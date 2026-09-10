import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVideoSlug } from '@/lib/content/videoPublication';

const isMongoAvailableMock = vi.fn();
const findOneMock = vi.fn();
const findMock = vi.fn();
const listAllStoredVideosMock = vi.fn();
const getPublicArticleBySlugMock = vi.fn();

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
  getPublicArticleBySlug: getPublicArticleBySlugMock,
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

function regularRow(id: string, publishedAt: string, overrides: Record<string, unknown> = {}) {
  return swipeRow({
    _id: id,
    slug: '',
    title: `Regular ${id}`,
    isShort: false,
    publishedAt,
    createdAt: publishedAt,
    ...overrides,
  });
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

  it('preserves legacy generated-slug lookup and published Article preview resolution', async () => {
    const legacy = swipeRow({ slug: '', articleId: 'published-article' });
    mockFindOne(null);
    mockLegacyFind([legacy]);
    getPublicArticleBySlugMock.mockResolvedValue({
      article: {
        id: 'article-1',
        slug: 'full-report',
        title: 'Full report',
        summary: 'Published article summary',
        category: 'National',
        author: 'Reporter',
        city: 'Indore',
        publishedAt: '2026-09-01T08:00:00.000Z',
        href: '/main/news/full-report',
      },
    });
    const { getPublicSwipeStory } = await import('@/lib/server/publicVideos');
    const generatedSlug = buildVideoSlug(legacy.title, legacy._id);

    const story = await getPublicSwipeStory(generatedSlug);

    expect(story?.video.slug).toBe(generatedSlug);
    expect(story?.article).toEqual(
      expect.objectContaining({
        id: 'article-1',
        slug: 'full-report',
        title: 'Full report',
        href: '/main/news/full-report',
      })
    );
    expect(getPublicArticleBySlugMock).toHaveBeenCalledWith('published-article');
  });
});

describe('public regular video feed domain boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMongoAvailableMock.mockResolvedValue(false);
  });

  it('keeps publishedAt/id cursor ordering and publication filtering in file mode', async () => {
    listAllStoredVideosMock.mockResolvedValue([
      regularRow('video-6', '2026-09-01T06:00:00.000Z'),
      regularRow('video-5', '2026-09-01T05:00:00.000Z'),
      regularRow('video-4', '2026-09-01T04:00:00.000Z'),
      regularRow('video-3', '2026-09-01T03:00:00.000Z'),
      regularRow('video-2', '2026-09-01T02:00:00.000Z'),
      regularRow('video-1', '2026-09-01T01:00:00.000Z'),
      regularRow('draft', '2026-09-01T08:00:00.000Z', {
        isPublished: false,
        workflow: { status: 'draft' },
      }),
      regularRow('future', '2099-09-01T08:00:00.000Z'),
    ]);
    const { getPublicVideoFeedPage } = await import('@/lib/server/publicVideos');

    const first = await getPublicVideoFeedPage({ limit: 5 });
    expect(first.items.map((item) => item._id)).toEqual([
      'video-6',
      'video-5',
      'video-4',
      'video-3',
      'video-2',
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual({
      publishedAt: '2026-09-01T02:00:00.000Z',
      id: 'video-2',
    });

    const second = await getPublicVideoFeedPage({
      limit: 5,
      cursorPublishedAt: first.nextCursor?.publishedAt,
      cursorId: first.nextCursor?.id,
    });
    expect(second.items.map((item) => item._id)).toEqual(['video-1']);
  });

  it('falls back to file storage when the Mongo read fails', async () => {
    isMongoAvailableMock.mockResolvedValue(true);
    findMock.mockImplementationOnce(() => {
      throw new Error('Mongo read failed');
    });
    listAllStoredVideosMock.mockResolvedValue([
      regularRow('file-video', '2026-09-01T01:00:00.000Z'),
    ]);
    const { getPublicVideoFeedPage } = await import('@/lib/server/publicVideos');

    const page = await getPublicVideoFeedPage();

    expect(page.items.map((item) => item._id)).toEqual(['file-video']);
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(listAllStoredVideosMock).toHaveBeenCalledTimes(1);
  });
});

describe('public Swipe feed domain boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMongoAvailableMock.mockResolvedValue(false);
  });

  it('uses createdAt-first cursors, publishedAt fallback, and excludes unsafe rows', async () => {
    const eligible = [
      swipeRow({ _id: 'short-a', slug: 'short-a', createdAt: '2026-09-01T06:00:00.000Z', publishedAt: '2026-09-01T01:00:00.000Z' }),
      swipeRow({ _id: 'short-b', slug: 'short-b', createdAt: '2026-09-01T05:00:00.000Z', publishedAt: '2026-09-01T10:00:00.000Z' }),
      swipeRow({ _id: 'short-c', slug: 'short-c', createdAt: '2026-09-01T04:00:00.000Z' }),
      swipeRow({ _id: 'short-d', slug: 'short-d', createdAt: '2026-09-01T03:00:00.000Z' }),
      swipeRow({ _id: 'short-e', slug: 'short-e', createdAt: '2026-09-01T02:00:00.000Z' }),
      swipeRow({
        _id: 'legacy-short',
        slug: '',
        createdAt: undefined,
        publishedAt: '2026-09-01T01:00:00.000Z',
        aspectRatio: undefined,
        processingStatus: undefined,
      }),
    ];
    listAllStoredVideosMock.mockResolvedValue([
      ...eligible,
      swipeRow({ _id: 'future', workflow: { status: 'published', scheduledFor: '2099-01-01T00:00:00.000Z' } }),
      swipeRow({ _id: 'unpublished', isPublished: false }),
      swipeRow({ _id: 'processing', processingStatus: 'processing' }),
      swipeRow({ _id: 'failed', processingStatus: 'failed' }),
      swipeRow({ _id: 'landscape', aspectRatio: '16:9' }),
    ]);
    const { getPublicSwipeFeedPage } = await import('@/lib/server/publicSwipeFeed');

    const first = await getPublicSwipeFeedPage({ limit: 5 });
    expect(first.items.map((item) => item._id)).toEqual([
      'short-a',
      'short-b',
      'short-c',
      'short-d',
      'short-e',
    ]);
    expect(first.nextCursor).toEqual({
      publishedAt: '2026-09-01T02:00:00.000Z',
      id: 'short-e',
    });

    const second = await getPublicSwipeFeedPage({
      limit: 5,
      cursorPublishedAt: first.nextCursor?.publishedAt,
      cursorId: first.nextCursor?.id,
    });
    expect(second.items.map((item) => item._id)).toEqual(['legacy-short']);
  });
});
