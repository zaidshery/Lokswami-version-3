import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listArticlesForSitemapMock = vi.fn();
const listNewsArticlesForSitemapMock = vi.fn();
const listEPapersForSitemapMock = vi.fn();
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

vi.mock('@/lib/content/serverArticles', () => ({
  countPublicArticlesForSitemap: vi.fn().mockResolvedValue(1),
  listArticlesForSitemap: listArticlesForSitemapMock,
  listArticlesForSitemapSlice: listArticlesForSitemapMock,
  listNewsArticlesForSitemap: listNewsArticlesForSitemapMock,
  getServerArticlePath: (article: { id: string; slug?: string }) =>
    `/main/article/${encodeURIComponent(article.slug || article.id)}`,
}));

vi.mock('@/lib/content/publicSitemap', () => ({
  listEPapersForSitemap: listEPapersForSitemapMock,
}));

describe('metadata routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listArticlesForSitemapMock.mockResolvedValue([]);
    listNewsArticlesForSitemapMock.mockResolvedValue([]);
    listEPapersForSitemapMock.mockResolvedValue([]);
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lokswami.com/';
  });

  afterEach(() => {
    if (typeof originalSiteUrl === 'undefined') {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      return;
    }
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it('builds robots metadata from the normalized production site URL', async () => {
    const { default: robots } = await import('@/app/robots');
    const payload = robots();

    expect(payload).toEqual({
      rules: [
        {
          userAgent: '*',
          allow: ['/', '/api/og/'],
          disallow: ['/admin', '/api', '/main/account', '/main/preferences', '/main/saved'],
        },
      ],
      sitemap: [
        'https://lokswami.com/sitemap.xml',
        'https://lokswami.com/news-sitemap.xml',
        'https://lokswami.com/video-sitemap.xml',
      ],
      host: 'https://lokswami.com',
    });
  });

  it('builds sitemap entries for static routes and articles on the configured site URL', async () => {
    listArticlesForSitemapMock.mockResolvedValue([
      {
        id: 'story/one',
        slug: 'slug-one',
        updatedAt: '2026-03-27T05:00:00.000Z',
      },
    ]);
    listEPapersForSitemapMock.mockResolvedValue([
      {
        id: 'epaper-1',
        citySlug: 'indore',
        publishDate: '2026-05-21',
        updatedAt: '2026-05-21T08:30:00.000Z',
      },
    ]);

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    expect(listArticlesForSitemapMock).toHaveBeenCalledWith(5000);
    expect(listEPapersForSitemapMock).toHaveBeenCalledWith(1000);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://lokswami.com/',
          changeFrequency: 'daily',
          priority: 0.7,
        }),
        expect.objectContaining({
          url: 'https://lokswami.com/main',
          changeFrequency: 'hourly',
          priority: 1,
        }),
        expect.objectContaining({
          url: 'https://lokswami.com/main/article/slug-one',
          changeFrequency: 'weekly',
          priority: 0.8,
          lastModified: new Date('2026-03-27T05:00:00.000Z'),
        }),
        expect.objectContaining({
          url: 'https://lokswami.com/main/category/politics',
          changeFrequency: 'daily',
          priority: 0.85,
        }),
        expect.objectContaining({
          url: 'https://lokswami.com/main/epaper?city=indore',
          changeFrequency: 'daily',
          priority: 0.65,
        }),
        expect.objectContaining({
          url: 'https://lokswami.com/main/epaper?paper=epaper-1&city=indore&date=2026-05-21',
          changeFrequency: 'weekly',
          priority: 0.7,
          lastModified: new Date('2026-05-21T08:30:00.000Z'),
        }),
      ])
    );
  });

  it('builds a Google News sitemap for recent eligible articles', async () => {
    listNewsArticlesForSitemapMock.mockResolvedValue([
      {
        id: 'article-1',
        slug: 'indore-metro-update',
        title: 'Indore Metro update',
        publishedAt: '2026-05-06T09:00:00.000Z',
        updatedAt: '2026-05-06T10:00:00.000Z',
        includeInNewsSitemap: true,
      },
    ]);

    const { GET } = await import('@/app/news-sitemap.xml/route');
    const response = await GET();
    const xml = await response.text();

    expect(response.headers.get('Content-Type')).toContain('application/xml');
    expect(xml).toContain('<loc>https://lokswami.com/main/article/indore-metro-update</loc>');
    expect(xml).toContain('<news:language>hi</news:language>');
    expect(xml).toContain('<news:title>Indore Metro update</news:title>');
  });
});
