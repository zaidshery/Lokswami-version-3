import type { Article } from '@/lib/mock/data';
import type { HomePageShortItem } from '@/lib/content/homeFeed';
import { NEWS_CATEGORIES, resolveNewsCategory } from '@/lib/constants/newsCategories';
import { compareHomepageRecency, selectHomepageSections } from '@/lib/content/homepageSections';
import { isSwipeFeedEligibleVideo, toPublicVideoItem } from '@/lib/content/videoPublication';

export const HOMEPAGE_CATEGORY_MODULES = [
  'regional', 'national', 'politics', 'business', 'technology', 'sports', 'entertainment', 'international',
] as const;
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
    const ranked = [...(categoryArticles[slug] || []), ...topArticles]
      .filter((article) => article.id && resolveNewsCategory(article.category)?.slug === slug)
      .sort(compareHomepageRecency)
      .filter((article) => {
        if (seen.has(article.id)) return false;
        seen.add(article.id);
        return true;
      });
    const limit = slug === 'regional' ? 4 : 3;
    const articles = [...ranked.filter((a) => !used.has(a.id)), ...ranked.filter((a) => used.has(a.id))].slice(0, limit);
    articles.forEach((a) => used.add(a.id));
    return { category: NEWS_CATEGORIES.find((c) => c.slug === slug)!, variant: slug === 'regional' ? 'large' as const : 'compact' as const, articles };
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
