'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store/appStore';
import { articles as mockArticles, type Article } from '@/lib/mock/data';
import { NEWS_CATEGORY_DEFINITIONS } from '@/lib/constants/newsCategories';
import NewsCard from '@/components/ui/NewsCard';
import { Search, X, TrendingUp, Clock, Filter } from 'lucide-react';
import { categoryMatches, fetchMergedLiveArticles } from '@/lib/content/liveArticles';

const TRENDING_SEARCHES: Record<'hi' | 'en', string[]> = {
  hi: ['आईपीएल 2026', 'लोकसभा', 'मौसम अपडेट', 'सोने का भाव'],
  en: ['IPL 2026', 'Lok Sabha', 'Weather Update', 'Gold Price'],
};

export default function SearchClient() {
  const { language } = useAppStore();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [completedQuery, setCompletedQuery] = useState('');
  const [sourceArticles, setSourceArticles] = useState<Article[]>(mockArticles);
  const [searchResults, setSearchResults] = useState<Article[]>(mockArticles);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'latest' | 'popular'>('relevance');

  const categoryOptions = useMemo(
    () => [
      { slug: 'all', label: language === 'hi' ? 'सभी श्रेणियां' : 'All Categories' },
      ...NEWS_CATEGORY_DEFINITIONS.map((item) => ({
        slug: item.slug,
        label: language === 'hi' ? item.name : item.nameEn,
      })),
    ],
    [language]
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      const merged = await fetchMergedLiveArticles(120);
      if (!active) return;

      setSourceArticles(merged);

      if (initialQuery.trim()) {
        await performSearch(initialQuery, merged, selectedCategory, sortBy);
      } else {
        setSearchResults(merged);
      }
    };

    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const performLocalSearch = (
    searchQuery: string,
    dataSet: Article[] = sourceArticles,
    categoryValue: string = selectedCategory,
    sortValue: 'relevance' | 'latest' | 'popular' = sortBy
  ) => {
    const lowerQuery = searchQuery.toLowerCase().trim();

    const filtered = dataSet.filter((article) => {
      const matchesQuery =
        !lowerQuery ||
        article.title.toLowerCase().includes(lowerQuery) ||
        article.summary.toLowerCase().includes(lowerQuery) ||
        article.category.toLowerCase().includes(lowerQuery);

      const matchesCategory =
        categoryValue === 'all' ||
        categoryMatches(article.category, categoryValue, NEWS_CATEGORY_DEFINITIONS);

      return matchesQuery && matchesCategory;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortValue === 'latest') {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      if (sortValue === 'popular') {
        return (b.views || 0) - (a.views || 0);
      }
      return 0;
    });

    setSearchResults(sorted);
  };

  const performSearch = async (
    searchQuery: string,
    dataSet: Article[] = sourceArticles,
    categoryValue: string = selectedCategory,
    sortValue: 'relevance' | 'latest' | 'popular' = sortBy
  ) => {
    const cleanQuery = searchQuery.trim();

    if (!cleanQuery) {
      setSearchResults(dataSet);
      setCompletedQuery('');
      return;
    }

    performLocalSearch(cleanQuery, dataSet, categoryValue, sortValue);
    setCompletedQuery(cleanQuery);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void performSearch(query, sourceArticles, selectedCategory, sortBy);

    const url = new URL(window.location.href);
    url.searchParams.set('q', query);
    window.history.pushState({}, '', url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          <span className="h-8 w-1 rounded-full bg-brand-500" />
          {language === 'hi' ? 'खोज' : 'Search'}
        </h1>
      </div>

      <form onSubmit={handleSearch} className="relative" data-swipe-ignore="true">
        <div className="flex items-center overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-colors focus-within:border-brand-500 dark:border-zinc-800 dark:bg-zinc-900">
          <Search className="ml-4 h-5 w-5 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={language === 'hi' ? 'समाचार खोजें...' : 'Search news...'}
            aria-label={language === 'hi' ? 'समाचार खोजें' : 'Search news'}
            className="min-h-12 flex-1 bg-transparent px-4 py-3.5 text-zinc-900 placeholder:text-zinc-500 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-400"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="reader-touch-button reader-focus-ring inline-flex h-12 w-12 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              aria-label={language === 'hi' ? 'खोज साफ़ करें' : 'Clear search query'}
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="submit"
            className="reader-touch-button reader-focus-ring min-h-12 bg-brand-500 px-5 font-semibold text-white transition-colors hover:bg-brand-600 sm:px-6"
          >
            {language === 'hi' ? 'खोजें' : 'Search'}
          </button>
        </div>
      </form>

      {query ? (
        <div className="flex flex-wrap items-center gap-3" data-swipe-ignore="true">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <select
              value={selectedCategory}
              aria-label={language === 'hi' ? 'श्रेणी चुनें' : 'Choose category'}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedCategory(next);
                void performSearch(query, sourceArticles, next, sortBy);
              }}
              className="reader-focus-ring min-h-11 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {categoryOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              aria-label={language === 'hi' ? 'क्रमबद्ध करें' : 'Sort articles'}
              onChange={(e) => {
                const next = (e.target.value as 'relevance' | 'latest' | 'popular') || 'relevance';
                setSortBy(next);
                void performSearch(query, sourceArticles, selectedCategory, next);
              }}
              className="reader-focus-ring min-h-11 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="relevance">{language === 'hi' ? 'प्रासंगिकता' : 'Relevance'}</option>
              <option value="latest">{language === 'hi' ? 'ताज़ा' : 'Latest'}</option>
              <option value="popular">{language === 'hi' ? 'लोकप्रिय' : 'Popular'}</option>
            </select>
          </div>
        </div>
      ) : null}

      {query ? (
        <div>
          {completedQuery ? (
            <div className="mb-4 space-y-3" role="status" aria-live="polite" aria-atomic="true">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {searchResults.length === 0
                  ? (language === 'hi' ? `"${completedQuery}" के लिए कोई परिणाम नहीं मिला` : `No results found for "${completedQuery}"`)
                  : (language === 'hi'
                      ? `"${completedQuery}" के लिए ${searchResults.length} परिणाम मिले`
                      : `${searchResults.length} results found for "${completedQuery}"`)}
              </p>
            </div>
          ) : null}

          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {searchResults.map((article, index) => (
                <NewsCard key={article.id} article={article} index={index} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
              <Search className="mx-auto mb-4 h-16 w-16 text-zinc-400 dark:text-zinc-600" />
              <h3 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {language === 'hi' ? 'कोई परिणाम नहीं मिला' : 'No results found'}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                {language === 'hi'
                  ? 'कृपया अलग कीवर्ड के साथ पुनः प्रयास करें।'
                  : 'Please try searching with different keywords.'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              <TrendingUp className="h-5 w-5 text-brand-500" />
              {language === 'hi' ? 'ट्रेंडिंग खोजें' : 'Trending Searches'}
            </h2>
            <div className="flex flex-wrap gap-2">
              {TRENDING_SEARCHES[language].map((term) => (
                <button
                  key={term}
                  onClick={() => {
                    setQuery(term);
                    void performSearch(term, sourceArticles, selectedCategory, sortBy);
                  }}
                  className="reader-touch-button reader-focus-ring min-h-11 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-brand-500/50 dark:hover:bg-brand-950/40 dark:hover:text-brand-400"
                >
                  {term}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              <Clock className="h-5 w-5 text-brand-500" />
              {language === 'hi' ? 'हाल की खोजें' : 'Recent Searches'}
            </h2>
            <div className="space-y-2">
              {TRENDING_SEARCHES[language].slice(0, 3).map((term) => (
                <button
                  key={term}
                  onClick={() => {
                    setQuery(term);
                    void performSearch(term, sourceArticles, selectedCategory, sortBy);
                  }}
                  className="reader-touch-button reader-focus-ring flex min-h-12 w-full items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80"
                >
                  <span className="text-zinc-800 dark:text-zinc-200">{term}</span>
                  <Clock className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
