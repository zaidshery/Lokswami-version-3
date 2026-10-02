import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

const connectDBMock = vi.fn();
const getStoredArticleByIdMock = vi.fn();
const getStoredArticleByIdOrSlugMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();
const resolvePublicArticleTokenMock = vi.fn();
const mongoAvailableMock = vi.fn();
const mongoFindMock = vi.fn();
const mongoCountMock = vi.fn();

vi.mock('@/lib/db/mongoAvailability', () => ({ isMongoAvailable: mongoAvailableMock }));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    find: mongoFindMock,
    countDocuments: mongoCountMock,
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
  it('maps Mongo ObjectIds and Date timestamps into both canonical sitemap feeds', async () => {
    mongoAvailableMock.mockResolvedValue(true);
    const id = new Types.ObjectId();
    const publication = new Date('2026-10-02T06:00:00.000Z');
    const rows = [
      { _id: id, slug: 'mongo-published', title: 'Published story', publishedAt: publication,
        updatedAt: publication, seo: { includeInNewsSitemap: true }, workflow: { status: 'published' } },
      ...['draft', 'archived', 'scheduled'].map(status => ({ _id: new Types.ObjectId(), slug: status,
        publishedAt: publication, updatedAt: publication, workflow: { status, scheduledFor: new Date('2099-01-01') } })),
    ];
    const query = { select: vi.fn(), sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), lean: vi.fn(async () => rows) };
    for (const method of ['select', 'sort', 'skip', 'limit'] as const) query[method].mockReturnValue(query);
    mongoFindMock.mockReturnValue(query);
    const { listArticlesForSitemapSlice, listNewsArticlesForSitemap } = await import('@/lib/content/serverArticles');
    const general = await listArticlesForSitemapSlice();
    expect(general).toEqual([{ id: id.toHexString(), slug: 'mongo-published', updatedAt: publication.toISOString() }]);
    const news = await listNewsArticlesForSitemap(100, new Date('2026-10-02T08:00:00Z'));
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ id: id.toHexString(), publishedAt: publication.toISOString() });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mongoAvailableMock.mockResolvedValue(false);
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

  it('keeps drafts, future schedules, and archived records out of file sitemap counts and slices', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      { _id: 'published', slug: 'published', updatedAt: '2026-01-01', workflow: { status: 'published' } },
      { _id: 'due', slug: 'due', updatedAt: '2026-01-01', workflow: { status: 'scheduled', scheduledFor: '2000-01-01' } },
      { _id: 'future', slug: 'future', workflow: { status: 'scheduled', scheduledFor: '2099-01-01' } },
      { _id: 'draft', slug: 'draft', workflow: { status: 'draft' } },
      { _id: 'archived', slug: 'archived', workflow: { status: 'archived' } },
    ]);
    const { countPublicArticlesForSitemap, listArticlesForSitemapSlice } = await import('@/lib/content/serverArticles');
    expect(await countPublicArticlesForSitemap()).toBe(2);
    expect((await listArticlesForSitemapSlice()).map(item => item.id)).toEqual(['published', 'due']);
    expect((await listArticlesForSitemapSlice({ skip: 1, limit: 1 })).map(item => item.id)).toEqual(['due']);
  });

  it('uses matching publication predicates and stable pagination for Mongo sitemap count and chunks', async () => {
    mongoAvailableMock.mockResolvedValue(true);
    mongoCountMock.mockResolvedValue(1);
    const query = { select: vi.fn(), sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), lean: vi.fn().mockResolvedValue([]) };
    for (const method of ['select', 'sort', 'skip', 'limit'] as const) query[method].mockReturnValue(query);
    mongoFindMock.mockReturnValue(query);
    const { countPublicArticlesForSitemap, listArticlesForSitemapSlice } = await import('@/lib/content/serverArticles');
    await countPublicArticlesForSitemap();
    await listArticlesForSitemapSlice({ skip: 2500, limit: 2500 });
    const counted = mongoCountMock.mock.calls[0][0];
    const listed = mongoFindMock.mock.calls[0][0];
    for (const predicate of [counted, listed]) expect(predicate.$or).toEqual([
      { 'workflow.status': 'published' },
      { 'workflow.status': 'scheduled', 'workflow.scheduledFor': { $lte: expect.any(Date) } },
      { 'workflow.status': { $in: [null, undefined] }, publishedAt: { $exists: true, $ne: null } },
    ]);
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1, _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(2500);
    expect(query.limit).toHaveBeenCalledWith(2500);
  });
});
