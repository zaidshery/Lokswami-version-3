import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  createStoryVideoDownloadRequest,
  createStoryVideoUploadTarget,
  verifyStoryVideoUpload,
  type StoryVideoUploadInitInput,
} from '@/lib/storage/storyVideoUpload';
import { validateMp4Prefix } from './mediaFileValidation';
import { mediaRepository, type MediaRepository } from './mediaRepository';
import { MediaValidationError } from './mediaService';
import { spacesAdapter, type SpacesAdapter } from './spacesAdapter';

export class StoryVideoAssetService {
  constructor(
    private readonly repository: MediaRepository = mediaRepository,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly spaces: SpacesAdapter = spacesAdapter
  ) {}

  async initialize(input: StoryVideoUploadInitInput, user: AdminSessionIdentity) {
    const target = createStoryVideoUploadTarget(input);
    const record = await this.repository.createMedia({
      filename: input.fileName,
      url: target.mediaUrl,
      size: 0,
      type: 'video/mp4',
      uploadedBy: user.email || 'admin',
      createdById: user.id,
      provider: 'do-spaces',
      objectKey: target.mediaKey,
      status: 'pending',
      mediaKind: 'video',
      ownerType: 'story',
      ownerId: input.storyId || '',
      expectedSize: input.fileSize,
      referenceTrackingComplete: false,
      references: [],
    });
    return { ...target, assetId: String(record._id) };
  }

  async complete(input: {
    assetId: string;
    expectedSize: number;
    expectedFileType: string;
    expectedFileName: string;
  }, user: AdminSessionIdentity) {
    const record = await this.repository.getMediaById(input.assetId);
    if (!record || record.status !== 'pending' || !record.objectKey) {
      throw new MediaValidationError('Pending upload receipt not found.', 404);
    }
    if (record.createdById !== user.id) {
      throw new MediaValidationError('Upload receipt belongs to another user.', 403);
    }
    if (record.expectedSize !== input.expectedSize || record.type !== input.expectedFileType) {
      throw new MediaValidationError('Upload completion metadata does not match its receipt.', 400);
    }

    const asset = await verifyStoryVideoUpload(record.objectKey);
    if (Math.abs(asset.mediaSizeBytes - Number(record.expectedSize || 0)) > 1024) {
      throw new MediaValidationError('Uploaded video size does not match the selected file.', 400);
    }

    const signed = createStoryVideoDownloadRequest(record.objectKey);
    const prefixResponse = await this.fetchImpl(signed.url, {
      method: 'GET',
      headers: { ...signed.headers, Range: 'bytes=0-31' },
      redirect: 'error',
      cache: 'no-store',
    });
    if (!prefixResponse.ok) {
      throw new MediaValidationError('Uploaded video contents could not be verified.', 502);
    }
    const prefix = new Uint8Array(await prefixResponse.arrayBuffer());
    const contentError = validateMp4Prefix(prefix);
    if (contentError) {
      await this.repository.updateMediaById(input.assetId, { status: 'cleanup_pending', cleanupError: contentError });
      throw new MediaValidationError(contentError, 400);
    }

    try {
      const updated = await this.repository.updateMediaById(input.assetId, {
        url: asset.mediaUrl,
        size: asset.mediaSizeBytes,
        type: asset.mediaMimeType,
        status: 'verified',
        verifiedAt: new Date(),
        cleanupError: '',
      });
      if (!updated) throw new Error('Upload receipt disappeared during verification.');
    } catch {
      await this.spaces.deleteAssetByPublicId(record.objectKey).catch(() => undefined);
      await this.repository.updateMediaById(input.assetId, {
        status: 'cleanup_pending',
        cleanupError: 'Receipt persistence failed after object upload.',
      }).catch(() => undefined);
      throw new MediaValidationError('Upload verification could not be persisted safely.', 503);
    }
    return { ...asset, assetId: input.assetId };
  }
}

export const storyVideoAssetService = new StoryVideoAssetService();
