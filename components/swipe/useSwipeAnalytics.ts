'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { SwipeFeedItem } from '@/components/swipe/types';
import { trackClientEvent } from '@/lib/analytics/trackClient';
import { buildSwipeReaderPath } from '@/lib/utils/readerContentPaths';

type UseSwipeAnalyticsOptions = {
  activeItem: SwipeFeedItem | null;
  paused: boolean;
  playbackStarted: boolean;
};

export default function useSwipeAnalytics({
  activeItem,
  paused,
  playbackStarted,
}: UseSwipeAnalyticsOptions) {
  const trackedRef = useRef(new Set<string>());
  const watchSecondsRef = useRef(0);
  const isDocumentHiddenRef = useRef(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      isDocumentHiddenRef.current = document.hidden;
    };
    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const trackEvent = useCallback(
    (event: string, item: SwipeFeedItem, metadata: Record<string, unknown> = {}) => {
      trackClientEvent({
        event,
        page: buildSwipeReaderPath(item.slug),
        source: 'lokswami_swipe',
        metadata: {
          videoId: item._id,
          videoSlug: item.slug,
          mediaProvider: item.mediaProvider,
          duration: Math.round(item.duration || 0),
          watchedSeconds: Math.round(watchSecondsRef.current),
          ...metadata,
        },
      });
    },
    []
  );

  const trackOnce = useCallback(
    (
      event: string,
      item: SwipeFeedItem,
      suffix = event,
      metadata: Record<string, unknown> = {}
    ) => {
      const key = `${item._id}:${suffix}`;
      if (trackedRef.current.has(key)) return;
      trackedRef.current.add(key);
      trackEvent(event, item, metadata);
    },
    [trackEvent]
  );

  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!activeItem) return;
    watchSecondsRef.current = 0;
    lastTimeRef.current = 0;
    trackOnce('short_impression', activeItem);
    trackOnce('swipe_impression', activeItem);
  }, [activeItem, trackOnce]);

  useEffect(() => {
    if (!activeItem || paused || !playbackStarted || isDocumentHiddenRef.current) return;
    trackOnce('watch_start', activeItem);
  }, [activeItem, paused, playbackStarted, trackOnce]);

  const onProgress = useCallback(
    (currentTime: number, duration: number, confirmedPlaying = true) => {
      if (!Number.isFinite(currentTime) || currentTime < 0 || !Number.isFinite(duration) || duration <= 0) return;
      if (!activeItem || paused || !playbackStarted || !confirmedPlaying || isDocumentHiddenRef.current) {
        lastTimeRef.current = currentTime;
        return;
      }

      const prevTime = lastTimeRef.current;
      const delta = currentTime - prevTime;

      if (delta > 0 && delta <= 2) {
        watchSecondsRef.current += delta;
      }
      lastTimeRef.current = currentTime;

      const seconds = watchSecondsRef.current;
      if (seconds >= 3) trackOnce('video_3_second_view', activeItem);
      const effDuration = Math.max(1, duration || activeItem.duration || 1);
      const watched = watchSecondsRef.current;

      if (watched >= effDuration * 0.25 && currentTime >= effDuration * 0.25) {
        trackOnce('watch_25', activeItem);
        trackOnce('video_25_percent', activeItem);
      }
      if (watched >= effDuration * 0.5 && currentTime >= effDuration * 0.5) {
        trackOnce('watch_50', activeItem);
        trackOnce('video_50_percent', activeItem);
      }
      if (watched >= effDuration * 0.75 && currentTime >= effDuration * 0.75) {
        trackOnce('watch_75', activeItem);
      }
      if (watched >= effDuration * 0.95 && currentTime >= effDuration * 0.95) {
        trackOnce('watch_complete', activeItem);
        trackOnce('video_complete', activeItem);
      }
    },
    [activeItem, paused, playbackStarted, trackOnce]
  );

  return { trackEvent, trackOnce, onProgress };
}
