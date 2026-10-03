'use client';

import { useCallback, useEffect, useRef } from 'react';
import { trackClientEvent } from '@/lib/analytics/trackClient';

export type VideoWatchTelemetryOptions = {
  contentId: string;
  slug?: string;
  title?: string;
  contentType: 'video' | 'short';
  mediaProvider?: string;
  pagePath: string;
  source: 'lokswami_video_hub' | 'lokswami_swipe';
  duration?: number;
  isPlaying: boolean;
  isBuffering?: boolean;
};

export type VideoWatchTelemetryReturn = {
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onTimeUpdate: (currentTime: number, duration?: number) => void;
  onSeek: () => void;
  getAccumulatedWatchTime: () => number;
};

export default function useVideoWatchTelemetry({
  contentId,
  slug = '',
  title = '',
  contentType,
  mediaProvider = 'unknown',
  pagePath,
  source,
  duration = 0,
  isPlaying,
  isBuffering = false,
}: VideoWatchTelemetryOptions): VideoWatchTelemetryReturn {
  const firedMilestonesRef = useRef<Set<string>>(new Set());
  const watchedSecondsRef = useRef<number>(0);
  const lastActiveContentIdRef = useRef<string>(contentId);
  const lastTimeRef = useRef<number>(0);
  const isDocumentHiddenRef = useRef<boolean>(false);

  // Reset milestone accumulation when contentId changes
  if (lastActiveContentIdRef.current !== contentId) {
    lastActiveContentIdRef.current = contentId;
    watchedSecondsRef.current = 0;
    lastTimeRef.current = 0;
  }

  // Track document visibility to suspend watch time while tab is hidden
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const updateVisibility = () => {
      isDocumentHiddenRef.current = document.hidden;
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  const emitMilestone = useCallback(
    (milestone: 'watch_start' | 'watch_25' | 'watch_50' | 'watch_75' | 'watch_complete') => {
      if (!contentId) return;
      const key = `${contentId}:${milestone}`;
      if (firedMilestonesRef.current.has(key)) return;
      firedMilestonesRef.current.add(key);

      trackClientEvent({
        event: milestone,
        page: pagePath,
        source,
        metadata: {
          videoId: contentId,
          videoSlug: slug,
          videoTitle: title,
          contentType,
          mediaProvider,
          duration: Math.round(duration),
          watchedSeconds: Math.round(watchedSecondsRef.current),
        },
      });
    },
    [contentId, contentType, duration, mediaProvider, pagePath, slug, source, title]
  );

  const checkMilestones = useCallback(
    (currentTime: number, targetDuration?: number) => {
      const effDuration = Math.max(0, targetDuration || duration);
      if (effDuration <= 0) return;

      const watched = watchedSecondsRef.current;

      // 25% milestone: user must have accumulated at least 25% of duration AND reached at least 25% position
      if (watched >= effDuration * 0.25 && currentTime >= effDuration * 0.25) {
        emitMilestone('watch_25');
      }

      // 50% milestone: user must have accumulated at least 50% of duration AND reached at least 50% position
      if (watched >= effDuration * 0.5 && currentTime >= effDuration * 0.5) {
        emitMilestone('watch_50');
      }

      // 75% milestone: user must have accumulated at least 75% of duration AND reached at least 75% position
      if (watched >= effDuration * 0.75 && currentTime >= effDuration * 0.75) {
        emitMilestone('watch_75');
      }

      // 100% completion milestone via progress (>= 98% watched)
      if (watched >= effDuration * 0.95 && currentTime >= effDuration * 0.95) {
        emitMilestone('watch_complete');
      }
    },
    [duration, emitMilestone]
  );

  const onPlay = useCallback(() => {
    emitMilestone('watch_start');
  }, [emitMilestone]);

  const onPause = useCallback(() => {
    // Pause stops time accumulation
  }, []);

  const onEnded = useCallback(() => {
    emitMilestone('watch_complete');
  }, [emitMilestone]);

  const onTimeUpdate = useCallback(
    (currentTime: number, currentDuration?: number) => {
      if (!isPlaying || isBuffering || isDocumentHiddenRef.current) {
        lastTimeRef.current = currentTime;
        return;
      }

      const prevTime = lastTimeRef.current;
      const delta = currentTime - prevTime;

      // Only accumulate if continuous normal playback (delta > 0 and <= 2 seconds).
      // If user jumped/seeked forward (delta > 2s) or backward (delta < 0), do not credit skipped range!
      if (delta > 0 && delta <= 2) {
        watchedSecondsRef.current += delta;
      }

      lastTimeRef.current = currentTime;
      checkMilestones(currentTime, currentDuration);
    },
    [checkMilestones, isBuffering, isPlaying]
  );

  const onSeek = useCallback(() => {
    // When seeking, lastTimeRef is reset on the next time update
  }, []);

  const getAccumulatedWatchTime = useCallback(() => {
    return watchedSecondsRef.current;
  }, []);

  // When isPlaying changes to true, trigger watch_start
  useEffect(() => {
    if (isPlaying && contentId) {
      emitMilestone('watch_start');
    }
  }, [contentId, emitMilestone, isPlaying]);

  return {
    onPlay,
    onPause,
    onEnded,
    onTimeUpdate,
    onSeek,
    getAccumulatedWatchTime,
  };
}
