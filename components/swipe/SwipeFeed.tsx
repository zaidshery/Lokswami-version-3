'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import SwipeActions from '@/components/swipe/SwipeActions';
import SwipeVideoCard from '@/components/swipe/SwipeVideoCard';
import QuickArticleSheet from '@/components/swipe/QuickArticleSheet';
import SwipeSettingsSheet from '@/components/swipe/SwipeSettingsSheet';
import { SwipeEmptyState, SwipeLoadError } from '@/components/swipe/SwipeStates';
import useSwipeAnalytics from '@/components/swipe/useSwipeAnalytics';
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
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<SwipeCursor>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [articlesBySlug, setArticlesBySlug] = useState<Record<string, SwipeArticle | null>>(() => {
    const firstSlug = initialItems[0]?.slug;
    return firstSlug ? { [firstSlug]: initialArticle } : {};
  });
  const touchStartY = useRef<number | null>(null);
  const articleButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const activeItem = items[activeIndex] || null;
  const activeArticle = activeItem ? articlesBySlug[activeItem.slug] ?? null : null;
  const { trackEvent, trackOnce } = useSwipeAnalytics({
    activeItem,
    paused,
    playbackStarted,
  });

  useEffect(() => {
    try {
      setDataSaver(window.localStorage.getItem(DATA_SAVER_KEY) !== 'false');
    } catch {
      setDataSaver(true);
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

  useEffect(() => {
    if (!activeItem) return;
    setPaused(false);
    setPlaybackStarted(false);
    setPlaybackError(false);
    setSheetOpen(false);
    setSettingsOpen(false);
    window.history.replaceState(window.history.state, '', `/main/shorts/${encodeURIComponent(activeItem.slug)}`);
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
        setPaused((current) => !current);
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

  const shareActive = useCallback(async () => {
    if (!activeItem) return;
    const url = new URL(`/main/shorts/${activeItem.slug}`, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: activeItem.title, text: activeItem.description, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      trackEvent('swipe_share', activeItem);
    } catch {
      // A dismissed share sheet is not an application error.
    }
  }, [activeItem, trackEvent]);

  if (!activeItem) {
    return <SwipeEmptyState />;
  }

  return (
    <section
      className="fixed inset-0 z-40 overflow-hidden bg-black text-white"
      aria-label="Lokswami Swipe news feed"
      onTouchStart={(event) => {
        touchStartY.current = event.changedTouches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartY.current;
        touchStartY.current = null;
        if (start == null) return;
        const delta = start - (event.changedTouches[0]?.clientY ?? start);
        if (Math.abs(delta) < 48) return;
        moveTo(activeIndex + (delta > 0 ? 1 : -1));
      }}
    >
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
            setPaused((current) => !current);
          }}
          onPlay={handlePlay}
          onProgress={handleProgress}
          onError={handlePlaybackError}
        />
      ))}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-black/75 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-72 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

      <div className="absolute left-3 top-[max(env(safe-area-inset-top),0.75rem)] z-30 flex items-center gap-3">
        <Link href="/main/videos" aria-label="Back to videos" className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur">
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
        onShare={() => void shareActive()}
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
        onClose={() => setSettingsOpen(false)}
        returnFocusRef={settingsButtonRef}
      />
    </section>
  );
}
