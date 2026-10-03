import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ available: vi.fn(), stored: vi.fn(), find: vi.fn(), select: vi.fn(), lean: vi.fn() }));
vi.mock('@/lib/db/mongoAvailability', () => ({ isMongoAvailable: mocks.available }));
vi.mock('@/lib/storage/videosFile', () => ({ getStoredVideoById: mocks.stored }));
vi.mock('@/lib/models/Video', () => ({ default: { findOne: mocks.find } }));

const video = {
  _id: '507f1f77bcf86cd799439011', title: 'Public video', isPublished: true,
  publishedAt: '2026-01-01T09:00:00.000Z', workflow: { status: 'published' },
  processingStatus: 'ready', videoUrl: 'https://cdn.example.com/video.mp4',
};

describe('direct video selection uses feed eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ lean: mocks.lean });
  });
  it.each(['mongo', 'file'])('resolves published exact video in %s mode', async (store) => {
    mocks.available.mockResolvedValue(store === 'mongo');
    mocks.lean.mockResolvedValue(video);
    mocks.stored.mockResolvedValue(video);
    const { getPublicVideoForMetadata } = await import('@/lib/server/publicVideoMetadata');
    expect(await getPublicVideoForMetadata(video._id)).toEqual(expect.objectContaining({ id: video._id, title: video.title }));
    if (store === 'mongo') expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('workflow processingStatus'));
  });
  it.each([
    ['draft', { workflow: { status: 'draft' } }],
    ['scheduled', { workflow: { status: 'published', scheduledFor: '2999-01-01T00:00:00Z' } }],
    ['future', { publishedAt: '2999-01-01T00:00:00Z' }],
    ['unpublished', { isPublished: false }],
    ['processing', { processingStatus: 'processing' }],
  ])('rejects %s in both stores and prevents stale-file resurrection', async (_label, fields) => {
    const { getPublicVideoForMetadata } = await import('@/lib/server/publicVideoMetadata');
    mocks.available.mockResolvedValue(true);
    mocks.lean.mockResolvedValue({ ...video, ...fields });
    mocks.stored.mockResolvedValue(video);
    expect(await getPublicVideoForMetadata(video._id)).toBeNull();
    expect(mocks.stored).not.toHaveBeenCalled();
    mocks.available.mockResolvedValue(false);
    mocks.stored.mockResolvedValue({ ...video, ...fields });
    expect(await getPublicVideoForMetadata(video._id)).toBeNull();
  });
  it('returns null for missing authority instead of reading a stale fallback', async () => {
    mocks.available.mockResolvedValue(true);
    mocks.lean.mockResolvedValue(null);
    mocks.stored.mockResolvedValue(video);
    const { getPublicVideoForMetadata } = await import('@/lib/server/publicVideoMetadata');
    expect(await getPublicVideoForMetadata(video._id)).toBeNull();
    expect(mocks.stored).not.toHaveBeenCalled();
  });
});
