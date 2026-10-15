'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import { WhatsAppShareLink } from '@/components/home/HomepageTopPackage';
import ReaderImage from '@/components/ui/ReaderImage';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import type { Article } from '@/lib/mock/data';
import { getNewsCategoryHref, resolveNewsCategory, type NewsCategory } from '@/lib/constants/newsCategories';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { formatUiDate } from '@/lib/utils/dateFormat';
import { READER_NAVIGATION } from '@/lib/constants/readerNavigation';

function CategoryStoryCard({ article, label, language, placement }: { article: Article; label: string; language: 'hi' | 'en'; placement: 'national' | 'homepage_category' }) {
  const epaperLabel = language === 'hi' ? 'ई-पेपर देखें' : 'Browse E-Paper';
  return (
    <article data-story-id={article.id} className="flex min-w-0 flex-col overflow-hidden rounded-editorial-lg border border-zinc-200 p-2.5 transition-colors hover:border-brand-500 focus-within:border-brand-500 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:border-brand-500 dark:focus-within:border-brand-500">
      <Link href={buildArticlePublicPath(article)} className="editorial-focus-ring group flex flex-1 flex-col rounded-editorial-md">
        <div className="relative aspect-video overflow-hidden rounded-editorial-md bg-zinc-100 dark:bg-zinc-800">
          <ReaderImage src={article.image} alt={article.title} fill sizes="(min-width: 1440px) 286px, (min-width: 1280px) 22vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="mt-3 min-w-0">
          <Badge>{label}</Badge>
          <h3 className="hindi-headline mt-2 line-clamp-3 break-words py-0.5 text-base font-semibold leading-relaxed text-zinc-900 group-hover:text-brand-600 dark:text-zinc-100 dark:group-hover:text-brand-400">{article.title}</h3>
        </div>
      </Link>
      <div className="mt-auto flex min-w-0 items-center justify-between gap-1 pt-2">
        <time dateTime={article.publishedAt} className="shrink-0 whitespace-nowrap text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{formatUiDate(article.publishedAt)}</time>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link href={READER_NAVIGATION.epaper.href} aria-label={epaperLabel} title={epaperLabel} className="editorial-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-editorial-sm text-brand-500 transition-colors hover:bg-brand-50 hover:text-brand-600 motion-reduce:transition-none dark:hover:bg-brand-950/40 dark:hover:text-brand-400 sm:h-8 sm:w-8">
            <Newspaper aria-hidden="true" className="h-[19px] w-[19px] sm:h-[18px] sm:w-[18px]" />
          </Link>
          <WhatsAppShareLink article={article} language={language} placement={placement} />
        </div>
      </div>
    </article>
  );
}

export default function CategorySection({ category, articles, language }: {
  category: NewsCategory; articles: Article[]; language: 'hi' | 'en';
}) {
  const [visibleCount, setVisibleCount] = useState(4);
  const seen = new Set<string>();
  const destinations = new Set<string>();
  const items = articles.filter((article) => {
    const destination = buildArticlePublicPath(article);
    if (!article.id || seen.has(article.id) || destinations.has(destination) || resolveNewsCategory(article.category)?.slug !== category.slug) return false;
    seen.add(article.id);
    destinations.add(destination);
    return true;
  });
  const visibleItems = items.slice(0, visibleCount);
  if (!items.length) return null;
  const label = language === 'hi' ? category.name : category.nameEn;
  return (
    <section data-testid={`home-category-${category.slug}`} className="min-w-0 rounded-editorial-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <SectionHeader title={label} href={getNewsCategoryHref(category.slug)} ctaText={language === 'hi' ? 'सभी देखें' : 'View All'} />
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleItems.map((article) => <CategoryStoryCard key={article.id} article={article} label={label} language={language} placement={category.slug === 'national' ? 'national' : 'homepage_category'} />)}
      </div>
      {visibleCount < items.length && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setVisibleCount((count) => count + 4)} className="editorial-focus-ring inline-flex h-11 items-center justify-center rounded-editorial-md border border-zinc-200 bg-zinc-50 px-5 text-sm font-semibold text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-100 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-700">
            {language === 'hi' ? 'और खबरें देखें' : 'Load More Stories'}
          </button>
        </div>
      )}
    </section>
  );
}
