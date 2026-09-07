import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import { isPubliclyPublishedArticle } from '@/lib/content/articlePublication';
import { PUBLIC_VIDEO_PROJECTION, toPublicVideoItem } from '@/lib/content/videoPublication';
import { getCitySlugFromName } from '@/lib/constants/epaperCities';
import Article from '@/lib/models/Article';
import EPaper from '@/lib/models/EPaper';
import Video from '@/lib/models/Video';
import { resolveReusableBreakingTts } from '@/lib/server/breakingTts';
import { listAllStoredArticles } from '@/lib/storage/articlesFile';
import { listAllStoredEPapers } from '@/lib/storage/epapersFile';
import { listAllStoredVideos } from '@/lib/storage/videosFile';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { resolveEpaperCoverImagePath } from '@/lib/utils/epaperCover';
import { type EPaperPublicationType } from '@/lib/types/epaper';
import {
  buildPublicationTypeMongoFilter,
  normalizePublicationIssueMonth,
} from '@/lib/utils/epaperPublication';
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

function toDateLabel(value: unknown) {
  const parsed = new Date(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : Date.now()
  );
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
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

function mapMongoEPaper(raw: unknown): PublicHomeFeedEPaper | null {
  const input = asObject(raw);
  const id = toId(input._id || input.id);
  if (!id) return null;

  const publishDate = toDateLabel(input.publishDate);
  const citySlug = String(input.citySlug || '').trim();
  const publicationType =
    String(input.publicationType || '').trim() === 'emagazine'
      ? 'emagazine'
      : 'epaper';

  return {
    id,
    publicationType,
    citySlug,
    cityName: String(input.cityName || '').trim(),
    title: String(input.title || '').trim(),
    publishDate,
    thumbnailPath: resolveEpaperCoverImagePath({
      thumbnailPath: input.thumbnailPath,
      thumbnail: input.thumbnail,
      pages: input.pages,
    }),
    pdfPath: firstNonEmptyString(input.pdfPath, input.pdfUrl),
    pageCount: Math.max(1, Math.floor(toNumber(input.pageCount, 1))),
    href: buildEpaperHref(citySlug, publishDate, publicationType),
  };
}

function mapFileEPaper(raw: unknown): PublicHomeFeedEPaper | null {
  const input = asObject(raw);
  const id = toId(input._id || input.id);
  if (!id) return null;

  const cityName = String(input.city || input.cityName || '').trim();
  const citySlug = String(input.citySlug || '').trim() || getCitySlugFromName(cityName);
  const publishDate = String(input.publishDate || '').trim() || toDateLabel(input.publishedAt);

  return {
    id,
    publicationType: 'epaper',
    citySlug,
    cityName,
    title: String(input.title || '').trim(),
    publishDate,
    thumbnailPath: firstNonEmptyString(input.thumbnailPath, input.thumbnail),
    pdfPath: firstNonEmptyString(input.pdfPath, input.pdfUrl),
    pageCount: Math.max(1, Math.floor(toNumber(input.pages || input.pageCount, 1))),
    href: buildEpaperHref(citySlug, publishDate, 'epaper'),
  };
}

function buildEpaperHref(
  citySlug: string,
  publishDate: string,
  publicationType: EPaperPublicationType = 'epaper'
) {
  if (publicationType === 'emagazine') {
    const month = normalizePublicationIssueMonth(publishDate);
    return month ? `/main/e-magazine?month=${encodeURIComponent(month)}` : '/main/e-magazine';
  }

  const params = new URLSearchParams();
  if (citySlug) params.set('city', citySlug);
  if (publishDate) params.set('date', publishDate);
  const query = params.toString();
  return query ? `/main/epaper?${query}` : '/main/epaper';
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

  const [articleDocs, videoDocs, shortDocs, epaperDocs, emagazineDocs] = await Promise.all([
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
    limits.videos > 0
      ? Video.find({ isPublished: true, isShort: { $ne: true } })
          .select(PUBLIC_VIDEO_PROJECTION)
          .sort({ publishedAt: -1, _id: -1 })
          .limit(limits.videos)
          .lean()
      : Promise.resolve([]),
    limits.shorts > 0
      ? Video.find({ isPublished: true, isShort: true })
          .select(PUBLIC_VIDEO_PROJECTION)
          .sort({ createdAt: -1, _id: -1 })
          .limit(limits.shorts)
          .lean()
      : Promise.resolve([]),
    EPaper.find({
      status: 'published',
      isCurrentRevision: { $ne: false },
      citySlug: 'indore',
      ...buildPublicationTypeMongoFilter('epaper'),
    })
      .select('_id publicationType citySlug cityName title publishDate thumbnailPath thumbnail pdfPath pdfUrl pageCount pages')
      .sort({ publishDate: -1, _id: -1 })
      .limit(1)
      .lean(),
    EPaper.find({
      status: 'published',
      isCurrentRevision: { $ne: false },
      ...buildPublicationTypeMongoFilter('emagazine'),
    })
      .select('_id publicationType citySlug cityName title publishDate thumbnailPath thumbnail pdfPath pdfUrl pageCount pages')
      .sort({ publishDate: -1, _id: -1 })
      .limit(1)
      .lean(),
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
    videos: videoDocs
      .map((item) => mapVideo(item, false))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.videos),
    shorts: shortDocs
      .map((item) => mapVideo(item, true))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.shorts),
    epaper: mapMongoEPaper(epaperDocs[0]) || null,
    emagazine: mapMongoEPaper(emagazineDocs[0]) || null,
  };
}

async function loadFileFeed(limits: Required<PublicHomeFeedLimits>) {
  const [articleRows, videoRows, epaperRows] = await Promise.all([
    listAllStoredArticles(),
    limits.videos > 0 || limits.shorts > 0 ? listAllStoredVideos() : Promise.resolve([]),
    listAllStoredEPapers(),
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

  const latestEPaper: PublicHomeFeedEPaper | null = epaperRows
    .map((item) => mapFileEPaper(item))
    .filter((item): item is PublicHomeFeedEPaper => Boolean(item))
    .filter((item) => item.citySlug === 'indore')
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate))[0] ?? null;

  return {
    articles,
    breaking,
    videos: videoRows
      .filter((item) => item.isPublished !== false && !item.isShort)
      .map((item) => mapVideo(item, false))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.videos),
    shorts: videoRows
      .filter((item) => item.isPublished !== false && Boolean(item.isShort))
      .map((item) => mapVideo(item, true))
      .filter((item): item is PublicHomeFeedVideo => Boolean(item))
      .sort(compareByPublishedAtDesc)
      .slice(0, limits.shorts),
    epaper: latestEPaper,
    emagazine: null,
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

export async function getPublicHomeFeed(
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

export async function getPublicHomepageInitialFeed(): Promise<PublicHomeFeedResult> {
  return getPublicHomeFeed({
    limits: HOMEPAGE_INITIAL_LIMITS,
    allowZeroLimits: true,
    articleCandidateMinimum: HOMEPAGE_ARTICLE_CANDIDATE_MINIMUM,
  });
}
