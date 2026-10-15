import 'server-only';

import { Types } from 'mongoose';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import { isPubliclyPublishedArticle } from '@/lib/content/articlePublication';
import { resolveNewsCategory } from '@/lib/constants/newsCategories';
import Article from '@/lib/models/Article';
import {
  getStoredArticleByIdStrict,
  getStoredArticleByIdOrSlug,
  listAllStoredArticles,
  listStoredArticleResolutionRecords,
} from '@/lib/storage/articlesFile';
import type { ArticleSeo } from '@/lib/storage/articlesFile';
import {
  buildArticlePublicPath,
  normalizeArticleSeo,
  normalizeArticleSlug,
} from '@/lib/seo/articleSeo';
import { resolveArticleEditorialFlags } from '@/lib/content/articleEditorial';
import { WORKFLOW_STATUSES } from '@/lib/workflow/types';
import type {
  PublicArticleSource,
  PublicArticleItem,
  PublicArticleDetail,
  PublicArticleListOptions,
  PublicArticleCursor,
  LegacyFeedCursor,
} from './articleTypes';

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const MAX_RELATED_LIMIT = 20;
const MAX_RELATED_MONGO_CANDIDATES = MAX_RELATED_LIMIT * 3;

const USE_REMOTE_DEMO_MEDIA =
  process.env.NEXT_PUBLIC_USE_REMOTE_DEMO_MEDIA === 'true';
const UNSPLASH_IMAGE_HOST = /^https:\/\/images\.unsplash\.com\//i;
const LOCAL_NEWS_FALLBACK_IMAGE = '/placeholders/news-16x9.svg';

const ARTICLE_RESOLUTION_PROJECTION = [
  '_id',
  'slug',
  'previousSlugs',
  'title',
  'summary',
  'image',
  'category',
  'author',
  'publishedAt',
  'updatedAt',
  'seo',
  'workflow.status',
  'workflow.publishedAt',
  'workflow.scheduledFor',
].join(' ');

const RELATED_ARTICLE_MONGO_PROJECTION = [
  '_id',
  'slug',
  'title',
  'summary',
  'image',
  'category',
  'author',
  'publishedAt',
  'updatedAt',
  'views',
  'isBreaking',
  'isTrending',
  'editorial.breakingStartsAt',
  'editorial.breakingExpiresAt',
  'editorial.trendingExpiresAt',
  'workflow.status',
  'reporterMeta.locationTag',
  'city',
  'cityName',
  'locationTag',
  'seo.authorDisplayName',
  'seo.authorDisplayNameSet',
  'seo.authorAvatarUrl',
  'seo.authorProgramName',
].join(' ');

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

function toText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toIsoDate(value: unknown) {
  const parsed = new Date(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : Date.now()
  );
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMediaUrl(value: unknown, fallback = LOCAL_NEWS_FALLBACK_IMAGE) {
  const image = typeof value === 'string' ? value.trim() : '';
  if (!image) return fallback;
  if (!USE_REMOTE_DEMO_MEDIA && UNSPLASH_IMAGE_HOST.test(image)) {
    return fallback;
  }
  return image;
}

function normalizeSeo(input: unknown, image: string): ArticleSeo {
  const seo = normalizeArticleSeo(input);
  return {
    ...seo,
    ogImage: normalizeMediaUrl(seo.ogImage, image),
  };
}

function normalizeSlugList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => normalizeArticleSlug(String(item || '')))
    .filter(Boolean);
}

export function normalizePublicArticleLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, parsed));
}

function normalizeFilterValue(value: unknown) {
  return String(value || '').trim();
}

function normalizeComparable(value: string) {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCategoryCandidates(category: string) {
  const normalized = normalizeComparable(category);
  if (!normalized || normalized === 'all' || normalized === 'latest') {
    return [];
  }

  const matched = resolveNewsCategory(normalized);
  const candidates = matched
    ? [matched.slug, matched.name, matched.nameEn, ...matched.aliases]
    : [category];

  return Array.from(
    new Set(candidates.map((item) => item.trim()).filter(Boolean))
  );
}

function getLocationFromSource(source: Record<string, unknown>) {
  const reporterMeta = asObject(source.reporterMeta);
  return (
    toText(reporterMeta.locationTag) ||
    toText(source.city) ||
    toText(source.cityName) ||
    toText(source.locationTag)
  );
}

function getAuthorMetaFromSource(source: Record<string, unknown>) {
  const seo = asObject(source.seo);
  const hasAuthorDisplayFields =
    seo.authorDisplayNameSet === true ||
    Boolean(toText(seo.authorDisplayName) || toText(seo.authorAvatarUrl) || toText(seo.authorProgramName));

  if (!hasAuthorDisplayFields) return undefined;

  return {
    name: toText(seo.authorDisplayName),
    avatar: toText(seo.authorAvatarUrl),
    programName: toText(seo.authorProgramName),
  };
}

export function toPublicArticleItem(source: unknown): PublicArticleItem | null {
  const input = asObject(source);
  const activeFlags = resolveArticleEditorialFlags(input);
  const id = toId(input._id) || toId(input.id);
  const title = toText(input.title);
  const summary = toText(input.summary);
  const image = normalizeMediaUrl(input.image);
  const category = toText(input.category) || 'General';
  const author = toText(input.author) || 'Editor';
  const slug = normalizeArticleSlug(toText(input.slug));
  const publishedAt = toIsoDate(input.publishedAt);
  const updatedAt = toIsoDate(input.updatedAt || input.publishedAt);

  if (!id || !title || !summary || !image) return null;

  const authorMeta = getAuthorMetaFromSource(input);

  return {
    _id: id,
    id,
    slug,
    title,
    summary,
    image,
    category,
    author,
    ...(authorMeta ? { authorMeta } : {}),
    publishedAt,
    updatedAt,
    views: Math.max(0, Math.floor(toNumber(input.views, 0))),
    isBreaking: activeFlags.isBreaking,
    isTrending: activeFlags.isTrending,
    city: getLocationFromSource(input),
    href: buildArticlePublicPath({ id, slug }),
  };
}

export function toPublicArticleDetail(source: unknown): PublicArticleDetail | null {
  const input = asObject(source);
  const item = toPublicArticleItem(input);
  if (!item) return null;

  return {
    ...item,
    previousSlugs: normalizeSlugList(input.previousSlugs).filter(
      (slug) => slug !== item.slug
    ),
    content: toText(input.content),
    seo: normalizeSeo(input.seo, item.image),
  };
}

function parseCursor(options: PublicArticleListOptions): PublicArticleCursor | null {
  const publishedAt = normalizeFilterValue(options.cursorPublishedAt);
  const id = normalizeFilterValue(options.cursorId);
  if (!publishedAt || !id) return null;

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;

  return {
    publishedAt: date.toISOString(),
    id,
  };
}

function buildMongoFilter(options: PublicArticleListOptions) {
  const and: Record<string, unknown>[] = [];

  const cursor = parseCursor(options);
  if (cursor && Types.ObjectId.isValid(cursor.id)) {
    const publishedAt = new Date(cursor.publishedAt);
    and.push({
      $or: [
        { publishedAt: { $lt: publishedAt } },
        { publishedAt, _id: { $lt: new Types.ObjectId(cursor.id) } },
      ],
    });
  }

  const now = new Date();
  and.push({
    $or: [
      { 'workflow.status': 'published' },
      {
        'workflow.status': 'scheduled',
        'workflow.scheduledFor': { $lte: now },
      },
      {
        'workflow.status': { $in: [null, undefined] },
        publishedAt: { $exists: true, $ne: null },
      },
    ],
  });

  const categoryCandidates = getCategoryCandidates(normalizeFilterValue(options.category));
  if (categoryCandidates.length) {
    and.push({
      $or: categoryCandidates.map((item) => ({
        category: { $regex: `^${escapeRegExp(item)}$`, $options: 'i' },
      })),
    });
  }

  const city = normalizeFilterValue(options.city);
  if (city) {
    const cityRegex = { $regex: escapeRegExp(city), $options: 'i' };
    and.push({
      $or: [
        { 'reporterMeta.locationTag': cityRegex },
        { city: cityRegex },
        { cityName: cityRegex },
        { locationTag: cityRegex },
      ],
    });
  }

  const query = normalizeFilterValue(options.query);
  if (query) {
    const queryRegex = { $regex: escapeRegExp(query), $options: 'i' };
    and.push({
      $or: [
        { title: queryRegex },
        { summary: queryRegex },
        { category: queryRegex },
        { author: queryRegex },
        { 'reporterMeta.locationTag': queryRegex },
        { city: queryRegex },
        { cityName: queryRegex },
        { locationTag: queryRegex },
      ],
    });
  }

  return and.length ? { $and: and } : {};
}

function buildMongoPublishedArticleFilter() {
  const hasLegacyPublicationDate = {
    $or: [
      { publishedAt: { $exists: true, $ne: null } },
      { updatedAt: { $exists: true, $ne: null } },
    ],
  };

  return {
    $or: [
      { 'workflow.status': 'published' },
      {
        $and: [
          { 'workflow.status': { $nin: [...WORKFLOW_STATUSES] } },
          hasLegacyPublicationDate,
        ],
      },
    ],
  };
}

export class ArticleRepository {
  async resolveSource(): Promise<PublicArticleSource> {
    return (await isMongoAvailable({
      label: 'public articles',
      unavailableTtlMs: process.env.NODE_ENV === 'test' ? 0 : undefined,
      availableTtlMs: process.env.NODE_ENV === 'test' ? 0 : undefined,
    }))
      ? 'mongo'
      : 'file';
  }

  async listMongoArticles(options: PublicArticleListOptions): Promise<PublicArticleItem[]> {
    const requestedLimit = normalizePublicArticleLimit(options.limit);
    const candidateLimit = Math.min(
      500,
      Math.max(requestedLimit * 3, requestedLimit + 30)
    );

    try {
      const docs = await Article.find(buildMongoFilter(options))
        .select(
          '_id slug previousSlugs title summary image category author publishedAt updatedAt views isBreaking isTrending editorial workflow reporterMeta city cityName locationTag seo'
        )
        .sort({ publishedAt: -1, _id: -1 })
        .limit(candidateLimit)
        .maxTimeMS(5000)
        .lean();

      return docs
        .filter((item) => isPubliclyPublishedArticle(item))
        .map((item) => toPublicArticleItem(item))
        .filter((item): item is PublicArticleItem => Boolean(item));
    } catch (error) {
      console.warn('[MongoDB] Public articles query timed out or failed, falling back to file store:', error);
      return this.listFileArticles();
    }
  }

  async listFileArticles(): Promise<PublicArticleItem[]> {
    const stored = (await listAllStoredArticles()) || [];
    return stored
      .filter((item) => isPubliclyPublishedArticle(item))
      .map((item) => toPublicArticleItem(item))
      .filter((item): item is PublicArticleItem => Boolean(item));
  }

  async listStoredResolutionRecords(): Promise<unknown[]> {
    return (await listStoredArticleResolutionRecords()) || [];
  }

  async getMongoResolutionCandidates(token: {
    objectId?: string | null;
    normalizedSlug?: string | null;
  }): Promise<unknown[]> {
    const or: Record<string, unknown>[] = [];
    if (token.objectId && Types.ObjectId.isValid(token.objectId)) {
      or.push({ _id: token.objectId });
    }
    if (token.normalizedSlug) {
      or.push({ slug: token.normalizedSlug }, { previousSlugs: token.normalizedSlug });
    }
    if (!or.length) return [];
    return Article.find({ $or: or })
      .select(ARTICLE_RESOLUTION_PROJECTION)
      .limit(3)
      .lean();
  }

  async findMongoArticleById(id: string): Promise<unknown | null> {
    return Article.findById(id).lean();
  }

  async findFileArticleById(id: string): Promise<unknown | null> {
    return getStoredArticleByIdStrict(id);
  }

  async findMongoArticleByIdOrSlug(idOrSlug: string): Promise<unknown | null> {
    const slug = normalizeArticleSlug(idOrSlug);
    if (Types.ObjectId.isValid(idOrSlug)) {
      return Article.findById(idOrSlug).lean();
    }
    if (slug) {
      return Article.findOne({ $or: [{ slug }, { previousSlugs: slug }] }).lean();
    }
    return null;
  }

  async findFileArticleByIdOrSlug(idOrSlug: string): Promise<unknown | null> {
    return getStoredArticleByIdOrSlug(idOrSlug);
  }

  async listMongoRelatedCandidates(
    category: string,
    limit: number
  ): Promise<PublicArticleItem[]> {
    const categoryPattern = `^${escapeRegExp(category.trim())}$`;
    const categoryFilter = { $regex: categoryPattern, $options: 'i' };
    const candidateLimit = Math.min(
      MAX_RELATED_MONGO_CANDIDATES,
      Math.max(limit * 3, limit + 10)
    );
    const publishedFilter = buildMongoPublishedArticleFilter();

    const [sameCategoryDocs, fallbackDocs] = await Promise.all([
      Article.find({
        $and: [publishedFilter, { category: categoryFilter }],
      })
        .select(RELATED_ARTICLE_MONGO_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .limit(candidateLimit)
        .lean(),
      Article.find({
        $and: [publishedFilter, { category: { $not: categoryFilter } }],
      })
        .select(RELATED_ARTICLE_MONGO_PROJECTION)
        .sort({ publishedAt: -1, _id: -1 })
        .limit(candidateLimit)
        .lean(),
    ]);

    const items = [...sameCategoryDocs, ...fallbackDocs]
      .filter((item) => isPubliclyPublishedArticle(item))
      .map((item) => toPublicArticleItem(item))
      .filter((item): item is PublicArticleItem => Boolean(item));

    return items;
  }

  async listMongoFeedArticles(
    limit: number,
    cursor: LegacyFeedCursor | null
  ): Promise<unknown[]> {
    const and: Record<string, unknown>[] = [
      buildMongoPublishedArticleFilter(),
      { title: { $type: 'string', $regex: /\S/ } },
      { summary: { $type: 'string', $regex: /\S/ } },
      { image: { $type: 'string', $regex: /\S/ } },
    ];

    if (cursor) {
      const equalDateIdFilter = Types.ObjectId.isValid(cursor.id)
        ? { _id: { $lt: new Types.ObjectId(cursor.id) } }
        : {
            $expr: {
              $lt: [{ $toString: '$_id' }, cursor.id],
            },
          };

      and.push({
        $or: [
          { publishedAt: { $lt: cursor.date } },
          {
            $and: [{ publishedAt: cursor.date }, equalDateIdFilter],
          },
        ],
      });
    }

    return Article.find({ $and: and })
      .select(
        '_id slug title summary image category author publishedAt updatedAt views isBreaking isTrending editorial workflow'
      )
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
  }

  async listMongoBreakingCandidates(limit: number): Promise<unknown[]> {
    return Article.find({})
      .select(
        '_id slug title category city cityName locationTag publishedAt createdAt updatedAt views isBreaking editorial workflow reporterMeta breakingTts'
      )
      .sort({ publishedAt: -1, _id: -1 })
      .limit(Math.min(25 * 5, Math.max(limit * 5, limit)))
      .lean();
  }

  async listAllStored(): Promise<unknown[]> {
    return (await listAllStoredArticles()) || [];
  }
}

export const articleRepository = new ArticleRepository();
