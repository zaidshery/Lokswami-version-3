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
    if (!existing || existing.status === 'deleted') {
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
    if (!record.provider || record.provider === 'legacy' || !record.objectKey) {
      await this.repository.updateMediaById(id, { status: 'deleted', deletedAt: new Date() });
      return;
    }
    if (!record.referenceTrackingComplete) {
      throw new MediaValidationError('Asset reference state is unknown; provider deletion was refused.', 409);
    }
    if ((record.references || []).length > 0) {
      throw new MediaValidationError('Asset is still referenced and cannot be deleted.', 409);
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

  async reconcileCleanup(before: Date): Promise<{ deleted: number; failed: number }> {
    const candidates = await this.repository.listCleanupCandidates(before);
    let deleted = 0;
    let failed = 0;
    for (const record of candidates) {
      if (!record._id || !record.objectKey || (record.references || []).length) continue;
      try {
        for (const key of getCanonicalObjectKeys(record)) {
          await this.spaces.deleteAssetByPublicId(key);
        }
        await this.repository.updateMediaById(String(record._id), {
          status: 'deleted', deletedAt: new Date(), cleanupError: '',
        });
        deleted += 1;
      } catch {
        await this.repository.updateMediaById(String(record._id), {
          cleanupError: 'provider_cleanup_failed',
        });
        failed += 1;
      }
    }
    return { deleted, failed };
  }
}

export const mediaService = new MediaService();
