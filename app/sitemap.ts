import type { MetadataRoute } from 'next';
import { EPAPER_CITY_OPTIONS } from '@/lib/constants/epaperCities';
import { NEWS_CATEGORIES, getNewsCategoryHref } from '@/lib/constants/newsCategories';
import { listEPapersForSitemap } from '@/lib/content/publicSitemap';
import {
  countPublicArticlesForSitemap,
  getServerArticlePath,
  listArticlesForSitemap,
  listArticlesForSitemapSlice,
} from '@/lib/content/serverArticles';

export const revalidate = 86_400;

const FALLBACK_SITE_URL = 'http://localhost:3000';
const ARTICLE_SITEMAP_LIMIT = 5000;
const SITEMAP_ARTICLE_CHUNK_SIZE = 2500;
const EPAPER_SITEMAP_LIMIT = 1000;

type StaticSitemapRoute = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
};

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL;
  return raw.replace(/\/+$/, '');
}

function absoluteUrl(baseUrl: string, path: string) {
  if (!path.startsWith('/')) {
    return `${baseUrl}/${path}`;
  }
  return `${baseUrl}${path}`;
}

function buildEpaperIssuePath(input: { id: string; citySlug: string; publishDate: string }) {
  const params = new URLSearchParams({
    paper: input.id,
    city: input.citySlug,
    date: input.publishDate,
  });
  return `/main/epaper?${params.toString()}`;
}

function uniqueEntries(entries: MetadataRoute.Sitemap) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}

/**
 * Next.js App Router dynamic sitemap indexing.
 * Generates an index of sitemaps chunked at 2,500 articles each,
 * lifting the previous hardcoded 5,000 article limit.
 */
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const totalArticles =
    typeof countPublicArticlesForSitemap === 'function'
      ? await countPublicArticlesForSitemap()
      : 0;
  const chunkCount = Math.max(1, Math.ceil(totalArticles / SITEMAP_ARTICLE_CHUNK_SIZE));
  return Array.from({ length: chunkCount }, (_, index) => ({ id: index }));
}

/**
 * Emits sitemap entries.
 * When invoked with an explicit chunk id ({ id }), serves paginated article slices.
 * When invoked without arguments (legacy / test calls), serves default complete sitemap.
 */
export default async function sitemap(props?: {
  id?: number | string;
}): Promise<MetadataRoute.Sitemap> {
  const isChunkedRequest = typeof props?.id !== 'undefined';
  const sitemapId =
    typeof props?.id === 'number'
      ? props.id
      : typeof props?.id === 'string'
        ? Number.parseInt(props.id, 10) || 0
        : 0;

  const siteUrl = getSiteUrl();
  const now = new Date();

  // If this is a chunked request for page > 0, return only that article slice
  if (isChunkedRequest && sitemapId > 0) {
    const articles = typeof listArticlesForSitemapSlice === 'function'
      ? await listArticlesForSitemapSlice({
          skip: sitemapId * SITEMAP_ARTICLE_CHUNK_SIZE,
          limit: SITEMAP_ARTICLE_CHUNK_SIZE,
        })
      : await listArticlesForSitemap(SITEMAP_ARTICLE_CHUNK_SIZE);

    const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
      url: absoluteUrl(siteUrl, getServerArticlePath(article)),
      lastModified: new Date(article.updatedAt),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return uniqueEntries(articleEntries);
  }

  // Base routes: static pages, categories, and e-paper editions
  const staticRoutes: StaticSitemapRoute[] = [
    { path: '/', changeFrequency: 'daily', priority: 0.7 },
    { path: '/main', changeFrequency: 'hourly', priority: 1 },
    { path: '/main/latest', changeFrequency: 'hourly', priority: 0.9 },
    { path: '/main/videos', changeFrequency: 'daily', priority: 0.8 },
    { path: '/main/ftaftaf', changeFrequency: 'daily', priority: 0.7 },
    { path: '/main/epaper', changeFrequency: 'daily', priority: 0.85 },
    { path: '/main/e-magazine', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/main/elections', changeFrequency: 'daily', priority: 0.7 },
    { path: '/main/search', changeFrequency: 'weekly', priority: 0.45 },
    { path: '/main/digital-newsroom', changeFrequency: 'weekly', priority: 0.55 },
    { path: '/main/about', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/main/contact', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/main/advertise', changeFrequency: 'monthly', priority: 0.45 },
    { path: '/main/careers', changeFrequency: 'weekly', priority: 0.45 },
    { path: '/main/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/main/terms', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/main/cookies', changeFrequency: 'yearly', priority: 0.25 },
    { path: '/main/disclaimer', changeFrequency: 'yearly', priority: 0.25 },
    { path: '/main/sitemap', changeFrequency: 'weekly', priority: 0.4 },
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: absoluteUrl(siteUrl, route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const categoryEntries: MetadataRoute.Sitemap = NEWS_CATEGORIES.map((category) => ({
    url: absoluteUrl(siteUrl, getNewsCategoryHref(category.slug)),
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  const epaperCityEntries: MetadataRoute.Sitemap = EPAPER_CITY_OPTIONS.map((city) => ({
    url: absoluteUrl(siteUrl, `/main/epaper?city=${encodeURIComponent(city.slug)}`),
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.65,
  }));

  const epapers = await listEPapersForSitemap(EPAPER_SITEMAP_LIMIT);
  const epaperEntries: MetadataRoute.Sitemap = epapers.map((paper) => ({
    url: absoluteUrl(siteUrl, buildEpaperIssuePath(paper)),
    lastModified: new Date(paper.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Fetch articles: chunked requests fetch slice 0; legacy unparameterized calls fetch up to ARTICLE_SITEMAP_LIMIT
  const articles = isChunkedRequest
    ? typeof listArticlesForSitemapSlice === 'function'
      ? await listArticlesForSitemapSlice({ skip: 0, limit: SITEMAP_ARTICLE_CHUNK_SIZE })
      : await listArticlesForSitemap(SITEMAP_ARTICLE_CHUNK_SIZE)
    : await listArticlesForSitemap(ARTICLE_SITEMAP_LIMIT);

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: absoluteUrl(siteUrl, getServerArticlePath(article)),
    lastModified: new Date(article.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return uniqueEntries([
    ...staticEntries,
    ...categoryEntries,
    ...epaperCityEntries,
    ...epaperEntries,
    ...articleEntries,
  ]);
}
