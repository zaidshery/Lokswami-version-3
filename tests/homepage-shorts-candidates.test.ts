import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sift from 'sift';
import { selectHomepageMedia } from '@/lib/content/homepageDiscovery';

const mocks = vi.hoisted(() => ({ available: vi.fn(), connect: vi.fn(), find: vi.fn(), fileRows: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/mongoose', () => ({ default: mocks.connect }));
vi.mock('@/lib/db/mongoAvailability', () => ({ isMongoAvailable: mocks.available }));
vi.mock('@/lib/models/Video', () => ({ default: { find: mocks.find } }));
vi.mock('@/lib/storage/videosFile', () => ({ listAllStoredVideos: mocks.fileRows }));
import { VideoRepository } from '@/lib/server/video/videoRepository';

const now = new Date('2026-10-02T08:00:00Z');
function short(id: string, age: number, extra: Record<string, unknown> = {}) {
  const date = new Date(now.getTime() - age * 60_000);
  const row = { _id: id, slug: id, title: id, thumbnail: '/poster.jpg', category: 'National',
    videoUrl: '/qa.mp4', isPublished: true, isShort: true, aspectRatio: '9:16',
    processingStatus: 'ready', publishedAt: date, createdAt: date, workflow: { status: 'published' }, ...extra };
  // Mongo omits undefined fields; represent legacy absence the same way.
  for (const [key, value] of Object.entries(row)) if (value === undefined) Reflect.deleteProperty(row, key);
  return row;
}
function mongoRows(rows: ReturnType<typeof short>[]) {
  mocks.find.mockImplementation(filter => {
    let order: Record<string, number> = {}, limit = Infinity;
    const query = { select: vi.fn(), sort: vi.fn(), limit: vi.fn(), lean: vi.fn() };
    query.select.mockReturnValue(query);
    query.sort.mockImplementation(value => { order = value; return query; });
    query.limit.mockImplementation(value => { limit = value; return query; });
    // Execute the actual supplied Mongo predicate before sorting/limiting.
    query.lean.mockImplementation(async () => rows.filter(sift(filter)).sort((a, b) => {
      for (const [key, direction] of Object.entries(order)) {
        const left = a[key as keyof typeof a], right = b[key as keyof typeof b];
        if (left < right) return -direction;
        if (left > right) return direction;
      }
      return 0;
    }).slice(0, limit));
    return query;
  });
}
describe('Homepage Shorts candidates', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); mocks.available.mockResolvedValue(false); mocks.fileRows.mockResolvedValue([]); });
  afterEach(() => vi.useRealTimers());
  it('queries eligible older Shorts before the twelve-candidate Mongo limit', async () => {
    const future = new Date('2099-01-01');
    const invalidStates = [{ workflow: { status: 'scheduled', scheduledFor: future } },
      { publishedAt: future }, { processingStatus: 'processing' }, { aspectRatio: '16:9' },
      { workflow: { status: 'draft' } }, { processingStatus: 'failed' }];
    const newerInvalid = Array.from({ length: 18 }, (_, i) => short(`invalid-${i}`, i, invalidStates[i % invalidStates.length]));
    const olderValid = Array.from({ length: 15 }, (_, i) => short(`valid-${i}`, 100 + i));
    mongoRows([...newerInvalid, ...olderValid]);
    const result = await new VideoRepository().getHomeFeedVideos({ videos: 0, shorts: 12 }, 'mongo');
    expect(result.rawShorts.map(row => (row as { _id: string })._id)).toEqual(olderValid.slice(0, 12).map(row => row._id));
    expect(selectHomepageMedia(result.rawShorts, 'shorts', now).map(row => row.id)).toEqual(['valid-0', 'valid-1', 'valid-2']);
    expect(mocks.fileRows).not.toHaveBeenCalled();
  });
  it('preserves legacy eligible records, published readiness and stable createdAt/id order', async () => {
    mongoRows([short('a', 1), short('z', 1, { processingStatus: 'published' }),
      short('legacy', 2, { workflow: undefined, processingStatus: undefined, aspectRatio: undefined }),
      short('unpublished', 0, { isPublished: false }), short('regular', 0, { isShort: false })]);
    const result = await new VideoRepository().getHomeFeedVideos({ videos: 0, shorts: 12 }, 'mongo');
    expect(result.rawShorts.map(row => (row as { _id: string })._id)).toEqual(['z', 'a', 'legacy']);
  });
  it.each(['uploaded', 'processing', 'failed', 'review', 'approved'])('excludes %s media before limiting', async status => {
    mongoRows([short('unready', 0, { processingStatus: status }), short('ready', 1)]);
    const result = await new VideoRepository().getHomeFeedVideos({ videos: 0, shorts: 1 }, 'mongo');
    expect(result.rawShorts.map(row => (row as { _id: string })._id)).toEqual(['ready']);
  });
  it('shares the canonical public Swipe Mongo predicate', async () => {
    mongoRows([short('ready', 1)]);
    const repository = new VideoRepository();
    await repository.getHomeFeedVideos({ videos: 0, shorts: 12 }, 'mongo');
    mocks.available.mockResolvedValue(true);
    await repository.getPublicSwipeFeedPage({ limit: 12 });
    expect(mocks.find.mock.calls[0][0]).toEqual(mocks.find.mock.calls[1][0]);
    expect(mocks.available).toHaveBeenCalledWith({ label: 'public swipe feed' });
  });
  it('uses file-store selection without Mongo during builds and deduplicates Shorts', async () => {
    mocks.fileRows.mockResolvedValue([short('valid', 20), short('valid', 20), short('older', 30),
      short('processing', 1, { processingStatus: 'processing' }), short('future', 2, { publishedAt: new Date('2099-01-01') })]);
    const previous = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    try {
      const result = await new VideoRepository().getHomeFeedVideos({ videos: 0, shorts: 12 });
      expect(selectHomepageMedia(result.rawShorts, 'shorts', now).map(row => row.id)).toEqual(['valid', 'older']);
      expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
    } finally { if (previous !== undefined) process.env.MONGODB_URI = previous; }
  });
  it('preserves file fallback when configured Mongo cannot connect', async () => {
    const previous = process.env.MONGODB_URI; process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/qa';
    mocks.connect.mockRejectedValueOnce(new Error('unavailable'));
    mocks.fileRows.mockResolvedValue([short('file-valid', 20)]);
    try {
      const result = await new VideoRepository().getHomeFeedVideos({ videos: 0, shorts: 12 });
      expect(selectHomepageMedia(result.rawShorts, 'shorts', now).map(row => row.id)).toEqual(['file-valid']);
      expect(mocks.find).not.toHaveBeenCalled();
    } finally { if (previous === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previous; }
  });
});

describe('Homepage standard-video candidates', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); mocks.fileRows.mockResolvedValue([]); });
  afterEach(() => vi.useRealTimers());
  const standard = (id: string, age: number, extra: Record<string, unknown> = {}) =>
    short(id, age, { isShort: false, aspectRatio: '16:9', ...extra });

  it('finds older eligible standard videos before the twelve-candidate Mongo limit', async () => {
    const future = new Date('2099-01-01');
    const invalidStates = [{ workflow: { status: 'draft' } },
      { workflow: { status: 'scheduled', scheduledFor: future } }, { publishedAt: future },
      { processingStatus: 'processing' }, { processingStatus: 'failed' },
      { workflow: { status: 'published', scheduledFor: future } }];
    const invalid = Array.from({ length: 18 }, (_, i) => standard(`invalid-${i}`, i, invalidStates[i % invalidStates.length]));
    const valid = Array.from({ length: 15 }, (_, i) => standard(`valid-${i}`, 100 + i));
    mongoRows([...invalid, ...valid, short('short', 0), standard('unpublished', 0, { isPublished: false })]);
    const result = await new VideoRepository().getHomeFeedVideos({ videos: 12, shorts: 0 }, 'mongo');
    expect(result.rawVideos.map(row => (row as { _id: string })._id)).toEqual(valid.slice(0, 12).map(row => row._id));
    expect(selectHomepageMedia(result.rawVideos, 'videos', now).map(row => row.id)).toEqual(['valid-0', 'valid-1', 'valid-2']);
    expect(mocks.fileRows).not.toHaveBeenCalled();
  });

  it('preserves publishedAt/id order, due schedules and legacy ready standard videos', async () => {
    mongoRows([standard('a', 1), standard('z', 1, { processingStatus: 'published' }),
      standard('due', 2, { workflow: { status: 'published', scheduledFor: now } }),
      standard('legacy', 3, { isShort: undefined, workflow: undefined, processingStatus: undefined }),
      ...['uploaded', 'review', 'approved'].map(status => standard(status, 0, { processingStatus: status }))]);
    const result = await new VideoRepository().getHomeFeedVideos({ videos: 12, shorts: 0 }, 'mongo');
    expect(result.rawVideos.map(row => (row as { _id: string })._id)).toEqual(['z', 'a', 'due', 'legacy']);
  });

  it('keeps file-store standard-video filtering and dedupe safe without Mongo', async () => {
    mocks.fileRows.mockResolvedValue([standard('valid', 20), standard('valid', 20), standard('older', 30),
      standard('draft', 0, { workflow: { status: 'draft' } }), standard('processing', 1, { processingStatus: 'processing' }),
      standard('future', 2, { publishedAt: new Date('2099-01-01') }), short('short', 0)]);
    const previous = process.env.MONGODB_URI; delete process.env.MONGODB_URI;
    try {
      const result = await new VideoRepository().getHomeFeedVideos({ videos: 12, shorts: 0 });
      const selected = selectHomepageMedia(result.rawVideos, 'videos', now);
      expect(selected.map(row => row.id)).toEqual(['valid', 'older']);
      expect(new Set(selected.map(row => row.slug)).size).toBe(2);
      expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
    } finally { if (previous !== undefined) process.env.MONGODB_URI = previous; }
  });
});
