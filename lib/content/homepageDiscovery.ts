import type { Article } from '@/lib/mock/data';
import type { HomePageShortItem } from '@/lib/content/homeFeed';
import { resolveNewsCategory } from '@/lib/constants/newsCategories';
import { compareHomepageRecency, selectHomepageSections } from '@/lib/content/homepageSections';
import { isSwipeFeedEligibleVideo, toPublicVideoItem } from '@/lib/content/videoPublication';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';

export const HOMEPAGE_CATEGORY_MODULES = [
  'madhya-pradesh', 'maharashtra', 'crime', 'national', 'politics', 'international',
  'rajasthan', 'uttar-pradesh', 'gujarat', 'entertainment', 'sports', 'business', 'technology',
] as const;
export const HOMEPAGE_CATEGORY_CANDIDATE_LIMIT = 13;
export type HomepageCategorySlug = typeof HOMEPAGE_CATEGORY_MODULES[number];
export type HomepageDiscovery = {
  categoryArticles: Partial<Record<HomepageCategorySlug, Article[]>>;
  videos: HomePageShortItem[];
  shorts: HomePageShortItem[];
  videoError: boolean;
};

/** Only publication-filtered public article DTOs may enter this selector. */
export function selectHomepageCategories(topArticles: Article[], categoryArticles: HomepageDiscovery['categoryArticles'] = {}) {
  const top = selectHomepageSections(topArticles);
  const used = new Set([...(top.lead ? [top.lead.id] : []), ...top.latest.map((a) => a.id), ...top.popular.map((a) => a.id)]);
  return HOMEPAGE_CATEGORY_MODULES.map((slug) => {
    const seen = new Set<string>();
    const destinations = new Set<string>();
    const ranked = [...(categoryArticles[slug] || []), ...topArticles]
      .filter((article) => article.id && resolveNewsCategory(article.category)?.slug === slug)
      .sort(compareHomepageRecency)
      .filter((article) => {
        const destination = buildArticlePublicPath(article);
        if (seen.has(article.id) || destinations.has(destination)) return false;
        seen.add(article.id);
        destinations.add(destination);
        return true;
      });
    // Keep the existing recency/unused preference; the UI reveals four at a time.
    const limit = HOMEPAGE_CATEGORY_CANDIDATE_LIMIT;
    const articles = [...ranked.filter((a) => !used.has(a.id)), ...ranked.filter((a) => used.has(a.id))].slice(0, limit);
    articles.slice(0, 4).forEach((a) => used.add(a.id));
    return { category: resolveNewsCategory(slug)!, articles };
  }).filter((section) => section.articles.length > 0);
}

/** Raw persisted video records pass the same publication/Swipe eligibility as the reader. */
export function selectHomepageMedia(rows: unknown[], kind: 'videos' | 'shorts', now = new Date()): HomePageShortItem[] {
  const items = rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const source = row as Record<string, unknown>;
    if (kind === 'shorts' ? !isSwipeFeedEligibleVideo(source, now) : Boolean(source.isShort)) return [];
    const publicItem = toPublicVideoItem(source, { requireShort: kind === 'shorts', now });
    if (!publicItem || (kind === 'shorts' && !publicItem.thumbnail)) return [];
    const duration = Number(source.duration);
    const published = source.publishedAt instanceof Date ? source.publishedAt.toISOString() : String(source.publishedAt || '');
    return [{
      id: publicItem._id, slug: publicItem.slug, title: publicItem.title,
      thumbnail: publicItem.thumbnail, duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0,
      category: publicItem.category, publishedAt: Number.isFinite(Date.parse(published)) ? published : '',
    }];
  }).sort(compareHomepageRecency);
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 3);
}
