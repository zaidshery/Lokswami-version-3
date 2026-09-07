'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { SwipeFeedItem } from '@/components/swipe/types';
import { trackClientEvent } from '@/lib/analytics/trackClient';

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

  const trackEvent = useCallback(
    (event: string, item: SwipeFeedItem, metadata: Record<string, unknown> = {}) => {
      trackClientEvent({
        event,
        page: `/main/shorts/${item.slug}`,
        source: 'lokswami_swipe',
        metadata: {
          videoId: item._id,
          videoSlug: item.slug,
          mediaProvider: item.mediaProvider,
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

  useEffect(() => {
    if (!activeItem) return;
    watchSecondsRef.current = 0;
    trackOnce('short_impression', activeItem);
  }, [activeItem, trackOnce]);

  useEffect(() => {
    if (!activeItem || paused || !playbackStarted) return;
    const timer = window.setInterval(() => {
      watchSecondsRef.current += 1;
      const seconds = watchSecondsRef.current;
      if (seconds >= 3) trackOnce('video_3_second_view', activeItem);
      const duration = Math.max(1, activeItem.duration || 1);
      const ratio = seconds / duration;
      if (ratio >= 0.25) trackOnce('video_25_percent', activeItem);
      if (ratio >= 0.5) trackOnce('video_50_percent', activeItem);
      if (ratio >= 0.95) trackOnce('video_complete', activeItem);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeItem, paused, playbackStarted, trackOnce]);

  return { trackEvent, trackOnce };
}
