import { Types } from 'mongoose';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import { isPubliclyPublishedArticle } from '@/lib/content/articlePublication';
import {
  NEWS_CATEGORY_DEFINITIONS,
  resolveNewsCategory,
} from '@/lib/constants/newsCategories';
import Article from '@/lib/models/Article';
import {
  getStoredArticleByIdStrict,
  listAllStoredArticles,
  listStoredArticleResolutionRecords,
} from '@/lib/storage/articlesFile';
import type { ArticleSeo } from '@/lib/storage/articlesFile';
import {
  buildArticlePublicPath,
  normalizeArticleSeo,
  normalizeArticleSlug,
  parseArticleRequestToken,
  isValidArticleSlug,
} from '@/lib/seo/articleSeo';
import { resolveArticleEditorialFlags } from '@/lib/content/articleEditorial';
import { WORKFLOW_STATUSES } from '@/lib/workflow/types';

export type PublicArticleSource = 'mongo' | 'file';

export type PublicArticleCursor = {
  publishedAt: string;
  id: string;
};

export type PublicArticleListFilters = {
  category?: string;
  city?: string;
  query?: string;
};

export type PublicArticleListOptions = PublicArticleListFilters & {
  limit?: number;
  cursorPublishedAt?: string;
  cursorId?: string;
};

export type PublicArticleItem = {
  _id: string;
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  authorMeta?: {
    name?: string;
    avatar?: string;
    programName?: string;
  };
  publishedAt: string;
  updatedAt: string;
  views: number;
  isBreaking: boolean;
  isTrending: boolean;
  city: string;
  href: string;
};

export type PublicArticleDetail = PublicArticleItem & {
  previousSlugs: string[];
  content: string;
  seo: ArticleSeo;
};

export type PublicArticleListResult = {
  items: PublicArticleItem[];
  source: PublicArticleSource;
  limit: number;
  filters: PublicArticleListFilters;
  hasMore: boolean;
  nextCursor: PublicArticleCursor | null;
};

export type PublicArticleDetailResult = {
  article: PublicArticleDetail;
  source: PublicArticleSource;
};

export type PublicArticleAuthority = {
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
  href: string;
};

type ResolvedPublicArticleToken = {
  kind: 'current' | 'previous' | 'legacyId';
  source: PublicArticleSource;
  article: PublicArticleAuthority;
  authoritativePath: string;
  isExactAuthority: boolean;
};

export type PublicArticleResolution =
  | ResolvedPublicArticleToken
  | { kind: 'missing' }
  | { kind: 'ambiguous' }
  | { kind: 'unavailable' };

export class PublicArticleResolutionError extends Error {
  constructor(public readonly resolution: 'ambiguous' | 'unavailable') {
    super(`Public article resolution ${resolution}`);
    this.name = 'PublicArticleResolutionError';
  }
}

export type PublicRelatedArticlesResult = {
  items: PublicArticleItem[];
  source: PublicArticleSource;
  limit: number;
};

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const MAX_RELATED_LIMIT = 20;
const MAX_RELATED_MONGO_CANDIDATES = MAX_RELATED_LIMIT * 3;
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
const USE_REMOTE_DEMO_MEDIA =
  process.env.NEXT_PUBLIC_USE_REMOTE_DEMO_MEDIA === 'true';
const UNSPLASH_IMAGE_HOST = /^https:\/\/images\.unsplash\.com\//i;
const LOCAL_NEWS_FALLBACK_IMAGE = '/placeholders/news-16x9.svg';

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

function categoryMatchesFilter(articleCategory: string, category: string) {
  const normalized = normalizeComparable(category);
  if (!normalized || normalized === 'all' || normalized === 'latest') return true;

  const articleValue = normalizeComparable(articleCategory);
  const matched = resolveNewsCategory(normalized);
  if (!matched) return articleValue === normalized;

  const candidates = [
    matched.slug,
    matched.name,
    matched.nameEn,
    ...matched.aliases,
  ].map(normalizeComparable);

  return candidates.includes(articleValue);
}

function cityMatchesFilter(article: Pick<PublicArticleItem, 'city'>, city: string) {
  const normalized = normalizeComparable(city);
  if (!normalized || normalized === 'all') return true;
  return normalizeComparable(article.city).includes(normalized);
}

function searchMatchesFilter(
  article: Pick<PublicArticleItem, 'title' | 'summary' | 'category' | 'author' | 'city'>,
  query: string
) {
  const normalized = normalizeComparable(query);
  if (!normalized) return true;

  return [article.title, article.summary, article.category, article.author, article.city]
    .map(normalizeComparable)
    .some((value) => value.includes(normalized));
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

function toPublicArticleItem(source: unknown): PublicArticleItem | null {
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

function toPublicArticleDetail(source: unknown): PublicArticleDetail | null {
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

function getSortTime(value: Pick<PublicArticleItem, 'publishedAt'>) {
  const parsed = new Date(value.publishedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareArticles(a: PublicArticleItem, b: PublicArticleItem) {
  const byDate = getSortTime(b) - getSortTime(a);
  if (byDate !== 0) return byDate;
  return b.id.localeCompare(a.id);
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

function applyCursorFilter(items: PublicArticleItem[], cursor: PublicArticleCursor | null) {
  if (!cursor) return items;
  const cursorTime = new Date(cursor.publishedAt).getTime();

  return items.filter((item) => {
    const itemTime = getSortTime(item);
    if (itemTime < cursorTime) return true;
    if (itemTime > cursorTime) return false;
    return item.id < cursor.id;
  });
}

function applyFilters(items: PublicArticleItem[], filters: PublicArticleListFilters) {
  return items.filter((item) => {
    if (filters.category && !categoryMatchesFilter(item.category, filters.category)) {
      return false;
    }
    if (filters.city && !cityMatchesFilter(item, filters.city)) {
      return false;
    }
    if (filters.query && !searchMatchesFilter(item, filters.query)) {
      return false;
    }
    return true;
  });
}

function buildListResult(
  items: PublicArticleItem[],
  source: PublicArticleSource,
  options: PublicArticleListOptions
): PublicArticleListResult {
  const limit = normalizePublicArticleLimit(options.limit);
  const filters: PublicArticleListFilters = {
    ...(normalizeFilterValue(options.category)
      ? { category: normalizeFilterValue(options.category) }
      : {}),
    ...(normalizeFilterValue(options.city)
      ? { city: normalizeFilterValue(options.city) }
      : {}),
    ...(normalizeFilterValue(options.query)
      ? { query: normalizeFilterValue(options.query) }
      : {}),
  };
  const cursor = parseCursor(options);
  const filtered = applyCursorFilter(applyFilters(items.sort(compareArticles), filters), cursor);
  const pageItems = filtered.slice(0, limit);
  const last = pageItems[pageItems.length - 1];
  const hasMore = filtered.length > limit;

  return {
    items: pageItems,
    source,
    limit,
    filters,
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            publishedAt: last.publishedAt,
            id: last.id,
          }
        : null,
  };
}

async function resolveSource(): Promise<PublicArticleSource> {
  return (await isMongoAvailable({ label: 'public articles' })) ? 'mongo' : 'file';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMongoFilter(options: PublicArticleListOptions) {
  const and: Record<string, unknown>[] = [];

  // Apply the cursor before the candidate limit; otherwise every page reloads
  // the newest window and readers can never reach older published stories.
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

async function listMongoArticles(options: PublicArticleListOptions) {
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
    return listFileArticles();
  }
}

async function listFileArticles() {
  const stored = await listAllStoredArticles();
  return stored
    .filter((item) => isPubliclyPublishedArticle(item))
    .map((item) => toPublicArticleItem(item))
    .filter((item): item is PublicArticleItem => Boolean(item));
}

export async function listPublicArticles(
  options: PublicArticleListOptions = {}
): Promise<PublicArticleListResult> {
  const source = await resolveSource();
  const items = source === 'mongo' ? await listMongoArticles(options) : await listFileArticles();
  return buildListResult(items, source, options);
}

function buildRelatedPublicArticles(
  items: PublicArticleItem[],
  current: Pick<PublicArticleDetail, 'id' | 'href' | 'category'>,
  limit: number
) {
  const currentCategory = normalizeComparable(current.category);
  const seenDestinations = new Set<string>();
  const sameCategory: PublicArticleItem[] = [];
  const fallback: PublicArticleItem[] = [];

  for (const item of items.sort(compareArticles)) {
    if (item.id === current.id || item.href === current.href) continue;
    if (seenDestinations.has(item.href)) continue;
    seenDestinations.add(item.href);

    if (normalizeComparable(item.category) === currentCategory) {
      sameCategory.push(item);
    } else {
      fallback.push(item);
    }
  }

  return [...sameCategory, ...fallback].slice(0, limit);
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

async function listMongoRelatedArticles(
  current: Pick<PublicArticleDetail, 'id' | 'href' | 'category'>,
  limit: number
) {
  const categoryPattern = `^${escapeRegExp(current.category.trim())}$`;
  const categoryFilter = { $regex: categoryPattern, $options: 'i' };
  const candidateLimit = Math.min(
    MAX_RELATED_MONGO_CANDIDATES,
    Math.max(limit * 3, limit + 10)
  );
  const publishedFilter = buildMongoPublishedArticleFilter();

  const sameCategoryDocs = await Article.find({
    $and: [publishedFilter, { category: categoryFilter }],
  })
    .select(RELATED_ARTICLE_MONGO_PROJECTION)
    .sort({ publishedAt: -1, _id: -1 })
    .limit(candidateLimit)
    .lean();
  const fallbackDocs = await Article.find({
    $and: [publishedFilter, { category: { $not: categoryFilter } }],
  })
    .select(RELATED_ARTICLE_MONGO_PROJECTION)
    .sort({ publishedAt: -1, _id: -1 })
    .limit(candidateLimit)
    .lean();

  const items = [...sameCategoryDocs, ...fallbackDocs]
    .filter((item) => isPubliclyPublishedArticle(item))
    .map((item) => toPublicArticleItem(item))
    .filter((item): item is PublicArticleItem => Boolean(item));

  return buildRelatedPublicArticles(items, current, limit);
}

export async function listRelatedPublicArticles(
  current: Pick<PublicArticleDetail, 'id' | 'href' | 'category'>,
  options: { limit?: number; source?: PublicArticleSource } = {}
): Promise<PublicRelatedArticlesResult> {
  const limit = Math.min(
    MAX_RELATED_LIMIT,
    Math.max(MIN_LIMIT, normalizePublicArticleLimit(options.limit))
  );
  const source = options.source || (await resolveSource());
  const items = source === 'mongo'
    ? await listMongoRelatedArticles(current, limit)
    : buildRelatedPublicArticles(await listFileArticles(), current, limit);

  return {
    items,
    source,
    limit,
  };
}

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

function normalizedStoredSlug(value: unknown) {
  const text = toText(value);
  return text ? text.normalize('NFKC').toLowerCase() : '';
}

function matchesResolutionToken(
  raw: unknown,
  token: Extract<ReturnType<typeof parseArticleRequestToken>, { ok: true }>
) {
  const source = asObject(raw);
  const id = toId(source._id) || toId(source.id);
  const currentSlug = normalizedStoredSlug(source.slug);
  const previousSlugs = Array.isArray(source.previousSlugs)
    ? source.previousSlugs.map(normalizedStoredSlug).filter(Boolean)
    : [];
  return Boolean(
    id === token.decoded ||
      (token.objectId && id.toLowerCase() === token.objectId.toLowerCase()) ||
      (token.normalizedSlug &&
        (currentSlug === token.normalizedSlug || previousSlugs.includes(token.normalizedSlug)))
  );
}

function toPublicArticleAuthority(raw: unknown): PublicArticleAuthority | null {
  const source = asObject(raw);
  const id = toId(source._id) || toId(source.id);
  const slug = toText(source.slug);
  const title = toText(source.title);
  const summary = toText(source.summary);
  const image = normalizeMediaUrl(source.image);
  const category = toText(source.category) || 'General';
  const author = toText(source.author) || 'Editor';
  if (!id || !title || !summary) return null;
  const previousSlugs = Array.isArray(source.previousSlugs)
    ? source.previousSlugs.map(toText).filter(Boolean)
    : [];
  return {
    id,
    slug,
    previousSlugs,
    title,
    summary,
    image,
    category,
    author,
    publishedAt: toIsoDate(source.publishedAt),
    updatedAt: toIsoDate(source.updatedAt),
    seo: normalizeSeo(source.seo, image),
    href: buildArticlePublicPath({ id, slug }),
  };
}

async function getMongoResolutionCandidates(
  token: Extract<ReturnType<typeof parseArticleRequestToken>, { ok: true }>
) {
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

export async function resolvePublicArticleToken(
  requestToken: string
): Promise<PublicArticleResolution> {
  const token = parseArticleRequestToken(requestToken);
  if (!token.ok) return { kind: 'missing' };

  let source: PublicArticleSource;
  let candidates: unknown[];
  try {
    source = await resolveSource();
    candidates = source === 'mongo'
      ? await getMongoResolutionCandidates(token)
      : (await listStoredArticleResolutionRecords()).filter((item) =>
          matchesResolutionToken(item, token)
        );
  } catch (error) {
    console.error('Public article resolver store failure.', error);
    return { kind: 'unavailable' };
  }

  const owners = new Map<string, unknown>();
  for (const candidate of candidates.filter((item) => matchesResolutionToken(item, token))) {
    const sourceRecord = asObject(candidate);
    const id = toId(sourceRecord._id) || toId(sourceRecord.id);
    if (id) owners.set(id, candidate);
  }
  if (owners.size > 1 || candidates.length > 2) return { kind: 'ambiguous' };
  if (owners.size === 0) return { kind: 'missing' };

  const raw = owners.values().next().value;
  if (!raw || !isPubliclyPublishedArticle(raw)) return { kind: 'missing' };
  const article = toPublicArticleAuthority(raw);
  if (!article) return { kind: 'missing' };

  const normalizedCurrent = normalizedStoredSlug(article.slug);
  const idMatch = Boolean(
    article.id === token.decoded ||
      (token.objectId && article.id.toLowerCase() === token.objectId.toLowerCase())
  );
  const hasSlugAuthority = isValidArticleSlug(article.slug);
  const kind: ResolvedPublicArticleToken['kind'] = token.normalizedSlug === normalizedCurrent
    ? 'current'
    : idMatch && hasSlugAuthority
      ? 'legacyId'
      : idMatch
        ? 'current'
        : 'previous';
  const authoritativePath = article.href;
  const authoritativeToken = hasSlugAuthority ? article.slug : article.id;
  const isExactAuthority = kind === 'current' && token.decoded === authoritativeToken;

  return { kind, source, article, authoritativePath, isExactAuthority };
}

export async function getPublicArticleByResolution(
  resolution: ResolvedPublicArticleToken
): Promise<PublicArticleDetailResult> {
  let raw: unknown;
  try {
    raw = resolution.source === 'mongo'
      ? await Article.findById(resolution.article.id).lean()
      : await getStoredArticleByIdStrict(resolution.article.id);
  } catch (error) {
    console.error('Public article detail store failure.', error);
    throw new PublicArticleResolutionError('unavailable');
  }
  if (!raw || !isPubliclyPublishedArticle(raw)) {
    throw new PublicArticleResolutionError('unavailable');
  }
  const article = toPublicArticleDetail(raw);
  if (!article) throw new PublicArticleResolutionError('unavailable');
  return { article, source: resolution.source };
}

export async function getPublicArticleBySlug(
  slugOrId: string
): Promise<PublicArticleDetailResult | null> {
  const resolution = await resolvePublicArticleToken(slugOrId);
  if (resolution.kind === 'missing') return null;
  if (resolution.kind === 'ambiguous' || resolution.kind === 'unavailable') {
    throw new PublicArticleResolutionError(resolution.kind);
  }
  return getPublicArticleByResolution(resolution);
}

export const PUBLIC_ARTICLE_FILTER_FIELDS = [
  'category',
  'city',
  ...NEWS_CATEGORY_DEFINITIONS.map((item) => item.slug),
];
