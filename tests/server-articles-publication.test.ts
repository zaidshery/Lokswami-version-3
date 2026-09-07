import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectDBMock = vi.fn();
const getStoredArticleByIdMock = vi.fn();
const getStoredArticleByIdOrSlugMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();
const resolvePublicArticleTokenMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  getStoredArticleById: getStoredArticleByIdMock,
  getStoredArticleByIdOrSlug: getStoredArticleByIdOrSlugMock,
  listAllStoredArticles: listAllStoredArticlesMock,
}));

vi.mock('@/lib/server/publicArticles', () => ({
  resolvePublicArticleToken: resolvePublicArticleTokenMock,
}));

describe('server article publication helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getStoredArticleByIdOrSlugMock.mockImplementation((token: string) =>
      getStoredArticleByIdMock(token)
    );
    resolvePublicArticleTokenMock.mockResolvedValue({ kind: 'missing' });
  });

  it('hides unpublished articles from metadata lookups', async () => {
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'draft-1',
      title: 'Draft article',
      summary: 'Draft summary',
      content: 'Draft content',
      image: '/draft.jpg',
      category: 'General',
      author: 'Reporter',
      publishedAt: '2026-04-13T10:00:00.000Z',
      updatedAt: '2026-04-13T10:00:00.000Z',
      seo: {
        metaTitle: '',
        metaDescription: '',
        ogImage: '',
        canonicalUrl: '',
      },
      workflow: {
        status: 'draft',
      },
    });

    const { getArticleForMetadata } = await import('@/lib/content/serverArticles');
    const article = await getArticleForMetadata('draft-1');

    expect(article).toBeNull();
  });

  it('includes only published articles in sitemap lookups', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'draft-1',
        updatedAt: '2026-04-13T10:00:00.000Z',
        publishedAt: '2026-04-13T10:00:00.000Z',
        workflow: {
          status: 'draft',
        },
      },
      {
        _id: 'published-1',
        slug: 'published-slug',
        updatedAt: '2026-04-13T09:00:00.000Z',
        publishedAt: '2026-04-13T09:00:00.000Z',
        workflow: {
          status: 'published',
        },
      },
    ]);

    const { listArticlesForSitemap } = await import('@/lib/content/serverArticles');
    const articles = await listArticlesForSitemap(500);

    expect(articles).toEqual([
      {
        id: 'published-1',
        slug: 'published-slug',
        updatedAt: '2026-04-13T09:00:00.000Z',
      },
    ]);
  });

  it('resolves metadata by slug and preserves canonical slug fields', async () => {
    resolvePublicArticleTokenMock.mockResolvedValue({
      kind: 'previous',
      source: 'file',
      authoritativePath: '/main/article/indore-metro-update',
      isExactAuthority: false,
      article: {
      id: 'article-1',
      slug: 'indore-metro-update',
      previousSlugs: ['old-indore-metro-update'],
      title: 'Indore Metro update',
      summary: 'Metro summary',
      content: 'Metro content',
      image: '/metro.jpg',
      category: 'National',
      author: 'Desk',
      publishedAt: '2026-05-06T09:00:00.000Z',
      updatedAt: '2026-05-06T10:00:00.000Z',
      seo: {
        metaTitle: 'SEO title',
        metaDescription: '',
        ogImage: '',
        canonicalUrl: '',
        includeInNewsSitemap: true,
      },
      href: '/main/article/indore-metro-update',
      },
    });

    const { getArticleForMetadata } = await import('@/lib/content/serverArticles');
    const article = await getArticleForMetadata('old-indore-metro-update');

    expect(article).toEqual(
      expect.objectContaining({
        id: 'article-1',
        slug: 'indore-metro-update',
        previousSlugs: ['old-indore-metro-update'],
      })
    );
  });

  it('filters Google News sitemap articles to recent opted-in published stories', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'recent-1',
        slug: 'recent-story',
        title: 'Recent story',
        updatedAt: '2026-05-06T09:30:00.000Z',
        publishedAt: '2026-05-06T09:00:00.000Z',
        seo: { includeInNewsSitemap: true },
        workflow: { status: 'published' },
      },
      {
        _id: 'old-1',
        slug: 'old-story',
        title: 'Old story',
        updatedAt: '2026-05-01T09:30:00.000Z',
        publishedAt: '2026-05-01T09:00:00.000Z',
        seo: { includeInNewsSitemap: true },
        workflow: { status: 'published' },
      },
      {
        _id: 'hidden-1',
        slug: 'hidden-story',
        title: 'Hidden story',
        updatedAt: '2026-05-06T09:30:00.000Z',
        publishedAt: '2026-05-06T09:00:00.000Z',
        seo: { includeInNewsSitemap: false },
        workflow: { status: 'published' },
      },
    ]);

    const { listNewsArticlesForSitemap } = await import('@/lib/content/serverArticles');
    const articles = await listNewsArticlesForSitemap(100, new Date('2026-05-06T12:00:00.000Z'));

    expect(articles).toEqual([
      expect.objectContaining({
        id: 'recent-1',
        slug: 'recent-story',
        title: 'Recent story',
      }),
    ]);
  });

  it('correctly handles scheduled articles: past due are visible, future are hidden', async () => {
    const { isPubliclyPublishedArticle } = await import('@/lib/content/articlePublication');

    const now = new Date('2026-05-10T12:00:00.000Z');

    const futureScheduled = {
      workflow: {
        status: 'scheduled',
        scheduledFor: '2026-05-10T15:00:00.000Z',
      },
    };

    const pastScheduled = {
      workflow: {
        status: 'scheduled',
        scheduledFor: '2026-05-10T10:00:00.000Z',
      },
    };

    expect(isPubliclyPublishedArticle(futureScheduled, now)).toBe(false);
    expect(isPubliclyPublishedArticle(pastScheduled, now)).toBe(true);
  });
});
