'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Article } from '@/lib/mock/data';
import ReaderImage from '@/components/ui/ReaderImage';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { buildArticleImageVariantUrl } from '@/lib/utils/articleMedia';
import { resolveNewsCategory } from '@/lib/constants/newsCategories';
import { formatReaderDateTime } from '@/lib/utils/dateFormat';

export default function ArticleRelatedStories({ articles, language }: { articles: Article[]; language: 'hi' | 'en' }) {
  const [count, setCount] = useState(4);
  if (!articles.length) return null;
  return (
    <section data-related-articles aria-labelledby="article-related-heading" className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 id="article-related-heading" className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{language === 'hi' ? 'संबंधित खबरें' : 'Related News'}</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{language === 'hi' ? 'आगे पढ़ने के लिए और खबरें' : 'More stories to continue reading'}</p>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {articles.slice(0, count).map(item => {
          const category = resolveNewsCategory(item.category);
          const validDate = Number.isFinite(new Date(item.publishedAt).getTime());
          return (
            <Link key={item.id} href={buildArticlePublicPath({ id: item.id, slug: item.slug })} data-related-story
              className="reader-focus-ring group flex min-w-0 gap-3 rounded-xl border border-zinc-200 bg-white p-3 hover:border-red-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-red-700 sm:gap-4 sm:p-4">
              <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-950 sm:h-24 sm:w-28">
                <ReaderImage src={buildArticleImageVariantUrl(item.image, 'thumb')} alt="" fill sizes="(max-width: 639px) 96px, 112px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-red-700 dark:text-red-400">{category ? language === 'hi' ? category.name : category.nameEn : item.category}</span>
                <h3 className="mt-1 line-clamp-3 break-words text-base font-bold leading-snug text-zinc-900 group-hover:text-red-700 dark:text-zinc-100 dark:group-hover:text-red-400">{item.title}</h3>
                {validDate ? <time dateTime={new Date(item.publishedAt).toISOString()} className="mt-2 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{formatReaderDateTime(item.publishedAt, language)}</time> : null}
              </div>
            </Link>
          );
        })}
      </div>
      {count < articles.length ? <div className="mt-6 flex justify-center">
        <button type="button" onClick={() => setCount(current => Math.min(current + 4, articles.length))} className="reader-focus-ring min-h-11 w-full rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-bold text-zinc-900 hover:border-red-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:w-auto">
          {language === 'hi' ? 'और खबरें लोड करें' : 'Load More Stories'}
        </button>
      </div> : null}
    </section>
  );
}
