import { unstable_cache } from 'next/cache';
import { notFound, permanentRedirect } from 'next/navigation';
import { getNewsCategoryHref, resolveNewsCategory } from '@/lib/constants/newsCategories';
import type { PublicArticleApiItem } from '@/lib/content/publicArticles';
import { listPublicArticles } from '@/lib/server/publicArticles';
import CategoryPageClient from './CategoryPageClient';

type PageContext = {
  params: Promise<{ slug: string }>;
};

const CATEGORY_FEED_LIMIT = 40;

const getCachedCategoryArticles = unstable_cache(
  async (slug: string) => {
    try {
      const result = await listPublicArticles({
        category: slug,
        limit: CATEGORY_FEED_LIMIT,
      });
      return (result.items || []) as unknown as PublicArticleApiItem[];
    } catch {
      return [] as PublicArticleApiItem[];
    }
  },
  ['reader-category-feed'],
  { revalidate: 60, tags: ['articles', 'category-feed'] }
);

export default async function CategoryPage(context: PageContext) {
  const { slug: rawSlug } = await context.params;
  let decoded: string;
  try { decoded = decodeURIComponent(rawSlug || ''); } catch { notFound(); }
  const category = resolveNewsCategory(decoded);
  if (category && decoded !== category.slug) permanentRedirect(getNewsCategoryHref(category.slug));
  const slug = category?.slug || decoded.toLowerCase();
  const initialItems = await getCachedCategoryArticles(slug);

  return <CategoryPageClient slug={slug} initialItems={initialItems} />;
}
