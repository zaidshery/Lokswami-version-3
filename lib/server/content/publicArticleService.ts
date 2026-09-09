import 'server-only';

import {
  NEWS_CATEGORY_DEFINITIONS,
  resolveNewsCategory,
} from '@/lib/constants/newsCategories';
import {
  buildArticlePublicPath,
  isValidArticleSlug,
  parseArticleRequestToken,
} from '@/lib/seo/articleSeo';
import { isPubliclyPublishedArticle } from '@/lib/content/articlePublication';
import { resolveArticleEditorialFlags } from '@/lib/content/articleEditorial';
import { resolveReusableBreakingTts } from '@/lib/server/breakingTts';
import {
  articleRepository,
  normalizePublicArticleLimit,
  toPublicArticleDetail,
  type ArticleRepository,
} from './articleRepository';
import {
  PublicArticleResolutionError,
  type PublicArticleAuthority,
  type PublicArticleCursor,
  type PublicArticleDetail,
  type PublicArticleDetailResult,
  type PublicArticleItem,
  type PublicArticleListFilters,
  type PublicArticleListOptions,
  type PublicArticleListResult,
  type PublicArticleResolution,
  type PublicArticleSource,
  type PublicBreakingItem,
  type PublicRelatedArticlesResult,
  type ResolvedPublicArticleToken,
  type LegacyFeedArticle,
  type LegacyFeedCursor,
  type LegacyFeedPageResult,
} from './articleTypes';

const DEFAULT_FEED_LIMIT = 20;
const MIN_FEED_LIMIT = 5;
const MAX_FEED_LIMIT = 200;

const DEFAULT_BREAKING_LIMIT = 10;
const MIN_BREAKING_LIMIT = 1;
const MAX_BREAKING_LIMIT = 25;

const MAX_RELATED_LIMIT = 20;
const MIN_LIMIT = 1;

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

function normalizeFilterValue(value: unknown) {
  return String(value || '').trim();
}

function normalizeComparable(value: string) {
  return value.trim().toLowerCase();
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
  const image = toText(source.image);
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
    publishedAt: toText(source.publishedAt),
    updatedAt: toText(source.updatedAt || source.publishedAt),
    seo: (source.seo as PublicArticleAuthority['seo']) || {},
    href: buildArticlePublicPath({ id, slug }),
  };
}

function parseFeedLimit(raw: unknown) {
  const parsed = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_FEED_LIMIT;
  return Math.min(MAX_FEED_LIMIT, Math.max(MIN_FEED_LIMIT, parsed));
}

function parseFeedCursor(
  cursorPublishedAt: string | null | undefined,
  cursorId: string | null | undefined
): LegacyFeedCursor | null {
  if (!cursorPublishedAt || !cursorId) return null;

  const cursorDate = new Date(cursorPublishedAt);
  if (Number.isNaN(cursorDate.getTime())) return null;

  const id = cursorId.trim();
  if (!id) return null;

  return {
    publishedAt: cursorDate.toISOString(),
    id,
    date: cursorDate,
  };
}

function normalizeFeedDate(value: unknown) {
  const parsed = new Date(
    typeof value === 'string' || typeof value === 'number' || value instanceof Date
      ? value
      : Date.now()
  );
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeFeedAuthorMeta(input: Record<string, unknown>) {
  const seo =
    typeof input.seo === 'object' && input.seo
      ? (input.seo as Record<string, unknown>)
      : null;
  if (!seo) return undefined;

  const hasFields =
    seo.authorDisplayNameSet === true ||
    Boolean(seo.authorDisplayName || seo.authorAvatarUrl || seo.authorProgramName);
  if (!hasFields) return undefined;

  return {
    name: typeof seo.authorDisplayName === 'string' ? seo.authorDisplayName.trim() : '',
    avatar: typeof seo.authorAvatarUrl === 'string' ? seo.authorAvatarUrl.trim() : '',
    programName: typeof seo.authorProgramName === 'string' ? seo.authorProgramName.trim() : '',
  };
}

function normalizeFeedArticle(source: unknown): LegacyFeedArticle | null {
  const input = asObject(source);
  const id = toId(input._id) || toId(input.id);
  const slug = toText(input.slug);
  const title = toText(input.title);
  const summary = toText(input.summary);
  const content = toText(input.content);
  const image = toText(input.image);
  const category = toText(input.category) || 'General';
  const author = toText(input.author) || 'Editor';
  const publishedAt = normalizeFeedDate(input.publishedAt);
  const viewsRaw =
    typeof input.views === 'number' ? input.views : Number(input.views || 0);
  const activeFlags = resolveArticleEditorialFlags(input);

  if (!id || !title || !summary || !image) return null;

  const authorMeta = normalizeFeedAuthorMeta(input);

  return {
    _id: id,
    id,
    slug,
    title,
    summary,
    content,
    image,
    category,
    author,
    ...(authorMeta ? { authorMeta } : {}),
    publishedAt,
    views: Number.isFinite(viewsRaw) ? viewsRaw : 0,
    isBreaking: activeFlags.isBreaking,
    isTrending: activeFlags.isTrending,
  };
}

function compareFeedArticles(a: LegacyFeedArticle, b: LegacyFeedArticle) {
  const byDate = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  if (byDate !== 0) return byDate;
  return b._id.localeCompare(a._id);
}

function applyFeedCursorFilter(items: LegacyFeedArticle[], cursor: LegacyFeedCursor | null) {
  if (!cursor) return items;
  const cursorTime = cursor.date.getTime();
  return items.filter((item) => {
    const itemTime = new Date(item.publishedAt).getTime();
    if (itemTime < cursorTime) return true;
    if (itemTime > cursorTime) return false;
    return item._id < cursor.id;
  });
}

function parseBreakingLimit(value: unknown) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_BREAKING_LIMIT;
  return Math.min(MAX_BREAKING_LIMIT, Math.max(MIN_BREAKING_LIMIT, parsed));
}

function normalizeBreakingTimestamp(value: unknown) {
  const parsed = new Date(
    typeof value === 'string' || typeof value === 'number' || value instanceof Date
      ? value
      : Date.now()
  );
  if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString();
  return parsed.toISOString();
}

function normalizeBreakingItem(source: unknown): PublicBreakingItem | null {
  const input = asObject(source);
  if (!isPubliclyPublishedArticle(input)) return null;

  const id = toId(input._id) || toId(input.id);
  const title = toText(input.title);
  if (!id || !title) return null;

  const category = toText(input.category);
  const reporterMeta = asObject(input.reporterMeta);
  const city = toText(
    input.city || input.cityName || input.locationTag || reporterMeta.locationTag || ''
  );
  const isBreaking = resolveArticleEditorialFlags(input).isBreaking;
  const reusableTts = isBreaking
    ? resolveReusableBreakingTts({
        _id: id,
        title,
        city,
        reporterMeta: input.reporterMeta,
        category,
        isBreaking: true,
        breakingTts: input.breakingTts,
      })
    : null;
  const publishedAt = normalizeBreakingTimestamp(input.publishedAt || input.createdAt);

  return {
    id,
    title,
    city: city || undefined,
    category: category || undefined,
    createdAt: publishedAt,
    href: buildArticlePublicPath({ id, slug: toText(input.slug) }),
    priority: Math.max(1, new Date(publishedAt).getTime()),
    ...(reusableTts
      ? {
          ttsAudioUrl: reusableTts.audioUrl,
          ttsReady: true,
        }
      : {}),
  };
}

function compareBreakingItems(a: PublicBreakingItem, b: PublicBreakingItem) {
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

export class PublicArticleService {
  constructor(private readonly repo: ArticleRepository = articleRepository) {}

  async listPublicArticles(
    options: PublicArticleListOptions = {}
  ): Promise<PublicArticleListResult> {
    const source = await this.repo.resolveSource();
    const items =
      source === 'mongo'
        ? await this.repo.listMongoArticles(options)
        : await this.repo.listFileArticles();
    return buildListResult(items, source, options);
  }

  async resolvePublicArticleToken(
    requestToken: string
  ): Promise<PublicArticleResolution> {
    const token = parseArticleRequestToken(requestToken);
    if (!token.ok) return { kind: 'missing' };

    let source: PublicArticleSource;
    let candidates: unknown[];
    try {
      source = await this.repo.resolveSource();
      candidates =
        source === 'mongo'
          ? await this.repo.getMongoResolutionCandidates(token)
          : (await this.repo.listStoredResolutionRecords()).filter((item) =>
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

  async getPublicArticleByResolution(
    resolution: ResolvedPublicArticleToken
  ): Promise<PublicArticleDetailResult> {
    let raw: unknown;
    try {
      raw =
        resolution.source === 'mongo'
          ? await this.repo.findMongoArticleById(resolution.article.id)
          : await this.repo.findFileArticleById(resolution.article.id);
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

  async getPublicArticleBySlug(
    slugOrId: string
  ): Promise<PublicArticleDetailResult | null> {
    const resolution = await this.resolvePublicArticleToken(slugOrId);
    if (resolution.kind === 'missing') return null;
    if (resolution.kind === 'ambiguous' || resolution.kind === 'unavailable') {
      throw new PublicArticleResolutionError(resolution.kind);
    }
    return this.getPublicArticleByResolution(resolution);
  }

  async listRelatedPublicArticles(
    current: Pick<PublicArticleDetail, 'id' | 'href' | 'category'>,
    options: { limit?: number; source?: PublicArticleSource } = {}
  ): Promise<PublicRelatedArticlesResult> {
    const limit = Math.min(
      MAX_RELATED_LIMIT,
      Math.max(MIN_LIMIT, normalizePublicArticleLimit(options.limit))
    );
    const source = options.source || (await this.repo.resolveSource());
    const items =
      source === 'mongo'
        ? await this.repo.listMongoRelatedCandidates(current.category, limit)
        : await this.repo.listFileArticles();

    return {
      items: buildRelatedPublicArticles(items, current, limit),
      source,
      limit,
    };
  }

  async getLatestFeed(
    limitInput?: unknown,
    cursorInput?: { cursorPublishedAt?: string | null; cursorId?: string | null }
  ): Promise<LegacyFeedPageResult> {
    const limit = parseFeedLimit(limitInput);
    const cursor = parseFeedCursor(
      cursorInput?.cursorPublishedAt,
      cursorInput?.cursorId
    );
    const source = await this.repo.resolveSource();

    if (source === 'file') {
      const stored = await this.repo.listAllStored();
      const normalized = stored
        .filter((item) => isPubliclyPublishedArticle(item))
        .map((item) => normalizeFeedArticle(item))
        .filter((item): item is LegacyFeedArticle => Boolean(item))
        .sort(compareFeedArticles);

      const filtered = applyFeedCursorFilter(normalized, cursor);
      const pageItems = filtered.slice(0, limit);
      const hasMore = filtered.length > limit;
      const last = pageItems[pageItems.length - 1];

      return {
        items: pageItems,
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? {
                publishedAt: last.publishedAt,
                id: last._id,
              }
            : null,
      };
    }

    const docs = await this.repo.listMongoFeedArticles(limit, cursor);
    const normalized = docs
      .filter((doc) => isPubliclyPublishedArticle(doc))
      .map((doc) => normalizeFeedArticle(doc))
      .filter((item): item is LegacyFeedArticle => Boolean(item))
      .sort(compareFeedArticles);

    const hasMore = normalized.length > limit;
    const pageItems = normalized.slice(0, limit);
    const last = pageItems[pageItems.length - 1];

    return {
      items: pageItems,
      limit,
      hasMore,
      nextCursor:
        hasMore && last
          ? {
              publishedAt: last.publishedAt,
              id: last._id,
            }
          : null,
    };
  }

  async getBreakingArticles(limitInput?: unknown): Promise<PublicBreakingItem[]> {
    const limit = parseBreakingLimit(limitInput);
    const source = await this.repo.resolveSource();

    const raw =
      source === 'mongo'
        ? await this.repo.listMongoBreakingCandidates(limit)
        : await this.repo.listAllStored();

    return raw
      .map((item) => normalizeBreakingItem(item))
      .filter((item): item is PublicBreakingItem => Boolean(item))
      .sort(compareBreakingItems)
      .slice(0, limit);
  }

  async getLegacyArticleByIdOrSlug(idOrSlug: string): Promise<unknown | null> {
    const normalized = decodeURIComponent(idOrSlug).trim();
    if (!normalized) return null;

    const source = await this.repo.resolveSource();
    const article =
      source === 'mongo'
        ? await this.repo.findMongoArticleByIdOrSlug(normalized)
        : await this.repo.findFileArticleByIdOrSlug(normalized);

    if (!article || !isPubliclyPublishedArticle(article)) {
      return null;
    }

    return article;
  }
}

export const publicArticleService = new PublicArticleService();

export const PUBLIC_ARTICLE_FILTER_FIELDS = [
  'category',
  'city',
  ...NEWS_CATEGORY_DEFINITIONS.map((item) => item.slug),
];
