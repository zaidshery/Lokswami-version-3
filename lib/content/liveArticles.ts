import type { Article } from '@/lib/mock/data';

type ApiArticle = {
  _id?: string;
  id?: string;
  slug?: string;
  title?: string;
  summary?: string;
  content?: string;
  image?: string;
  category?: string;
  author?: string | { name?: string; avatar?: string };
  publishedAt?: string;
  views?: number;
  isBreaking?: boolean;
  isTrending?: boolean;
  seo?: Article['seo'];
};

const DEFAULT_AVATAR = '/logo-icon-final.png';
const USE_REMOTE_DEMO_MEDIA =
  process.env.NEXT_PUBLIC_USE_REMOTE_DEMO_MEDIA === 'true';
const UNSPLASH_IMAGE_HOST = /^https:\/\/images\.unsplash\.com\//i;
const LOCAL_NEWS_FALLBACK_IMAGE = '/placeholders/news-16x9.svg';

function normalizeArticleImage(value: string) {
  const image = value.trim();
  if (!image) return '';
  if (!USE_REMOTE_DEMO_MEDIA && UNSPLASH_IMAGE_HOST.test(image)) {
    return LOCAL_NEWS_FALLBACK_IMAGE;
  }
  return image;
}

function normalizeArticle(raw: ApiArticle, index: number): Article | null {
  const id = raw._id || raw.id || `live-${index}`;
  const title = (raw.title || '').trim();
  const summary = (raw.summary || '').trim();
  const image = normalizeArticleImage(raw.image || '');
  const category = (raw.category || 'General').trim();
  const publishedAt = raw.publishedAt || new Date().toISOString();

  if (!title || !summary || !image) {
    return null;
  }

  const authorName =
    typeof raw.author === 'string'
      ? raw.author
      : raw.author?.name || 'Editor';
  const authorAvatar =
    typeof raw.author === 'string'
      ? DEFAULT_AVATAR
      : raw.author?.avatar || DEFAULT_AVATAR;

  return {
    id,
    slug: raw.slug,
    title,
    summary,
    content: raw.content || '',
    image,
    category,
    author: {
      id: `author-${authorName.toLowerCase().replace(/\s+/g, '-')}`,
      name: authorName,
      avatar: authorAvatar,
    },
    publishedAt,
    views: Number.isFinite(raw.views) ? Number(raw.views) : 0,
    isBreaking: Boolean(raw.isBreaking),
    isTrending: Boolean(raw.isTrending),
    seo: raw.seo,
  };
}

function dedupeArticles(articles: Article[]) {
  const seen = new Set<string>();
  const output: Article[] = [];

  const pushUnique = (article: Article) => {
    const key = `${article.title.toLowerCase()}|${article.publishedAt}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(article);
  };

  articles.forEach(pushUnique);
  return output;
}

export async function fetchMergedLiveArticles(limit = 100): Promise<Article[]> {
  try {
    const res = await fetch(`/api/articles/latest?limit=${limit}`);
    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const rows: ApiArticle[] = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
        ? data.data
        : [];
    const live = rows
      .map((row, idx) => normalizeArticle(row, idx))
      .filter((item): item is Article => Boolean(item));

    return dedupeArticles(live);
  } catch {
    return [];
  }
}

export function categoryMatches(
  articleCategory: string | undefined | null,
  selected: string | undefined | null,
  categoryDefs: Array<{ name: string; nameEn: string; slug: string; aliases?: string[] }>
) {
  const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
  const selectedValue = normalize(selected);
  if (!selectedValue || selectedValue === 'all' || selectedValue === 'latest') return true;

  const articleValue = normalize(articleCategory);
  if (!articleValue) return false;

  const categoryValues = (category: {
    name?: string;
    nameEn?: string;
    slug?: string;
    aliases?: string[];
  }) => {
    const output = new Set<string>();
    [category?.slug, category?.name, category?.nameEn, ...(category?.aliases || [])].forEach((item) => {
      const normalized = normalize(item);
      if (normalized) output.add(normalized);
    });
    return output;
  };

  const safeCategoryDefs = Array.isArray(categoryDefs) ? categoryDefs : [];
  const matchedCategory = safeCategoryDefs.find(
    (cat) => cat && categoryValues(cat).has(selectedValue)
  );

  if (!matchedCategory) {
    return articleValue === selectedValue;
  }

  return categoryValues(matchedCategory).has(articleValue);
}
