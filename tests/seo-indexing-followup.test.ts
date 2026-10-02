import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sitemap, { generateSitemaps } from '@/app/sitemap';
import robots from '@/app/robots';
import { GET as getSitemapIndex } from '@/app/sitemap.xml/route';
import { buildArticlePageMetadata, normalizeMetadataSiteUrl } from '@/lib/seo/articleMetadata';
import { resolveSiteUrl } from '@/lib/seo/readerPageMetadata';
import { buildArticlePublicPath, buildNewsArticleJsonLd, defaultArticleSeo, getSiteUrl } from '@/lib/seo/articleSeo';
import { toAbsoluteShareUrl } from '@/lib/utils/articleShare';
import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data';

const mocks = vi.hoisted(() => ({ count: vi.fn(), list: vi.fn(), papers: vi.fn() }));
vi.mock('@/lib/server/content/sitemapContentQueryService', () => ({
  sitemapContentQueryService: {
    countArticleChunks: mocks.count,
    listArticles: mocks.list,
    listEPapers: mocks.papers,
    articlePath: (article: { id: string; slug: string }) => buildArticlePublicPath(article),
  },
}));

const article = {
  id: '507f1f77bcf86cd799439011', slug: 'स्थानीय-हिंदी-समाचार', previousSlugs: [],
  title: 'स्थानीय हिंदी समाचार', summary: 'यह स्थानीय हिंदी समाचार की जानकारी है।',
  image: '/image.jpg', category: 'Regional', author: 'Local Author',
  publishedAt: '2026-10-01T06:00:00.000Z', updatedAt: '2026-10-01T07:00:00.000Z',
  seo: defaultArticleSeo(),
};

describe('SEO indexing discovery and canonical consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    mocks.count.mockResolvedValue(3);
    mocks.list.mockResolvedValue([article, article]);
    mocks.papers.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('serves the advertised sitemap as an XML index containing every generated chunk', async () => {
    const advertised = robots().sitemap as string[];
    expect(advertised[0]).toBe('https://lokswami.com/sitemap.xml');
    const response = await getSitemapIndex();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/xml');
    const xml = await response.text();
    const chunks = await generateSitemaps();
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])).toEqual(
      chunks.map(({ id }) => `https://lokswami.com/sitemap/${id}.xml`)
    );
    for (const { id } of chunks) {
      const entries = await sitemap({ id });
      expect(entries.some(entry => entry.url.endsWith(buildArticlePublicPath(article)))).toBe(true);
      expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ sitemapId: id, isChunkedRequest: true }));
    }
  });

  it.each(['', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'not-a-url', 'javascript:alert(1)'])('never emits a local or invalid production origin for %s', async (configured) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', configured);
    expect(getSiteUrl()).toBe('https://lokswami.com');
    expect(normalizeMetadataSiteUrl()).toBe(getSiteUrl());
    expect(resolveSiteUrl()).toBe(getSiteUrl());
    expect(toAbsoluteShareUrl(buildArticlePublicPath(article), 'http://localhost:3000')).toBe(`${getSiteUrl()}${buildArticlePublicPath(article)}`);
    expect((await sitemap({ id: 0 })).every(entry => new URL(entry.url).origin === getSiteUrl())).toBe(true);
    expect(await (await getSitemapIndex()).text()).not.toContain('localhost');
  });

  it.each(['https://lokswami.com/', 'https://preview.example.test/'])('aligns canonical, OG, schema, robots, share and sitemap on %s', async (configured) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', configured);
    const origin = new URL(configured).origin;
    const expected = `${origin}${buildArticlePublicPath(article)}`;
    const metadata = buildArticlePageMetadata({ article });
    expect(metadata.alternates?.canonical).toBe(expected);
    expect(metadata.openGraph).toEqual(expect.objectContaining({ url: expected }));
    expect(buildNewsArticleJsonLd(article).mainEntityOfPage['@id']).toBe(expected);
    expect((await sitemap({ id: 0 })).filter(entry => entry.url === expected)).toHaveLength(1);
    expect((robots().sitemap as string[])[0]).toBe(`${origin}/sitemap.xml`);
    expect(toAbsoluteShareUrl(buildArticlePublicPath(article), 'http://localhost:3000')).toBe(expected);
  });

  it('allows explicit local origins during development while retaining the public default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getSiteUrl('http://localhost:3015/')).toBe('http://localhost:3015');
    expect(getSiteUrl()).toBe('https://lokswami.com');
  });

  it('emits parseable Next.js XML and preserves E-Paper query parameters after XML decoding', async () => {
    mocks.papers.mockResolvedValue([{ id: 'issue-1', citySlug: 'indore', publishDate: '2026-10-01', updatedAt: article.updatedAt }]);
    const xml = resolveSitemap(await sitemap({ id: 0 }));
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    const urls = [...document.querySelectorAll('loc')].map(node => node.textContent);
    expect(urls).toContain('https://lokswami.com/main/epaper?paper=issue-1&city=indore&date=2026-10-01');
  });

  it('keeps wildcard crawl rules and private exclusions without adding AI bot policy', () => {
    expect(robots().rules).toEqual([expect.objectContaining({
      userAgent: '*', allow: ['/', '/api/og/'],
      disallow: ['/admin', '/api', '/main/account', '/main/preferences', '/main/saved'],
    })]);
  });

  it('uses the existing language detector and preserves schema fields without fabricating author URLs', () => {
    const hindi = buildNewsArticleJsonLd(article);
    const english = buildNewsArticleJsonLd({ ...article, title: 'English news headline', summary: 'English news summary.' });
    expect(hindi.inLanguage).toBe('hi-IN');
    expect(english.inLanguage).toBe('en-IN');
    expect(english).toMatchObject({
      '@context': 'https://schema.org', '@type': 'NewsArticle',
      headline: 'English news headline', description: 'English news summary.',
      image: ['https://lokswami.com/image.jpg'],
      datePublished: article.publishedAt, dateModified: article.updatedAt,
      author: [{ '@type': 'Person', name: article.author }],
      publisher: { '@type': 'Organization', name: 'Lokswami' },
    });
    expect(english.author[0]).not.toHaveProperty('url');
    expect(JSON.parse(JSON.stringify(english))).toEqual(english);
  });
});
