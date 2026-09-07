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
  Pause,
  PauseCircle,
  Play,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import NewsCard from '@/components/ui/NewsCard';
import ShareMenu from '@/components/ui/ShareMenu';
import type { Article } from '@/lib/mock/data';
import { useArticleTts } from '@/lib/hooks/useArticleTts';
import { useAppStore } from '@/lib/store/appStore';
import {
  buildArticleSharePath,
  buildArticleWhatsAppShareText,
} from '@/lib/utils/articleShare';
import {
  buildArticleImageVariantUrl,
} from '@/lib/utils/articleMedia';
import { formatUiDate } from '@/lib/utils/dateFormat';
import { renderArticleRichContent } from '@/lib/utils/articleRichContent';
import {
  TTS_LANGUAGE_OPTIONS,
  TTS_VOICE_OPTIONS,
} from '@/lib/constants/tts';
import {
  buildTtsAudioSource,
  requestArticleTtsAudio,
  type TtsAudioData,
} from '@/lib/ai/ttsClient';

const MONGO_OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const RELATED_STORIES_INITIAL_COUNT = 4;
const RELATED_STORIES_LOAD_STEP = 4;

type PreparedArticleAudio = {
  sourceId: string;
  languageCode: string;
  voice: string;
  src: string;
  payload: TtsAudioData;
};

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

function getPreferredListenLanguageCode(article: ReaderArticle | null) {
  return inferArticleContentLanguage(article) === 'hi' ? 'hi-IN' : 'en-IN';
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
  const [visibleRelatedCount, setVisibleRelatedCount] = useState(
    RELATED_STORIES_INITIAL_COUNT
  );
  const [readingProgress, setReadingProgress] = useState(0);
  const [aiBullets, setAiBullets] = useState<string[]>([]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [, setAiSummaryError] = useState('');
  const [isAuthorImageModalOpen, setIsAuthorImageModalOpen] = useState(false);
  const [listenLanguageCode, setListenLanguageCode] = useState('hi-IN');
  const [listenVoiceId, setListenVoiceId] = useState('');
  const [isPreparingListen, setIsPreparingListen] = useState(false);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [listenError, setListenError] = useState('');
  const [preparedListenAudio, setPreparedListenAudio] = useState<PreparedArticleAudio | null>(null);
  const preloadedListenAudioRef = useRef<HTMLAudioElement | null>(null);
  const listenRequestIdRef = useRef(0);
  const listenPrefetchRequestIdRef = useRef(0);
  const listenPrefetchPromiseRef = useRef<Promise<PreparedArticleAudio | null> | null>(null);
  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const hasTrackedReadRef = useRef(false);
  const readingProgressRef = useRef(0);
  const isSignedIn = Boolean(currentUser);
  const canSaveArticle = Boolean(article && MONGO_OBJECT_ID_REGEX.test(article.id));
  const articleContentLanguage = useMemo(() => inferArticleContentLanguage(article), [article]);
  const isBookmarked = Boolean(
    article && Array.isArray(savedArticleIds) && savedArticleIds.includes(article.id)
  );
  const visibleRelatedArticles = relatedArticles.slice(0, visibleRelatedCount);
  const hasMoreRelatedStories = visibleRelatedCount < relatedArticles.length;
  const fontSizeClass = 'text-[15px] sm:text-base leading-relaxed';
  const canPrepareListen = true;
  const currentListenSourceId = article?.id || '';
  const currentListenVoice = listenVoiceId || '';
  const canUsePreparedListenAudio = Boolean(
    preparedListenAudio &&
      preparedListenAudio.sourceId === currentListenSourceId &&
      preparedListenAudio.languageCode === listenLanguageCode &&
      preparedListenAudio.voice === currentListenVoice
  );
  const listenButtonTitle = language === 'hi' ? 'Lekh sunein' : 'Listen to article';

  const articlePlainText = useMemo(() => {
    if (!article) return '';
    const parts = [
      article.title,
      article.summary,
      article.content ? toPlainText(article.content) : '',
    ].filter(Boolean);
    return parts.join('। ');
  }, [article]);

  const tts = useArticleTts({
    audioUrl: preparedListenAudio?.src || null,
    text: articlePlainText,
    title: article?.title,
    lang: listenLanguageCode,
    onError: (err) => {
      setListenError(
        language === 'hi'
          ? 'ऑडियो चलाने में त्रुटि हुई।'
          : err || 'Unable to play article audio right now.'
      );
    },
  });

  useEffect(() => {
    if (!isAuthorImageModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAuthorImageModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthorImageModalOpen]);

  useEffect(() => {
    const updateReadingProgress = () => {
      const root = document.documentElement;
      const scrollTop = window.scrollY || root.scrollTop;
      const scrollable = root.scrollHeight - root.clientHeight;

      if (scrollable <= 0) {
        setReadingProgress(0);
        return;
      }

      const nextValue = Math.min(100, Math.max(0, (scrollTop / scrollable) * 100));
      setReadingProgress(nextValue);
    };

    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener('resize', updateReadingProgress);

    return () => {
      window.removeEventListener('scroll', updateReadingProgress);
      window.removeEventListener('resize', updateReadingProgress);
    };
  }, []);

  useEffect(() => {
    readingProgressRef.current = readingProgress;
  }, [readingProgress]);

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
    setVisibleRelatedCount(RELATED_STORIES_INITIAL_COUNT);
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

  useEffect(() => {
    if (readingProgress < 80) {
      return;
    }

    void trackArticleRead(readingProgress);
  }, [readingProgress, trackArticleRead]);

  const contentHtml = useMemo(() => {
    if (!article) return '';
    const raw = article.content && article.content.trim() ? article.content : article.summary;
    const parsed = renderArticleRichContent(raw);
    return parsed || renderArticleRichContent(article.summary);
  }, [article]);

  const articleMeta = useMemo(() => {
    if (!article) {
      return { readMinutes: 1, publishedText: '' };
    }

    const plain = toPlainText(article.content || article.summary || '');
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    const readMinutes = Math.max(1, Math.round(words / 220));

    const publishedText = formatUiDate(article.publishedAt, '');

    return { readMinutes, publishedText };
  }, [article]);

  const listenLanguageOptions = useMemo(() => {
    return TTS_LANGUAGE_OPTIONS;
  }, []);

  const listenVoiceOptions = useMemo(() => {
    return TTS_VOICE_OPTIONS;
  }, []);

  useEffect(() => {
    if (!listenLanguageOptions.length) return;
    const exists = listenLanguageOptions.some((item) => item.code === listenLanguageCode);
    if (!exists) {
      setListenLanguageCode(listenLanguageOptions[0].code);
    }
  }, [listenLanguageCode, listenLanguageOptions]);

  useEffect(() => {
    const preferredCode = getPreferredListenLanguageCode(article);
    setListenLanguageCode((current) =>
      current === preferredCode ? current : preferredCode
    );
  }, [article]);

  useEffect(() => {
    if (!listenVoiceId) return;
    const exists = listenVoiceOptions.some((voice) => voice.id === listenVoiceId);
    if (!exists) {
      setListenVoiceId('');
    }
  }, [listenVoiceId, listenVoiceOptions]);

  const stopListening = useCallback((suppressState = false) => {
    listenRequestIdRef.current += 1;
    tts.stop();
    if (!suppressState) {
      setIsPreparingListen(false);
    }
  }, [tts]);

  const prepareArticleListenAudio = useCallback(
    async (options?: { force?: boolean }) => {
      if (!article) {
        return null;
      }

      const sourceId = article.id;
      const languageCode = listenLanguageCode;
      const voice = listenVoiceId || '';

      if (
        !options?.force &&
        preparedListenAudio &&
        preparedListenAudio.sourceId === sourceId &&
        preparedListenAudio.languageCode === languageCode &&
        preparedListenAudio.voice === voice
      ) {
        return preparedListenAudio;
      }

      if (!options?.force && listenPrefetchPromiseRef.current) {
        return await listenPrefetchPromiseRef.current;
      }

      const requestId = listenPrefetchRequestIdRef.current + 1;
      listenPrefetchRequestIdRef.current = requestId;

      const promise = requestArticleTtsAudio(sourceId)
        .then((payload) => {
          if (requestId !== listenPrefetchRequestIdRef.current) {
            return null;
          }

          const src = buildTtsAudioSource(payload);
          if (!src) {
            return null;
          }

          const prepared = {
            sourceId,
            languageCode,
            voice,
            src,
            payload,
          } satisfies PreparedArticleAudio;

          const preloaded = new Audio(src);
          preloaded.preload = 'auto';
          preloaded.load();
          preloadedListenAudioRef.current = preloaded;
          setPreparedListenAudio(prepared);
          return prepared;
        })
        .catch(() => null)
        .finally(() => {
          if (requestId === listenPrefetchRequestIdRef.current) {
            listenPrefetchPromiseRef.current = null;
          }
        });

      listenPrefetchPromiseRef.current = promise;
      return await promise;
    },
    [article, listenLanguageCode, listenVoiceId, preparedListenAudio]
  );

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
    } catch (error) {
      if (controller.signal.aborted) return;
      setAiSummaryError(error instanceof Error ? error.message : 'Failed to generate summary');
    } finally {
      if (summaryAbortControllerRef.current === controller) {
        summaryAbortControllerRef.current = null;
        setIsGeneratingSummary(false);
      }
    }
  };

  const handleListen = async () => {
    if (!article) return;

    if (tts.isSpeaking) {
      tts.pause();
      return;
    }

    if (tts.isPaused) {
      tts.resume();
      return;
    }

    const requestId = listenRequestIdRef.current + 1;
    listenRequestIdRef.current = requestId;
    setListenError('');
    setIsPreparingListen(true);

    const articleListenSourceId = article.id;

    try {
      let audioSource = preparedListenAudio?.src || null;
      if (!audioSource && articleListenSourceId) {
        try {
          const preparedAudio = await prepareArticleListenAudio();
          if (requestId === listenRequestIdRef.current && preparedAudio?.src) {
            audioSource = preparedAudio.src;
          }
        } catch {
          audioSource = null;
        }
      }

      if (requestId !== listenRequestIdRef.current) return;

      await tts.play({
        audioUrl: audioSource,
        text: articlePlainText,
        lang: listenLanguageCode,
      });
    } catch (error) {
      if (requestId !== listenRequestIdRef.current) return;
      setListenError(
        error instanceof Error && error.message.trim()
          ? error.message
          : language === 'hi'
            ? 'ऑडियो चलाने में त्रुटि हुई।'
            : 'Unable to play article audio right now.'
      );
    } finally {
      if (requestId === listenRequestIdRef.current) {
        setIsPreparingListen(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      summaryAbortControllerRef.current?.abort();
      summaryAbortControllerRef.current = null;
      stopListening(true);
    };
  }, []);

  useEffect(() => {
    listenPrefetchRequestIdRef.current += 1;
    listenPrefetchPromiseRef.current = null;
    preloadedListenAudioRef.current = null;
    setPreparedListenAudio(null);
    stopListening(true);
  }, [article?.id, listenLanguageCode, listenVoiceId]);

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
    <div className="mx-auto w-full max-w-4xl pb-[calc(var(--reader-bottom-nav-space)+5rem)] sm:pb-12">
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-orange-500 via-orange-600 to-red-600 transition-[width] duration-150 ease-out"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      <Link
        href="/main"
        className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400 sm:mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        {language === 'hi' ? 'होम' : 'Home'}
      </Link>

      <article className="cnp-surface overflow-hidden p-0">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-950">
          <Image
            src={buildArticleImageVariantUrl(article.image, 'detail')}
            alt={article.seo?.featuredImageAlt || article.title}
            fill
            className="object-contain"
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 92vw, 896px"
            priority
          />
        </div>
        {article.seo?.featuredImageCaption || article.seo?.featuredImageCredit ? (
          <div className="border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            {article.seo.featuredImageCaption ? <span>{article.seo.featuredImageCaption}</span> : null}
            {article.seo.featuredImageCredit ? (
              <span className="ml-2 font-medium">{article.seo.featuredImageCredit}</span>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3.5 p-3.5 sm:space-y-4 sm:p-6 md:p-8">
          <div className="-mx-0.5 overflow-x-auto pb-0.5 pl-0.5 pr-0.5 scrollbar-hide sm:mx-0 sm:overflow-visible sm:pb-0 sm:pl-0 sm:pr-0">
            <div className="inline-flex min-w-max items-center gap-1 sm:flex sm:min-w-0 sm:flex-wrap sm:gap-2">
            <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-orange-50 px-2.5 text-[10px] font-semibold leading-none text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 sm:h-auto sm:px-3 sm:py-1 sm:text-xs sm:leading-normal">
              {article.category}
            </span>
            {article.isBreaking ? (
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-red-600 px-2.5 text-[10px] font-semibold leading-none text-white sm:h-auto sm:px-3 sm:py-1 sm:text-xs sm:leading-normal">
                {language === 'hi' ? 'ब्रेकिंग' : 'BREAKING'}
              </span>
            ) : null}
            {article.isTrending ? (
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-zinc-900 px-2.5 text-[10px] font-semibold leading-none text-white dark:bg-zinc-700 sm:h-auto sm:px-3 sm:py-1 sm:text-xs sm:leading-normal">
                {language === 'hi' ? 'ट्रेंडिंग' : 'TRENDING'}
              </span>
            ) : null}
            <div className="inline-flex items-center gap-1 sm:ml-auto sm:gap-2">
              <button
                type="button"
                onClick={() => void handleBookmarkToggle()}
                disabled={!canSaveArticle || isSavingBookmark}
                className={`reader-touch-button reader-focus-ring inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold leading-none transition sm:min-h-9 sm:px-3.5 sm:text-sm sm:font-bold sm:leading-normal ${
                  isBookmarked
                    ? 'border-orange-400 bg-orange-600 text-white hover:bg-orange-700 dark:border-orange-500 dark:bg-orange-500 dark:hover:bg-orange-400'
                    : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-500/45 dark:bg-orange-500/12 dark:text-orange-300 dark:hover:bg-orange-500/20'
                } ${!canSaveArticle || isSavingBookmark ? 'cursor-not-allowed opacity-60' : ''}`}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Save article'}
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
                {isBookmarked ? 'Saved' : 'Save'}
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
                buttonClassName="reader-touch-button reader-focus-ring inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 text-[10px] font-semibold leading-none text-zinc-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-orange-500/50 dark:hover:bg-orange-500/15 dark:hover:text-orange-300 sm:min-h-9 sm:px-3.5 sm:text-sm sm:font-bold sm:leading-normal"
              />

              <Link
                href="/main/epaper"
                className="attention-pulsate-bck reader-touch-link reader-focus-ring inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2.5 text-[10px] font-semibold leading-none text-orange-700 transition hover:bg-orange-100 dark:border-orange-500/45 dark:bg-orange-500/12 dark:text-orange-300 dark:hover:bg-orange-500/20 sm:min-h-9 sm:px-3.5 sm:text-sm sm:font-bold sm:leading-normal"
                aria-label={language === 'hi' ? '\u0908-\u092a\u0947\u092a\u0930' : 'E-Paper'}
              >
                <Newspaper className="h-3.5 w-3.5 max-[420px]:hidden sm:h-4 sm:w-4" />
                {language === 'hi' ? '\u0908-\u092a\u0947\u092a\u0930' : 'E-Paper'}
              </Link>

            </div>
          </div>
          </div>

          <h1 className="text-xl font-black leading-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
            {article.title}
          </h1>

          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 sm:gap-2 sm:text-sm">
            <button
              type="button"
              onClick={() => setIsAuthorImageModalOpen(true)}
              className="group relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-zinc-200 transition-all duration-200 hover:scale-110 hover:border-orange-500 hover:ring-2 hover:ring-orange-500/50 active:scale-95 dark:border-zinc-700 dark:bg-zinc-800 sm:h-8 sm:w-8"
              aria-label={
                language === 'hi'
                  ? `${article.author.name || 'लेखक'} की प्रोफाइल फोटो देखें`
                  : `View profile picture of ${article.author.name || 'author'}`
              }
              title={
                language === 'hi'
                  ? `${article.author.name || 'लेखक'} की प्रोफाइल फोटो देखें`
                  : `View profile picture of ${article.author.name || 'author'}`
              }
            >
              {article.author.avatar ? (
                <Image
                  src={article.author.avatar}
                  alt={article.author.name || 'Author profile'}
                  fill
                  sizes="32px"
                  unoptimized
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-red-700 text-[11px] font-black uppercase text-white">
                  {(article.author.name || 'A').charAt(0)}
                </span>
              )}
            </button>
            {article.author.name ? <span className="font-bold text-zinc-900 dark:text-zinc-100">{article.author.name}</span> : null}
            {article.author.programName ? (
              <>
                <span className="text-zinc-400" aria-hidden="true">|</span>
                <span className="font-semibold text-red-600 dark:text-red-500">{article.author.programName}</span>
              </>
            ) : null}
            <span aria-hidden="true">&bull;</span>
            <span>{articleMeta.readMinutes} min read</span>
            {articleMeta.publishedText ? (
              <>
                <span aria-hidden="true">&bull;</span>
                <span>{articleMeta.publishedText}</span>
              </>
            ) : null}
          </div>

          <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-base">
            {article.summary}
          </p>

          <section
            aria-label={language === 'hi' ? 'Lokswami AI tools' : 'Lokswami AI tools'}
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div
              className={`flex items-center gap-1.5 bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900/70 sm:gap-2 sm:px-4 sm:py-2.5 ${
                aiBullets.length || listenError
                  ? 'border-b border-zinc-200 dark:border-zinc-800'
                  : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-xl sm:h-[65px] sm:w-[65px]">
                  <Image
                    src="/ai-logo-shery-lokswami-cutout.png"
                    alt="Lokswami AI"
                    fill
                    sizes="(max-width: 639px) 50px, 65px"
                    className="object-contain object-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                    priority={false}
                  />
                </div>
                <div className="hidden min-w-0 sm:flex sm:flex-col sm:gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold tracking-wide text-zinc-900 dark:text-zinc-100">
                      Lokswami
                    </span>
                    <span className="inline-flex h-5 items-center rounded-full border border-red-200 bg-red-50 px-2 text-[10px] font-black uppercase tracking-[0.12em] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                      AI
                    </span>
                  </div>
                  <p className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Audio tools for this article
                  </p>
                </div>
              </div>

              <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => void handleListen()}
                  disabled={isPreparingListen || !canPrepareListen}
                  title={listenButtonTitle}
                  className={`reader-touch-button reader-focus-ring inline-flex min-h-10 items-center justify-center gap-1 rounded-full border px-2.5 text-[10px] font-bold leading-none transition disabled:opacity-60 sm:min-h-8 sm:gap-1.5 sm:px-3 sm:text-xs ${
                    tts.isSpeaking
                      ? 'border-orange-400 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:border-orange-600 dark:bg-orange-950/60 dark:text-orange-200'
                      : canUsePreparedListenAudio
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-200 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                  }`}
                >
                  {isPreparingListen ? (
                    <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" />
                  ) : tts.isSpeaking ? (
                    <PauseCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : (
                    <Volume2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  )}
                  {tts.isSpeaking
                    ? language === 'hi'
                      ? 'रोकें'
                      : 'Pause'
                    : language === 'hi'
                      ? 'सुनें'
                      : 'Listen'}
                </button>

                {tts.isSpeaking || tts.isPaused ? (
                  <button
                    type="button"
                    onClick={() => stopListening()}
                    className="reader-touch-button reader-focus-ring inline-flex min-h-10 items-center justify-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 text-[10px] font-bold leading-none text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:min-h-8 sm:gap-1.5 sm:px-3 sm:text-xs"
                  >
                    <Square className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    {language === 'hi' ? 'बंद करें' : 'Stop'}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleGenerateSummary()}
                  disabled={isGeneratingSummary}
                  className="reader-touch-button reader-focus-ring inline-flex min-h-10 items-center justify-center gap-1 rounded-full border border-red-200 bg-white px-2.5 text-[10px] font-bold leading-none text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/70 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/30 sm:min-h-8 sm:gap-1.5 sm:px-3 sm:text-xs"
                >
                  {isGeneratingSummary ? <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" /> : <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                  {language === 'hi' ? 'सारांश' : 'Summary'}
                </button>
              </div>
            </div>

            {aiBullets.length ? (
              <ul className="space-y-2 px-3 py-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300 sm:px-4">
                {aiBullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-red-600" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {listenError ? (
              <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300 sm:px-4">
                {listenError}
              </p>
            ) : null}
          </section>

          <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

          <div
            data-article-body
            className={`article-rich-content text-zinc-800 dark:text-zinc-200 ${fontSizeClass}`}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>
      </article>

      {relatedArticles.length ? (
        <section data-related-articles className="mt-6 space-y-3">
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100 sm:text-xl">
            {language === 'hi' ? 'संबंधित खबरें' : 'Related News'}
          </h2>
          <div className="space-y-3">
            {visibleRelatedArticles.map((item, index) => (
              <NewsCard key={item.id} article={item} variant="horizontal" index={index} />
            ))}
          </div>

          {hasMoreRelatedStories ? (
            <div className="flex justify-center pt-3 sm:pt-4">
              <button
                type="button"
                onClick={() =>
                  setVisibleRelatedCount((current) =>
                    Math.min(current + RELATED_STORIES_LOAD_STEP, relatedArticles.length)
                  )
                }
                className="reader-touch-button reader-focus-ring min-h-12 w-full rounded-full border border-zinc-300 bg-white px-6 py-3 text-[13px] font-semibold text-zinc-900 transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-orange-700 dark:hover:bg-zinc-800 sm:w-auto sm:px-8 sm:text-sm"
              >
                {language === 'hi' ? '\u0914\u0930 \u0916\u092c\u0930\u0947\u0902 \u0932\u094b\u0921 \u0915\u0930\u0947\u0902' : 'Load More Stories'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {isAuthorImageModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={article.author.name || 'Author Profile'}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsAuthorImageModalOpen(false)}
        >
          <div
            className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-zinc-700/80 bg-zinc-900/95 p-6 text-center shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsAuthorImageModalOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
              aria-label="Close"
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
              <h3 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                {article.author.name || 'Digital News Desk'}
              </h3>
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

      {/* Floating Audio Mini-Player */}
      {tts.isSpeaking || tts.isPaused ? (
        <aside
          aria-label={language === 'hi' ? 'ऑडियो प्लेयर' : 'Audio player'}
          className="fixed bottom-4 left-3 right-3 z-50 mx-auto max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95 sm:px-4">
            {/* Status Icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
              {tts.isSpeaking ? (
                <Volume2 className="h-5 w-5 animate-pulse" />
              ) : (
                <Volume2 className="h-5 w-5 opacity-60" />
              )}
            </div>

            {/* Title & Mode */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-hindi text-xs font-bold text-zinc-900 dark:text-zinc-100 sm:text-sm">
                {article?.title}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-full bg-orange-500 transition-all duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, tts.playbackProgress))}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                  {tts.currentMode === 'audio' ? 'HQ Audio' : 'AI Speech'}
                </span>
              </div>
            </div>

            {/* Controls: Play/Pause and Stop */}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => (tts.isPaused ? tts.resume() : tts.pause())}
                aria-label={tts.isPaused ? 'Resume audio' : 'Pause audio'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {tts.isPaused ? (
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                ) : (
                  <Pause className="h-4 w-4 fill-current" />
                )}
              </button>
              <button
                type="button"
                onClick={() => stopListening()}
                aria-label="Stop audio"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition hover:bg-red-50 hover:text-red-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
