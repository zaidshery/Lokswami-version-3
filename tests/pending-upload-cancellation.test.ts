import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { MediaRecord } from '@/lib/server/media/mediaTypes';
import type { MediaRepository } from '@/lib/server/media/mediaRepository';
import type { SpacesAdapter } from '@/lib/server/media/spacesAdapter';
import { MediaService } from '@/lib/server/media/mediaService';
import { StoryVideoAssetService } from '@/lib/server/media/storyVideoAssetService';

const storage = vi.hoisted(() => ({ verify: vi.fn(), target: vi.fn() }));
vi.mock('@/lib/storage/storyVideoUpload', () => ({
  STORY_VIDEO_UPLOAD_EXPIRY_SECONDS: 600,
  verifyStoryVideoUpload: storage.verify,
  createStoryVideoUploadTarget: storage.target,
  createStoryVideoDownloadRequest: () => ({ url: 'https://qa/prefix', headers: {} }),
}));
const admin = { id: 'a', role: 'admin', email: 'a@qa', name: 'A', username: 'a' } as AdminSessionIdentity;
const reporter = { ...admin, id: 'r', role: 'reporter' } as AdminSessionIdentity;
describe('pending Story upload cancellation', () => {
  let record: MediaRecord, repository: MediaRepository, spaces: SpacesAdapter, service: MediaService;
  beforeEach(() => {
    vi.resetAllMocks();
    record = { _id: 'receipt', filename: 'qa.mp4', url: 'https://qa/stories/videos/qa.mp4',
      type: 'video/mp4', size: 0, expectedSize: 32, status: 'pending', provider: 'do-spaces',
      createdById: 'r', ownerType: 'story', objectKey: 'stories/videos/qa.mp4', mediaKind: 'video',
      references: [], referenceTrackingComplete: false, createdAt: new Date(Date.now() - 3600000) };
    repository = {
      getMediaById: vi.fn(async () => ({ ...record })),
      hasPersistedReference: vi.fn(async () => false),
      transitionStatus: vi.fn(async (_id, from, updates) => {
        if (record.status !== from) return null;
        Object.assign(record, updates); return { ...record };
      }),
      updateMediaById: vi.fn(async (_id, updates) => { Object.assign(record, updates); return { ...record }; }),
      listCleanupCandidates: vi.fn(async () => [record]),
    } as unknown as MediaRepository;
    spaces = { deleteAssetByPublicId: vi.fn(async () => undefined) } as unknown as SpacesAdapter;
    service = new MediaService(repository, spaces);
  });
  it('cancels an expired server receipt without repairing referenceTrackingComplete; retries idempotently', async () => {
    await expect(service.cancelPendingUpload('receipt', admin)).resolves.toMatchObject({ cleanupPending: false });
    expect(record).toMatchObject({ status: 'cancelled', referenceTrackingComplete: false });
    await service.cancelPendingUpload('receipt', admin);
    expect(spaces.deleteAssetByPublicId).toHaveBeenCalledTimes(2);
  });
  it.each(['reporter', 'copy_editor'])('preserves %s cancellation and library deletion denial', async role => {
    const actor = { ...reporter, role } as AdminSessionIdentity;
    await expect(service.cancelPendingUpload('receipt', actor)).rejects.toMatchObject({ status: 403 });
    await expect(service.deleteMedia('receipt', actor)).rejects.toMatchObject({ status: 403 });
    expect(repository.transitionStatus).not.toHaveBeenCalled();
  });
  it('defers cleanup while a PUT URL is valid and reconciles a late object after expiry', async () => {
    record.uploadExpiresAt = new Date(Date.now() + 600000);
    await expect(service.cancelPendingUpload('receipt', admin)).resolves.toMatchObject({ cleanupPending: true });
    expect(spaces.deleteAssetByPublicId).not.toHaveBeenCalled();
    record.uploadExpiresAt = new Date(Date.now() - 1);
    await service.reconcileCleanup(new Date());
    // A previously begun PUT finishes after the first sweep. The tombstone is never discarded.
    await service.reconcileCleanup(new Date());
    expect(spaces.deleteAssetByPublicId).toHaveBeenCalledTimes(2);
    expect(record.status).toBe('cancelled');
  });
  it('retains cancellation on provider failure and recovers through the same API', async () => {
    vi.mocked(spaces.deleteAssetByPublicId).mockRejectedValueOnce(new Error('provider down'));
    await expect(service.cancelPendingUpload('receipt', admin)).rejects.toMatchObject({ status: 503 });
    expect(record.status).toBe('cancelled');
    await service.cancelPendingUpload('receipt', admin);
    expect(record.cleanupError).toBe('');
  });
  it.each(['registry', 'persisted', 'lookup', 'expiry', 'completed'])('fails closed for %s uncertainty or references', async kind => {
    if (kind === 'registry') record.references = [{ ownerType: 'story', ownerId: 'foreign', attachedAt: new Date() }];
    if (kind === 'persisted') vi.mocked(repository.hasPersistedReference).mockResolvedValue(true);
    if (kind === 'lookup') vi.mocked(repository.hasPersistedReference).mockRejectedValue(new Error('lookup failed'));
    if (kind === 'expiry') record.createdAt = undefined;
    if (kind === 'completed') record.status = 'verified';
    await expect(service.cancelPendingUpload('receipt', admin)).rejects.toThrow();
    expect(spaces.deleteAssetByPublicId).not.toHaveBeenCalled();
    expect(repository.transitionStatus).not.toHaveBeenCalled();
  });
  it('loses safely if completion wins the atomic pending transition', async () => {
    vi.mocked(repository.transitionStatus).mockImplementationOnce(async () => { record.status = 'verified'; return null; });
    await expect(service.cancelPendingUpload('receipt', admin)).rejects.toMatchObject({ status: 409 });
    expect(record.status).toBe('verified');
    expect(spaces.deleteAssetByPublicId).not.toHaveBeenCalled();
  });
  it('cannot complete or revive a receipt cancelled while provider verification was in flight', async () => {
    let release!: (asset: unknown) => void;
    storage.verify.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const prefix = new Uint8Array(32); prefix.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const video = new StoryVideoAssetService(repository, vi.fn(async () => new Response(prefix)) as typeof fetch, spaces);
    const completion = video.complete({ assetId: 'receipt', expectedSize: 32, expectedFileType: 'video/mp4', expectedFileName: 'qa.mp4' }, reporter);
    await vi.waitFor(() => expect(storage.verify).toHaveBeenCalled());
    await service.cancelPendingUpload('receipt', admin);
    release({ mediaKey: record.objectKey, mediaUrl: record.url, mediaSizeBytes: 32, mediaMimeType: 'video/mp4', storageProvider: 'do-spaces' });
    await expect(completion).rejects.toMatchObject({ status: 409 });
    expect(record.status).toBe('cancelled');
    await expect(video.complete({ assetId: 'receipt', expectedSize: 32, expectedFileType: 'video/mp4', expectedFileName: 'qa.mp4' }, reporter)).rejects.toMatchObject({ status: 404 });
  });
});
