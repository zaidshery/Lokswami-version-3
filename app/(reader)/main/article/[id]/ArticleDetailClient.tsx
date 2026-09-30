'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bookmark,
  Loader2,
  Newspaper,
  Sparkles,
  X,
} from 'lucide-react';
import ArticleAudioPlayer from '@/components/article/ArticleAudioPlayer';
import ArticleRelatedStories from '@/components/article/ArticleRelatedStories';
import ShareMenu from '@/components/ui/ShareMenu';
import ArticleReaderHeader from '@/components/article/ArticleReaderHeader';
import ArticleReadingProgress from '@/components/article/ArticleReadingProgress';
import styles from '@/components/article/ArticleReader.module.css';
import { getNewsCategoryHref, resolveNewsCategory } from '@/lib/constants/newsCategories';
import type { Article } from '@/lib/mock/data';
import { useAppStore } from '@/lib/store/appStore';
import {
  buildArticleSharePath,
  buildArticleWhatsAppShareText,
} from '@/lib/utils/articleShare';
import {
  buildArticleImageVariantUrl,
} from '@/lib/utils/articleMedia';
import { renderArticleRichContent } from '@/lib/utils/articleRichContent';
const MONGO_OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
function toPlainText(html: string) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ReaderArticle = Omit<Article, 'seo'> & {
  updatedAt?: string;
  seo?: {
    featuredImageAlt?: string;
    featuredImageCaption?: string;
    featuredImageCredit?: string;
  };
};

function inferArticleContentLanguage(article: ReaderArticle | null): 'hi' | 'en' {
  if (!article) {
    return 'hi';
  }

  const sample = [article.title, article.summary, article.content || '']
    .filter(Boolean)
    .join(' ');

  return DEVANAGARI_REGEX.test(sample) ? 'hi' : 'en';
}

type ArticleDetailClientProps = {
  article: ReaderArticle | null;
  relatedArticles: ReaderArticle[];
};

export default function ArticleDetailClient({
  article,
  relatedArticles,
}: ArticleDetailClientProps) {
  const router = useRouter();
  const language = useAppStore((state) => state.language);
  const currentUser = useAppStore((state) => state.currentUser);
  const savedArticleIds = currentUser?.savedArticles ?? null;
  const articleRegionRef = useRef<HTMLElement | null>(null);
  const [aiBullets, setAiBullets] = useState<string[]>([]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState('');
  const [isAuthorImageModalOpen, setIsAuthorImageModalOpen] = useState(false);
  const authorCloseRef = useRef<HTMLButtonElement>(null);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const hasTrackedReadRef = useRef(false);
  const readingProgressRef = useRef(0);
  const isSignedIn = Boolean(currentUser);
  const canSaveArticle = Boolean(article && MONGO_OBJECT_ID_REGEX.test(article.id));
  const articleContentLanguage = useMemo(() => inferArticleContentLanguage(article), [article]);
  const isBookmarked = Boolean(
    article && Array.isArray(savedArticleIds) && savedArticleIds.includes(article.id)
  );
  const articleCategory = article ? resolveNewsCategory(article.category) : undefined;

  const articlePlainText = useMemo(() => {
    if (!article) return '';
    const parts = [
      article.title,
      article.summary,
      article.content ? toPlainText(article.content) : '',
    ].filter(Boolean);
    return parts.join('। ');
  }, [article]);

  useEffect(() => {
    if (!isAuthorImageModalOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    authorCloseRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAuthorImageModalOpen(false);
      }
      // The image dialog has one control. Keep keyboard focus inside it.
      if (e.key === 'Tab') {
        e.preventDefault();
        authorCloseRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isAuthorImageModalOpen]);


  const trackArticleRead = useCallback(
    async (completionPercent: number) => {
      if (!article || !MONGO_OBJECT_ID_REGEX.test(article.id) || hasTrackedReadRef.current) {
        return;
      }

      hasTrackedReadRef.current = true;

      try {
        await fetch('/api/user/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            articleId: article.id,
            completionPercent: Math.min(100, Math.max(0, Math.round(completionPercent))),
          }),
        });
      } catch (error) {
        console.error('Failed to track article read:', error);
        hasTrackedReadRef.current = false;
      }
    },
    [article]
  );

  useEffect(() => {
    hasTrackedReadRef.current = false;
    readingProgressRef.current = 0;
    summaryAbortControllerRef.current?.abort();
    summaryAbortControllerRef.current = null;
    setAiBullets([]);
    setAiSummaryError('');
    setIsGeneratingSummary(false);
    setIsAuthorImageModalOpen(false);
  }, [article?.id]);

  useEffect(() => {
    if (!article || !MONGO_OBJECT_ID_REGEX.test(article.id)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void trackArticleRead(Math.max(60, readingProgressRef.current));
    }, 60_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [article, trackArticleRead]);

  const handleReadingProgress = useCallback((percent: number) => {
    readingProgressRef.current = percent;
    if (percent >= 80) void trackArticleRead(percent);
  }, [trackArticleRead]);

  const contentHtml = useMemo(() => {
    if (!article) return '';
    const raw = article.content && article.content.trim() ? article.content : article.summary;
    const parsed = renderArticleRichContent(raw);
    return parsed || renderArticleRichContent(article.summary);
  }, [article]);

  const articleMeta = useMemo(() => {
    if (!article) {
      return { readMinutes: 1 };
    }

    const plain = toPlainText(article.content || article.summary || '');
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    const readMinutes = Math.max(1, Math.round(words / 220));

    return { readMinutes };
  }, [article]);

  const handleGenerateSummary = async () => {
    if (!article) return;
    summaryAbortControllerRef.current?.abort();
    const controller = new AbortController();
    summaryAbortControllerRef.current = controller;
    setAiSummaryError('');
    setIsGeneratingSummary(true);

    try {
      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          articleId: article.id,
          language: articleContentLanguage,
        }),
      });

      if (controller.signal.aborted) return;

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: {
          bullets?: string[];
        };
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to generate summary');
      }

      const bullets = Array.isArray(payload.data.bullets)
        ? payload.data.bullets.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

      if (!bullets.length) {
        throw new Error('Summary was empty');
      }

      if (controller.signal.aborted) return;
      setAiBullets(bullets.slice(0, 3));
    } catch {
      if (controller.signal.aborted) return;
      setAiSummaryError('unavailable');
    } finally {
      if (summaryAbortControllerRef.current === controller) {
        summaryAbortControllerRef.current = null;
        setIsGeneratingSummary(false);
      }
    }
  };

  useEffect(() => () => {
    summaryAbortControllerRef.current?.abort();
    summaryAbortControllerRef.current = null;
  }, []);

  const handleBookmarkToggle = async () => {
    if (!article) return;

    if (!isSignedIn) {
      router.push('/signin?redirect=/main/saved');
      return;
    }

    if (!canSaveArticle || isSavingBookmark) return;

    setIsSavingBookmark(true);

    try {
      const response = await fetch('/api/user/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ articleId: article.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: {
          saved?: boolean;
          savedArticleIds?: string[];
        };
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error('Failed to toggle bookmark');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('lokswami:saved-article-updated', {
            detail: {
              articleId: article.id,
              saved: Boolean(payload.data.saved),
              savedArticleIds: Array.isArray(payload.data.savedArticleIds)
                ? payload.data.savedArticleIds
                : undefined,
            },
          })
        );
      }
    } catch (error) {
      console.error('Failed to toggle article bookmark:', error);
    } finally {
      setIsSavingBookmark(false);
    }
  };

  if (!article) {
    return (
      <div className="mx-auto max-w-4xl py-10">
        <div className="cnp-surface p-6 sm:p-8">
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {language === 'hi' ? 'लेख नहीं मिला' : 'Article not found'}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {language === 'hi'
              ? 'यह लेख उपलब्ध नहीं है या हटाया जा चुका है।'
              : 'This article is unavailable or may have been removed.'}
          </p>
          <Link
            href="/main"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-orange-300 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-orange-700 dark:hover:text-orange-400"
          >
            <ArrowLeft className="h-4 w-4" />
            {language === 'hi' ? 'होम पर वापस जाएं' : 'Back to Home'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.reader} pb-[calc(var(--reader-bottom-nav-space)+5rem)] sm:pb-12`}>
      <ArticleReadingProgress regionRef={articleRegionRef} articleId={article.id} onProgress={handleReadingProgress} />
      <nav aria-label={language === 'hi' ? 'लेख का रास्ता' : 'Breadcrumb'} className="mb-4 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/main" className="reader-focus-ring inline-flex min-h-11 items-center gap-2 hover:text-red-700 dark:hover:text-red-400">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {language === 'hi' ? 'होम' : 'Home'}
        </Link>
        <span aria-hidden="true">/</span>
        {articleCategory ? <Link href={getNewsCategoryHref(articleCategory.slug)} className="reader-focus-ring inline-flex min-h-11 items-center hover:text-red-700 dark:hover:text-red-400">{language === 'hi' ? articleCategory.name : articleCategory.nameEn}</Link> : <span>{article.category}</span>}
      </nav>

      <article ref={articleRegionRef} className="cnp-surface overflow-hidden p-0">
        <ArticleReaderHeader article={article} language={language} readMinutes={articleMeta.readMinutes} onAuthorClick={() => setIsAuthorImageModalOpen(true)}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleBookmarkToggle()}
                disabled={!canSaveArticle || isSavingBookmark}
                className={`reader-touch-button reader-focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-sm font-semibold leading-none transition sm:min-h-11 sm:px-3.5 sm:text-sm sm:font-bold sm:leading-normal ${
                  isBookmarked
                    ? 'border-orange-400 bg-orange-600 text-white hover:bg-orange-700 dark:border-orange-500 dark:bg-orange-500 dark:hover:bg-orange-400'
                    : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-500/45 dark:bg-orange-500/12 dark:text-orange-300 dark:hover:bg-orange-500/20'
                } ${!canSaveArticle || isSavingBookmark ? 'cursor-not-allowed opacity-60' : ''}`}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? (language === 'hi' ? 'सहेजा गया लेख हटाएं' : 'Remove bookmark') : (language === 'hi' ? 'लेख सहेजें' : 'Save article')}
              >
                {isSavingBookmark ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                ) : (
                  <Bookmark
                    className={`h-3.5 w-3.5 max-[420px]:hidden sm:h-4 sm:w-4 ${
                      isBookmarked ? 'fill-current' : ''
                    }`}
                  />
                )}
                {isBookmarked ? (language === 'hi' ? 'सहेजा गया' : 'Saved') : (language === 'hi' ? 'सहेजें' : 'Save')}
              </button>

              <ShareMenu
                title={article.title}
                url={buildArticleSharePath({ id: article.id, slug: article.slug })}
                text={article.summary}
                whatsappText={buildArticleWhatsAppShareText({
                  title: article.title,
                  articleUrl: '',
                  summary: article.summary,
                  category: article.category,
                  includeUrl: false,
                })}
                contentType="article"
                contentId={article.id}
                placement="article_detail_header"
                language={language}
                triggerLabel={language === 'hi' ? '\u0936\u0947\u092f\u0930' : 'Share'}
                ariaLabel={language === 'hi' ? '\u0932\u0947\u0916 \u0936\u0947\u092f\u0930 \u0915\u0930\u0947\u0902' : 'Share article'}
                className="shrink-0"
                buttonClassName="reader-touch-button reader-focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full border border-zinc-300 bg-white px-3 text-sm font-semibold leading-none text-zinc-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-orange-500/50 dark:hover:bg-orange-500/15 dark:hover:text-orange-300 sm:min-h-11 sm:px-3.5 sm:text-sm sm:font-bold sm:leading-normal"
              />

              <Link
                href="/main/epaper"
                className="reader-touch-link reader-focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-3 text-sm font-semibold leading-none text-orange-700 transition hover:bg-orange-100 dark:border-orange-500/45 dark:bg-orange-500/12 dark:text-orange-300 dark:hover:bg-orange-500/20 sm:min-h-11 sm:px-3.5 sm:text-sm sm:font-bold sm:leading-normal"
                aria-label={language === 'hi' ? '\u0908-\u092a\u0947\u092a\u0930' : 'E-Paper'}
              >
                <Newspaper className="h-3.5 w-3.5 max-[420px]:hidden sm:h-4 sm:w-4" />
                {language === 'hi' ? '\u0908-\u092a\u0947\u092a\u0930' : 'E-Paper'}
              </Link>

            </div>
        </ArticleReaderHeader>
        <figure>
          <div className="relative aspect-[16/10] max-h-[480px] w-full overflow-hidden bg-zinc-950 sm:aspect-[16/9] lg:aspect-[2/1]">
            <Image src={buildArticleImageVariantUrl(article.image, 'detail')} alt={article.seo?.featuredImageAlt || article.title}
              fill className="object-contain" sizes="(max-width: 639px) calc(100vw - 24px), (max-width: 1023px) calc(100vw - 40px), (max-width: 1071px) calc(100vw - 48px), 1024px" priority />
          </div>
          {article.seo?.featuredImageCaption || article.seo?.featuredImageCredit ? (
            <figcaption className="border-b border-zinc-200 px-4 py-3 text-xs leading-relaxed text-zinc-600 dark:border-white/10 dark:text-zinc-400 sm:px-6">
              {article.seo.featuredImageCaption ? <span>{article.seo.featuredImageCaption}</span> : null}
              {article.seo.featuredImageCredit ? <span className="ml-2 font-medium">{article.seo.featuredImageCredit}</span> : null}
            </figcaption>
          ) : null}
        </figure>
        <div className={`${styles.readingColumn} space-y-6 px-4 py-6 sm:px-6 sm:py-8`}>

          <ArticleAudioPlayer key={article.id} articleId={article.id} text={articlePlainText} contentLanguage={articleContentLanguage} language={language} secondaryAction={
            <button type="button" onClick={() => void handleGenerateSummary()} disabled={isGeneratingSummary}
              aria-busy={isGeneratingSummary}
              className="reader-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40">
              {isGeneratingSummary ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
              {language === 'hi' ? 'सारांश' : 'Summary'}
            </button>
          }>
          <section aria-label={language === 'hi' ? 'लोकस्वामी AI उपकरण' : 'Lokswami AI tools'} aria-busy={isGeneratingSummary}
            className={isGeneratingSummary || aiSummaryError || aiBullets.length ? 'mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800' : 'sr-only'}>
            <p role="status" aria-live="polite" className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {isGeneratingSummary ? (language === 'hi' ? 'सारांश तैयार हो रहा है…' : 'Preparing summary…') : aiSummaryError ? (language === 'hi' ? 'सारांश उपलब्ध नहीं है। फिर कोशिश करें या लेख पढ़ें।' : 'Summary unavailable. Try again or continue reading.') : aiBullets.length ? (language === 'hi' ? 'सारांश तैयार है।' : 'Summary ready.') : ''}
            </p>
            {aiBullets.length ? <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {aiBullets.map(bullet => <li key={bullet} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" /><span>{bullet}</span></li>)}
            </ul> : null}
          </section>
          </ArticleAudioPlayer>

          <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

          <div
            data-article-body
            className={`${styles.body} article-rich-content text-zinc-800 dark:text-zinc-200`}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>
      </article>

      <ArticleRelatedStories key={article.id} articles={relatedArticles} language={language} />
      {isAuthorImageModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={article.author.name || 'Author Profile'}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200 motion-reduce:animate-none"
          onClick={() => setIsAuthorImageModalOpen(false)}
        >
          <div
            className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-zinc-700/80 bg-zinc-900/95 p-6 text-center shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200 motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={authorCloseRef}
              type="button"
              onClick={() => setIsAuthorImageModalOpen(false)}
              className="reader-focus-ring absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white"
              aria-label={language === 'hi' ? 'बंद करें' : 'Close'}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative mt-2 h-44 w-44 overflow-hidden rounded-full border-4 border-orange-500/30 bg-zinc-950 shadow-xl ring-4 ring-orange-500/10 sm:h-52 sm:w-52">
              {article.author.avatar ? (
                <Image
                  src={article.author.avatar}
                  alt={article.author.name || 'Author profile'}
                  fill
                  sizes="208px"
                  unoptimized
                  className="object-cover"
                  priority
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-red-700 text-5xl font-black uppercase text-white">
                  {(article.author.name || 'A').charAt(0)}
                </span>
              )}
            </div>

            <div className="mt-5 space-y-1">
              <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                {article.author.name || 'Digital News Desk'}
              </h2>
              {article.author.programName ? (
                <p className="text-sm font-semibold text-orange-400">
                  {article.author.programName}
                </p>
              ) : null}
              <p className="text-xs text-zinc-400">Lokswami Editorial Desk</p>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
