'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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
  onMutedChange: (muted: boolean) => void;
  onTimeChange: (currentTime: number, duration: number) => void;
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
    onMutedChange,
    onTimeChange,
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
  const callbacksRef = useRef({
    onCaptionsChange,
    onEnded,
    onMutedChange,
    onPausedChange,
    onPlaybackRateChange,
    onTimeChange,
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
  const progressKey = useMemo(() => `${LOCAL_PROGRESS_PREFIX}:${videoId}`, [videoId]);
  const embedUrl = useMemo(() => {
    if (!youtubeId) return '';
    return buildYouTubeEmbedUrl(youtubeId, {
      autoplay: isActive && !isPaused,
      mute: isMuted,
      isLive: isLiveStream,
      playsinline: true,
      enablejsapi: true,
    });
  }, [youtubeId, isActive, isPaused, isMuted, isLiveStream]);

  callbacksRef.current = {
    onCaptionsChange,
    onEnded,
    onMutedChange,
    onPausedChange,
    onPlaybackRateChange,
    onTimeChange,
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
              if (event.data === youtube.PlayerState.PLAYING) {
                callbacksRef.current.onPausedChange(false);
                return;
              }

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
    if (isYouTube) {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(safeSeconds, true);
      } else if (youtubeIframeRef.current) {
        youtubeIframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [safeSeconds, true] }),
          '*'
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
        if (isYouTube) {
          if (youtubePlayerRef.current) {
            youtubePlayerRef.current.seekTo(safeSeconds, true);
          } else if (youtubeIframeRef.current) {
            youtubeIframeRef.current.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'seekTo', args: [safeSeconds, true] }),
              '*'
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
          void (el.requestFullscreen?.() || (el as any).webkitRequestFullscreen?.());
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
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${aspectClass} w-full overflow-hidden rounded-2xl bg-black shadow-2xl ${className}`}
    >
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
          const safeDuration = Math.max(0, video.duration || fallbackDuration);
          onTimeChange(Math.max(0, video.currentTime || 0), safeDuration);
        }}
        onPlay={() => {
          onPausedChange(false);
        }}
        onPause={() => {
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
      />

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
    </div>
  );
});

export default VideoPlayer;
