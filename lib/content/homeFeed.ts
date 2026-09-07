import type { Article } from '@/lib/mock/data';
import type { EPaperPublicationType } from '@/lib/types/epaper';

const DEFAULT_AVATAR = '/logo-icon-final.png';

export type HomePageEpaperPreview = {
  _id: string;
  publicationType?: EPaperPublicationType;
  citySlug: string;
  cityName: string;
  title: string;
  publishDate: string;
  thumbnailPath: string;
  pageCount: number;
};

export type HomePageShortItem = {
  id: string;
  slug?: string;
  title: string;
  thumbnail: string;
  videoUrl?: string;
  duration: number;
  category: string;
  publishedAt: string;
};

export type HomePageFeedState = {
  articles: Article[];
  epaper: HomePageEpaperPreview | null;
  emagazine: HomePageEpaperPreview | null;
  shorts?: HomePageShortItem[];
};

type PublicHomeFeedArticle = {
  id?: string;
  _id?: string;
  slug?: string;
  title?: string;
  summary?: string;
  image?: string;
  category?: string;
  author?: string | { name?: string; avatar?: string };
  publishedAt?: string;
  views?: number;
  isBreaking?: boolean;
  isTrending?: boolean;
  seo?: Article['seo'];
};

type PublicHomeFeedEPaper = {
  id?: string;
  _id?: string;
  publicationType?: EPaperPublicationType;
  citySlug?: string;
  cityName?: string;
  title?: string;
  publishDate?: string;
  thumbnailPath?: string;
  thumbnail?: string;
  pageCount?: number;
};

type PublicHomeFeedData = {
  hero?: PublicHomeFeedArticle[];
  latest?: PublicHomeFeedArticle[];
  trending?: PublicHomeFeedArticle[];
  epaper?: PublicHomeFeedEPaper | null;
  emagazine?: PublicHomeFeedEPaper | null;
  shorts?: Array<Record<string, unknown>>;
};

type PublicHomeFeedEnvelope = {
  success?: boolean;
  data?: PublicHomeFeedData;
};

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeDate(value: unknown) {
  const parsed = new Date(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : Date.now()
  );
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeAuthor(value: PublicHomeFeedArticle['author']) {
  if (typeof value === 'string') {
    const name = value.trim() || 'Editor';
    return {
      id: `author-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      avatar: DEFAULT_AVATAR,
    };
  }

  const name = value?.name?.trim() || 'Editor';
  return {
    id: `author-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    avatar: value?.avatar?.trim() || DEFAULT_AVATAR,
  };
}

function mapHomeFeedArticle(raw: PublicHomeFeedArticle, index: number): Article | null {
  const input = asObject(raw) as PublicHomeFeedArticle;
  const id = String(input.id || input._id || `home-feed-${index}`).trim();
  const title = String(input.title || '').trim();
  const summary = String(input.summary || '').trim();
  const image = String(input.image || '').trim();
  const category = String(input.category || '').trim() || 'General';

  if (!id || !title || !summary || !image) return null;

  return {
    id,
    slug: String(input.slug || '').trim() || undefined,
    title,
    summary,
    image,
    category,
    author: normalizeAuthor(input.author),
    publishedAt: normalizeDate(input.publishedAt),
    views: Math.max(0, Math.floor(normalizeNumber(input.views))),
    isBreaking: Boolean(input.isBreaking),
    isTrending: Boolean(input.isTrending),
    seo: input.seo,
  };
}

function mergeUniqueArticles(sections: PublicHomeFeedArticle[][]) {
  const seen = new Set<string>();
  const output: Article[] = [];

  sections.flat().forEach((item, index) => {
    const article = mapHomeFeedArticle(item, index);
    if (!article) return;
    const key = article.id || `${article.title.toLowerCase()}|${article.publishedAt}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(article);
  });

  return output;
}

function mapHomeFeedEPaper(raw: PublicHomeFeedEPaper | null | undefined) {
  if (!raw) return null;
  const input = asObject(raw) as PublicHomeFeedEPaper;
  const id = String(input.id || input._id || '').trim();
  if (!id) return null;

  return {
    _id: id,
    publicationType: input.publicationType === 'emagazine' ? 'emagazine' : 'epaper',
    citySlug: String(input.citySlug || '').trim(),
    cityName: String(input.cityName || '').trim(),
    title: String(input.title || '').trim(),
    publishDate: String(input.publishDate || '').trim(),
    thumbnailPath: firstNonEmptyString(input.thumbnailPath, input.thumbnail),
    pageCount: Math.max(0, Math.floor(normalizeNumber(input.pageCount))),
  } satisfies HomePageEpaperPreview;
}

function getHomeFeedData(payload: unknown): PublicHomeFeedData | null {
  const envelope = asObject(payload) as PublicHomeFeedEnvelope;
  if (envelope.success === false) return null;

  const data = asObject(envelope.data || payload) as PublicHomeFeedData;
  if (!data || typeof data !== 'object') return null;
  return data;
}

export function mapHomeFeedToHomePageState(payload: unknown): HomePageFeedState | null {
  const data = getHomeFeedData(payload);
  if (!data) return null;

  const articles = mergeUniqueArticles([
    Array.isArray(data.hero) ? data.hero : [],
    Array.isArray(data.latest) ? data.latest : [],
    Array.isArray(data.trending) ? data.trending : [],
  ]);
  const epaper = mapHomeFeedEPaper(data.epaper);
  const emagazine = mapHomeFeedEPaper(data.emagazine);

  const rawShorts = Array.isArray(data.shorts) ? data.shorts : [];
  const shorts = rawShorts.reduce<HomePageShortItem[]>((acc, s, idx) => {
    const item = asObject(s);
    const id = String(item.id || item._id || `short-${idx}`).trim();
    const title = String(item.title || '').trim();
    const thumbnail = String(item.thumbnail || '').trim();
    if (!id || !title) return acc;
    const slug = String(item.slug || '').trim();
    acc.push({
      id,
      slug: slug || undefined,
      title,
      thumbnail,
      videoUrl: String(item.videoUrl || '').trim() || undefined,
      duration: Math.max(0, Math.floor(Number(item.duration) || 0)),
      category: String(item.category || 'National').trim(),
      publishedAt: String(item.publishedAt || new Date().toISOString()),
    });
    return acc;
  }, []);

  if (!articles.length && !epaper && !emagazine && !shorts.length) return null;

  return {
    articles,
    epaper,
    emagazine,
    shorts,
  };
}

export async function fetchHomeFeedForHomePage(
  input: RequestInfo | URL = '/api/v1/public/home-feed'
) {
  try {
    const response = await fetch(input);
    const payload = await response.json().catch(() => null);
    if (!response.ok) return null;
    return mapHomeFeedToHomePageState(payload);
  } catch {
    return null;
  }
}
