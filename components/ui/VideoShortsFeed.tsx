'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Pause,
  Play,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { buildVideoReaderPath } from '@/lib/utils/readerContentPaths';
import formatNumber from '@/lib/utils/formatNumber';
import ShareMenu from '@/components/ui/ShareMenu';

const IMMERSIVE_VIEWPORT_HEIGHT_CLASS = 'h-vh-dvh h-dvh';
const SHORTS_SETTINGS_KEY = 'lokswami.shorts.settings.v1';
const PLAYBACK_SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2] as const;

type PlaybackSpeed = (typeof PLAYBACK_SPEED_OPTIONS)[number];
type SettingsPanelView = 'main' | 'playback-speed';

type ShortsSettings = {
  autoAdvance: boolean;
  captions: boolean;
  defaultVolume: number;
  muteByDefault: boolean;
  playbackSpeed: PlaybackSpeed;
  dataSaver: boolean;
};

export interface ShortsVideoItem {
  id: string;
  slug?: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  category: string;
  views: number;
  publishedAt: string;
  shortsRank: number;
}

interface VideoShortsFeedProps {
  videos: ShortsVideoItem[];
  language: 'hi' | 'en';
  immersiveMode?: boolean;
  onReachEnd?: () => void;
  initialVideoId?: string;
  onClose?: () => void;
}

function getYouTubeId(urlString: string) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.replace('www.', '');

    if (host === 'youtu.be') {
      return url.pathname.slice(1) || null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v');

      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] || null;
      }

      if (url.pathname.startsWith('/embed/')) {
        return url.pathname.split('/')[2] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function formatPlaybackTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00';
  }

  const safeTotalSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(safeTotalSeconds / 3600);
  const minutes = Math.floor((safeTotalSeconds % 3600) / 60);
  const seconds = safeTotalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds
    ).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 70;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizePlaybackSpeed(value: unknown): PlaybackSpeed {
  const numeric = Number(value);
  if (PLAYBACK_SPEED_OPTIONS.includes(numeric as PlaybackSpeed)) {
    return numeric as PlaybackSpeed;
  }
  return 1;
}

function formatPlaybackSpeedLabel(speed: PlaybackSpeed) {
  if (speed === 1) return '1x / Normal';
  return `${speed}x`;
}

function normalizeShortsSettings(source: unknown): ShortsSettings {
  if (!source || typeof source !== 'object') {
    return {
      autoAdvance: true,
      captions: true,
      defaultVolume: 70,
      muteByDefault: true,
      playbackSpeed: 1,
      dataSaver: false,
    };
  }

  const raw = source as Record<string, unknown>;

  return {
    autoAdvance: raw.autoAdvance !== false,
    captions: raw.captions !== false,
    defaultVolume: clampVolume(Number(raw.defaultVolume)),
    muteByDefault: raw.muteByDefault !== false,
    playbackSpeed: normalizePlaybackSpeed(raw.playbackSpeed),
    dataSaver: raw.dataSaver === true,
  };
}

export default function VideoShortsFeed({
  videos,
  language,
  immersiveMode = false,
  onReachEnd,
  initialVideoId,
  onClose,
}: VideoShortsFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const iframeRefs = useRef<Array<HTMLIFrameElement | null>>([]);
  const actionPillRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const didSwipeRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const hasHydratedSettingsRef = useRef(false);
  const lastAutoReachEndLengthRef = useRef(-1);

  const initialIndex = useMemo(() => {
    if (!initialVideoId) return 0;
    const found = videos.findIndex((v) => v.id === initialVideoId || v.slug === initialVideoId);
    return found >= 0 ? found : 0;
  }, [initialVideoId, videos]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [rippleState, setRippleState] = useState<'play' | 'pause' | null>(null);
  const rippleTimerRef = useRef<number | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPanelView, setSettingsPanelView] = useState<SettingsPanelView>('main');
  const [isVolumeExpanded, setIsVolumeExpanded] = useState(false);
  const [settings, setSettings] = useState<ShortsSettings>(() =>
    normalizeShortsSettings(null)
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [currentTimeById, setCurrentTimeById] = useState<Record<string, number>>({});
  const [durationById, setDurationById] = useState<Record<string, number>>({});

  useEffect(() => {
    setIsHydrated(true);
    try {
      const stored = window.localStorage.getItem('lokswami.video.watch-later.v1');
      if (stored) setSavedIds(JSON.parse(stored));
    } catch {
      // Safe ignore
    }
  }, []);

  const toggleSave = (videoId: string) => {
    setSavedIds((prev) => {
      const next = { ...prev, [videoId]: !prev[videoId] };
      try {
        window.localStorage.setItem('lokswami.video.watch-later.v1', JSON.stringify(next));
      } catch {
        // Safe ignore
      }
      return next;
    });
  };

  const triggerRipple = useCallback((type: 'play' | 'pause') => {
    setRippleState(type);
    if (rippleTimerRef.current !== null) {
      window.clearTimeout(rippleTimerRef.current);
    }
    rippleTimerRef.current = window.setTimeout(() => {
      setRippleState(null);
    }, 450);
  }, []);

  useEffect(() => {
    if (activeIndex <= videos.length - 1) return;
    setActiveIndex(Math.max(0, videos.length - 1));
  }, [videos.length, activeIndex]);

  useEffect(() => {
    if (!onReachEnd || videos.length === 0) return;
    if (activeIndex < Math.max(0, videos.length - 2)) return;
    if (lastAutoReachEndLengthRef.current === videos.length) return;

    lastAutoReachEndLengthRef.current = videos.length;
    onReachEnd();
  }, [activeIndex, onReachEnd, videos.length]);

  useEffect(() => {
    setIsPaused(false);
  }, [activeIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(SHORTS_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        const next = normalizeShortsSettings(parsed);
        setSettings(next);
        setIsMuted(true);
      }
    } catch {
      // Ignore invalid persisted settings.
    } finally {
      hasHydratedSettingsRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedSettingsRef.current || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SHORTS_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage write issues.
    }
  }, [settings]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsPanelRef.current?.contains(target)) return;
      if (actionPillRef.current?.contains(target)) return;
      setIsSettingsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!settings.muteByDefault) return;
    setIsMuted(true);
  }, [settings.muteByDefault]);

  const updateSettings = useCallback(
    (updater: (previous: ShortsSettings) => ShortsSettings) => {
      setSettings((previous) => updater(previous));
    },
    []
  );

  const applyNativeVideoPreferences = useCallback(
    (video: HTMLVideoElement | null, mutedState: boolean) => {
      if (!video) return;
      video.playbackRate = settings.playbackSpeed;
      video.defaultPlaybackRate = settings.playbackSpeed;
      video.volume = settings.defaultVolume / 100;
      video.muted = mutedState;
    },
    [settings.defaultVolume, settings.playbackSpeed]
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diff < 60) {
      return language === 'hi' ? `${diff} मिनट पहले` : `${diff} min ago`;
    }

    if (diff < 1440) {
      const hours = Math.floor(diff / 60);
      return language === 'hi' ? `${hours} घंटे पहले` : `${hours}h ago`;
    }

    const days = Math.floor(diff / 1440);
    return language === 'hi' ? `${days} दिन पहले` : `${days}d ago`;
  };

  const renderTime = (dateString?: string) => {
    if (!dateString) return '';
    if (!isHydrated) return '';
    return formatTime(dateString);
  };

  const effectiveMuted = isMuted;

  const actionIconButtonClass =
    'flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:h-12 md:w-12';

  const actionPillPositionClass = immersiveMode
    ? 'right-3 bottom-[calc(var(--reader-bottom-nav-space)+4rem)] md:right-5 md:bottom-[calc(var(--reader-bottom-nav-space)+4.5rem)]'
    : 'right-3 bottom-[calc(var(--reader-bottom-nav-space)+1.5rem)] md:right-5 md:bottom-[calc(var(--reader-bottom-nav-space)+2rem)]';

  const settingsRowClass =
    'flex h-12 w-full items-center justify-between rounded-xl px-3 text-left transition-colors hover:bg-white/5 active:bg-white/10 md:h-14 md:px-4';

  const sendYouTubeCommand = (
    iframe: HTMLIFrameElement | null,
    command: 'playVideo' | 'pauseVideo' | 'mute' | 'unMute',
    args: unknown[] = []
  ) => {
    try {
      iframe?.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: command,
          args,
        }),
        '*'
      );
    } catch {
      // Safe catch
    }
  };

  const toggleActivePlayback = () => {
    const current = videos[activeIndex];
    if (!current) return;

    const isYouTube = Boolean(getYouTubeId(current.videoUrl));
    if (isYouTube) {
      const iframe = iframeRefs.current[activeIndex];
      if (!iframe) return;

      if (isPaused) {
        sendYouTubeCommand(iframe, 'playVideo');
        sendYouTubeCommand(iframe, effectiveMuted ? 'mute' : 'unMute');
        setIsPaused(false);
        triggerRipple('play');
        return;
      }

      sendYouTubeCommand(iframe, 'pauseVideo');
      setIsPaused(true);
      triggerRipple('pause');
      return;
    }

    const video = videoRefs.current[activeIndex];
    if (!video) return;

    if (video.paused) {
      applyNativeVideoPreferences(video, effectiveMuted);
      void video.play().catch(() => undefined);
      setIsPaused(false);
      triggerRipple('play');
    } else {
      video.pause();
      setIsPaused(true);
      triggerRipple('pause');
    }
  };

  const scrollToIndex = useCallback((index: number) => {
    if (!videos.length) return;
    if (index > videos.length - 1) {
      onReachEnd?.();
    }

    const nextIndex = Math.max(0, Math.min(index, videos.length - 1));
    const target = cardRefs.current[nextIndex];
    if (!target) return;

    isAnimatingRef.current = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    window.setTimeout(() => {
      isAnimatingRef.current = false;
    }, 450);
  }, [onReachEnd, videos.length]);

  useEffect(() => {
    if (initialIndex > 0) {
      scrollToIndex(initialIndex);
    }
  }, [initialIndex, scrollToIndex]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target as HTMLElement;
          const nextIndex = Number(target.dataset.index);
          if (!Number.isFinite(nextIndex)) return;

          setActiveIndex((prev) => {
            if (prev === nextIndex) return prev;
            return nextIndex;
          });
        });
      },
      {
        root: feedRef.current,
        threshold: 0.65,
      }
    );

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card);
    });

    return () => observer.disconnect();
  }, [videos.length]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      if (isAnimatingRef.current) return;
      if (Math.abs(event.deltaY) < 10) return;

      event.preventDefault();
      scrollToIndex(activeIndex + (event.deltaY > 0 ? 1 : -1));
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      scrollToIndex(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndex) {
        applyNativeVideoPreferences(video, effectiveMuted);
        if (isPaused) {
          video.pause();
          return;
        }
        void video.play().catch(() => undefined);
        return;
      }

      video.pause();
    });
  }, [activeIndex, effectiveMuted, isPaused, applyNativeVideoPreferences]);

  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe) return;

      if (index === activeIndex) {
        if (!isPaused) {
          sendYouTubeCommand(iframe, 'playVideo');
          sendYouTubeCommand(iframe, effectiveMuted ? 'mute' : 'unMute');
          return;
        }
        sendYouTubeCommand(iframe, 'pauseVideo');
        return;
      }

      sendYouTubeCommand(iframe, 'mute');
      sendYouTubeCommand(iframe, 'pauseVideo');
    });
  }, [activeIndex, effectiveMuted, isPaused]);

  const handleSurfaceToggle = (index: number) => {
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }

    if (index !== activeIndex) return;

    toggleActivePlayback();
  };

  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    const current = videos[activeIndex];
    if (!current) return;

    const isYouTube = Boolean(getYouTubeId(current.videoUrl));
    if (isYouTube) {
      const iframe = iframeRefs.current[activeIndex];
      if (iframe) {
        sendYouTubeCommand(iframe, nextMuted ? 'mute' : 'unMute');
        if (!nextMuted) {
          sendYouTubeCommand(iframe, 'unMute');
        }
      }
    } else {
      const video = videoRefs.current[activeIndex];
      if (video) {
        video.muted = nextMuted;
        if (!nextMuted) {
          video.volume = settings.defaultVolume / 100 || 1;
        }
      }
    }
  };

  const handleVideoLoadedMetadata = (videoId: string, fallbackDuration: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const element = event.currentTarget;
    applyNativeVideoPreferences(element, effectiveMuted);
    const resolvedDuration =
      Number.isFinite(element.duration) && element.duration > 0 ? element.duration : fallbackDuration;

    setDurationById((prev) => {
      if (prev[videoId] === resolvedDuration) return prev;
      return { ...prev, [videoId]: resolvedDuration };
    });
  };

  const handleVideoDurationChange = (videoId: string, fallbackDuration: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const element = event.currentTarget;
    applyNativeVideoPreferences(element, effectiveMuted);
    const resolvedDuration =
      Number.isFinite(element.duration) && element.duration > 0 ? element.duration : fallbackDuration;

    setDurationById((prev) => {
      if (prev[videoId] === resolvedDuration) return prev;
      return { ...prev, [videoId]: resolvedDuration };
    });
  };

  const handleVideoTimeUpdate = (videoId: string, index: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (index !== activeIndex) return;
    const element = event.currentTarget;
    const currentTime = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    setCurrentTimeById((prev) => ({ ...prev, [videoId]: currentTime }));
  };

  const handleVideoPause = (index: number) => {
    if (index === activeIndex) {
      setIsPaused(true);
    }
  };

  const handleVideoPlay = (videoId: string, index: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const element = event.currentTarget;
    applyNativeVideoPreferences(element, effectiveMuted);
    if (index === activeIndex) {
      setIsPaused(false);
      setCurrentTimeById((prev) => ({ ...prev, [videoId]: element.currentTime || 0 }));
    }
  };

  const handleVideoEnded = (index: number) => {
    if (index !== activeIndex) return;
    if (!settings.autoAdvance) {
      setIsPaused(true);
      return;
    }
    scrollToIndex(activeIndex + 1);
  };

  const openSettingsPanel = () => {
    setSettingsPanelView('main');
    setIsSettingsOpen(true);
  };

  const closeSettingsPanel = () => {
    setIsSettingsOpen(false);
    setIsVolumeExpanded(false);
  };

  const activeVideo = videos[activeIndex] || null;
  const activeReadHref = activeVideo
    ? buildVideoReaderPath(activeVideo.id, activeVideo.title)
    : '/main/videos';

  const originParam = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';

  return (
    <section
      className={`relative w-full overflow-hidden bg-black text-white ${
        immersiveMode ? IMMERSIVE_VIEWPORT_HEIGHT_CLASS : 'h-screen'
      }`}
      aria-label="Video Shorts Feed"
    >
      <div className="relative h-full w-full">
        {/* Vertical Snap Scroll Feed */}
        <div
          ref={feedRef}
          className="relative h-full w-full overflow-y-scroll snap-y snap-mandatory touch-pan-y scroll-smooth no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (!touch) return;
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            didSwipeRef.current = false;
          }}
          onTouchMove={(event) => {
            if (!touchStartRef.current) return;
            const touch = event.touches[0];
            if (!touch) return;

            const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
            const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
            if (deltaY > 10 || deltaX > 10) {
              didSwipeRef.current = true;
            }
          }}
          onTouchEnd={() => {
            touchStartRef.current = null;
          }}
        >
          {videos.map((video, index) => {
            const youtubeId = getYouTubeId(video.videoUrl);
            const isYouTube = Boolean(youtubeId);
            const isCurrent = index === activeIndex;
            const readHref = buildVideoReaderPath(video.id, video.title);
            const currentSeconds = currentTimeById[video.id] || 0;
            const totalDuration = durationById[video.id] || video.duration || 0;
            const progressPercent =
              totalDuration > 0 ? Math.min(100, (currentSeconds / totalDuration) * 100) : 0;

            return (
              <article
                key={video.id}
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                data-index={index}
                className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black"
                style={{ height: '100%' }}
              >
                {/* Media Surface */}
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  {isYouTube ? (
                    <iframe
                      ref={(el) => {
                        iframeRefs.current[index] = el;
                      }}
                      title={video.title}
                      src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&playsinline=1&controls=0&mute=1&loop=1&playlist=${youtubeId}&autoplay=${
                        isCurrent ? 1 : 0
                      }&rel=0&modestbranding=1&origin=${originParam}`}
                      className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      ref={(el) => {
                        videoRefs.current[index] = el;
                      }}
                      src={video.videoUrl}
                      poster={video.thumbnail}
                      playsInline
                      muted={effectiveMuted}
                      loop
                      className="h-full w-full object-cover"
                      preload={index <= activeIndex + 1 ? 'metadata' : 'none'}
                      autoPlay={isCurrent}
                      onLoadedMetadata={(event) =>
                        handleVideoLoadedMetadata(video.id, video.duration, event)
                      }
                      onDurationChange={(event) =>
                        handleVideoDurationChange(video.id, video.duration, event)
                      }
                      onTimeUpdate={(event) => handleVideoTimeUpdate(video.id, index, event)}
                      onPause={() => handleVideoPause(index)}
                      onPlay={(event) => handleVideoPlay(video.id, index, event)}
                      onEnded={() => handleVideoEnded(index)}
                    />
                  )}
                </div>

                {/* Surface Touch / Click Interceptor */}
                <button
                  type="button"
                  onClick={() => handleSurfaceToggle(index)}
                  className="absolute inset-0 z-10 cursor-default bg-transparent focus:outline-none"
                  aria-label={isPaused ? 'Play video' : 'Pause video'}
                />

                {/* Center Ripple Animation (YouTube Shorts Style) */}
                {isCurrent && rippleState && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/60 text-white shadow-2xl backdrop-blur-md animate-ping duration-300">
                      {rippleState === 'play' ? (
                        <Play className="h-10 w-10 fill-current translate-x-0.5" />
                      ) : (
                        <Pause className="h-10 w-10 fill-current" />
                      )}
                    </div>
                  </div>
                )}

                {/* Bottom Caption & Channel Overlay */}
                <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pt-12 pb-[calc(var(--reader-bottom-nav-space)+1.25rem)]">
                  <div className="max-w-[82%] space-y-2">
                    {/* Channel Row (avatar removed) */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white drop-shadow">लोकस्वामी न्यूज़</span>
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-black text-white">✓</span>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                        {video.category}
                      </span>
                    </div>

                    {/* Video Title */}
                    <h2 className="line-clamp-2 text-sm sm:text-base font-bold leading-snug text-white drop-shadow-md">
                      {video.title}
                    </h2>

                    {/* Description snippet */}
                    {video.description && (
                      <p className="line-clamp-1 text-xs text-zinc-300 drop-shadow">
                        {video.description}
                      </p>
                    )}

                    {/* Primary CTA Button (160d ago & 0 views removed) */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Link
                        href={readHref}
                        className="reader-touch-link pointer-events-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition active:scale-95"
                      >
                        <span>{language === 'hi' ? 'पूरी खबर पढ़ें' : 'Read Story'}</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Bottom Red Scrubber Line */}
                <div className="absolute inset-x-0 bottom-0 z-30 h-1 bg-white/20">
                  <div
                    className="h-full bg-[#ff0000] transition-[width] duration-100"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>

        {/* Floating Right Action Rail */}
        {activeVideo ? (
          <div
            ref={actionPillRef}
            className={`absolute z-30 pointer-events-auto ${actionPillPositionClass}`}
            data-swipe-ignore="true"
          >
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md md:gap-4 md:p-3">
              {/* Sound / Mute Toggle */}
              <button
                type="button"
                onClick={handleMuteToggle}
                className={actionIconButtonClass}
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                data-swipe-ignore="true"
              >
                {isMuted ? (
                  <VolumeX className="h-[22px] w-[22px] md:h-[26px] md:w-[26px]" />
                ) : (
                  <Volume2 className="h-[22px] w-[22px] md:h-[26px] md:w-[26px]" />
                )}
              </button>

              {/* Watch Later / Save Bookmark */}
              <button
                type="button"
                onClick={() => toggleSave(activeVideo.id)}
                className={actionIconButtonClass}
                aria-label={savedIds[activeVideo.id] ? 'Saved to Watch Later' : 'Save to Watch Later'}
                data-swipe-ignore="true"
              >
                {savedIds[activeVideo.id] ? (
                  <BookmarkCheck className="h-[22px] w-[22px] text-red-500 md:h-[26px] md:w-[26px]" />
                ) : (
                  <Bookmark className="h-[22px] w-[22px] md:h-[26px] md:w-[26px]" />
                )}
              </button>

              {/* Share Menu */}
              <div data-swipe-ignore="true">
                <ShareMenu
                  title={activeVideo.title}
                  url={activeReadHref}
                  text={`Lokswami News - ${activeVideo.title}`}
                  whatsappText={`Lokswami News - ${activeVideo.title}`}
                  contentType="video"
                  contentId={activeVideo.id}
                  placement="video_shorts_actions"
                  language={language}
                  triggerLabel={language === 'hi' ? 'शेयर' : 'Share'}
                  ariaLabel={language === 'hi' ? 'शेयर करने का तरीका चुनें' : 'Choose how to share video'}
                  buttonClassName={`${actionIconButtonClass} [&>span]:sr-only [&>svg]:h-[22px] [&>svg]:w-[22px] md:[&>svg]:h-[26px] md:[&>svg]:w-[26px]`}
                />
              </div>

              {/* Settings Drawer Trigger */}
              <button
                type="button"
                onClick={() => {
                  if (isSettingsOpen) {
                    closeSettingsPanel();
                    return;
                  }
                  openSettingsPanel();
                }}
                className={actionIconButtonClass}
                aria-label={language === 'hi' ? 'सेटिंग्स' : 'Settings'}
                data-swipe-ignore="true"
              >
                <SlidersHorizontal className="h-[22px] w-[22px] md:h-[26px] md:w-[26px]" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Settings Drawer Sheet */}
        {isSettingsOpen && activeVideo ? (
          <div
            ref={settingsPanelRef}
            className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-white/10 bg-black/90 p-4 shadow-2xl backdrop-blur-xl md:inset-x-auto md:right-4 md:bottom-24 md:w-80 md:rounded-2xl md:border"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">
                {language === 'hi' ? 'प्लेबैक सेटिंग्स' : 'Playback Settings'}
              </h3>
              <button
                type="button"
                onClick={closeSettingsPanel}
                className="rounded-full p-1 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-1">
              {settingsPanelView === 'main' ? (
                <>
                  {/* Auto-Advance Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings((prev) => ({ ...prev, autoAdvance: !prev.autoAdvance }))
                    }
                    className={settingsRowClass}
                  >
                    <span className="inline-flex items-center gap-2.5 text-sm text-white md:text-base">
                      <Clock3 className="h-5 w-5 md:h-6 md:w-6" />
                      {language === 'hi' ? 'ऑटो-एडवांस' : 'Auto-advance'}
                    </span>
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        settings.autoAdvance ? 'bg-red-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          settings.autoAdvance ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                  </button>

                  {/* Captions Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings((prev) => ({ ...prev, captions: !prev.captions }))
                    }
                    className={settingsRowClass}
                  >
                    <span className="inline-flex items-center gap-2.5 text-sm text-white md:text-base">
                      <Eye className="h-5 w-5 md:h-6 md:w-6" />
                      {language === 'hi' ? 'कैप्शन' : 'Captions'}
                    </span>
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        settings.captions ? 'bg-red-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          settings.captions ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                  </button>

                  {/* Playback Speed Submenu Trigger */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsVolumeExpanded(false);
                      setSettingsPanelView('playback-speed');
                    }}
                    className={settingsRowClass}
                  >
                    <span className="inline-flex items-center gap-2.5 text-sm text-white md:text-base">
                      <Play className="h-5 w-5 md:h-6 md:w-6" />
                      {language === 'hi' ? 'प्लेबैक स्पीड' : 'Playback speed'}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs text-white/60 md:text-sm">
                      {formatPlaybackSpeedLabel(settings.playbackSpeed)}
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </button>
                </>
              ) : null}

              {/* Playback Speed Options View */}
              {settingsPanelView === 'playback-speed' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSettingsPanelView('main')}
                    className={settingsRowClass}
                  >
                    <span className="inline-flex items-center gap-2.5 text-sm text-white md:text-base">
                      <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
                      {language === 'hi' ? 'प्लेबैक स्पीड' : 'Playback speed'}
                    </span>
                  </button>

                  {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => {
                        updateSettings((prev) => ({ ...prev, playbackSpeed: speed }));
                        setSettingsPanelView('main');
                      }}
                      className={`${settingsRowClass} ${
                        settings.playbackSpeed === speed ? 'bg-white/10 text-white' : 'text-white/90'
                      }`}
                    >
                      <span className="text-sm md:text-base">{formatPlaybackSpeedLabel(speed)}</span>
                      {settings.playbackSpeed === speed ? <Check className="h-4 w-4 md:h-5 md:w-5" /> : null}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
