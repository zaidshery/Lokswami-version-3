'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { breakingNews as mockBreakingNews } from '@/lib/mock/data';
import {
  breakingQueuesEqualByOrder,
  buildSpokenBreakingHeadline,
  detectBreakingTtsLanguage,
  normalizeBreakingNewsItem,
  sortBreakingNewsItems,
  type BreakingNewsItem,
} from '@/lib/types/breaking';
import { fetchTtsStatus } from '@/lib/ai/ttsClient';

const BREAKING_LIMIT = 10;
const POLL_INTERVAL_MS = 30_000;
const SILENT_ROTATION_MS = 6_500;
const SPOKEN_HEADLINE_PAUSE_MS = 1_200;
const TTS_FAILURE_HOLD_MS = 4_000;
const TRANSITION_MS = 300;

type UseBreakingNewsControllerOptions = {
  items?: BreakingNewsItem[];
  news?: BreakingNewsItem[];
  preferredLanguage: 'hi' | 'en';
};

type PreparedHeadlineAudio = {
  itemId: string;
  src: string;
  cacheKey: string;
};

type PlaybackOutcome = 'ended' | 'error' | 'cancelled';

function normalizeDedupText(value: string | undefined) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getBreakingDedupKey(item: BreakingNewsItem) {
  const hrefKey = normalizeDedupText(item.href);
  if (hrefKey) {
    return `href:${hrefKey}`;
  }

  return [
    `title:${normalizeDedupText(item.title)}`,
    `city:${normalizeDedupText(item.city)}`,
    `category:${normalizeDedupText(item.category)}`,
  ].join('|');
}

function dedupeBreakingNewsItems(items: BreakingNewsItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getBreakingDedupKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBreakingList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return dedupeBreakingNewsItems(
    sortBreakingNewsItems(
      value
        .map((item) => normalizeBreakingNewsItem(item))
        .filter((item): item is BreakingNewsItem => Boolean(item))
    )
  );
}

function buildFallbackItems() {
  return dedupeBreakingNewsItems(
    sortBreakingNewsItems(
      mockBreakingNews
        .map((item) =>
          normalizeBreakingNewsItem({
            id: item.id,
            title: item.title,
            priority: item.priority,
            href: `/main/article/${encodeURIComponent(item.id)}`,
          })
        )
        .filter((item): item is BreakingNewsItem => Boolean(item))
    )
  );
}

export function useBreakingNewsController({
  items,
  news,
  preferredLanguage,
}: UseBreakingNewsControllerOptions) {
  const hasExternalItems = items !== undefined || news !== undefined;
  const externalItems = useMemo(
    () => normalizeBreakingList((items && items.length ? items : news) || []),
    [items, news]
  );
  const fallbackItems = useMemo(() => buildFallbackItems(), []);

  const [queue, setQueue] = useState<BreakingNewsItem[]>(() =>
    hasExternalItems ? externalItems : []
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animationNonce, setAnimationNonce] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasExternalItems);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);

  const mountedRef = useRef(true);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(0);
  const cancelTokenRef = useRef(0);
  const bufferedItemsRef = useRef<BreakingNewsItem[] | null>(null);
  const activeTimeoutsRef = useRef<Set<number>>(new Set());
  const pollIntervalRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preparedAudioCacheRef = useRef<Map<string, PreparedHeadlineAudio>>(new Map());
  const preloadedAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playbackResolveRef = useRef<((outcome: PlaybackOutcome) => void) | null>(null);
  const soundEnabledRef = useRef(false);
  const ttsAvailableRef = useRef<boolean | null>(null);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    ttsAvailableRef.current = ttsAvailable;
  }, [ttsAvailable]);
  const clearTrackedTimeout = useCallback((timeoutId: number | null) => {
    if (timeoutId === null) return;
    window.clearTimeout(timeoutId);
    activeTimeoutsRef.current.delete(timeoutId);
  }, []);

  const clearAllTrackedTimeouts = useCallback(() => {
    for (const timeoutId of activeTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    activeTimeoutsRef.current.clear();
    transitionTimeoutRef.current = null;
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, ms: number) => {
    const timeoutId = window.setTimeout(() => {
      activeTimeoutsRef.current.delete(timeoutId);
      callback();
    }, ms);
    activeTimeoutsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  const wait = useCallback(
    (ms: number, token: number) =>
      new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          activeTimeoutsRef.current.delete(timeoutId);
          resolve(mountedRef.current && token === cancelTokenRef.current);
        }, ms);
        activeTimeoutsRef.current.add(timeoutId);
      }),
    []
  );

  const stopCurrentAudio = useCallback(
    (reason: PlaybackOutcome = 'cancelled') => {
      const audio = audioRef.current;
      const resolve = playbackResolveRef.current;

      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.currentTime = 0;
        audioRef.current = null;
      }

      playbackResolveRef.current = null;

      if (mountedRef.current) {
        setIsPlaying(false);
      }

      if (resolve) {
        resolve(reason);
      }
    },
    []
  );

  const invalidatePlayback = useCallback(() => {
    cancelTokenRef.current += 1;
    clearAllTrackedTimeouts();
    stopCurrentAudio('cancelled');
    if (mountedRef.current) {
      setIsPreparingAudio(false);
      setIsTransitioning(false);
      setIsPlaying(false);
    }
  }, [clearAllTrackedTimeouts, stopCurrentAudio]);

  const buildPreparedAudioCacheKey = useCallback(
    (item: BreakingNewsItem) => {
      const spokenText = buildSpokenBreakingHeadline(item);
      return [
        item.id,
        spokenText,
        item.ttsAudioUrl || '',
        detectBreakingTtsLanguage(spokenText, preferredLanguage),
      ].join('||');
    },
    [preferredLanguage]
  );

  const rememberPreparedAudio = useCallback((prepared: PreparedHeadlineAudio) => {
    const cache = preparedAudioCacheRef.current;
    cache.set(prepared.cacheKey, prepared);
    while (cache.size > 24) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }, []);

  const primePreparedAudio = useCallback((prepared: PreparedHeadlineAudio) => {
    if (typeof Audio === 'undefined' || !prepared.src || prepared.src.startsWith('data:')) {
      return;
    }

    const cache = preloadedAudioRef.current;
    const existing = cache.get(prepared.cacheKey);
    if (existing) {
      return;
    }

    const audio = new Audio(prepared.src);
    audio.preload = 'auto';
    audio.load();
    cache.set(prepared.cacheKey, audio);

    while (cache.size > 12) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      const oldestAudio = cache.get(oldestKey);
      if (oldestAudio && oldestAudio !== audioRef.current) {
        oldestAudio.pause();
      }
      cache.delete(oldestKey);
    }
  }, []);

  const commitVisibleHeadline = useCallback(
    (nextIndex: number, options?: { animate?: boolean; force?: boolean }) => {
      const normalizedIndex = queueRef.current.length
        ? Math.max(0, Math.min(nextIndex, queueRef.current.length - 1))
        : 0;
      const shouldAnimate = options?.animate ?? true;
      const didChange = currentIndexRef.current !== normalizedIndex;

      currentIndexRef.current = normalizedIndex;

      if (mountedRef.current) {
        setCurrentIndex(normalizedIndex);
      }

      if (!shouldAnimate || (!didChange && !options?.force)) {
        if (mountedRef.current) {
          setIsTransitioning(false);
        }
        return;
      }

      if (mountedRef.current) {
        setAnimationNonce((value) => value + 1);
        setIsTransitioning(true);
      }

      clearTrackedTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = scheduleTimeout(() => {
        if (!mountedRef.current) return;
        setIsTransitioning(false);
      }, TRANSITION_MS);
    },
    [clearTrackedTimeout, scheduleTimeout]
  );

  const replaceQueue = useCallback(
    (nextItems: BreakingNewsItem[], options?: { resetIndex?: boolean }) => {
      queueRef.current = nextItems;
      bufferedItemsRef.current = options?.resetIndex ? null : bufferedItemsRef.current;

      const nextIndex = nextItems.length
        ? options?.resetIndex
          ? 0
          : Math.min(currentIndexRef.current, nextItems.length - 1)
        : 0;

      currentIndexRef.current = nextIndex;

      if (!mountedRef.current) return;
      setQueue(nextItems);
      setCurrentIndex(nextIndex);
      setIsLoading(false);
    },
    []
  );

  const fetchBreakingItems = useCallback(
    async (options?: { fallbackToMock?: boolean }) => {
      try {
        const response = await fetch(`/api/breaking?limit=${BREAKING_LIMIT}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json().catch(() => ({}))) as { items?: unknown };
        const normalized = normalizeBreakingList(payload.items);
        return normalized;
      } catch {
        return options?.fallbackToMock ? fallbackItems : null;
      }
    },
    [fallbackItems]
  );

  const prepareHeadlineAudio = useCallback(
    async (item: BreakingNewsItem): Promise<PreparedHeadlineAudio | null> => {
      const spokenText = buildSpokenBreakingHeadline(item);
      if (!spokenText) return null;
      const cacheKey = buildPreparedAudioCacheKey(item);
      const cached = preparedAudioCacheRef.current.get(cacheKey);
      if (cached) {
        primePreparedAudio(cached);
        return cached;
      }

      if (item.ttsAudioUrl) {
        const prepared = {
          itemId: item.id,
          src: item.ttsAudioUrl,
          cacheKey,
        };
        rememberPreparedAudio(prepared);
        primePreparedAudio(prepared);
        return prepared;
      }

      // Auto-synthesis is decommissioned — manual audio upload required for spoken headlines.
      return null;
    },
    [buildPreparedAudioCacheKey, primePreparedAudio, rememberPreparedAudio]
  );

  const waitForPreparedAudio = useCallback(
    async (item: BreakingNewsItem, promise: Promise<PreparedHeadlineAudio | null>, token: number) => {
      const cacheKey = buildPreparedAudioCacheKey(item);
      const isInstantReady =
        Boolean(item.ttsAudioUrl) || preparedAudioCacheRef.current.has(cacheKey);

      if (!isInstantReady && mountedRef.current) {
        setIsPreparingAudio(true);
      }

      try {
        return await promise;
      } finally {
        if (!isInstantReady && mountedRef.current && token === cancelTokenRef.current) {
          setIsPreparingAudio(false);
        }
      }
    },
    [buildPreparedAudioCacheKey]
  );

  const playPreparedAudio = useCallback(
    async (prepared: PreparedHeadlineAudio, token: number): Promise<PlaybackOutcome> => {
      stopCurrentAudio('cancelled');

      if (!mountedRef.current || token !== cancelTokenRef.current || !soundEnabledRef.current) {
        return 'cancelled';
      }

      return await new Promise<PlaybackOutcome>((resolve) => {
        const audio = preloadedAudioRef.current.get(prepared.cacheKey) || new Audio(prepared.src);
        let settled = false;

        const settle = (outcome: PlaybackOutcome) => {
          if (settled) return;
          settled = true;

          if (audioRef.current === audio) {
            audioRef.current = null;
          }

          if (playbackResolveRef.current === settle) {
            playbackResolveRef.current = null;
          }

          audio.onended = null;
          audio.onerror = null;

          if (mountedRef.current) {
            setIsPlaying(false);
          }

          resolve(outcome);
        };

        audioRef.current = audio;
        audio.preload = 'auto';
        audio.currentTime = 0;
        playbackResolveRef.current = settle;
        audio.onended = () => settle('ended');
        audio.onerror = () => settle('error');

        audio
          .play()
          .then(() => {
            if (!mountedRef.current || token !== cancelTokenRef.current || !soundEnabledRef.current) {
              settle('cancelled');
              return;
            }

            if (mountedRef.current) {
              setIsPlaying(true);
            }
          })
          .catch(() => {
            settle('error');
          });
      });
    },
    [stopCurrentAudio]
  );

  const runSilentCycle = useCallback(
    async (token: number) => {
      if (mountedRef.current) {
        setIsPlaying(false);
      }

      while (
        mountedRef.current &&
        token === cancelTokenRef.current &&
        (!soundEnabledRef.current || ttsAvailableRef.current !== true)
      ) {
        const activeQueue = queueRef.current;
        if (!activeQueue.length) return;

        const completed = await wait(SILENT_ROTATION_MS, token);
        if (!completed) return;

        const isLastHeadline = currentIndexRef.current >= activeQueue.length - 1;
        const nextBufferedQueue = isLastHeadline ? bufferedItemsRef.current : null;

        if (nextBufferedQueue?.length) {
          bufferedItemsRef.current = null;
          replaceQueue(nextBufferedQueue, { resetIndex: true });
          commitVisibleHeadline(0, { animate: true, force: true });
          continue;
        }

        if (activeQueue.length <= 1) {
          commitVisibleHeadline(0, { animate: false, force: false });
          continue;
        }

        const nextIndex = isLastHeadline ? 0 : currentIndexRef.current + 1;
        commitVisibleHeadline(nextIndex, { animate: true });
      }
    },
    [commitVisibleHeadline, replaceQueue, wait]
  );

  const runSpokenCycle = useCallback(
    async (token: number) => {
      let activeQueue = queueRef.current;
      if (!activeQueue.length) return;

      let workingIndex = Math.min(currentIndexRef.current, activeQueue.length - 1);
      let currentItem = activeQueue[workingIndex];
      let preparedCurrent = await waitForPreparedAudio(
        currentItem,
        prepareHeadlineAudio(currentItem),
        token
      );

      while (mountedRef.current && token === cancelTokenRef.current && soundEnabledRef.current) {
        activeQueue = queueRef.current;
        if (!activeQueue.length) return;

        if (workingIndex >= activeQueue.length) {
          workingIndex = 0;
        }

        currentItem = activeQueue[workingIndex];

        const isLastHeadline = workingIndex >= activeQueue.length - 1;
        const bufferedQueue = isLastHeadline ? bufferedItemsRef.current : null;
        const nextQueue = bufferedQueue?.length ? bufferedQueue : activeQueue;
        const nextIndex = bufferedQueue?.length ? 0 : isLastHeadline ? 0 : workingIndex + 1;
        const nextItem = nextQueue[nextIndex];
        const nextPreparedPromise = nextItem
          ? prepareHeadlineAudio(nextItem)
          : Promise.resolve<PreparedHeadlineAudio | null>(null);

        commitVisibleHeadline(workingIndex, {
          animate: currentIndexRef.current !== workingIndex,
          force:
            activeQueue[currentIndexRef.current]?.id !== currentItem.id ||
            activeQueue[currentIndexRef.current]?.title !== currentItem.title,
        });

        if (preparedCurrent) {
          const outcome = await playPreparedAudio(preparedCurrent, token);
          if (outcome === 'cancelled' || token !== cancelTokenRef.current || !soundEnabledRef.current) {
            return;
          }

          const resumed = await wait(
            outcome === 'ended' ? SPOKEN_HEADLINE_PAUSE_MS : TTS_FAILURE_HOLD_MS,
            token
          );
          if (!resumed) return;
        } else {
          const resumed = await wait(TTS_FAILURE_HOLD_MS, token);
          if (!resumed) return;
        }

        if (bufferedQueue?.length) {
          bufferedItemsRef.current = null;
          replaceQueue(bufferedQueue, { resetIndex: true });
          workingIndex = 0;
        } else {
          workingIndex = nextIndex;
        }

        preparedCurrent = nextItem
          ? await waitForPreparedAudio(nextItem, nextPreparedPromise, token)
          : null;
      }
    },
    [
      commitVisibleHeadline,
      playPreparedAudio,
      prepareHeadlineAudio,
      replaceQueue,
      wait,
      waitForPreparedAudio,
    ]
  );

  const toggleSound = useCallback(() => {
    if (ttsAvailableRef.current === false) {
      setSoundEnabled(false);
      return;
    }

    setSoundEnabled((previous) => !previous);
  }, []);

  useEffect(() => {
    if (ttsAvailable === false && soundEnabledRef.current) {
      setSoundEnabled(false);
    }
  }, [ttsAvailable]);

  useEffect(() => {
    const preparedAudioCache = preparedAudioCacheRef.current;
    const preloadedAudio = preloadedAudioRef.current;

    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
      }
      clearAllTrackedTimeouts();
      preparedAudioCache.clear();
      preloadedAudio.clear();
      stopCurrentAudio('cancelled');
    };
  }, [clearAllTrackedTimeouts, stopCurrentAudio]);

  useEffect(() => {
    let active = true;

    const loadTtsStatus = async () => {
      try {
        const payload = await fetchTtsStatus();
        if (!active || !mountedRef.current) return;
        setTtsAvailable(Boolean(payload.configured));
      } catch {
        if (!active || !mountedRef.current) return;
        setTtsAvailable(false);
      }
    };

    void loadTtsStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasExternalItems) return;

    bufferedItemsRef.current = null;
    replaceQueue(externalItems, { resetIndex: true });
    commitVisibleHeadline(0, { animate: false, force: true });
    setIsLoading(false);
  }, [commitVisibleHeadline, externalItems, hasExternalItems, replaceQueue]);

  useEffect(() => {
    if (hasExternalItems) return;

    let active = true;

    const loadInitialItems = async () => {
      if (mountedRef.current) {
        setIsLoading(true);
      }

      const initialItems = await fetchBreakingItems({ fallbackToMock: true });
      if (!active || !mountedRef.current || !initialItems) return;

      replaceQueue(initialItems, { resetIndex: true });
      commitVisibleHeadline(0, { animate: false, force: true });
    };

    const pollForUpdates = async () => {
      const nextItems = await fetchBreakingItems({ fallbackToMock: false });
      if (!active || !mountedRef.current || !nextItems) return;

      if (
        breakingQueuesEqualByOrder(nextItems, queueRef.current) ||
        breakingQueuesEqualByOrder(nextItems, bufferedItemsRef.current || [])
      ) {
        return;
      }

      if (!nextItems.length) {
        invalidatePlayback();
        replaceQueue([], { resetIndex: true });
        return;
      }

      bufferedItemsRef.current = nextItems;
    };

    void loadInitialItems();

    pollIntervalRef.current = window.setInterval(() => {
      void pollForUpdates();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [
    commitVisibleHeadline,
    fetchBreakingItems,
    hasExternalItems,
    invalidatePlayback,
    replaceQueue,
  ]);

  useEffect(() => {
    if (!queue.length) return;

    invalidatePlayback();
    const token = cancelTokenRef.current;
    const canSpeak = soundEnabled && ttsAvailable === true;

    if (canSpeak) {
      void runSpokenCycle(token);
      return;
    }

    void runSilentCycle(token);
  }, [invalidatePlayback, queue.length, runSilentCycle, runSpokenCycle, soundEnabled, ttsAvailable]);

  useEffect(() => {
    if (ttsAvailable !== true || !queue.length) return;

    const activeItem = queue[currentIndex] || queue[0];
    const nextItem = queue.length > 1 ? queue[(currentIndex + 1) % queue.length] : null;

    if (activeItem) {
      void prepareHeadlineAudio(activeItem);
    }

    if (nextItem && nextItem.id !== activeItem?.id) {
      void prepareHeadlineAudio(nextItem);
    }
  }, [currentIndex, prepareHeadlineAudio, queue, ttsAvailable]);

  const visibleItem = queue[currentIndex] || null;

  return {
    currentIndex,
    isLoading,
    isPlaying,
    isPreparingAudio,
    isTransitioning,
    queue,
    soundEnabled,
    toggleSound,
    transitionMs: TRANSITION_MS,
    ttsAvailable,
    visibleItem,
    visibleKey: visibleItem ? `${visibleItem.id}-${animationNonce}` : `empty-${animationNonce}`,
  };
}
