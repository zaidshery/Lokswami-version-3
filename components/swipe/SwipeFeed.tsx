'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react';
import SwipeActions from '@/components/swipe/SwipeActions';
import ShareMenu from '@/components/ui/ShareMenu';
import SwipeVideoCard from '@/components/swipe/SwipeVideoCard';
import QuickArticleSheet from '@/components/swipe/QuickArticleSheet';
import SwipeSettingsSheet from '@/components/swipe/SwipeSettingsSheet';
import { SwipeEmptyState, SwipeLoadError } from '@/components/swipe/SwipeStates';
import useSwipeAnalytics from '@/components/swipe/useSwipeAnalytics';
import { buildSwipeReaderPath } from '@/lib/utils/readerContentPaths';
import type {
  SwipeArticle,
  SwipeCursor,
  SwipeFeedItem,
  SwipeStoryResponse,
} from '@/components/swipe/types';

type SwipeFeedProps = {
  initialItems: SwipeFeedItem[];
  initialArticle: SwipeArticle | null;
  initialHasMore: boolean;
  initialNextCursor: SwipeCursor;
};

type FeedResponse = {
  items?: SwipeFeedItem[];
  hasMore?: boolean;
  nextCursor?: SwipeCursor;
};

const DATA_SAVER_KEY = 'lokswami.swipe.data-saver.v1';
const AUTOPLAY_KEY = 'lokswami.swipe.autoplay.v1';
const MUTE_DEFAULT_KEY = 'lokswami.swipe.mute-default.v1';

function mergeUnique(items: SwipeFeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?._id || seen.has(item._id)) return false;
    seen.add(item._id);
    return true;
  });
}

export default function SwipeFeed({
  initialItems,
  initialArticle,
  initialHasMore,
  initialNextCursor,
}: SwipeFeedProps) {
  const [items, setItems] = useState(() => mergeUnique(initialItems));
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [dataSaver, setDataSaver] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [muteDefault, setMuteDefault] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<SwipeCursor>(initialNextCursor);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const wasManuallyPausedRef = useRef(false);
  const pausedByVisibilityRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [articlesBySlug, setArticlesBySlug] = useState<Record<string, SwipeArticle | null>>(() => {
    const firstSlug = initialItems[0]?.slug;
    return firstSlug ? { [firstSlug]: initialArticle } : {};
  });

  const touchStartY = useRef<number | null>(null);
  const lastWheelTime = useRef<number>(0);
  const articleButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const activeItem = items[activeIndex] || null;
  const activeArticle = activeItem ? articlesBySlug[activeItem.slug] ?? null : null;
  const { trackEvent, trackOnce } = useSwipeAnalytics({
    activeItem,
    paused,
    playbackStarted,
  });

  // Network online/offline monitoring
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      setPaused(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      const storedDataSaver = window.localStorage.getItem(DATA_SAVER_KEY);
      if (storedDataSaver !== null) {
        setDataSaver(storedDataSaver !== 'false');
      } else {
        const hasSaveData = (navigator as unknown as { connection?: { saveData?: boolean } })?.connection?.saveData;
        setDataSaver(hasSaveData ?? true);
      }
      setAutoplay(window.localStorage.getItem(AUTOPLAY_KEY) !== 'false');
      const savedMute = window.localStorage.getItem(MUTE_DEFAULT_KEY);
      if (savedMute !== null) {
        const isMuted = savedMute === 'true';
        setMuteDefault(isMuted);
        setMuted(isMuted);
      }
    } catch {
      setDataSaver(true);
      setAutoplay(true);
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DATA_SAVER_KEY, String(dataSaver));
    } catch {
      // Storage is optional.
    }
  }, [dataSaver]);

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  // Document visibility handling (pause on background, resume if not manually paused)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (!paused) {
          pausedByVisibilityRef.current = true;
          setPaused(true);
        }
      } else {
        if (pausedByVisibilityRef.current) {
          pausedByVisibilityRef.current = false;
          if (!wasManuallyPausedRef.current && autoplayRef.current) {
            setPaused(false);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [paused]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTOPLAY_KEY, String(autoplay));
    } catch {
      // Storage is optional.
    }
  }, [autoplay]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MUTE_DEFAULT_KEY, String(muteDefault));
    } catch {
      // Storage is optional.
    }
  }, [muteDefault]);

  useEffect(() => {
    if (!activeItem) return;
    setPaused(!autoplayRef.current);
    setPlaybackStarted(false);
    setPlaybackError(false);
    setSheetOpen(false);
    setSettingsOpen(false);
    window.history.replaceState(window.history.state, '', buildSwipeReaderPath(activeItem.slug));
  }, [activeItem]);

  useEffect(() => {
    if (!activeItem?.articleId || Object.prototype.hasOwnProperty.call(articlesBySlug, activeItem.slug)) {
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/v1/public/shorts/${encodeURIComponent(activeItem.slug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SwipeStoryResponse;
      })
      .then((payload) => {
        if (!payload) return;
        setArticlesBySlug((current) => ({
          ...current,
          [activeItem.slug]: payload.data?.article ?? null,
        }));
      })
      .catch((error) => {
        if ((error as Error).name === 'AbortError') return;
        setArticlesBySlug((current) => ({ ...current, [activeItem.slug]: null }));
      });
    return () => controller.abort();
  }, [activeItem, articlesBySlug]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({
        limit: '8',
        cursorPublishedAt: nextCursor.publishedAt,
        cursorId: nextCursor.id,
      });
      const response = await fetch(`/api/v1/public/shorts?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load more Swipe stories.');
      const payload = (await response.json()) as FeedResponse;
      setItems((current) => mergeUnique([...current, ...(payload.items || [])]));
      setHasMore(Boolean(payload.hasMore));
      setNextCursor(payload.nextCursor || null);
    } catch {
      setLoadError('अगली खबर लोड नहीं हो सकी। फिर कोशिश करें।');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor]);

  const moveTo = useCallback(
    (nextIndex: number) => {
      if (!items.length) return;
      const bounded = Math.max(0, Math.min(items.length - 1, nextIndex));
      if (bounded === activeIndex) {
        if (bounded === items.length - 1) void loadMore();
        return;
      }
      wasManuallyPausedRef.current = false;
      const from = items[activeIndex];
      const to = items[bounded];
      trackEvent(bounded > activeIndex ? 'swipe_next' : 'swipe_back', from, {
        fromVideoId: from._id,
        toVideoId: to._id,
      });
      setActiveIndex(bounded);
      if (bounded >= items.length - 2) void loadMore();
    },
    [activeIndex, items, loadMore, trackEvent]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (sheetOpen || settingsOpen) return;
      const now = Date.now();
      if (now - lastWheelTime.current < 400) return;
      if (Math.abs(event.deltaY) > 30) {
        lastWheelTime.current = now;
        moveTo(activeIndex + (event.deltaY > 0 ? 1 : -1));
      }
    },
    [activeIndex, moveTo, settingsOpen, sheetOpen]
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (sheetOpen || settingsOpen) return;
      touchStartY.current = event.changedTouches[0]?.clientY ?? null;
    },
    [settingsOpen, sheetOpen]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (sheetOpen || settingsOpen) return;
      const start = touchStartY.current;
      touchStartY.current = null;
      if (start == null) return;
      const delta = start - (event.changedTouches[0]?.clientY ?? start);
      if (Math.abs(delta) < 48) return;
      moveTo(activeIndex + (delta > 0 ? 1 : -1));
    },
    [activeIndex, moveTo, settingsOpen, sheetOpen]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (sheetOpen || settingsOpen) return;
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        moveTo(activeIndex + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        moveTo(activeIndex - 1);
      } else if (event.key === ' ') {
        event.preventDefault();
        setPaused((current) => {
          const next = !current;
          wasManuallyPausedRef.current = next;
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, moveTo, settingsOpen, sheetOpen]);

  const visibleCards = useMemo(() => {
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => Math.abs(index - activeIndex) <= 1)
      .map(({ item, index }) => ({
        item,
        position: Math.sign(index - activeIndex) as -1 | 0 | 1,
      }));
  }, [activeIndex, items]);

  const handlePlay = useCallback(() => {
    if (activeItem) {
      setPlaybackError(false);
      setPlaybackStarted(true);
      trackOnce('video_play', activeItem);
    }
  }, [activeItem, trackOnce]);

  const handleProgress = useCallback(
    (currentTime: number, duration: number) => {
      if (!activeItem || !duration) return;
      const ratio = currentTime / duration;
      if (ratio >= 0.25) trackOnce('video_25_percent', activeItem);
      if (ratio >= 0.5) trackOnce('video_50_percent', activeItem);
      if (ratio >= 0.95) trackOnce('video_complete', activeItem);
    },
    [activeItem, trackOnce]
  );

  const handlePlaybackError = useCallback(() => {
    setPlaybackError(true);
    setPaused(true);
    if (activeItem) trackOnce('video_playback_failure', activeItem);
  }, [activeItem, trackOnce]);

  if (!activeItem) {
    return <SwipeEmptyState />;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black md:bg-zinc-950/95 md:backdrop-blur-md text-white overflow-hidden">
      <section
        className="relative h-full w-full max-w-[480px] overflow-hidden bg-black shadow-2xl md:max-h-[92dvh] md:rounded-[32px] md:border md:border-white/10"
        aria-label="Lokswami Swipe news feed"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isOffline && (
          <div
            role="status"
            className="pointer-events-none absolute top-[max(env(safe-area-inset-top),3.5rem)] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-bold text-zinc-950 shadow-lg backdrop-blur"
          >
            <span className="h-2 w-2 rounded-full bg-zinc-950 animate-pulse" />
            <span>इंटरनेट कनेक्शन नहीं है (ऑफ़लाइन)</span>
          </div>
        )}

        {visibleCards.map(({ item, position }) => (
          <SwipeVideoCard
            key={item._id}
            item={item}
            position={position}
            active={position === 0}
            muted={muted}
            paused={paused}
            reducedMotion={reducedMotion}
            preloadMetadata={position === 1 && !dataSaver}
            onTogglePlayback={() => {
              setPlaybackError(false);
              setPaused((current) => {
                const next = !current;
                wasManuallyPausedRef.current = next;
                return next;
              });
            }}
            onPlay={handlePlay}
            onProgress={handleProgress}
            onError={handlePlaybackError}
          />
        ))}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-black/75 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-72 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

        <div className="absolute left-3 top-[max(env(safe-area-inset-top),0.75rem)] z-30 flex items-center gap-3">
          <Link
            href="/main/videos"
            aria-label="Back to videos"
            className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">Lokswami Swipe</p>
            <p className="text-xs text-white/75">देखो • पढ़ो • आगे बढ़ो</p>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-[calc(var(--reader-bottom-nav-space)+4.5rem)] left-4 right-20 z-30">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-400">{activeItem.category}</p>
          <h1 className="mt-2 line-clamp-3 text-xl font-extrabold leading-7 drop-shadow-lg">{activeItem.title}</h1>
        </div>

        <SwipeActions
          muted={muted}
          dataSaver={dataSaver}
          hasArticle={Boolean(activeArticle)}
          articleButtonRef={articleButtonRef}
          settingsButtonRef={settingsButtonRef}
          onToggleMuted={() => setMuted((current) => !current)}
          onOpenSettings={() => setSettingsOpen(true)}
          shareControl={
            <ShareMenu
              title={activeItem.title}
              text={activeItem.description}
              url={buildSwipeReaderPath(activeItem.slug)}
              contentType="video"
              contentId={activeItem._id}
              ariaLabel="Share this Swipe story"
              placement="swipe_actions"
              onShareEvent={(event, platform) =>
                trackEvent(event === 'share_complete' ? 'swipe_share' : event, activeItem, { platform })
              }
              buttonClassName="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10 [&>span]:sr-only"
            />
          }
          onOpenArticle={() => {
            if (!activeArticle) return;
            setSheetOpen(true);
            trackEvent('quick_article_open', activeItem, { articleId: activeArticle.id });
          }}
        />

        <p className="sr-only" aria-live="polite">
          {`Story ${activeIndex + 1} of ${items.length}: ${activeItem.title}`}
        </p>
        <p className="sr-only" aria-live="polite" role="status">
          {playbackError
            ? 'Playback failed. Press play to try again.'
            : paused
              ? 'Video paused.'
              : playbackStarted
                ? muted
                  ? 'Video playing muted.'
                  : 'Video playing with sound.'
                : 'Video loading.'}
        </p>
        {loadingMore ? <p className="sr-only" aria-live="polite">Loading more Swipe stories</p> : null}
        {loadError ? <SwipeLoadError message={loadError} onRetry={() => void loadMore()} /> : null}

        {activeArticle ? (
          <QuickArticleSheet
            article={activeArticle}
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            returnFocusRef={articleButtonRef}
          />
        ) : null}
        <SwipeSettingsSheet
          open={settingsOpen}
          dataSaver={dataSaver}
          onDataSaverChange={setDataSaver}
          autoplay={autoplay}
          onAutoplayChange={setAutoplay}
          muteDefault={muteDefault}
          onMuteDefaultChange={(val) => {
            setMuteDefault(val);
            setMuted(val);
          }}
          onClose={() => setSettingsOpen(false)}
          returnFocusRef={settingsButtonRef}
        />
      </section>

      {/* Desktop floating navigation controls */}
      <div className="hidden md:flex flex-col gap-3 ml-4 z-50">
        <button
          type="button"
          onClick={() => moveTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          aria-label="Previous story"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 transition disabled:opacity-30 disabled:pointer-events-none active:scale-95"
        >
          <ChevronUp className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => moveTo(activeIndex + 1)}
          disabled={activeIndex === items.length - 1}
          aria-label="Next story"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 transition disabled:opacity-30 disabled:pointer-events-none active:scale-95"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
