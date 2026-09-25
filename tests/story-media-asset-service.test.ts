import { describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { StoryMediaAsset } from '@/lib/content/storyMedia';
import type { MediaRepository } from '@/lib/server/media/mediaRepository';
import { StoryMediaAssetService } from '@/lib/server/media/storyMediaAssetService';

const reporter: AdminSessionIdentity = {
  id: 'reporter-1', email: 'r@example.com', name: 'R', username: 'r', role: 'reporter',
};
const forged: StoryMediaAsset = {
  id: 'local', assetId: 'asset-1', kind: 'video', url: 'https://evil/x', key: 'other/key',
  mimeType: 'text/html', sizeBytes: 1, storageProvider: 'forged', originalFileName: 'evil',
  order: 0, createdAt: new Date().toISOString(),
};

describe('Story canonical media attachment boundary', () => {
  it('derives trusted fields from the receipt and ignores client provider/key/url', async () => {
    const repository = {
      getMediaById: vi.fn(async () => ({
        _id: 'asset-1', createdById: reporter.id, provider: 'do-spaces',
        objectKey: 'stories/videos/safe.mp4', url: 'https://cdn/safe.mp4',
        type: 'video/mp4', size: 99, filename: 'safe.mp4', status: 'verified',
        mediaKind: 'video', ownerType: 'story', ownerId: 'story-1',
      })),
    } as unknown as MediaRepository;
    const service = new StoryMediaAssetService(repository);
    const [resolved] = await service.resolveForWrite([forged], reporter, { storyId: 'story-1' });
    expect(resolved).toMatchObject({
      url: 'https://cdn/safe.mp4', key: 'stories/videos/safe.mp4',
      mimeType: 'video/mp4', sizeBytes: 99, storageProvider: 'do-spaces',
    });
  });

  it('rejects wrong actor, content owner, and non-Story receipts', async () => {
    const base = {
      _id: 'asset-1', createdById: 'other-user', provider: 'do-spaces', objectKey: 'safe/x.jpg',
      url: 'https://cdn/x.jpg', type: 'image/jpeg', size: 3, filename: 'x.jpg', status: 'verified',
      mediaKind: 'image', ownerType: 'story', ownerId: 'story-other',
    };
    const repository = { getMediaById: vi.fn(async () => base) } as unknown as MediaRepository;
    const service = new StoryMediaAssetService(repository);
    await expect(service.resolveForWrite([forged], reporter, { storyId: 'story-1' }))
      .rejects.toMatchObject({ status: 403 });
    base.createdById = reporter.id;
    await expect(service.resolveForWrite([forged], reporter, { storyId: 'story-1' }))
      .rejects.toMatchObject({ status: 409 });
    base.ownerId = 'story-1';
    base.ownerType = 'article';
    await expect(service.resolveForWrite([forged], reporter, { storyId: 'story-1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('marks removed assets cleanup-pending only after syncing a persisted replacement', async () => {
    const removeReference = vi.fn(async () => null);
    const addReference = vi.fn(async () => null);
    const repository = { removeReference, addReference } as unknown as MediaRepository;
    const service = new StoryMediaAssetService(repository);
    const before = [{ ...forged, assetId: 'old' }];
    const after = [{ ...forged, assetId: 'new' }];
    await service.syncReferences('story-1', before, after);
    expect(addReference).toHaveBeenCalledWith('new', expect.objectContaining({ ownerId: 'story-1' }));
    expect(removeReference).toHaveBeenCalledWith('old', 'story', 'story-1');
  });

  it('marks a newly uploaded asset for reconciliation when content persistence fails', async () => {
    const updateMediaById = vi.fn(async () => null);
    const repository = {
      getMediaById: vi.fn(async () => ({ _id: 'new', references: [], status: 'verified' })),
      updateMediaById,
    } as unknown as MediaRepository;
    const service = new StoryMediaAssetService(repository);
    await service.markUnattachedForCleanup([], [{ ...forged, assetId: 'new' }]);
    expect(updateMediaById).toHaveBeenCalledWith('new', expect.objectContaining({
      status: 'cleanup_pending', referenceTrackingComplete: true,
    }));
  });
});
