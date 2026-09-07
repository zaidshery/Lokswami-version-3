import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import { isPubliclyPublishedArticle } from '@/lib/content/articlePublication';
import Article from '@/lib/models/Article';
import type { ArticleSeo } from '@/lib/storage/articlesFile';
import { listAllStoredArticles } from '@/lib/storage/articlesFile';
import { resolvePublicArticleToken } from '@/lib/server/publicArticles';
import {
  buildArticlePublicPath,
  normalizeArticleSeo,
  normalizeArticleSlug,
} from '@/lib/seo/articleSeo';

export type ServerArticle = {
  id: string;
  slug: string;
  previousSlugs: string[];
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  seo: ArticleSeo;
};

export type ServerArticleSitemapItem = {
  id: string;
  slug: string;
  updatedAt: string;
};

export type ServerNewsArticleSitemapItem = ServerArticleSitemapItem & {
  title: string;
  publishedAt: string;
  includeInNewsSitemap: boolean;
};

const USE_REMOTE_DEMO_MEDIA =
  process.env.NEXT_PUBLIC_USE_REMOTE_DEMO_MEDIA === 'true';
const UNSPLASH_IMAGE_HOST = /^https:\/\/images\.unsplash\.com\//i;
const LOCAL_NEWS_FALLBACK_IMAGE = '/placeholders/news-16x9.svg';

function normalizeMediaUrl(value: string, fallback = LOCAL_NEWS_FALLBACK_IMAGE) {
  const media = value.trim();
  if (!media) return fallback;
  if (!USE_REMOTE_DEMO_MEDIA && UNSPLASH_IMAGE_HOST.test(media)) {
    return fallback;
  }
  return media;
}

function normalizeSeo(input: unknown): ArticleSeo {
  const seo = normalizeArticleSeo(input);
  return {
    ...seo,
    ogImage: normalizeMediaUrl(seo.ogImage, ''),
  };
}

function stringifyField(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export async function getArticleForMetadata(id: string) {
  const resolution = await resolvePublicArticleToken(id);
  if (resolution.kind === 'missing') return null;
  if (resolution.kind === 'ambiguous' || resolution.kind === 'unavailable') {
    throw new Error(`Article metadata resolution ${resolution.kind}`);
  }
  return {
    id: resolution.article.id,
    slug: resolution.article.slug,
    previousSlugs: resolution.article.previousSlugs,
    title: resolution.article.title,
    summary: resolution.article.summary,
    image: resolution.article.image,
    category: resolution.article.category,
    author: resolution.article.author,
    publishedAt: resolution.article.publishedAt,
    updatedAt: resolution.article.updatedAt,
    seo: resolution.article.seo,
  } satisfies ServerArticle;
}

function toSitemapItem(input: unknown): ServerArticleSitemapItem | null {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const id =
    typeof source._id === 'string'
      ? source._id
      : typeof source.id === 'string'
        ? source.id
        : '';
  if (!id) return null;
  const slug = normalizeArticleSlug(stringifyField(source.slug));

  const updatedAtRaw = source.updatedAt;
  const updatedAtValue = new Date(
    typeof updatedAtRaw === 'string' || typeof updatedAtRaw === 'number'
      ? updatedAtRaw
      : Date.now()
  );
  const updatedAt = Number.isNaN(updatedAtValue.getTime())
    ? new Date().toISOString()
    : updatedAtValue.toISOString();

  return { id, slug, updatedAt };
}

export async function listArticlesForSitemap(limit = 500) {
  if (await isMongoAvailable({ label: 'sitemap articles lookup' })) {
    try {
      const records = await Article.find({
        $or: [
          { 'workflow.status': 'published' },
          {
            'workflow.status': 'scheduled',
            'workflow.scheduledFor': { $lte: new Date() },
          },
          {
            'workflow.status': { $in: [null, undefined] },
            publishedAt: { $exists: true, $ne: null },
          },
        ],
      })
        .select('_id slug updatedAt publishedAt workflow')
        .sort({ updatedAt: -1 })
        .lean();

      const normalized = records
        .filter((item) => isPubliclyPublishedArticle(item))
        .map((item) => toSitemapItem(item))
        .filter((item): item is ServerArticleSitemapItem => Boolean(item))
        .slice(0, limit);
      return normalized;
    } catch (error) {
      console.error('Failed to load sitemap articles from MongoDB, falling back.', error);
    }
  }

  const fallback = await listAllStoredArticles();
  return fallback
    .filter((item) => isPubliclyPublishedArticle(item))
    .map((item) => toSitemapItem(item))
    .filter((item): item is ServerArticleSitemapItem => Boolean(item))
    .slice(0, limit);
}

export async function countPublicArticlesForSitemap(): Promise<number> {
  if (await isMongoAvailable({ label: 'sitemap articles count' })) {
    try {
      const count = await Article.countDocuments({
        'workflow.status': 'published',
      });
      return count;
    } catch (error) {
      console.error('Failed to count sitemap articles from MongoDB, falling back.', error);
    }
  }

  const fallback = await listAllStoredArticles();
  return fallback.filter((item) => isPubliclyPublishedArticle(item)).length;
}

export async function listArticlesForSitemapSlice(options: {
  skip?: number;
  limit?: number;
} = {}): Promise<ServerArticleSitemapItem[]> {
  const skip = Math.max(0, options.skip || 0);
  const limit = Math.max(1, options.limit || 2500);

  if (await isMongoAvailable({ label: 'sitemap articles slice lookup' })) {
    try {
      const records = await Article.find({
        'workflow.status': 'published',
      })
        .select('_id slug updatedAt publishedAt workflow')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const normalized = records
        .filter((item) => isPubliclyPublishedArticle(item))
        .map((item) => toSitemapItem(item))
        .filter((item): item is ServerArticleSitemapItem => Boolean(item));
      return normalized;
    } catch (error) {
      console.error('Failed to load sitemap articles slice from MongoDB, falling back.', error);
    }
  }

  const fallback = await listAllStoredArticles();
  return fallback
    .filter((item) => isPubliclyPublishedArticle(item))
    .slice(skip, skip + limit)
    .map((item) => toSitemapItem(item))
    .filter((item): item is ServerArticleSitemapItem => Boolean(item));
}

function toNewsSitemapItem(input: unknown): ServerNewsArticleSitemapItem | null {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source || !isPubliclyPublishedArticle(source)) return null;

  const sitemap = toSitemapItem(source);
  if (!sitemap) return null;
  const title = stringifyField(source.title);
  const seo = normalizeSeo(source.seo);
  const publishedAtRaw = source.publishedAt;
  const publishedAtValue = new Date(
    typeof publishedAtRaw === 'string' ||
      typeof publishedAtRaw === 'number' ||
      publishedAtRaw instanceof Date
      ? publishedAtRaw
      : Date.now()
  );
  const publishedAt = Number.isNaN(publishedAtValue.getTime())
    ? new Date().toISOString()
    : publishedAtValue.toISOString();

  return {
    ...sitemap,
    title,
    publishedAt,
    includeInNewsSitemap: seo.includeInNewsSitemap,
  };
}

export async function listNewsArticlesForSitemap(limit = 1000, now = new Date()) {
  const cutoff = now.getTime() - 48 * 60 * 60 * 1000;
  const filterRecent = (item: ServerNewsArticleSitemapItem) =>
    item.includeInNewsSitemap && new Date(item.publishedAt).getTime() >= cutoff;

  if (await isMongoAvailable({ label: 'news sitemap articles lookup' })) {
    try {
      const records = await Article.find({})
        .select('_id slug title publishedAt updatedAt workflow seo')
        .sort({ publishedAt: -1 })
        .lean();
      const normalized = records
        .map((item) => toNewsSitemapItem(item))
        .filter((item): item is ServerNewsArticleSitemapItem => Boolean(item))
        .filter(filterRecent)
        .slice(0, limit);
      return normalized;
    } catch (error) {
      console.error('Failed to load news sitemap articles from MongoDB, falling back.', error);
    }
  }

  const fallback = await listAllStoredArticles();
  return fallback
    .map((item) => toNewsSitemapItem(item))
    .filter((item): item is ServerNewsArticleSitemapItem => Boolean(item))
    .filter(filterRecent)
    .slice(0, limit);
}

export function getServerArticlePath(article: ServerArticleSitemapItem) {
  return buildArticlePublicPath({ id: article.id, slug: article.slug });
}
