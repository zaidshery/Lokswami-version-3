'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Grid3X3, List, Sparkles } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import type { Article } from '@/lib/mock/data';
import NewsCard from '@/components/ui/NewsCard';
import HeroCard from '@/components/ui/HeroCard';
import {
  fetchPublicArticlesPage,
  mapPublicArticleToUiArticle,
  type PublicArticleApiItem,
  type PublicArticlesCursor,
} from '@/lib/content/publicArticles';

const COPY = {
  en: {
    breadcrumb: 'Home',
    title: 'Latest News',
    subtitle: 'Fresh updates across all sections.',
    countLabel: 'articles',
    latest: 'Latest',
    popular: 'Popular',
    loadMore: 'Load More Stories',
    loadingMore: 'Loading...',
    empty: 'No articles found right now.',
    noMore: 'No more posts',
  },
  hi: {
    breadcrumb: '\u0939\u094b\u092e',
    title: '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902',
    subtitle: '\u0938\u092d\u0940 \u0936\u094d\u0930\u0947\u0923\u093f\u092f\u094b\u0902 \u0915\u0940 \u0928\u0908 \u0905\u092a\u0921\u0947\u091f\u094d\u0938\u0964',
    countLabel: '\u0916\u092c\u0930\u0947\u0902',
    latest: '\u0924\u093e\u091c\u093c\u093e',
    popular: '\u0932\u094b\u0915\u092a\u094d\u0930\u093f\u092f',
    loadMore: '\u0914\u0930 \u0916\u092c\u0930\u0947\u0902 \u0932\u094b\u0921 \u0915\u0930\u0947\u0902',
    loadingMore: '\u0932\u094b\u0921 \u0939\u094b \u0930\u0939\u093e \u0939\u0948...',
    empty: '\u0905\u092d\u0940 \u0915\u094b\u0908 \u0916\u092c\u0930 \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964',
    noMore: '\u0905\u092c \u0914\u0930 \u092a\u094b\u0938\u094d\u091f \u0928\u0939\u0940\u0902 \u0939\u0948\u0902',
  },
} as const;

const DEFAULT_AVATAR = '/logo-icon-final.png';

export type LatestFeedCursor = PublicArticlesCursor;
export type LatestFeedApiItem = PublicArticleApiItem;

type LatestFeedClientProps = {
  initialItems: LatestFeedApiItem[];
  initialLimit: number;
  initialHasMore: boolean;
  initialNextCursor: LatestFeedCursor | null;
};

function sortByLatest(items: LatestFeedApiItem[]) {
  return [...items].sort((a, b) => {
    const timeA = new Date(a.publishedAt || 0).getTime();
    const timeB = new Date(b.publishedAt || 0).getTime();
    if (timeA !== timeB) return timeB - timeA;
    return String(b._id || b.id || '').localeCompare(String(a._id || a.id || ''));
  });
}

function mergeUniqueById(current: LatestFeedApiItem[], incoming: LatestFeedApiItem[]) {
  const seen = new Set<string>();
  const output: LatestFeedApiItem[] = [];

  [...current, ...incoming].forEach((item) => {
    const key = (item._id || item.id || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

function toUiArticle(item: LatestFeedApiItem): Article {
  return mapPublicArticleToUiArticle(item) ?? {
    id: String(item._id || item.id || ''),
    title: item.title || '',
    summary: item.summary || '',
    content: item.content || '',
    image: item.image || '/placeholders/news-16x9.svg',
    category: item.category || 'General',
    author: {
      id: 'author-editor',
      name: 'Editor',
      avatar: DEFAULT_AVATAR,
    },
    publishedAt: item.publishedAt || new Date().toISOString(),
    views: Number.isFinite(Number(item.views)) ? Number(item.views) : 0,
    isBreaking: Boolean(item.isBreaking),
    isTrending: Boolean(item.isTrending),
  };
}

export default function LatestFeedClient({
  initialItems,
  initialLimit,
  initialHasMore,
  initialNextCursor,
}: LatestFeedClientProps) {
  const { language } = useAppStore();
  const t = COPY[language];
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const [items, setItems] = useState<LatestFeedApiItem[]>(sortByLatest(initialItems));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<LatestFeedCursor | null>(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const sortedArticles = useMemo(() => {
    const articles = items.map(toUiArticle);
    if (sortBy === 'popular') {
      return [...articles].sort((a, b) => {
        if ((b.views || 0) !== (a.views || 0)) return (b.views || 0) - (a.views || 0);
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });
    }
    return articles;
  }, [items, sortBy]);

  const heroArticle = sortedArticles[0];
  const otherArticles = sortedArticles.slice(1);

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const payload = await fetchPublicArticlesPage(
        {
          limit: initialLimit,
          cursor: nextCursor,
        },
        { fallbackToLegacyLatest: true }
      );

      if (!payload) {
        return;
      }

      const incoming = Array.isArray(payload.items) ? payload.items : [];
      setItems((current) => sortByLatest(mergeUniqueById(current, incoming)));
      setHasMore(Boolean(payload.hasMore));
      setNextCursor(
        payload.nextCursor &&
          typeof payload.nextCursor.publishedAt === 'string' &&
          typeof payload.nextCursor.id === 'string'
          ? payload.nextCursor
          : null
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span>{t.breadcrumb}</span>
        <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{t.title}</span>
      </nav>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t.title}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {sortedArticles.length} {t.countLabel} • {t.subtitle}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end sm:gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'latest' | 'popular')}
            className="reader-focus-ring min-h-11 min-w-[124px] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:min-w-[140px]"
            data-swipe-ignore="true"
          >
            <option value="latest">{t.latest}</option>
            <option value="popular">{t.popular}</option>
          </select>

          <div className="flex shrink-0 items-center rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900" data-swipe-ignore="true">
            <button
              onClick={() => setViewMode('grid')}
              className={`reader-touch-button reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-l-lg transition-colors ${viewMode === 'grid' ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
              aria-label="Grid view"
            >
              <Grid3X3 className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`reader-touch-button reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-r-lg transition-colors ${viewMode === 'list' ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
              aria-label="List view"
            >
              <List className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {heroArticle ? (
        <section>
          <HeroCard article={heroArticle} />
        </section>
      ) : null}

      {otherArticles.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {otherArticles.map((article, index) => (
              <NewsCard key={article.id} article={article} size="sm" index={index} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {otherArticles.map((article, index) => (
              <NewsCard key={article.id} article={article} variant="horizontal" index={index} />
            ))}
          </div>
        )
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-10 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          {t.empty}
        </div>
      )}

      {hasMore ? (
        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="reader-touch-button reader-focus-ring min-h-12 w-full rounded-full border border-zinc-200 bg-white px-8 py-3 text-zinc-700 shadow-sm transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-brand-500/50 dark:hover:bg-brand-950/40 dark:hover:text-brand-400 sm:w-auto"
          >
            {isLoadingMore ? t.loadingMore : t.loadMore}
          </button>
        </div>
      ) : sortedArticles.length > 0 ? (
        <p className="pt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">{t.noMore}</p>
      ) : null}
    </div>
  );
}
