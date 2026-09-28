import Link from 'next/link';
import ReaderImage from '@/components/ui/ReaderImage';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import type { Article } from '@/lib/mock/data';
import { getNewsCategoryHref, resolveNewsCategory, type NewsCategory } from '@/lib/constants/newsCategories';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { formatUiDate } from '@/lib/utils/dateFormat';

export default function CategorySection({ category, articles, variant = 'compact', language }: {
  category: NewsCategory; articles: Article[]; variant?: 'large' | 'compact'; language: 'hi' | 'en';
}) {
  const seen = new Set<string>();
  const items = articles.filter((article) => {
    if (!article.id || seen.has(article.id) || resolveNewsCategory(article.category)?.slug !== category.slug) return false;
    seen.add(article.id);
    return true;
  }).slice(0, variant === 'large' ? 4 : 3);
  if (!items.length) return null;
  const label = language === 'hi' ? category.name : category.nameEn;
  return (
    <section data-testid={`home-category-${category.slug}`} className="min-w-0 rounded-editorial-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <SectionHeader title={label} href={getNewsCategoryHref(category.slug)} ctaText={language === 'hi' ? 'सभी देखें' : 'View All'} />
      <div className={`grid min-w-0 grid-cols-1 gap-4 ${items.length > 1 ? variant === 'large' ? 'md:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
        {items.map((article, index) => <article key={article.id} data-story-id={article.id} className={`min-w-0 ${index === 0 && variant === 'large' ? 'md:row-span-3' : ''}`}>
          <Link href={buildArticlePublicPath(article)} className={`editorial-focus-ring group block rounded-editorial-sm ${index > 0 && variant === 'large' ? 'grid grid-cols-[88px_minmax(0,1fr)] gap-3' : ''}`}>
            <div className={`relative overflow-hidden rounded-editorial-sm bg-zinc-100 dark:bg-zinc-800 ${index > 0 && variant === 'large' ? 'aspect-square' : 'aspect-video'}`}>
              <ReaderImage src={article.image} alt={article.title} fill sizes={variant === 'large' ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 1024px) 33vw, 100vw'} className="object-cover" />
            </div>
            <div className={index > 0 && variant === 'large' ? 'min-w-0' : 'mt-3'}>
              <Badge>{label}</Badge>
              <h3 className="hindi-headline mt-2 break-words text-lg font-semibold leading-relaxed text-zinc-900 group-hover:text-brand-600 dark:text-zinc-100 dark:group-hover:text-brand-400">{article.title}</h3>
              <time dateTime={article.publishedAt} className="mt-2 block text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{formatUiDate(article.publishedAt)}</time>
            </div>
          </Link>
        </article>)}
      </div>
    </section>
  );
}
