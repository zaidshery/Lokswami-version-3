'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookmarkX, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import { buildArticleImageVariantUrl } from '@/lib/utils/articleMedia';
import { formatUiDate } from '@/lib/utils/dateFormat';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';

type SavedArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  publishedAt: string;
  isBreaking: boolean;
  isTrending: boolean;
};

type SavedArticlesPayload = {
  success?: boolean;
  data?: {
    savedArticleIds?: string[];
    savedArticles?: SavedArticle[];
    count?: number;
  };
  error?: string;
};

function formatPublishedAt(value: string, language: 'hi' | 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return language === 'hi'
      ? '\u0924\u093e\u0930\u0940\u0916 \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902'
      : 'Date unavailable';
  }

  return formatUiDate(value, language === 'hi' ? '\u0924\u093e\u0930\u0940\u0916 \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902' : 'Date unavailable');
}

/** Renders the authenticated reader saved-articles page backed by /api/user/save. */
export default function SavedArticlesPage() {
  const { language } = useAppStore();
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeArticleId, setActiveArticleId] = useState('');
  const [error, setError] = useState('');

  const copy = useMemo(
    () =>
      language === 'hi'
        ? {
            title: '\u0938\u0947\u0935 \u0915\u0940 \u0917\u0908 \u0916\u092c\u0930\u0947\u0902',
            subtitle: '\u0906\u092a\u0915\u0940 \u092c\u0941\u0915\u092e\u093e\u0930\u094d\u0915 \u0938\u094d\u091f\u094b\u0930\u0940\u091c \u092f\u0939\u093e\u0901 \u0926\u093f\u0916\u0947\u0917\u0940\u0964',
            loading: '\u0938\u0947\u0935 \u0915\u0940 \u0917\u0908 \u0916\u092c\u0930\u0947\u0902 \u0932\u094b\u0921 \u0939\u094b \u0930\u0939\u0940 \u0939\u0948\u0902...',
            retry: '\u0926\u094b\u092c\u093e\u0930\u093e \u0915\u094b\u0936\u093f\u0936 \u0915\u0930\u0947\u0902',
            emptyTitle: '\u0905\u092d\u0940 \u0915\u094b\u0908 \u0938\u0947\u0935 \u0916\u092c\u0930 \u0928\u0939\u0940\u0902',
            emptyDescription: '\u0915\u093f\u0938\u0940 \u0916\u092c\u0930 \u092a\u0930 \u092c\u0941\u0915\u092e\u093e\u0930\u094d\u0915 \u0915\u0930\u0947\u0902 \u0914\u0930 \u0935\u0939 \u092f\u0939\u093e\u0901 \u0926\u093f\u0916\u0947\u0917\u0940\u0964',
            explore: '\u0916\u092c\u0930\u0947\u0902 \u0926\u0947\u0916\u0947\u0902',
            remove: '\u0939\u091f\u093e\u090f\u0902',
            countLabel: '\u0915\u0941\u0932 \u0938\u0947\u0935 \u0916\u092c\u0930\u0947\u0902',
          }
        : {
            title: 'Saved Articles',
            subtitle: 'Your bookmarked stories appear here.',
            loading: 'Loading saved articles...',
            retry: 'Try again',
            emptyTitle: 'No saved stories yet',
            emptyDescription: 'Bookmark any story and it will appear here.',
            explore: 'Explore News',
            remove: 'Remove',
            countLabel: 'Total saved',
          },
    [language]
  );

  const loadSavedArticles = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/user/save', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as SavedArticlesPayload;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to load saved articles');
      }

      const rows = Array.isArray(payload.data.savedArticles)
        ? payload.data.savedArticles
        : [];

      setSavedArticles(rows);

      if (typeof window !== 'undefined' && Array.isArray(payload.data.savedArticleIds)) {
        window.dispatchEvent(
          new CustomEvent('lokswami:saved-article-updated', {
            detail: {
              savedArticleIds: payload.data.savedArticleIds,
            },
          })
        );
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load saved articles'
      );
      setSavedArticles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedArticles();
  }, [loadSavedArticles]);

  const handleToggleSave = async (articleId: string) => {
    if (!articleId || activeArticleId === articleId) {
      return;
    }

    setActiveArticleId(articleId);
    setError('');

    try {
      const response = await fetch('/api/user/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ articleId }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: {
          saved?: boolean;
          savedArticleIds?: string[];
        };
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to update saved article');
      }

      const isSaved = Boolean(payload.data.saved);

      if (!isSaved) {
        setSavedArticles((current) => current.filter((item) => item.id !== articleId));
      } else {
        await loadSavedArticles();
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('lokswami:saved-article-updated', {
            detail: {
              articleId,
              saved: isSaved,
              savedArticleIds: Array.isArray(payload.data.savedArticleIds)
                ? payload.data.savedArticleIds
                : undefined,
            },
          })
        );
      }
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Failed to update saved article'
      );
    } finally {
      setActiveArticleId('');
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl py-4 sm:py-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {copy.subtitle}
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
          {copy.countLabel}: {savedArticles.length}
        </p>

        {isLoading ? (
          <div className="mt-8 inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.loading}
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadSavedArticles()}
              className="mt-3 inline-flex rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {copy.retry}
            </button>
          </div>
        ) : null}

        {!isLoading && !error && !savedArticles.length ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {copy.emptyTitle}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {copy.emptyDescription}
            </p>
            <Link
              href="/main"
              className="mt-5 inline-flex rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {copy.explore}
            </Link>
          </div>
        ) : null}

        {!isLoading && !error && savedArticles.length ? (
          <div className="mt-6 space-y-3">
            {savedArticles.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4"
              >
                <div className="flex items-start gap-3">
                  <Link
                    href={buildArticlePublicPath({ id: item.id, slug: item.slug })}
                    className="flex min-w-0 flex-1 items-start gap-3"
                  >
                    <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-32">
                      <Image
                        src={buildArticleImageVariantUrl(item.image, 'thumb')}
                        alt={item.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 639px) 96px, 128px"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                        {item.category || (language === 'hi' ? '\u0938\u093e\u092e\u093e\u0928\u094d\u092f' : 'General')}
                      </p>
                      <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:text-base">
                        {item.title}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
                        {item.summary}
                      </p>
                      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 sm:text-xs">
                        {formatPublishedAt(item.publishedAt, language)}
                      </p>
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={() => void handleToggleSave(item.id)}
                    disabled={activeArticleId === item.id}
                    className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition ${
                      activeArticleId === item.id
                        ? 'cursor-not-allowed border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                        : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30'
                    }`}
                  >
                    {activeArticleId === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BookmarkX className="h-3.5 w-3.5" />
                    )}
                    {copy.remove}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
