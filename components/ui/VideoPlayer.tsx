'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import {
  buildYouTubeEmbedUrl,
  extractYouTubeVideoId,
  isYouTubeLiveUrl,
} from '@/lib/utils/youtube';

const LOCAL_PROGRESS_PREFIX = 'lokswami.video.progress.v1';
const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

export type VideoPlayerHandle = {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  requestFullscreen: () => void;
};

type YouTubePlayer = {
  destroy: () => void;
  getAvailablePlaybackRates: () => number[];
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  stopVideo?: () => void;
  unMute: () => void;
};

type YouTubePlayerEvent<T = undefined> = {
  data: T;
  target: YouTubePlayer;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onAutoplayBlocked?: () => void;
        onPlaybackRateChange?: (event: YouTubePlayerEvent<number>) => void;
        onReady: (event: YouTubePlayerEvent) => void;
        onStateChange: (event: YouTubePlayerEvent<number>) => void;
      };
    }
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
    PAUSED: number;
    PLAYING: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidMediaSource(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('blob:')
  ) {
    return false;
  }
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/');
}

function getYouTubeTargetOrigin(src?: string): string {
  if (!src) return 'https://www.youtube-nocookie.com';
  try {
    const origin = new URL(src).origin;
    if (origin.endsWith('.youtube.com') || origin.endsWith('.youtube-nocookie.com')) {
      return origin;
    }
  } catch {
    // fallback
  }
  return 'https://www.youtube-nocookie.com';
}

function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube iframe API requires a browser.'));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    const timeoutId = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error('YouTube iframe API did not load in time.'));
    }, 15000);

    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      if (!window.YT?.Player) return;
      window.clearTimeout(timeoutId);
      resolve(window.YT);
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`
    );
    if (existingScript) {
      return;
    }

    const script = document.createElement('script');
    script.src = YOUTUBE_IFRAME_API_SRC;
    script.async = true;
    script.addEventListener(
      'error',
      () => {
        window.clearTimeout(timeoutId);
        youtubeApiPromise = null;
        reject(new Error('Failed to load the YouTube iframe API.'));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

export interface VideoPlayerProps {
  videoId: string;
  title: string;
  src: string;
  poster?: string;
  fallbackDuration?: number;
  isActive: boolean;
  isPaused: boolean;
  isMuted: boolean;
  autoAdvance: boolean;
  playbackRate: number;
  defaultVolume: number;
  captionsEnabled: boolean;
  shouldPersistProgress?: boolean;
  startTime?: number;
  seekTargetTime?: number;
  isLive?: boolean;
  isShort?: boolean;
  className?: string;
  onPausedChange: (paused: boolean) => void;
  // Provider events only; playback requests never confirm playback.
  onPlaybackChange?: (playing: boolean) => void;
  onMutedChange: (muted: boolean) => void;
  onTimeChange: (currentTime: number, duration: number) => void;
  onSeeking?: () => void;
  onEnded: () => void;
  onPlaybackRateChange?: (speed: number) => void;
  onCaptionsChange?: (enabled: boolean) => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  {
    videoId,
    title,
    src,
    poster,
    fallbackDuration = 0,
    isActive,
    isPaused,
    isMuted,
    autoAdvance,
    playbackRate,
    defaultVolume,
    captionsEnabled,
    shouldPersistProgress = false,
    startTime = 0,
    seekTargetTime,
    isLive,
    isShort = false,
    className = '',
    onPausedChange,
    onPlaybackChange,
    onMutedChange,
    onTimeChange,
    onSeeking,
    onEnded,
    onPlaybackRateChange,
    onCaptionsChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const youtubeReadyRef = useRef(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [errorClassification, setErrorClassification] = useState<string>('generic');
  const [retryCount, setRetryCount] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const bufferTimerRef = useRef<number | null>(null);
  const wasManuallyPausedRef = useRef(isPaused);
  const pausedByVisibilityRef = useRef(false);

  useEffect(() => {
    if (!pausedByVisibilityRef.current) wasManuallyPausedRef.current = isPaused;
  }, [isPaused]);

  // Network offline/online tracking
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      callbacksRef.current.onPausedChange(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Document visibility handling (pause on background, resume if not manually paused)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (!controlsRef.current.isPaused) {
          pausedByVisibilityRef.current = true;
          callbacksRef.current.onPausedChange(true);
        }
      } else {
        if (pausedByVisibilityRef.current) {
          pausedByVisibilityRef.current = false;
          if (!wasManuallyPausedRef.current && controlsRef.current.isActive) {
            callbacksRef.current.onPausedChange(false);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    return () => {
      if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
    };
  }, []);

  const callbacksRef = useRef({
    onPlaybackChange,
    onCaptionsChange,
    onEnded,
    onMutedChange,
    onPausedChange,
    onPlaybackRateChange,
    onTimeChange,
    onSeeking,
  });
  const controlsRef = useRef({
    defaultVolume,
    isActive,
    isMuted,
    isPaused,
    playbackRate,
    startTime,
  });
  const youtubeId = useMemo(() => extractYouTubeVideoId(src), [src]);
  const isLiveStream = Boolean(isLive || isYouTubeLiveUrl(src));
  const isYouTube = Boolean(youtubeId);

  useEffect(() => {
    if (!isYouTube && src && !isValidMediaSource(src)) {
      setPlaybackError(true);
      setErrorClassification('not_supported');
      return;
    }
    setPlaybackError(false);
    setErrorClassification('generic');
    setRetryCount(0);
    setIsBuffering(false);
  }, [src, videoId, isYouTube]);
  const isSafeMediaSrc = useMemo(() => {
    return Boolean(src && isValidMediaSource(src));
  }, [src]);
  const progressKey = useMemo(() => `${LOCAL_PROGRESS_PREFIX}:${videoId}`, [videoId]);
  const embedUrl = useMemo(() => {
    if (!youtubeId) return '';
    return buildYouTubeEmbedUrl(youtubeId, {
      autoplay: false,
      mute: true,
      isLive: isLiveStream,
      playsinline: true,
      enablejsapi: true,
    });
  }, [youtubeId, isLiveStream]);

  callbacksRef.current = {
    onPlaybackChange,
    onCaptionsChange,
    onEnded,
    onMutedChange,
    onPausedChange,
    onPlaybackRateChange,
    onTimeChange,
    onSeeking,
  };
  controlsRef.current = {
    defaultVolume,
    isActive,
    isMuted,
    isPaused,
    playbackRate,
    startTime,
  };

  useEffect(() => {
    if (onCaptionsChange) {
      onCaptionsChange(captionsEnabled);
    }
  }, [captionsEnabled, onCaptionsChange]);

  useEffect(() => {
    if (!isYouTube || !youtubeId || !youtubeIframeRef.current) return;

    let disposed = false;
    let player: YouTubePlayer | null = null;

    void loadYouTubeIframeApi()
      .then((youtube) => {
        if (disposed || !youtubeIframeRef.current) return;

        player = new youtube.Player(youtubeIframeRef.current, {
          events: {
            onAutoplayBlocked: () => {
              if (player) {
                try {
                  player.mute();
                  callbacksRef.current.onMutedChange(true);
                  player.playVideo();
                  return;
                } catch {
                  // Fall through to paused
                }
              }
              callbacksRef.current.onPausedChange(true);
            },
            onPlaybackRateChange: (event) => {
              callbacksRef.current.onPlaybackRateChange?.(event.data);
            },
            onReady: (event) => {
              if (disposed) return;

              youtubePlayerRef.current = event.target;
              youtubeReadyRef.current = true;

              const controls = controlsRef.current;
              const volume = Math.max(0, Math.min(1, controls.defaultVolume));
              event.target.setVolume(Math.round(volume * 100));

              if (controls.isMuted || volume === 0) {
                event.target.mute();
              } else {
                event.target.unMute();
              }

              const availableRates = event.target.getAvailablePlaybackRates();
              if (availableRates.includes(controls.playbackRate)) {
                event.target.setPlaybackRate(controls.playbackRate);
              }

              if (controls.startTime > 0) {
                callbacksRef.current.onSeeking?.();
                event.target.seekTo(controls.startTime, true);
              }

              if (controls.isActive && !controls.isPaused) {
                event.target.playVideo();
              } else {
                event.target.pauseVideo();
              }

              callbacksRef.current.onTimeChange(
                Math.max(0, event.target.getCurrentTime() || 0),
                Math.max(0, event.target.getDuration() || fallbackDuration)
              );
            },
            onStateChange: (event) => {
              if (disposed || event.target !== youtubePlayerRef.current) return;
              if (event.data === 3) callbacksRef.current.onSeeking?.();
              if (event.data === youtube.PlayerState.PLAYING) {
                callbacksRef.current.onPausedChange(false);
                callbacksRef.current.onPlaybackChange?.(true);
                return;
              }

              callbacksRef.current.onPlaybackChange?.(false);

              if (event.data === youtube.PlayerState.PAUSED) {
                callbacksRef.current.onPausedChange(true);
                return;
              }

              if (event.data === youtube.PlayerState.ENDED) {
                callbacksRef.current.onEnded();
              }
            },
          },
        });
      })
      .catch(() => {
        // The native iframe controls still work if the optional JS API is unavailable.
      });

    return () => {
      disposed = true;
      youtubeReadyRef.current = false;
      youtubePlayerRef.current = null;
      try {
        player?.stopVideo?.();
      } catch {
        // Player may already have stopped or been detached.
      }
    };
  }, [fallbackDuration, isYouTube, youtubeId]);

  useEffect(() => {
    if (!isYouTube || !youtubeReadyRef.current || !youtubePlayerRef.current) return;

    const player = youtubePlayerRef.current;
    if (isActive && !isPaused) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }, [isActive, isPaused, isYouTube]);

  useEffect(() => {
    if (!isYouTube || !youtubeReadyRef.current || !youtubePlayerRef.current) return;

    const player = youtubePlayerRef.current;
    const volume = Math.max(0, Math.min(1, defaultVolume));
    player.setVolume(Math.round(volume * 100));

    if (isMuted || volume === 0) {
      player.mute();
    } else {
      player.unMute();
    }
  }, [defaultVolume, isMuted, isYouTube]);

  useEffect(() => {
    if (!isYouTube || !youtubeReadyRef.current || !youtubePlayerRef.current) return;

    const player = youtubePlayerRef.current;
    if (player.getAvailablePlaybackRates().includes(playbackRate)) {
      player.setPlaybackRate(playbackRate);
    }
  }, [isYouTube, playbackRate]);

  useEffect(() => {
    if (!isYouTube || !youtubeReadyRef.current || !youtubePlayerRef.current) return;
    if (startTime <= 0) return;
    callbacksRef.current.onSeeking?.();
    youtubePlayerRef.current.seekTo(startTime, true);
  }, [isYouTube, startTime]);

  useEffect(() => {
    if (!isYouTube) return;

    const intervalId = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!youtubeReadyRef.current || !player) return;

      callbacksRef.current.onTimeChange(
        Math.max(0, player.getCurrentTime() || 0),
        Math.max(0, player.getDuration() || fallbackDuration)
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [fallbackDuration, isYouTube]);

  useEffect(() => {
    if (isYouTube) return;
    const video = videoRef.current;
    if (!video) return;

    video.muted = isMuted;
    video.playbackRate = playbackRate > 0 ? playbackRate : 1;

    if (isActive && !isPaused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If unmuted playback was blocked by browser policy, fallback to muted autoplay
          if (!video.muted) {
            video.muted = true;
            callbacksRef.current.onMutedChange(true);
            void video.play().catch(() => {
              callbacksRef.current.onPausedChange(true);
            });
          } else {
            callbacksRef.current.onPausedChange(true);
          }
        });
      }
      return;
    }

    video.pause();
  }, [isActive, isMuted, isPaused, isYouTube, onPausedChange, playbackRate]);

  useEffect(() => {
    if (isYouTube) return;
    const video = videoRef.current;
    if (!video) return;

    const tracks = Array.from(video.textTracks || []);
    tracks.forEach((track, index) => {
      track.mode = captionsEnabled && index === 0 ? 'showing' : 'disabled';
    });
  }, [captionsEnabled, isYouTube, src]);

  useEffect(() => {
    if (isYouTube) return;
    const video = videoRef.current;
    if (!video) return;

    if (startTime > 0) {
      video.currentTime = startTime;
      return;
    }

    if (!shouldPersistProgress) return;

    try {
      const raw = window.localStorage.getItem(progressKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const savedCurrentTime = Math.max(0, toNumber(parsed.currentTime, 0));
      if (savedCurrentTime > 0) {
        video.currentTime = savedCurrentTime;
      }
    } catch {
      // Ignore localStorage issues.
    }
  }, [isYouTube, progressKey, shouldPersistProgress, startTime]);

  useEffect(() => {
    if (isYouTube || !shouldPersistProgress) return;
    const video = videoRef.current;
    if (!video) return;

    const persist = () => {
      const currentTime = Math.max(0, video.currentTime || 0);
      const duration = Math.max(0, video.duration || fallbackDuration);
      if (currentTime <= 0 || duration <= 0) return;

      try {
        window.localStorage.setItem(
          progressKey,
          JSON.stringify({
            currentTime,
            duration,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore localStorage issues.
      }
    };

    video.addEventListener('timeupdate', persist);
    return () => {
      video.removeEventListener('timeupdate', persist);
    };
  }, [fallbackDuration, isYouTube, progressKey, shouldPersistProgress]);

  // Handle seekTargetTime from parent
  useEffect(() => {
    if (seekTargetTime === undefined || seekTargetTime === null) return;
    const safeSeconds = Math.max(0, seekTargetTime);
    callbacksRef.current.onSeeking?.();
    if (isYouTube) {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(safeSeconds, true);
      } else if (youtubeIframeRef.current) {
        const targetOrigin = getYouTubeTargetOrigin(youtubeIframeRef.current.src);
        youtubeIframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [safeSeconds, true] }),
          targetOrigin
        );
      }
    } else if (videoRef.current) {
      videoRef.current.currentTime = safeSeconds;
    }
    callbacksRef.current.onTimeChange(safeSeconds, fallbackDuration);
  }, [seekTargetTime, isYouTube, fallbackDuration]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (seconds: number) => {
        const safeSeconds = Math.max(0, seconds);
        callbacksRef.current.onSeeking?.();
        if (isYouTube) {
          if (youtubePlayerRef.current) {
            youtubePlayerRef.current.seekTo(safeSeconds, true);
          } else if (youtubeIframeRef.current) {
            const targetOrigin = getYouTubeTargetOrigin(youtubeIframeRef.current.src);
            youtubeIframeRef.current.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'seekTo', args: [safeSeconds, true] }),
              targetOrigin
            );
          }
        } else if (videoRef.current) {
          videoRef.current.currentTime = safeSeconds;
        }
        callbacksRef.current.onTimeChange(safeSeconds, fallbackDuration);
      },
      play: () => {
        if (isYouTube) youtubePlayerRef.current?.playVideo();
        else void videoRef.current?.play();
        callbacksRef.current.onPausedChange(false);
      },
      pause: () => {
        if (isYouTube) youtubePlayerRef.current?.pauseVideo();
        else videoRef.current?.pause();
        callbacksRef.current.onPausedChange(true);
      },
      togglePlay: () => {
        if (controlsRef.current.isPaused) {
          if (isYouTube) youtubePlayerRef.current?.playVideo();
          else void videoRef.current?.play();
          callbacksRef.current.onPausedChange(false);
        } else {
          if (isYouTube) youtubePlayerRef.current?.pauseVideo();
          else videoRef.current?.pause();
          callbacksRef.current.onPausedChange(true);
        }
      },
      requestFullscreen: () => {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
          void document.exitFullscreen?.();
        } else {
          const webkitEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
          void (el.requestFullscreen?.() || webkitEl.webkitRequestFullscreen?.());
        }
      },
    }),
    [fallbackDuration, isYouTube]
  );

  const aspectClass = isShort ? 'aspect-[9/16] max-h-[75vh] mx-auto' : 'aspect-video';

  if (isYouTube && embedUrl) {
    return (
      <div
        ref={containerRef}
        className={`relative ${aspectClass} w-full overflow-hidden rounded-2xl bg-black shadow-2xl ${className}`}
      >
        <div className="h-full w-full">
          <iframe
            ref={youtubeIframeRef}
            src={embedUrl}
            title={title}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
          />
        </div>

        {isLiveStream && (
          <div className="pointer-events-none absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-lg backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            <span>LIVE</span>
          </div>
        )}

        {isPaused && !isLiveStream && (
          <button
            type="button"
            onClick={() => onPausedChange(false)}
            aria-label="Play video"
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition hover:bg-black/50 group"
          >
            <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl transition group-hover:scale-110 group-active:scale-95">
              <Play className="h-8 w-8 sm:h-10 sm:w-10 fill-current translate-x-0.5" />
            </div>
          </button>
        )}

        {isOffline && (
          <div
            className="absolute inset-0 z-35 flex flex-col items-center justify-center bg-black/85 p-6 text-center text-white backdrop-blur-sm"
            role="status"
          >
            <p className="text-sm font-semibold text-amber-300">
              इंटरनेट कनेक्शन नहीं है / Offline
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              कृपया इंटरनेट कनेक्शन की जांच करें।
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${aspectClass} w-full overflow-hidden rounded-2xl bg-black shadow-2xl ${className}`}
    >
      {isSafeMediaSrc && (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="h-full w-full object-contain"
          playsInline
          autoPlay={isActive && !isPaused}
          controls
          muted={isMuted}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const safeDuration = Math.max(0, video.duration || fallbackDuration);
            video.volume = Math.max(0, Math.min(1, defaultVolume));
            onTimeChange(Math.max(0, video.currentTime || 0), safeDuration);
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (video.seeking) callbacksRef.current.onSeeking?.();
            const safeDuration = Math.max(0, video.duration || fallbackDuration);
            onTimeChange(Math.max(0, video.currentTime || 0), safeDuration);
          }}
          onSeeking={() => callbacksRef.current.onSeeking?.()}
          onSeeked={() => callbacksRef.current.onSeeking?.()}
          onWaiting={() => {
            callbacksRef.current.onPlaybackChange?.(false);
            if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
            bufferTimerRef.current = window.setTimeout(() => setIsBuffering(true), 250);
          }}
          onStalled={() => {
            callbacksRef.current.onPlaybackChange?.(false);
            if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
            bufferTimerRef.current = window.setTimeout(() => setIsBuffering(true), 250);
          }}
          onPlaying={() => {
            if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
            onPausedChange(false);
            callbacksRef.current.onPlaybackChange?.(true);
          }}
          onCanPlay={() => {
            if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
          }}
          onPause={() => {
            callbacksRef.current.onPlaybackChange?.(false);
            onPausedChange(true);
          }}
          onVolumeChange={(event) => {
            const video = event.currentTarget;
            onMutedChange(Boolean(video.muted || video.volume === 0));
          }}
          onRateChange={(event) => {
            if (onPlaybackRateChange) {
              onPlaybackRateChange(event.currentTarget.playbackRate);
            }
          }}
          onEnded={() => {
            if (!autoAdvance) {
              onPausedChange(true);
            }
            onEnded();
          }}
          onError={(event) => {
            callbacksRef.current.onPlaybackChange?.(false);
            setPlaybackError(true);
            setIsBuffering(false);
            const code = event.currentTarget.error?.code;
            if (code === 2) {
              setErrorClassification('network');
            } else if (code === 3) {
              setErrorClassification('decode');
            } else if (code === 4) {
              setErrorClassification('not_supported');
            } else {
              setErrorClassification('generic');
            }
          }}
        />
      )}

      {/* Buffering Indicator */}
      {isBuffering && !isPaused && !playbackError && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
          aria-label="Loading video"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      {/* Offline Alert Overlay */}
      {isOffline && (
        <div
          className="absolute inset-0 z-35 flex flex-col items-center justify-center bg-black/85 p-6 text-center text-white backdrop-blur-sm"
          role="status"
        >
          <p className="text-sm font-semibold text-amber-300">
            इंटरनेट कनेक्शन नहीं है / Offline
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            कृपया इंटरनेट कनेक्शन की जांच करें।
          </p>
        </div>
      )}

      {/* Error & Bounded Retry Overlay */}
      {(playbackError || (!isYouTube && !src)) && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 p-6 text-center text-white backdrop-blur-sm"
          role="alert"
        >
          <p className="text-sm font-semibold text-zinc-200">
            {errorClassification === 'network'
              ? 'नेटवर्क त्रुटि: वीडियो लोड नहीं हो सका।'
              : errorClassification === 'decode'
              ? 'वीडियो डिकोड त्रुटि हुई।'
              : errorClassification === 'not_supported'
              ? 'वीडियो प्रारूप समर्थित नहीं है।'
              : 'वीडियो लोड करने में समस्या हुई।'}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {errorClassification === 'network'
              ? 'Network error. Please check your connection.'
              : 'Video currently unavailable.'}
          </p>
          {src && errorClassification !== 'not_supported' ? (
            retryCount < 3 ? (
              <button
                type="button"
                onClick={() => {
                  setRetryCount((c) => c + 1);
                  setPlaybackError(false);
                  if (videoRef.current) {
                    videoRef.current.load();
                    void videoRef.current.play().catch(() => {
                      callbacksRef.current.onPausedChange(true);
                    });
                  }
                }}
                className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition active:scale-95"
              >
                पुनः प्रयास करें / Retry ({3 - retryCount} remaining)
              </button>
            ) : (
              <p className="mt-3 text-xs text-zinc-400">
                अधिकतम प्रयास सीमा समाप्त। कृपया पेज रिफ्रेश करें।
              </p>
            )
          ) : null}
        </div>
      )}

      {isPaused && !isLiveStream && !playbackError && (
        <button
          type="button"
          onClick={() => onPausedChange(false)}
          aria-label="Play video"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition hover:bg-black/50 group"
        >
          <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl transition group-hover:scale-110 group-active:scale-95">
            <Play className="h-8 w-8 sm:h-10 sm:w-10 fill-current translate-x-0.5" />
          </div>
        </button>
      )}
    </div>
  );
});

export default VideoPlayer;
