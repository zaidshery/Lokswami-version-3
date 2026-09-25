import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  derivePrimaryStoryMedia,
  normalizeStoryMediaAssets,
  type StoryMediaAsset,
} from '@/lib/content/storyMedia';
import { mediaRepository, type MediaRepository } from './mediaRepository';
import { MediaValidationError } from './mediaService';

export class StoryMediaAssetService {
  constructor(private readonly repository: MediaRepository = mediaRepository) {}

  async resolveForWrite(
    assets: StoryMediaAsset[],
    actor: AdminSessionIdentity,
    options: { storyId?: string; current?: StoryMediaAsset[] } = {}
  ): Promise<StoryMediaAsset[]> {
    const current = normalizeStoryMediaAssets(options.current);
    const resolved: StoryMediaAsset[] = [];

    for (const asset of normalizeStoryMediaAssets(assets)) {
      if (!asset.assetId) {
        const existing = current.find((item) => item.id === asset.id && item.url === asset.url);
        resolved.push(existing || { ...asset, key: '', storageProvider: '' });
        continue;
      }

      const record = await this.repository.getMediaById(asset.assetId);
      if (!record || !['verified', 'attached'].includes(String(record.status))) {
        throw new MediaValidationError('Media upload receipt is missing or not verified.', 400);
      }
      if (record.createdById && record.createdById !== actor.id && actor.role === 'reporter') {
        throw new MediaValidationError('Media upload receipt belongs to another user.', 403);
      }
      if (record.provider !== 'do-spaces' || !record.objectKey || !record.url) {
        throw new MediaValidationError('Media upload receipt has invalid storage metadata.', 400);
      }
      if (record.ownerType !== 'story') {
        throw new MediaValidationError('Media upload receipt is not scoped to Stories.', 400);
      }
      if (record.ownerId && options.storyId && record.ownerId !== options.storyId) {
        throw new MediaValidationError('Media upload receipt belongs to another Story.', 409);
      }

      resolved.push({
        ...asset,
        assetId: String(record._id),
        kind: record.mediaKind === 'video' ? 'video' : 'image',
        url: record.url,
        key: record.objectKey,
        mimeType: String(record.type || '').toLowerCase(),
        sizeBytes: Number(record.size || 0),
        storageProvider: 'do-spaces',
        originalFileName: record.filename,
      });
    }
    return normalizeStoryMediaAssets(resolved);
  }

  applyPrimary(input: Record<string, unknown>, assets: StoryMediaAsset[]) {
    const primary = derivePrimaryStoryMedia(assets, String(input.thumbnail || ''));
    return { ...input, ...primary, mediaAssets: assets };
  }

  async syncReferences(storyId: string, before: StoryMediaAsset[], after: StoryMediaAsset[]) {
    const beforeIds = new Set(normalizeStoryMediaAssets(before).map((asset) => asset.assetId).filter(Boolean));
    const afterIds = new Set(normalizeStoryMediaAssets(after).map((asset) => asset.assetId).filter(Boolean));
    await Promise.all([
      ...[...afterIds].filter((id) => !beforeIds.has(id)).map((id) =>
        this.repository.addReference(String(id), {
          ownerType: 'story', ownerId: storyId, field: 'mediaAssets', attachedAt: new Date(),
        })
      ),
      ...[...beforeIds].filter((id) => !afterIds.has(id)).map((id) =>
        this.repository.removeReference(String(id), 'story', storyId)
      ),
    ]);
  }

  async markUnattachedForCleanup(before: StoryMediaAsset[], attempted: StoryMediaAsset[]) {
    const existingIds = new Set(normalizeStoryMediaAssets(before).map((asset) => asset.assetId).filter(Boolean));
    for (const assetId of normalizeStoryMediaAssets(attempted).map((asset) => asset.assetId).filter(Boolean)) {
      if (existingIds.has(assetId)) continue;
      const record = await this.repository.getMediaById(String(assetId));
      if (!record || (record.references || []).length) continue;
      await this.repository.updateMediaById(String(assetId), {
        status: 'cleanup_pending',
        referenceTrackingComplete: true,
        cleanupError: 'Content persistence failed before attachment.',
      });
    }
  }
}

export const storyMediaAssetService = new StoryMediaAssetService();
