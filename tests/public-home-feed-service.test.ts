import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectDBMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();
const listAllStoredVideosMock = vi.fn();
const listAllStoredEPapersMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/models/Video', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  listAllStoredArticles: listAllStoredArticlesMock,
}));

vi.mock('@/lib/storage/videosFile', () => ({
  listAllStoredVideos: listAllStoredVideosMock,
}));

vi.mock('@/lib/storage/epapersFile', () => ({
  listAllStoredEPapers: listAllStoredEPapersMock,
}));

describe('public home feed service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
  });

  it('excludes non-public and unfinished videos even when their legacy publish flag is true', async () => {
    listAllStoredArticlesMock.mockResolvedValue([]);
    listAllStoredEPapersMock.mockResolvedValue([]);
    const published = {
      title: 'Published video', category: 'News', thumbnail: '/poster.jpg',
      videoUrl: '/video.mp4', isPublished: true, publishedAt: '2026-01-01T00:00:00Z',
      workflow: { status: 'published' },
    };
    listAllStoredVideosMock.mockResolvedValue([
      { ...published, _id: 'ready', playbackUrl: '/ready.mp4' },
      { ...published, _id: 'draft', workflow: { status: 'draft' } },
      { ...published, _id: 'review', workflow: { status: 'in_review' } },
      { ...published, _id: 'future', publishedAt: '2099-01-01T00:00:00Z' },
      { ...published, _id: 'scheduled', workflow: { status: 'scheduled', scheduledFor: '2099-01-01' } },
      { ...published, _id: 'processing', processingStatus: 'processing' },
      { ...published, _id: 'failed', processingStatus: 'failed', isShort: true },
      { ...published, _id: 'landscape-short', isShort: true, aspectRatio: '16:9' },
      { ...published, _id: 'ready-short', isShort: true, aspectRatio: '9:16' },
    ]);
    const { getPublicHomeFeed } = await import('@/lib/server/publicHomeFeed');
    const { feed } = await getPublicHomeFeed();
    expect(feed.videos.map((item) => item.id)).toEqual(['ready']);
    expect(feed.shorts.map((item) => item.id)).toEqual(['ready-short']);
  });

  it('builds a mobile-ready home feed from file-store data without legacy route fetches', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'draft-1',
        slug: 'draft',
        title: 'Draft story',
        summary: 'Hidden draft',
        image: '/draft.jpg',
        category: 'General',
        author: 'Desk',
        publishedAt: '2026-05-09T08:00:00.000Z',
        workflow: { status: 'draft' },
      },
      {
        _id: 'article-1',
        slug: 'lead-story',
        title: 'Lead Story',
        summary: 'Lead summary',
        image: '/lead.jpg',
        category: 'Indore',
        author: 'Reporter',
        publishedAt: '2026-05-09T10:00:00.000Z',
        views: 25,
        isBreaking: true,
        isTrending: true,
        workflow: { status: 'published' },
      },
      {
        _id: 'article-2',
        slug: 'second-story',
        title: 'Second Story',
        summary: 'Second summary',
        image: '/second.jpg',
        category: 'State',
        author: 'Editor',
        publishedAt: '2026-05-09T09:00:00.000Z',
        views: 5,
        workflow: { status: 'published' },
      },
    ]);
    listAllStoredVideosMock.mockResolvedValue([
      {
        _id: 'video-1',
        title: 'Video Story',
        description: 'Video summary',
        thumbnail: '/video.jpg',
        videoUrl: 'https://video.example.com/watch',
        duration: 90,
        category: 'News',
        isPublished: true,
        isShort: false,
        publishedAt: '2026-05-09T07:00:00.000Z',
      },
      {
        _id: 'short-1',
        title: 'Short Story',
        description: 'Short summary',
        thumbnail: '/short.jpg',
        videoUrl: 'https://video.example.com/short',
        duration: 30,
        category: 'News',
        isPublished: true,
        isShort: true,
        publishedAt: '2026-05-09T06:00:00.000Z',
      },
    ]);
    listAllStoredEPapersMock.mockResolvedValue([
      {
        _id: 'paper-mumbai-newer',
        city: 'Mumbai',
        title: 'Mumbai Edition',
        publishDate: '2026-05-10',
        thumbnailPath: '/mumbai-paper.jpg',
        pdfPath: '/mumbai-paper.pdf',
        pages: 16,
      },
      {
        _id: 'paper-1',
        city: 'Indore',
        title: 'Indore Edition',
        publishDate: '2026-05-09',
        thumbnailPath: '/paper.jpg',
        pdfPath: '/paper.pdf',
        pages: 12,
      },
    ]);

    const { getPublicHomeFeed } = await import('@/lib/server/publicHomeFeed');
    const result = await getPublicHomeFeed({ limits: { hero: 1, latest: 2 } });

    expect(result.source).toBe('file');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(result.feed.hero).toHaveLength(1);
    expect(result.feed.hero[0]).toEqual(
      expect.objectContaining({
        id: 'article-1',
        href: '/main/article/lead-story',
      })
    );
    expect(result.feed.latest.map((item) => item.id)).toEqual(['article-2']);
    expect(result.feed.trending.map((item) => item.id)).toEqual(['article-1']);
    expect(result.feed.breaking.map((item) => item.id)).toEqual(['article-1']);
    expect(result.feed.videos[0]?.id).toBe('video-1');
    expect(result.feed.shorts[0]?.id).toBe('short-1');
    expect(result.feed.epaper).toEqual(
      expect.objectContaining({
        id: 'paper-1',
        publicationType: 'epaper',
        citySlug: 'indore',
        href: '/main/epaper?city=indore&date=2026-05-09',
      })
    );
    expect(result.feed.emagazine).toBeNull();
  });

  it('builds a lightweight homepage initial feed without unused media sections', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'article-1',
        slug: 'lead-story',
        title: 'Lead Story',
        summary: 'Lead summary',
        image: '/lead.jpg',
        category: 'Indore',
        author: 'Reporter',
        publishedAt: '2026-05-09T10:00:00.000Z',
        views: 25,
        isBreaking: true,
        isTrending: true,
        workflow: { status: 'published' },
      },
      {
        _id: 'article-2',
        slug: 'second-story',
        title: 'Second Story',
        summary: 'Second summary',
        image: '/second.jpg',
        category: 'State',
        author: 'Editor',
        publishedAt: '2026-05-09T09:00:00.000Z',
        views: 5,
        workflow: { status: 'published' },
      },
    ]);
    listAllStoredVideosMock.mockResolvedValue([
      {
        _id: 'video-1',
        title: 'Video Story',
        description: 'Video summary',
        thumbnail: '/video.jpg',
        videoUrl: 'https://video.example.com/watch',
        duration: 90,
        category: 'News',
        isPublished: true,
        isShort: false,
        publishedAt: '2026-05-09T07:00:00.000Z',
      },
    ]);
    listAllStoredEPapersMock.mockResolvedValue([
      {
        _id: 'paper-1',
        city: 'Indore',
        title: 'Indore Edition',
        publishDate: '2026-05-09',
        thumbnailPath: '/paper.jpg',
        pdfPath: '/paper.pdf',
        pages: 12,
      },
    ]);

    const { getPublicHomepageInitialFeed } = await import('@/lib/server/publicHomeFeed');
    const result = await getPublicHomepageInitialFeed();

    expect(result.limits).toEqual({
      hero: 5,
      latest: 6,
      trending: 3,
      breaking: 0,
      videos: 0,
      shorts: 0,
    });
    expect(listAllStoredVideosMock).not.toHaveBeenCalled();
    expect(result.feed.breaking).toEqual([]);
    expect(result.feed.videos).toEqual([]);
    expect(result.feed.shorts).toEqual([]);
    expect(result.feed.epaper?.id).toBe('paper-1');
    expect(result.feed.emagazine).toBeNull();
  });
});
