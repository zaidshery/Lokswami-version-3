import crypto from 'crypto';
import { LOKSWAMI_SOURCE_ORIGIN } from './safety';
import type {
  SnapshotArticle,
  SnapshotBreakingItem,
  SnapshotMediaReference,
  SnapshotPublication,
  SnapshotShort,
  SnapshotVideo,
} from './types';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function valueAt(source: UnknownRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => asRecord(value)[key], source);
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  const record = asRecord(value);
  return String(record.name || record.title || record.label || record.url || record.path || record.$oid || '').trim();
}

function firstText(source: UnknownRecord, paths: string[]): string {
  for (const candidate of paths) {
    const value = textValue(valueAt(source, candidate));
    if (value) return value;
  }
  return '';
}

function firstNumber(source: UnknownRecord, paths: string[], fallback = 0): number {
  for (const candidate of paths) {
    const value = Number(valueAt(source, candidate));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function normalizeDate(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function slugify(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function publicUrl(value: string, fallbackPath: string): string {
  try {
    return new URL(value || fallbackPath, `${LOKSWAMI_SOURCE_ORIGIN}/`).toString();
  } catch {
    return new URL(fallbackPath, `${LOKSWAMI_SOURCE_ORIGIN}/`).toString();
  }
}

function media(value: string, kind: 'image' | 'pdf'): SnapshotMediaReference | undefined {
  if (!value) return undefined;
  return {
    sourceUrl: publicUrl(value, '/'),
    kind,
    status: 'pending',
  };
}

function extractArray(payload: unknown, names: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  const data = root.data;
  if (Array.isArray(data)) return data;
  const containers = [asRecord(data), root];
  for (const container of containers) {
    for (const name of names) {
      const value = container[name];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function unwrapOne(payload: unknown, names: string[]): UnknownRecord {
  const root = asRecord(payload);
  const data = root.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const dataRecord = asRecord(data);
    for (const name of names) {
      const nested = asRecord(dataRecord[name]);
      if (Object.keys(nested).length) return nested;
    }
    if (Object.keys(dataRecord).length) return dataRecord;
  }
  for (const name of names) {
    const nested = asRecord(root[name]);
    if (Object.keys(nested).length) return nested;
  }
  return root;
}

export function deterministicLocalObjectId(type: string, publicId: string): string {
  const normalizedType = type.trim().toLowerCase();
  const normalizedId = publicId.trim().normalize('NFKC');
  if (!normalizedType || !normalizedId) {
    throw new Error('Deterministic snapshot IDs require both content type and public identifier.');
  }
  return crypto.createHash('sha256').update(`${normalizedType}\0${normalizedId}`).digest('hex').slice(0, 24);
}

function parseTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of values) {
    const tag = textValue(entry);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

function parseArticleRecord(raw: unknown, capturedAt: string): SnapshotArticle | null {
  const source = asRecord(raw);
  const title = firstText(source, ['title', 'headline', 'name']);
  const sourceId = firstText(source, ['_id', 'id', 'articleId', 'uuid']);
  if (!title || !sourceId) return null;
  const slug = firstText(source, ['slug', 'seo.slug']) || slugify(title) || sourceId;
  const imageUrl = firstText(source, [
    'image',
    'heroImage',
    'featuredImage',
    'thumbnail',
    'media.image',
    'seo.image',
  ]);
  const href = firstText(source, ['href', 'canonicalUrl', 'seo.canonicalUrl']);
  return {
    type: 'article',
    sourceId,
    localId: deterministicLocalObjectId('article', sourceId),
    sourceCapturedAt: capturedAt,
    sourceUrl: publicUrl(href, `/main/article/${encodeURIComponent(slug)}`),
    slug,
    title,
    summary: firstText(source, ['summary', 'excerpt', 'description']),
    content: firstText(source, ['content', 'body', 'contentHtml', 'articleBody']),
    category: firstText(source, ['category', 'category.name', 'section']) || 'General',
    author: firstText(source, ['author', 'author.name', 'authorMeta.name', 'reporterMeta.reporterName']) || 'Editor',
    tags: parseTags(source.tags || source.keywords || valueAt(source, 'seo.secondaryKeywords')),
    publishedAt: normalizeDate(firstText(source, ['publishedAt', 'publishDate', 'createdAt'])),
    updatedAt: normalizeDate(firstText(source, ['updatedAt', 'modifiedAt', 'publishedAt'])),
    ...(imageUrl ? { image: media(imageUrl, 'image') } : {}),
  };
}

export function parseArticleList(payload: unknown, capturedAt: string): SnapshotArticle[] {
  return extractArray(payload, ['items', 'articles', 'results'])
    .map((item) => parseArticleRecord(item, capturedAt))
    .filter((item): item is SnapshotArticle => Boolean(item));
}

export function parseArticleDetail(payload: unknown, capturedAt: string): SnapshotArticle | null {
  return parseArticleRecord(unwrapOne(payload, ['article', 'item']), capturedAt);
}

export function mergeArticleDetail(
  summary: SnapshotArticle,
  detail: SnapshotArticle | null
): SnapshotArticle {
  if (!detail || detail.sourceId !== summary.sourceId) return summary;
  return {
    ...summary,
    ...detail,
    summary: detail.summary || summary.summary,
    content: detail.content || summary.content,
    category: detail.category || summary.category,
    author: detail.author || summary.author,
    tags: detail.tags.length ? detail.tags : summary.tags,
    publishedAt: detail.publishedAt || summary.publishedAt,
    updatedAt: detail.updatedAt || summary.updatedAt,
    image: detail.image || summary.image,
  };
}

export function parseBreaking(payload: unknown, capturedAt: string): SnapshotBreakingItem[] {
  return extractArray(payload, ['items', 'breaking', 'articles', 'results']).reduce<SnapshotBreakingItem[]>((items, raw) => {
    const source = asRecord(raw);
    const title = firstText(source, ['title', 'headline']);
    const sourceId = firstText(source, ['_id', 'id', 'breakingId', 'articleId']);
    if (!title || !sourceId) return items;
    const href = firstText(source, ['href', 'sourceUrl']);
    const articleSourceId = firstText(source, ['articleId', 'article._id', 'article.id', '_id', 'id']);
    items.push({
      type: 'breaking',
      sourceId,
      localId: deterministicLocalObjectId('breaking', sourceId),
      sourceCapturedAt: capturedAt,
      sourceUrl: publicUrl(href, `/main/article/${encodeURIComponent(firstText(source, ['slug']) || articleSourceId || sourceId)}`),
      title,
      ...(articleSourceId ? {
        articleSourceId,
        articleLocalId: deterministicLocalObjectId('article', articleSourceId),
      } : {}),
      category: firstText(source, ['category', 'category.name']) || 'General',
      city: firstText(source, ['city', 'city.name']),
      publishedAt: normalizeDate(firstText(source, ['publishedAt', 'createdAt'])),
      ...(firstText(source, ['ttsAudioUrl', 'audioUrl']) ? {
        audioSourceUrl: publicUrl(firstText(source, ['ttsAudioUrl', 'audioUrl']), '/'),
      } : {}),
    });
    return items;
  }, []);
}

function inferProvider(source: UnknownRecord, url: string): string {
  const explicit = firstText(source, ['mediaProvider', 'provider']);
  if (explicit) return explicit;
  return /(?:youtube\.com|youtu\.be)/i.test(url) ? 'youtube' : 'spaces-mp4';
}

function parseVideoRecord(raw: unknown, capturedAt: string, type: 'video' | 'short'): SnapshotVideo | SnapshotShort | null {
  const source = asRecord(raw);
  const sourceId = firstText(source, ['_id', 'id', 'videoId', 'uuid']);
  const title = firstText(source, ['title', 'headline', 'name']);
  const playback = firstText(source, ['playbackUrl', 'videoUrl', 'youtubeUrl', 'hlsUrl', 'url']);
  if (!sourceId || !title || !playback) return null;
  const slug = firstText(source, ['slug']) || slugify(title) || sourceId;
  const thumbnailUrl = firstText(source, ['posterUrl', 'thumbnail', 'thumbnailUrl', 'image']);
  const common = {
    type,
    sourceId,
    localId: deterministicLocalObjectId(type, sourceId),
    sourceCapturedAt: capturedAt,
    sourceUrl: publicUrl(firstText(source, ['href']), type === 'short' ? `/main/shorts?short=${encodeURIComponent(slug)}` : `/main/videos?video=${encodeURIComponent(slug)}`),
    slug,
    title,
    description: firstText(source, ['description', 'summary', 'excerpt']),
    category: firstText(source, ['category', 'category.name']) || 'General',
    provider: inferProvider(source, playback),
    publicUrl: publicUrl(playback, '/main/videos'),
    durationSeconds: Math.max(0, Math.floor(firstNumber(source, ['duration', 'durationSeconds']))),
    publishedAt: normalizeDate(firstText(source, ['publishedAt', 'createdAt'])),
    ...(thumbnailUrl ? { thumbnail: media(thumbnailUrl, 'image') } : {}),
  };
  if (type === 'video') return common as SnapshotVideo;
  const articleSourceId = firstText(source, ['articleId', 'article._id', 'article.id', 'linkedArticleId']);
  return {
    ...common,
    type: 'short',
    ...(articleSourceId ? { articleSourceId } : {}),
    supported: false,
    unsupportedReason: articleSourceId
      ? 'Related article has not been resolved against the imported article snapshot.'
      : 'Public short does not expose a related article.',
  } as SnapshotShort;
}

export function parseVideos(payload: unknown, capturedAt: string): SnapshotVideo[] {
  return extractArray(payload, ['items', 'videos', 'results'])
    .map((item) => parseVideoRecord(item, capturedAt, 'video'))
    .filter((item): item is SnapshotVideo => Boolean(item));
}

export function parseShorts(payload: unknown, capturedAt: string): SnapshotShort[] {
  return extractArray(payload, ['items', 'shorts', 'videos', 'results'])
    .map((item) => parseVideoRecord(item, capturedAt, 'short'))
    .filter((item): item is SnapshotShort => Boolean(item));
}

export function resolveShortArticleLinks(
  shorts: SnapshotShort[],
  articles: SnapshotArticle[]
): SnapshotShort[] {
  const articlesBySourceId = new Map(articles.map((article) => [article.sourceId, article]));
  return shorts.map((short) => {
    const article = short.articleSourceId ? articlesBySourceId.get(short.articleSourceId) : undefined;
    if (!article) {
      return {
        ...short,
        supported: false,
        unsupportedReason: short.articleSourceId
          ? 'Related public article is not present in this bounded snapshot.'
          : 'Public short does not expose a related article.',
      };
    }
    return {
      ...short,
      supported: true,
      articleLocalId: article.localId,
      unsupportedReason: undefined,
    };
  });
}

function parsePageMedia(source: UnknownRecord): SnapshotMediaReference[] {
  const pages = Array.isArray(source.pages) ? source.pages : [];
  return pages.reduce<SnapshotMediaReference[]>((items, page) => {
    const pageRecord = asRecord(page);
    const imageUrl = firstText(pageRecord, ['imagePath', 'image', 'url', 'thumbnail']);
    const reference = media(imageUrl, 'image');
    if (reference) items.push(reference);
    return items;
  }, []);
}

function parsePublicationRecord(
  raw: unknown,
  capturedAt: string,
  type: 'epaper' | 'emagazine'
): SnapshotPublication | null {
  const source = asRecord(raw);
  const sourceId = firstText(source, ['_id', 'id', 'editionId', 'issueId']);
  const title = firstText(source, ['title', 'name']);
  if (!sourceId || !title) return null;
  const pages = parsePageMedia(source);
  const pageCount = Math.max(0, Math.floor(firstNumber(source, ['pageCount', 'pages'], pages.length)));
  const thumbnailUrl = firstText(source, ['thumbnailPath', 'thumbnail', 'cover', 'coverImage']);
  const pdfUrl = firstText(source, ['pdfPath', 'pdfUrl', 'downloadUrl']);
  const publishDate = normalizeDate(firstText(source, ['publishDate', 'publishedAt', 'issueDate']));
  const citySlug = firstText(source, ['citySlug', 'city.slug']);
  const href = firstText(source, ['href', 'publicUrl']);
  return {
    type,
    sourceId,
    localId: deterministicLocalObjectId(type, sourceId),
    sourceCapturedAt: capturedAt,
    sourceUrl: publicUrl(href, type === 'emagazine' ? '/main/e-magazine' : '/main/epaper'),
    title,
    city: firstText(source, ['cityName', 'city', 'city.name']),
    citySlug,
    publishDate,
    pageCount,
    publicUrl: publicUrl(href, type === 'emagazine' ? '/main/e-magazine' : '/main/epaper'),
    ...(thumbnailUrl ? { thumbnail: media(thumbnailUrl, 'image') } : {}),
    ...(pdfUrl ? { pdf: media(pdfUrl, 'pdf') } : {}),
    pages,
  };
}

export function parseEpapers(payload: unknown, capturedAt: string): SnapshotPublication[] {
  return extractArray(payload, ['epapers', 'items', 'editions', 'results'])
    .map((item) => parsePublicationRecord(item, capturedAt, 'epaper'))
    .filter((item): item is SnapshotPublication => Boolean(item));
}

export function parseHomeFeedEmagazines(payload: unknown, capturedAt: string): SnapshotPublication[] {
  const root = asRecord(payload);
  const data = asRecord(root.data || payload);
  const raw = data.emagazine || data.emagazines;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .map((item) => parsePublicationRecord(item, capturedAt, 'emagazine'))
    .filter((item): item is SnapshotPublication => Boolean(item));
}
