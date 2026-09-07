import { beforeEach, describe, expect, it, vi } from 'vitest';

const isMongoAvailableMock = vi.fn();
const findOneMock = vi.fn();
const findMock = vi.fn();
const listAllStoredVideosMock = vi.fn();

vi.mock('@/lib/db/mongoAvailability', () => ({
  isMongoAvailable: isMongoAvailableMock,
}));
vi.mock('@/lib/models/Video', () => ({
  default: { findOne: findOneMock, find: findMock },
}));
vi.mock('@/lib/storage/videosFile', () => ({
  listAllStoredVideos: listAllStoredVideosMock,
}));
vi.mock('@/lib/server/publicArticles', () => ({
  getPublicArticleBySlug: vi.fn(),
}));

function swipeRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'video-1',
    slug: 'story-one',
    title: 'Story one',
    description: 'Summary',
    thumbnail: '/poster.jpg',
    posterUrl: '/poster.jpg',
    videoUrl: 'https://cdn.example.com/story.mp4',
    playbackUrl: 'https://cdn.example.com/story.mp4',
    mediaProvider: 'spaces-mp4',
    aspectRatio: '9:16',
    processingStatus: 'ready',
    category: 'National',
    duration: 30,
    isShort: true,
    isPublished: true,
    publishedAt: '2026-09-01T08:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
    workflow: { status: 'published' },
    ...overrides,
  };
}

function mockFindOne(row: unknown) {
  findOneMock.mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(row) }),
  });
}

function mockLegacyFind(rows: unknown[]) {
  const lean = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ lean });
  const sort = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ sort });
  findMock.mockReturnValue({ select });
}

describe('public Swipe story resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMongoAvailableMock.mockResolvedValue(true);
    mockFindOne(null);
    mockLegacyFind([]);
    listAllStoredVideosMock.mockResolvedValue([]);
  });

  it('resolves an exact persisted slug without scanning the recent feed', async () => {
    mockFindOne(swipeRow());
    const { getPublicSwipeVideoBySlug } = await import('@/lib/server/publicVideos');

    const video = await getPublicSwipeVideoBySlug('story-one');

    expect(video?._id).toBe('video-1');
    expect(findOneMock).toHaveBeenCalledWith({
      isPublished: true,
      isShort: true,
      slug: 'story-one',
    });
    expect(findMock).not.toHaveBeenCalled();
    expect(listAllStoredVideosMock).not.toHaveBeenCalled();
  });

  it('does not serve stale file-store content when MongoDB authoritatively has no match', async () => {
    listAllStoredVideosMock.mockResolvedValue([swipeRow()]);
    const { getPublicSwipeVideoBySlug } = await import('@/lib/server/publicVideos');

    await expect(getPublicSwipeVideoBySlug('story-one')).resolves.toBeNull();
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(listAllStoredVideosMock).not.toHaveBeenCalled();
  });

  it('uses file storage only when MongoDB is unavailable', async () => {
    isMongoAvailableMock.mockResolvedValue(false);
    listAllStoredVideosMock.mockResolvedValue([swipeRow()]);
    const { getPublicSwipeVideoBySlug } = await import('@/lib/server/publicVideos');

    await expect(getPublicSwipeVideoBySlug('story-one')).resolves.toEqual(
      expect.objectContaining({ _id: 'video-1', slug: 'story-one' })
    );
    expect(findOneMock).not.toHaveBeenCalled();
    expect(listAllStoredVideosMock).toHaveBeenCalledTimes(1);
  });
});
