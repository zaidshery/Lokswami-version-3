'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Grid3X3, List } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import { articles as mockArticles, type Article } from '@/lib/mock/data';
import NewsCard from '@/components/ui/NewsCard';
import HeroCard from '@/components/ui/HeroCard';
import { categoryMatches, fetchMergedLiveArticles } from '@/lib/content/liveArticles';
import {
  fetchPublicArticlesPage,
  mapPublicArticlesToUiArticles,
  type PublicArticleApiItem,
} from '@/lib/content/publicArticles';
import {
  NEWS_CATEGORY_DEFINITIONS,
  resolveNewsCategory,
} from '@/lib/constants/newsCategories';

const CATEGORY_INITIAL_VISIBLE_COUNT = 10;
const CATEGORY_LOAD_MORE_STEP = 9;
const CATEGORY_FEED_LIMIT = 120;

type CategoryMeta = {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  aliases: string[];
};

type CategoryPageClientProps = {
  slug: string;
  initialItems: PublicArticleApiItem[];
};

function slugToTitle(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function matchesSelectedCategory(article: Article, slug: string, category: CategoryMeta) {
  return (
    categoryMatches(article.category, slug, NEWS_CATEGORY_DEFINITIONS) ||
    categoryMatches(article.category, category.name, NEWS_CATEGORY_DEFINITIONS) ||
    categoryMatches(article.category, category.nameEn, NEWS_CATEGORY_DEFINITIONS)
  );
}

export default function CategoryPageClient({
  slug,
  initialItems,
}: CategoryPageClientProps) {
  const { language } = useAppStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const initialArticles = useMemo(() => {
    const mapped = mapPublicArticlesToUiArticles(initialItems);
    return mapped.length ? mapped : mockArticles;
  }, [initialItems]);
  const [articlesData, setArticlesData] = useState<Article[]>(initialArticles);
  const [visibleCount, setVisibleCount] = useState(CATEGORY_INITIAL_VISIBLE_COUNT);

  const category = useMemo(() => {
    const matched = resolveNewsCategory(slug);
    if (matched) {
      return matched as CategoryMeta;
    }

    return {
      id: slug,
      slug,
      name: slugToTitle(slug),
      nameEn: slugToTitle(slug),
      icon: '\ud83d\udcf0',
      color: '#EF4444',
      aliases: [slug],
    };
  }, [slug]);

  useEffect(() => {
    setArticlesData(initialArticles);
  }, [initialArticles]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 639px)').matches) {
      setViewMode('list');
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const v1Feed = await fetchPublicArticlesPage({
        limit: CATEGORY_FEED_LIMIT,
        category: slug,
      });

      if (active && v1Feed?.items.length) {
        setArticlesData(mapPublicArticlesToUiArticles(v1Feed.items));
        return;
      }

      const merged = await fetchMergedLiveArticles(CATEGORY_FEED_LIMIT);
      if (active) setArticlesData(merged);
    };

    if (!initialItems.length) {
      load();
    }

    return () => {
      active = false;
    };
  }, [slug, initialItems.length]);

  const categoryArticles = useMemo(() => {
    return articlesData.filter((article) =>
      matchesSelectedCategory(article, slug, category)
    );
  }, [articlesData, slug, category]);

  const sortedArticles = useMemo(() => {
    const next = [...categoryArticles];
    next.sort((a, b) => {
      if (sortBy === 'popular') return (b.views || 0) - (a.views || 0);
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    return next;
  }, [categoryArticles, sortBy]);

  const heroArticle = sortedArticles[0];
  const visibleArticles = sortedArticles.slice(0, visibleCount);
  const otherArticles = visibleArticles.slice(1);
  const hasMoreStories = visibleCount < sortedArticles.length;

  useEffect(() => {
    setVisibleCount(CATEGORY_INITIAL_VISIBLE_COUNT);
  }, [slug, sortBy, articlesData.length]);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span>{language === 'hi' ? '\u0939\u094b\u092e' : 'Home'}</span>
        <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {language === 'hi' ? category.name : category.nameEn}
        </span>
      </nav>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <span className="text-3xl sm:text-4xl">{category.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {language === 'hi' ? category.name : category.nameEn}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {categoryArticles.length}{' '}
              {language === 'hi' ? '\u0916\u092c\u0930\u0947\u0902' : 'articles'}
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
            <option value="latest">
              {language === 'hi' ? '\u0924\u093e\u091c\u093c\u093e' : 'Latest'}
            </option>
            <option value="popular">
              {language === 'hi'
                ? '\u0932\u094b\u0915\u092a\u094d\u0930\u093f\u092f'
                : 'Popular'}
            </option>
          </select>

          <div className="flex shrink-0 items-center rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900" data-swipe-ignore="true">
            <button
              onClick={() => setViewMode('grid')}
              className={`reader-touch-button reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-l-lg transition-colors ${
                viewMode === 'grid'
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
              aria-label="Grid view"
            >
              <Grid3X3 className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`reader-touch-button reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-r-lg transition-colors ${
                viewMode === 'list'
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
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

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {otherArticles.map((article, index) => (
            <NewsCard key={article.id} article={article} size="sm" index={index} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {otherArticles.map((article, index) => (
            <NewsCard
              key={article.id}
              article={article}
              variant="horizontal"
              index={index}
            />
          ))}
        </div>
      )}

      {hasMoreStories ? (
        <div className="pt-8 text-center">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + CATEGORY_LOAD_MORE_STEP, sortedArticles.length)
              )
            }
            className="reader-touch-button reader-focus-ring min-h-12 w-full rounded-full border border-zinc-200 bg-white px-8 py-3 text-zinc-700 shadow-sm transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-brand-500/50 dark:hover:bg-brand-950/40 dark:hover:text-brand-400 sm:w-auto"
          >
            {language === 'hi'
              ? '\u0914\u0930 \u0916\u092c\u0930\u0947\u0902 \u0932\u094b\u0921 \u0915\u0930\u0947\u0902'
              : 'Load More Stories'}
          </button>
        </div>
      ) : null}

      {otherArticles.length === 0 && !heroArticle ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-10 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <p>
            {language === 'hi'
              ? '\u0907\u0938 \u0936\u094d\u0930\u0947\u0923\u0940 \u092e\u0947\u0902 \u0915\u094b\u0908 \u0916\u092c\u0930 \u0928\u0939\u0940\u0902 \u092e\u093f\u0932\u0940'
              : 'No articles found in this category'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
