import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { canDeleteContent } from '@/lib/auth/permissions';
import { isReporterDeskRole, normalizeAdminRole } from '@/lib/auth/roles';
import {
  mediaImageService,
  type MediaImageService,
} from './mediaImageService';
import {
  mediaRepository,
  type MediaRepository,
} from './mediaRepository';
import type {
  MediaRecord,
  MediaUploadPurpose,
  MediaUploadResult,
  MediaUploadRule,
} from './mediaTypes';
import {
  spacesAdapter,
  type SpacesAdapter,
} from './spacesAdapter';
import { validateUploadedFileContent } from './mediaFileValidation';
import { STORY_VIDEO_UPLOAD_EXPIRY_SECONDS } from '@/lib/storage/storyVideoUpload';
import {
  isValidDigitalOceanSpacesObjectKey,
  parseTrustedDigitalOceanSpacesAssetFromUrl,
} from '@/lib/utils/digitalOceanSpaces';

export class MediaValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'MediaValidationError';
    this.status = status;
  }
}

class MediaReferenceProtectionError extends MediaValidationError {
  constructor() { super('Asset is still referenced and cannot be deleted.', 409); }
}

class MediaReferenceLookupError extends Error {
  constructor() { super('Authoritative media reference lookup failed.'); }
}

class MediaCleanupStateError extends MediaValidationError {
  constructor() { super('Cancellation cleanup identity or expiry is unknown.', 409); }
}

export class MediaProviderCleanupError extends MediaValidationError {
  readonly persistenceError?: unknown;
  readonly providerError?: unknown;
  readonly labelPersistenceFailed: boolean;

  constructor(
    message = 'Provider cleanup failed; cancellation is retained for retry.',
    persistenceError?: unknown,
    providerError?: unknown
  ) {
    super(
      persistenceError
        ? 'Provider cleanup failed and error label persistence failed; cancellation is retained for retry.'
        : message,
      503
    );
    this.persistenceError = persistenceError;
    this.providerError = providerError;
    this.labelPersistenceFailed = Boolean(persistenceError);
  }
}

export class MediaReceiptPersistenceError extends Error {
  readonly persistenceError?: unknown;
  constructor(message = 'Media receipt persistence failed.', persistenceError?: unknown) {
    super(message);
    this.name = 'MediaReceiptPersistenceError';
    this.persistenceError = persistenceError;
  }
}

export type ReconcileCleanupResult = {
  deleted: number;
  failed: number;
  retained: number;
  blocked: number;
  lookupFailed: number;
  providerFailed: number;
  persistenceFailed: number;
  labelFailed: number;
  labelPersistenceFailed?: number;
  receiptPersistenceFailed?: number;
};

function bytesFromMb(mb: number) {
  return mb * 1024 * 1024;
}

function isPdf(file: File) {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();
  return mime === 'application/pdf' && name.endsWith('.pdf');
}

function isImage(file: File) {
  const mime = file.type.trim().toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    false
  );
}

function isImageOrPdf(file: File) {
  return isImage(file) || isPdf(file);
}

function getUploadRule(purpose: MediaUploadPurpose): MediaUploadRule {
  if (purpose === 'epaper-paper') {
    return {
      maxSizeBytes: bytesFromMb(25),
      errorType: 'E-paper file must be a PDF',
      errorSize: 'E-paper PDF size must be less than 25MB',
      folder: 'lokswami/epapers/papers',
      resourceType: 'raw',
      isAllowed: isPdf,
    };
  }

  if (purpose === 'epaper-thumbnail') {
    return {
      maxSizeBytes: bytesFromMb(10),
      errorType: 'Thumbnail must be JPG, JPEG, PNG, or WEBP',
      errorSize: 'Thumbnail size must be less than 10MB',
      folder: 'lokswami/epapers/thumbnails',
      resourceType: 'image',
      isAllowed: isImage,
    };
  }

  if (purpose === 'video-thumbnail') {
    return {
      maxSizeBytes: bytesFromMb(10),
      errorType: 'Video thumbnail must be JPG, JPEG, PNG, WEBP, or PDF',
      errorSize: 'Video thumbnail size must be less than 10MB',
      folder: 'lokswami/videos/thumbnails',
      resourceType: 'auto',
      isAllowed: isImageOrPdf,
    };
  }

  if (purpose === 'story-thumbnail') {
    return {
      maxSizeBytes: bytesFromMb(10),
      errorType: 'Story thumbnail must be JPG, JPEG, PNG, or WEBP',
      errorSize: 'Story thumbnail size must be less than 10MB',
      folder: 'lokswami/stories/thumbnails',
      resourceType: 'image',
      isAllowed: isImage,
    };
  }

  return {
    maxSizeBytes: bytesFromMb(5),
    errorType: 'Only JPG, JPEG, PNG, or WEBP image files are allowed',
    errorSize: 'Image size must be less than 5MB',
    folder: 'lokswami/images',
    resourceType: 'image',
    isAllowed: isImage,
  };
}

function canUseUploadPurpose(role: string | null | undefined, purpose: MediaUploadPurpose) {
  if (!isReporterDeskRole(role)) {
    return true;
  }

  return purpose === 'image' || purpose === 'story-thumbnail';
}

function getCanonicalObjectKeys(record: MediaRecord) {
  const keys = new Set<string>();
  if (record.objectKey && isValidDigitalOceanSpacesObjectKey(record.objectKey)) keys.add(record.objectKey);
  for (const url of Object.values(record.variants || {})) {
    if (!url) continue;
    const parsed = parseTrustedDigitalOceanSpacesAssetFromUrl(url);
    if (parsed?.publicId) keys.add(parsed.publicId);
  }
  return [...keys];
}

export class MediaService {
  constructor(
    private readonly repository: MediaRepository = mediaRepository,
    private readonly spaces: SpacesAdapter = spacesAdapter,
    private readonly imageService: MediaImageService = mediaImageService
  ) {}

  /** Admin-only cancellation is distinct from deletion: retain a non-reusable cleanup tombstone. */
  async cancelPendingUpload(id: string, user: AdminSessionIdentity) {
    if (!canDeleteContent(user)) throw new MediaValidationError('Only admins can cancel pending media uploads.', 403);
    let record = await this.repository.getMediaById(id);
    if (!record) throw new MediaValidationError('Not found', 404);
    if (!['pending', 'cancelled'].includes(String(record.status)) || record.ownerType !== 'story' ||
        record.mediaKind !== 'video' || record.provider !== 'do-spaces' || !record.createdById ||
        !record.objectKey?.startsWith('stories/videos/') || !isValidDigitalOceanSpacesObjectKey(record.objectKey)) {
      throw new MediaValidationError('Only server-issued pending Story video uploads can be cancelled.', 409);
    }
    const expiry = record.uploadExpiresAt || (record.createdAt &&
      new Date(new Date(record.createdAt).getTime() + STORY_VIDEO_UPLOAD_EXPIRY_SECONDS * 1000));
    if (!expiry || !Number.isFinite(new Date(expiry).getTime())) {
      throw new MediaValidationError('Upload expiry is unknown; cancellation was refused.', 409);
    }
    await this.assertUnreferenced(record);
    if (record.status === 'pending') {
      const claimed = await this.repository.transitionStatus(id, 'pending', {
        status: 'cancelled', cancelledAt: new Date(), uploadExpiresAt: expiry, cleanupError: '',
      });
      if (!claimed) throw new MediaValidationError('Upload changed during cancellation; retry after refreshing.', 409);
      record = claimed;
    }
    // A URL cannot be revoked individually. Do not declare deletion while it can still PUT.
    if (new Date(expiry).getTime() > Date.now()) {
      return { assetId: id, status: 'cancelled' as const, cleanupPending: true, cleanupNotBefore: new Date(expiry).toISOString() };
    }
    await this.cleanCancelledUpload(record);
    return { assetId: id, status: 'cancelled' as const, cleanupPending: false, tombstoneRetained: true };
  }

  private async assertUnreferenced(record: MediaRecord) {
    if ((record.references || []).length || await this.hasPersistedReferenceForCleanup(record)) {
      throw new MediaReferenceProtectionError();
    }
  }

  private async hasPersistedReferenceForCleanup(record: MediaRecord) {
    try {
      return await this.repository.hasPersistedReference(record);
    } catch {
      throw new MediaReferenceLookupError();
    }
  }

  private async cleanCancelledUpload(record: MediaRecord) {
    if (record.status !== 'cancelled' || !record.cancelledAt || record.ownerType !== 'story' ||
        record.mediaKind !== 'video' || record.provider !== 'do-spaces' ||
        !record.objectKey?.startsWith('stories/videos/') || !isValidDigitalOceanSpacesObjectKey(record.objectKey) ||
        !record.uploadExpiresAt || !Number.isFinite(new Date(record.uploadExpiresAt).getTime()) ||
        new Date(record.uploadExpiresAt).getTime() > Date.now()) {
      throw new MediaCleanupStateError();
    }
    await this.assertUnreferenced(record);
    try {
      await this.spaces.deleteAssetByPublicId(String(record.objectKey));
    } catch (providerError) {
      let persistenceError: unknown = null;
      try {
        await this.repository.updateMediaById(String(record._id), { cleanupError: 'provider_cleanup_failed' });
      } catch (error) {
        persistenceError = error;
      }
      throw new MediaProviderCleanupError(
        'Provider cleanup failed; cancellation is retained for retry.',
        persistenceError,
        providerError
      );
    }
    try {
      await this.repository.updateMediaById(String(record._id), { cleanupError: '', deletedAt: new Date() });
    } catch (persistenceError) {
      throw new MediaReceiptPersistenceError('Media receipt persistence failed after object deletion.', persistenceError);
    }
    // Keep status=cancelled in reconciliation forever: a PUT begun before expiry can finish later.
    // Such objects retain an authoritative cleanup owner; neither completion nor attachment can revive it.
  }

  async listMedia(user: AdminSessionIdentity): Promise<MediaRecord[]> {
    return this.repository.listMedia(user);
  }

  async createMedia(
    data: { assetId?: string; filename: string; url: string; size?: number; type?: string },
    user: AdminSessionIdentity
  ): Promise<MediaRecord> {
    if (!data.assetId && !data.url) {
      throw new MediaValidationError('Missing fields', 400);
    }
    const existing = data.assetId
      ? await this.repository.getMediaById(data.assetId)
      : await this.repository.findMediaByUrl(data.url);
    if (!existing || !['verified', 'attached'].includes(String(existing.status))) {
      throw new MediaValidationError('Upload receipt not found. Upload the file again.', 400);
    }
    if (existing.createdById && existing.createdById !== user.id && isReporterDeskRole(user.role)) {
      throw new MediaValidationError('This upload receipt belongs to another user.', 403);
    }
    return existing;
  }

  async deleteMedia(id: string, user: AdminSessionIdentity): Promise<void> {
    if (!canDeleteContent(user)) {
      throw new MediaValidationError('Only admins can delete media assets.', 403);
    }

    const record = await this.repository.getMediaById(id);
    if (!record) {
      throw new MediaValidationError('Not found', 404);
    }
    if (record.status === 'deleted') return;
    if (record.status === 'cancelled') {
      throw new MediaValidationError('Use pending-upload cancellation to retry this tombstone cleanup.', 409);
    }
    if (!record.provider || record.provider === 'legacy' || !record.objectKey) {
      await this.repository.updateMediaById(id, { status: 'deleted', deletedAt: new Date() });
      return;
    }
    if ((record.references || []).length > 0) {
      throw new MediaValidationError('Asset is still referenced and cannot be deleted.', 409);
    }
    if (record.ownerType === 'story') {
      // Registry links track current attachments; restorable revisions remain authoritative too.
      await this.assertUnreferenced(record);
      if (!record.referenceTrackingComplete) {
        throw new MediaValidationError('Asset reference state is unknown; provider deletion was refused.', 409);
      }
    } else if (record.ownerType === 'article' && record.mediaKind === 'image') {
      if (await this.repository.hasPersistedArticleImageReference(record)) {
        throw new MediaValidationError('Asset is still referenced and cannot be deleted.', 409);
      }
      // A successful authoritative read repairs receipts created before article reference tracking.
      await this.repository.updateMediaById(id, { referenceTrackingComplete: true });
    } else if (!record.referenceTrackingComplete) {
      throw new MediaValidationError('Asset reference state is unknown; provider deletion was refused.', 409);
    }
    if (!isValidDigitalOceanSpacesObjectKey(record.objectKey)) {
      throw new MediaValidationError('Stored asset key is invalid; provider deletion was refused.', 409);
    }

    await this.repository.updateMediaById(id, { status: 'cleanup_pending', cleanupError: '' });
    try {
      for (const key of getCanonicalObjectKeys(record)) {
        await this.spaces.deleteAssetByPublicId(key);
      }
      await this.repository.updateMediaById(id, {
        status: 'deleted',
        deletedAt: new Date(),
        cleanupError: '',
      });
    } catch {
      await this.repository.updateMediaById(id, {
        status: 'cleanup_pending',
        cleanupError: 'provider_cleanup_failed',
      });
      throw new MediaValidationError('Provider cleanup failed; the asset is queued for retry.', 503);
    }
  }

  async processUpload(
    file: File,
    purpose: MediaUploadPurpose,
    userInput: AdminSessionIdentity | string,
    options: {
      optimizeArticleImage?: boolean;
      focalPointX?: number;
      focalPointY?: number;
      ownerType?: MediaRecord['ownerType'];
      ownerId?: string;
      referenceTrackingComplete?: boolean;
    } = {}
  ): Promise<MediaUploadResult> {
    const user: AdminSessionIdentity = typeof userInput === 'string'
      ? { id: 'legacy-upload', email: '', name: '', username: '', role: normalizeAdminRole(userInput) || 'admin' }
      : userInput;
    if (!canUseUploadPurpose(user.role, purpose)) {
      throw new MediaValidationError(
        'Reporters can only upload image assets from this workspace.',
        403
      );
    }

    const rule = getUploadRule(purpose);
    if (!rule.isAllowed(file)) {
      throw new MediaValidationError(rule.errorType, 400);
    }

    if (file.size <= 0 || file.size > rule.maxSizeBytes) {
      throw new MediaValidationError(rule.errorSize, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentError = validateUploadedFileContent(file, purpose, buffer);
    if (contentError) throw new MediaValidationError(contentError, 400);

    let result: Omit<MediaUploadResult, 'assetId'>;

    if (purpose === 'image' && options.optimizeArticleImage) {
      const optimized = await this.imageService.uploadOptimizedArticleImage(
        {
          buffer,
          filename: file.name || 'article-image',
          folder: rule.folder,
          focalPointX: options.focalPointX ?? 50,
          focalPointY: options.focalPointY ?? 50,
        },
        this.spaces
      );

      result = {
        url: optimized.primary.secureUrl,
        secureUrl: optimized.primary.secureUrl,
        publicId: optimized.primary.publicId,
        resourceType: optimized.primary.resourceType,
        storageProvider: 'do-spaces',
        filename: optimized.filename,
        size: optimized.primary.bytes,
        type: 'image/webp',
        width: optimized.width,
        height: optimized.height,
        format: 'webp',
        variants: optimized.variants,
      };
    } else {
      const uploaded = await this.spaces.uploadBuffer(buffer, {
        folder: rule.folder,
        resourceType: rule.resourceType,
        originalFilename: file.name || undefined,
      });

      result = {
        url: uploaded.secureUrl,
        secureUrl: uploaded.secureUrl,
        publicId: uploaded.publicId,
        resourceType: uploaded.resourceType,
        storageProvider: 'do-spaces',
        filename: file.name,
        size: uploaded.bytes || file.size,
        type: file.type,
      };
    }

    try {
      const record = await this.repository.createMedia({
        filename: result.filename,
        url: result.secureUrl,
        size: result.size,
        type: result.type,
        uploadedBy: user.email || 'admin',
        createdById: user.id,
        provider: 'do-spaces',
        objectKey: result.publicId,
        status: 'verified',
        mediaKind: result.type === 'application/pdf' ? 'document' : 'image',
        ownerType: options.ownerType || (purpose.startsWith('epaper') ? 'epaper' : 'article'),
        ownerId: options.ownerId || '',
        referenceTrackingComplete: Boolean(options.referenceTrackingComplete),
        references: [],
        variants: result.variants || {},
        verifiedAt: new Date(),
      });
      return { ...result, assetId: String(record._id) };
    } catch (error) {
      await this.spaces.deleteAssetByPublicId(result.publicId).catch(() => undefined);
      throw error;
    }
  }

  private async classifyCleanupCandidate(record: MediaRecord): Promise<'ready' | 'retained' | 'blocked'> {
    if (!record._id || !record.objectKey || !isValidDigitalOceanSpacesObjectKey(record.objectKey)) return 'blocked';
    if ((record.references || []).length) return 'retained';

    if (record.status === 'cancelled') {
      if (!record.cancelledAt || record.ownerType !== 'story' || record.mediaKind !== 'video' ||
          record.provider !== 'do-spaces' || !record.objectKey.startsWith('stories/videos/') ||
          !record.uploadExpiresAt || !Number.isFinite(new Date(record.uploadExpiresAt).getTime()) ||
          new Date(record.uploadExpiresAt).getTime() > Date.now()) return 'blocked';
      return await this.hasPersistedReferenceForCleanup(record) ? 'retained' : 'ready';
    }
    if (record.status !== 'cleanup_pending') return 'blocked';
    if (record.ownerType === 'story') {
      if (await this.hasPersistedReferenceForCleanup(record)) return 'retained';
      return record.referenceTrackingComplete ? 'ready' : 'blocked';
    }
    if (record.ownerType === 'article' && record.mediaKind === 'image') {
      try {
        return await this.repository.hasPersistedArticleImageReference(record) ? 'retained' : 'ready';
      } catch {
        throw new MediaReferenceLookupError();
      }
    }
    return record.referenceTrackingComplete ? 'ready' : 'blocked';
  }

  /** Keep the existing result shape for callers that compare or serialize it. */
  async reconcileCleanup(before: Date): Promise<{ deleted: number; failed: number }> {
    const { deleted, failed } = await this.reconcileCleanupDetailed(before);
    return { deleted, failed };
  }

  /** Detailed classification for operated QA and future reconciliation reporting. */
  async reconcileCleanupDetailed(before: Date): Promise<ReconcileCleanupResult> {
    const candidates = await this.repository.listCleanupCandidates(before);
    let deleted = 0;
    let failed = 0;
    let retained = 0;
    let blocked = 0;
    let lookupFailed = 0;
    let providerFailed = 0;
    let persistenceFailed = 0;
    let labelFailed = 0;
    for (const record of candidates) {
      let disposition: 'ready' | 'retained' | 'blocked';
      try {
        disposition = await this.classifyCleanupCandidate(record);
      } catch {
        failed += 1;
        lookupFailed += 1;
        continue;
      }
      if (disposition === 'retained') { retained += 1; continue; }
      if (disposition === 'blocked') { blocked += 1; continue; }

      if (record.status === 'cancelled') {
        try {
          await this.cleanCancelledUpload(record);
          deleted += 1;
        } catch (error) {
          if (error instanceof MediaReferenceProtectionError) {
            retained += 1;
          } else if (error instanceof MediaReferenceLookupError) {
            failed += 1;
            lookupFailed += 1;
          } else if (error instanceof MediaCleanupStateError) {
            blocked += 1;
          } else if (error instanceof MediaProviderCleanupError) {
            failed += 1;
            providerFailed += 1;
            if (error.labelPersistenceFailed) {
              persistenceFailed += 1;
              labelFailed += 1;
            }
          } else {
            failed += 1;
            persistenceFailed += 1;
          }
        }
        continue;
      }
      let providerDeleteFailed = false;
      try {
        for (const key of getCanonicalObjectKeys(record)) {
          await this.spaces.deleteAssetByPublicId(key);
        }
      } catch {
        providerDeleteFailed = true;
      }
      if (providerDeleteFailed) {
        failed += 1;
        providerFailed += 1;
        try {
          await this.repository.updateMediaById(String(record._id), { cleanupError: 'provider_cleanup_failed' });
        } catch {
          persistenceFailed += 1;
          labelFailed += 1;
        }
        continue;
      }
      try {
        await this.repository.updateMediaById(String(record._id), {
          status: 'deleted', deletedAt: new Date(), cleanupError: '',
        });
        deleted += 1;
      } catch {
        failed += 1;
        persistenceFailed += 1;
      }
    }
    return {
      deleted,
      failed,
      retained,
      blocked,
      lookupFailed,
      providerFailed,
      persistenceFailed,
      labelFailed,
      labelPersistenceFailed: labelFailed,
      receiptPersistenceFailed: persistenceFailed - labelFailed,
    };
  }
}

export const mediaService = new MediaService();
