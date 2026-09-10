import 'server-only';

import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import { isPubliclyPublishedArticle } from '@/lib/content/articlePublication';
import { toPublicVideoItem } from '@/lib/content/videoPublication';
import Article from '@/lib/models/Article';
import { videoService } from '@/lib/server/video/videoService';
import { epaperService } from '@/lib/server/epaper/epaperService';
import { resolveReusableBreakingTts } from '@/lib/server/breakingTts';
import { listAllStoredArticles } from '@/lib/storage/articlesFile';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { type EPaperPublicationType } from '@/lib/types/epaper';
import { resolveArticleEditorialFlags } from '@/lib/content/articleEditorial';

export type PublicHomeFeedSource = 'mongo' | 'file';

export type PublicHomeFeedArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  publishedAt: string;
  views: number;
  isBreaking: boolean;
  isTrending: boolean;
  href: string;
};

export type PublicHomeFeedBreakingItem = {
  id: string;
  title: string;
  category: string;
  publishedAt: string;
  href: string;
  priority: number;
  ttsAudioUrl?: string;
  ttsReady?: boolean;
};

export type PublicHomeFeedVideo = {
  id: string;
  slug?: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  category: string;
  isShort: boolean;
  views: number;
  publishedAt: string;
};

export type PublicHomeFeedEPaper = {
  id: string;
  publicationType: EPaperPublicationType;
  citySlug: string;
  cityName: string;
  title: string;
  publishDate: string;
  thumbnailPath: string;
  pdfPath: string;
  pageCount: number;
  href: string;
};

export type PublicHomeFeed = {
  generatedAt: string;
  hero: PublicHomeFeedArticle[];
  latest: PublicHomeFeedArticle[];
  trending: PublicHomeFeedArticle[];
  breaking: PublicHomeFeedBreakingItem[];
  videos: PublicHomeFeedVideo[];
  shorts: PublicHomeFeedVideo[];
  epaper: PublicHomeFeedEPaper | null;
  emagazine: PublicHomeFeedEPaper | null;
};

export type PublicHomeFeedLimits = {
  hero?: number;
  latest?: number;
  trending?: number;
  breaking?: number;
  videos?: number;
  shorts?: number;
};

export type PublicHomeFeedResult = {
  feed: PublicHomeFeed;
  source: PublicHomeFeedSource;
  limits: Required<PublicHomeFeedLimits>;
};

type LoadedHomeFeedData = {
  articles: PublicHomeFeedArticle[];
  breaking: PublicHomeFeedBreakingItem[];
  videos: PublicHomeFeedVideo[];
  shorts: PublicHomeFeedVideo[];
  epaper: PublicHomeFeedEPaper | null;
  emagazine: PublicHomeFeedEPaper | null;
};

const DEFAULT_LIMITS: Required<PublicHomeFeedLimits> = {
  hero: 5,
  latest: 12,
  trending: 5,
  breaking: 10,
  videos: 6,
  shorts: 8,
};

const HOMEPAGE_INITIAL_LIMITS: Required<PublicHomeFeedLimits> = {
  hero: 5,
  latest: 6,
  trending: 3,
  breaking: 0,
  videos: 0,
  shorts: 0,
};

const DEFAULT_ARTICLE_CANDIDATE_MINIMUM = 40;
const HOMEPAGE_ARTICLE_CANDIDATE_MINIMUM = 24;

type LimitOptions = {
  allowZero?: boolean;
};

type FeedLoadOptions = {
  articleCandidateMinimum?: number;
};

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function toId(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'toString' in value) {
    return String(value).trim();
  }
  return '';
}

function toIsoDate(value: unknown) {
  const parsed = new Date(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : Date.now()
  );
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  options: LimitOptions = {}
) {
  if (!Number.isFinite(value)) return fallback;
  const minimum = options.allowZero ? 0 : 1;
  return Math.max(minimum, Math.min(50, Math.floor(Number(value))));
}

function resolveLimits(
  input: PublicHomeFeedLimits = {},
  options: LimitOptions = {}
): Required<PublicHomeFeedLimits> {
  return {
    hero: normalizeLimit(input.hero, DEFAULT_LIMITS.hero, options),
    latest: normalizeLimit(input.latest, DEFAULT_LIMITS.latest, options),
    trending: normalizeLimit(input.trending, DEFAULT_LIMITS.trending, options),
    breaking: normalizeLimit(input.breaking, DEFAULT_LIMITS.breaking, options),
    videos: normalizeLimit(input.videos, DEFAULT_LIMITS.videos, options),
    shorts: normalizeLimit(input.shorts, DEFAULT_LIMITS.shorts, options),
  };
}

function getSortTime(value: { publishedAt: string }) {
  const parsed = new Date(value.publishedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareByPublishedAtDesc<T extends { id: string; publishedAt: string }>(a: T, b: T) {
  const byDate = getSortTime(b) - getSortTime(a);
  if (byDate !== 0) return byDate;
  return b.id.localeCompare(a.id);
}

function mapArticle(raw: unknown): PublicHomeFeedArticle | null {
  const input = asObject(raw);
  const activeFlags = resolveArticleEditorialFlags(input);
  const id = toId(input._id || input.id);
  const slug = String(input.slug || '').trim();
  const title = String(input.title || '').trim();
  const summary = String(input.summary || '').trim();
  const image = String(input.image || '').trim();
  const category = String(input.category || '').trim() || 'General';
  const author = String(input.author || '').trim() || 'Editor';
  const publishedAt = toIsoDate(input.publishedAt || input.updatedAt);

  if (!id || !title || !summary || !image) return null;

  return {
    id,
    slug,
    title,
    summary,
    image,
    category,
    author,
    publishedAt,
    views: Math.max(0, Math.floor(toNumber(input.views, 0))),
    isBreaking: activeFlags.isBreaking,
    isTrending: activeFlags.isTrending,
    href: buildArticlePublicPath({ id, slug }),
  };
}

function mapBreakingItem(raw: unknown): PublicHomeFeedBreakingItem | null {
  const input = asObject(raw);
  const article = mapArticle(input);
  if (!article || !article.isBreaking) return null;

  const reusableTts = resolveReusableBreakingTts({
    _id: article.id,
    title: article.title,
    reporterMeta: input.reporterMeta,
    category: article.category,
    isBreaking: true,
    breakingTts: input.breakingTts,
  });

  return {
    id: article.id,
    title: article.title,
    category: article.category,
    publishedAt: article.publishedAt,
    href: article.href,
    priority: Math.max(1, article.views),
    ...(reusableTts
      ? {
          ttsAudioUrl: reusableTts.audioUrl,
          ttsReady: true,
        }
      : {}),
  };
}

function compareBreakingItems(
  a: PublicHomeFeedBreakingItem,
  b: PublicHomeFeedBreakingItem
) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return getSortTime(b) - getSortTime(a);
}

function mapVideo(raw: unknown, forceShort?: boolean): PublicHomeFeedVideo | null {
  const input = toPublicVideoItem(asObject(raw), { requireShort: forceShort === true });
  if (!input) return null;
  const id = input._id;
  const title = String(input.title || '').trim();
  const category = String(input.category || '').trim();
  if (!id || !title || !category) return null;

  const publishedAt = toIsoDate(input.publishedAt || input.createdAt);
  const slug = String(input.slug || '').trim();

  return {
    id,
    slug: slug || undefined,
    title,
    description: String(input.description || '').trim(),
    thumbnail: String(input.thumbnail || '').trim(),
    videoUrl: String(input.videoUrl || '').trim(),
    duration: Math.max(1, Math.floor(toNumber(input.duration, 1))),
    category,
    isShort: forceShort ?? Boolean(input.isShort),
    views: Math.max(0, Math.floor(toNumber(input.views, 0))),
    publishedAt,
  };
}

async function resolveSource(): Promise<PublicHomeFeedSource> {
  return (await isMongoAvailable({ label: 'public home feed' })) ? 'mongo' : 'file';
}

async function loadMongoFeed(
  limits: Required<PublicHomeFeedLimits>,
  options: FeedLoadOptions = {}
) {
  const articleCandidateMinimum =
    options.articleCandidateMinimum ?? DEFAULT_ARTICLE_CANDIDATE_MINIMUM;
  const articleLimit = Math.max(
    limits.hero + limits.latest + limits.trending,
    limits.breaking * 3,
    articleCandidateMinimum
  );

  const [articleDocs, videoData, editions] = await Promise.all([
    Article.find({
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
      .select(
        '_id slug title summary image category author publishedAt updatedAt views isBreaking isTrending editorial workflow reporterMeta breakingTts'
      )
      .sort({ publishedAt: -1, _id: -1 })
      .limit(articleLimit)
      .lean(),
    videoService.getHomeFeedVideos(
      { videos: limits.videos, shorts: limits.shorts },
      'mongo'
    ),
    epaperService.getHomeFeedEditions('mongo'),
  ]);

  const articles = articleDocs
    .filter((item) => isPubliclyPublishedArticle(item))
    .map((item) => mapArticle(item))
    .filter((item): item is PublicHomeFeedArticle => Boolean(item))
    .sort(compareByPublishedAtDesc);

  const breaking =
    limits.breaking > 0
      ? articleDocs
          .filter((item) => isPubliclyPublishedArticle(item))
          .map((item) => mapBreakingItem(item))
          .filter((item): item is PublicHomeFeedBreakingItem => Boolean(item))
          .sort(compareBreakingItems)
          .slice(0, limits.breaking)
      : [];

  return {
    articles,
    breaking,
    videos: videoData.rawVideos
      .map((item) => mapVideo(item, false))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.videos),
    shorts: videoData.rawShorts
      .map((item) => mapVideo(item, true))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.shorts),
    epaper: editions.epaper,
    emagazine: editions.emagazine,
  };
}

async function loadFileFeed(limits: Required<PublicHomeFeedLimits>) {
  const [articleRows, videoData, editions] = await Promise.all([
    listAllStoredArticles(),
    videoService.getHomeFeedVideos(
      { videos: limits.videos, shorts: limits.shorts },
      'file'
    ),
    epaperService.getHomeFeedEditions('file'),
  ]);

  const articles = articleRows
    .filter((item) => isPubliclyPublishedArticle(item))
    .map((item) => mapArticle(item))
    .filter((item): item is PublicHomeFeedArticle => Boolean(item))
    .sort(compareByPublishedAtDesc);

  const breaking =
    limits.breaking > 0
      ? articleRows
          .filter((item) => isPubliclyPublishedArticle(item))
          .map((item) => mapBreakingItem(item))
          .filter((item): item is PublicHomeFeedBreakingItem => Boolean(item))
          .sort(compareBreakingItems)
          .slice(0, limits.breaking)
      : [];

  return {
    articles,
    breaking,
    videos: videoData.rawVideos
      .map((item) => mapVideo(item, false))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.videos),
    shorts: videoData.rawShorts
      .map((item) => mapVideo(item, true))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.shorts),
    epaper: editions.epaper,
    emagazine: editions.emagazine,
  };
}

function buildFeed(input: LoadedHomeFeedData, limits: Required<PublicHomeFeedLimits>): PublicHomeFeed {
  const hero = input.articles.slice(0, limits.hero);
  const latest = input.articles.slice(limits.hero, limits.hero + limits.latest);
  const trending = input.articles
    .filter((article) => article.isTrending)
    .slice(0, limits.trending);

  return {
    generatedAt: new Date().toISOString(),
    hero,
    latest,
    trending,
    breaking: input.breaking,
    videos: input.videos,
    shorts: input.shorts,
    epaper: input.epaper,
    emagazine: input.emagazine,
  };
}

export class PublicHomeFeedService {
  async getPublicHomeFeed(
    options: {
      limits?: PublicHomeFeedLimits;
      allowZeroLimits?: boolean;
      articleCandidateMinimum?: number;
    } = {}
  ): Promise<PublicHomeFeedResult> {
    const limits = resolveLimits(options.limits, {
      allowZero: options.allowZeroLimits,
    });
    const source = await resolveSource();
    const data =
      source === 'mongo'
        ? await loadMongoFeed(limits, {
            articleCandidateMinimum: options.articleCandidateMinimum,
          })
        : await loadFileFeed(limits);

    return {
      feed: buildFeed(data, limits),
      source,
      limits,
    };
  }

  async getPublicHomepageInitialFeed(): Promise<PublicHomeFeedResult> {
    return this.getPublicHomeFeed({
      limits: HOMEPAGE_INITIAL_LIMITS,
      allowZeroLimits: true,
      articleCandidateMinimum: HOMEPAGE_ARTICLE_CANDIDATE_MINIMUM,
    });
  }
}

export const publicHomeFeedService = new PublicHomeFeedService();
