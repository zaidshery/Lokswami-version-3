import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
const mocks = vi.hoisted(() => ({ get: vi.fn(), fileUpdate: vi.fn(), mongoUpdate: vi.fn(), lease: vi.fn(), receipt: vi.fn(), sync: vi.fn() }));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/Story', () => ({ default: {
  findById: () => ({ lean: mocks.get }),
  findOneAndUpdate: (...args: unknown[]) => ({ lean: () => mocks.mongoUpdate(...args) }),
} }));
vi.mock('@/lib/storage/storiesFile', () => ({
  getStoredStoryById: mocks.get, updateStoredStory: mocks.fileUpdate,
  deleteStoredStory: vi.fn(), isStoryVersionConflictError: () => false,
  StoryVersionConflictError: class extends Error {},
}));
vi.mock('@/lib/server/storyLockService', () => ({ assertStoryLeaseNotHeldByOther: mocks.lease, deleteStoryLock: vi.fn(), StoryEditLeaseConflictError: class extends Error {} }));
vi.mock('@/lib/server/storyActivity', () => ({ buildStoryActivityMessage: () => '', recordStoryActivity: vi.fn() }));
vi.mock('@/lib/server/workflowNotificationEvents', () => ({ notifyWorkflowEvent: vi.fn() }));
vi.mock('@/lib/server/storyVideoUsage', () => ({ getStoryVideoMonthlyUsageSummary: vi.fn() }));
vi.mock('@/lib/server/media/mediaRepository', () => ({ mediaRepository: {
  getMediaById: mocks.receipt, addReference: mocks.sync, removeReference: mocks.sync,
} }));
import { StoryEditorialService } from '@/lib/server/storyEditorialService';
const actor = { id: 'admin', name: 'A', username: 'a', email: 'a@qa', role: 'admin' } as AdminSessionIdentity;
const image = { id: 'image', assetId: 'cover', kind: 'image', url: 'https://qa/cover.png', order: 0 };
const video = { id: 'video', assetId: 'video', kind: 'video', url: 'https://qa/video.mp4', key: 'stories/videos/video.mp4', mimeType: 'video/mp4', sizeBytes: 32, storageProvider: 'do-spaces', order: 1 };
const id = '507f1f77bcf86cd799439011';
let current: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  current = { _id: id, title: 'Required title', thumbnail: image.url, mediaAssets: [image, video],
    mediaType: 'video', mediaUrl: video.url, mediaKey: video.key, mediaSizeBytes: 32,
    mediaMimeType: 'video/mp4', storageProvider: 'do-spaces', version: 3, workflow: { status: 'draft' } };
  mocks.get.mockResolvedValue(current);
  mocks.receipt.mockResolvedValue({ _id: 'cover', status: 'attached', ownerType: 'story', ownerId: id,
    mediaKind: 'image', createdById: actor.id, provider: 'do-spaces', objectKey: 'lokswami/stories/thumbnails/cover.png', url: image.url, type: 'image/png', size: 10, filename: 'cover.png' });
  mocks.fileUpdate.mockImplementation(async (_id, updates) => ({ ...current, ...updates, version: 4 }));
  mocks.mongoUpdate.mockImplementation(async (_query, updates) => ({ ...current, ...updates.$set, version: 4 }));
});
describe.each(['file', 'mongo'] as const)('last verified video removal (%s)', store => {
  it('keeps a valid image-only Story, clears playable fields and snapshots the old video', async () => {
    const result = await StoryEditorialService.updateStoryEditorial(id, { expectedVersion: 3, mediaAssets: [image] }, actor, store);
    expect(result.story).toMatchObject({ title: 'Required title', thumbnail: image.url, mediaType: 'image',
      mediaUrl: image.url, mediaKey: '', mediaSizeBytes: 0, mediaMimeType: '', storageProvider: '', version: 4 });
    expect(result.story.mediaAssets).toHaveLength(1);
    if (store === 'file') {
      expect(mocks.fileUpdate.mock.calls[0][2].revisionSnapshot.mediaAssets).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: 'video' })]));
    } else {
      expect(mocks.mongoUpdate.mock.calls[0][1].$push.revisions.$each[0].mediaAssets).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: 'video' })]));
    }
    expect(mocks.sync).toHaveBeenCalledWith('video', 'story', id);
  });
  it.each(['mediaKey', 'mediaUrl', 'storageProvider', 'mediaMimeType', 'mediaSizeBytes'])('rejects client-forged %s even alongside valid mediaAssets', async field => {
    await expect(StoryEditorialService.updateStoryEditorial(id, {
      expectedVersion: 3, mediaAssets: [image], [field]: field === 'mediaSizeBytes' ? 123 : 'forged',
    }, actor, store)).rejects.toMatchObject({ status: 400 });
    expect(mocks.fileUpdate).not.toHaveBeenCalled(); expect(mocks.mongoUpdate).not.toHaveBeenCalled();
  });
  it('rejects trusted metadata changes without a validated asset update', async () => {
    await expect(StoryEditorialService.updateStoryEditorial(id, { expectedVersion: 3, mediaKey: 'forged' }, actor, store)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects stale versions before receipt validation or persistence', async () => {
    await expect(StoryEditorialService.updateStoryEditorial(id, { expectedVersion: 2, mediaAssets: [image] }, actor, store)).rejects.toThrow();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it('preserves lease denial', async () => {
    mocks.lease.mockRejectedValue(new Error('lease held by other'));
    await expect(StoryEditorialService.updateStoryEditorial(id, { expectedVersion: 3, mediaAssets: [image] }, actor, store)).rejects.toThrow('lease held');
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it('preserves edit permissions and receipt verification', async () => {
    current.workflow = { status: 'draft', createdBy: actor };
    await expect(StoryEditorialService.updateStoryEditorial(id, { expectedVersion: 3, mediaAssets: [image] }, { ...actor, id: 'other-reporter', role: 'reporter' }, store)).rejects.toThrow();
    mocks.receipt.mockResolvedValue({ status: 'cancelled' });
    await expect(StoryEditorialService.updateStoryEditorial(id, { expectedVersion: 3, mediaAssets: [image] }, actor, store)).rejects.toMatchObject({ status: 400 });
  });
});
