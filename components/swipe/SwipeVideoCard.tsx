'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Play } from 'lucide-react';
import type { SwipeFeedItem } from '@/components/swipe/types';
import { extractYouTubeVideoId } from '@/lib/utils/youtube';

type SwipeVideoCardProps = {
  item: SwipeFeedItem;
  position: -1 | 0 | 1;
  active: boolean;
  muted: boolean;
  paused: boolean;
  reducedMotion: boolean;
  preloadMetadata: boolean;
  onTogglePlayback: () => void;
  onPlay: () => void;
  onProgress: (currentTime: number, duration: number, confirmedPlaying?: boolean) => void;
  onError: () => void;
};

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

function syncYouTubeControls(iframe: HTMLIFrameElement, paused: boolean, muted: boolean) {
  const send = (func: string, args: unknown[] = []) => iframe.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func, args }), getYouTubeTargetOrigin(iframe.src)
  );
  send(paused ? 'pauseVideo' : 'playVideo');
  send(muted ? 'mute' : 'unMute');
  if (!muted) send('setVolume', [100]);
}

export default function SwipeVideoCard({
  item,
  position,
  active,
  muted,
  paused,
  reducedMotion,
  preloadMetadata,
  onTogglePlayback,
  onPlay,
  onProgress,
  onError,
}: SwipeVideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playingRef = useRef(false);
  const youtubeId = extractYouTubeVideoId(item.playbackUrl || item.videoUrl);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;
    video.muted = muted;
    if (paused) {
      playingRef.current = false;
      video.pause();
      return;
    }
    const playResult = video.play();
    if (playResult && typeof playResult.then === 'function') {
      let canceled = false;
      void playResult.then(() => {
        if (!canceled && !document.hidden) {
          playingRef.current = true;
          onPlay();
        }
      }).catch(() => { if (!canceled) onError(); });
      return () => { canceled = true; playingRef.current = false; };
    }
  }, [active, muted, onError, onPlay, paused]);

  // Synchronize playback and mute state to YouTube iframe
  useEffect(() => {
    if (!active || !youtubeId || !iframeRef.current) return;
    syncYouTubeControls(iframeRef.current, paused, muted);
  }, [active, youtubeId, paused, muted]);

  // Listen for confirmed playback events and progress from YouTube iframe
  useEffect(() => {
    if (!active || !youtubeId) return;
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow || event.origin !== new URL(iframe.src).origin) {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'onReady') syncYouTubeControls(iframe, paused, muted);
        if (data?.event === 'onStateChange' && typeof data.info === 'number') {
          playingRef.current = data.info === 1 && !paused && !document.hidden;
          if (playingRef.current) onPlay();
        } else if (data?.event === 'infoDelivery' && data.info) {
          if (typeof data.info.playerState === 'number') {
            playingRef.current = data.info.playerState === 1 && !paused && !document.hidden;
            if (playingRef.current) onPlay();
          }
          if (typeof data.info.currentTime === 'number') {
            onProgress(
              data.info.currentTime,
              typeof data.info.duration === 'number' ? data.info.duration : item.duration,
              playingRef.current && !paused && !document.hidden
            );
          }
        }
      } catch {
        // ignore parse error
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [active, item.duration, onPlay, onProgress, paused, muted, youtubeId]);

  // Cleanup media when becoming inactive or unmounting
  useEffect(() => {
    if (!active) {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {
          // ignore
        }
      }
      if (iframeRef.current) {
        try {
          const targetOrigin = getYouTubeTargetOrigin(iframeRef.current.src);
          iframeRef.current.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
            targetOrigin
          );
        } catch {
          // ignore
        }
      }
    }
  }, [active]);

  useEffect(() => {
    const videoEl = videoRef.current;
    const iframeEl = iframeRef.current;
    return () => {
      if (videoEl) {
        try {
          videoEl.pause();
        } catch {
          // ignore
        }
      }
      if (iframeEl) {
        try {
          const targetOrigin = getYouTubeTargetOrigin(iframeEl.src);
          iframeEl.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }),
            targetOrigin
          );
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const translate = position === -1 ? '-100%' : position === 1 ? '100%' : '0%';

  return (
    <article
      data-swipe-card
      data-active={active ? 'true' : 'false'}
      aria-hidden={active ? undefined : true}
      className="absolute inset-0 overflow-hidden bg-black"
      style={{
        transform: `translateY(${translate})`,
        transition: reducedMotion ? 'none' : 'transform 220ms ease-out',
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {active && youtubeId ? (
          <iframe
            ref={iframeRef}
            title={item.title}
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1&playsinline=1&controls=0&mute=1&autoplay=0&rel=0&modestbranding=1&loop=1&playlist=${youtubeId}`}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            onLoad={() => {
              iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'listening', id: item._id }),
                'https://www.youtube-nocookie.com'
              );
              if (iframeRef.current) syncYouTubeControls(iframeRef.current, paused, muted);
            }}
            onError={onError}
            allowFullScreen
          />
        ) : active ? (
          <video
            ref={videoRef}
            src={item.hlsUrl || item.playbackUrl || item.videoUrl}
            poster={item.posterUrl || item.thumbnail}
            className="h-full w-full object-cover"
            playsInline
            autoPlay
            muted={muted}
            preload="auto"
            loop
            onPlaying={() => { playingRef.current = true; onPlay(); }}
            onPause={() => { playingRef.current = false; }}
            onWaiting={() => { playingRef.current = false; }}
            onStalled={() => { playingRef.current = false; }}
            onError={onError}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              onProgress(video.currentTime, Number.isFinite(video.duration) ? video.duration : item.duration, playingRef.current && !video.paused && !video.seeking);
            }}
          >
            {item.captionUrl ? (
              <track kind="captions" src={item.captionUrl} srcLang="hi" label="Hindi" default />
            ) : null}
          </video>
        ) : preloadMetadata && !youtubeId ? (
          <video
            src={item.hlsUrl || item.playbackUrl || item.videoUrl}
            poster={item.posterUrl || item.thumbnail}
            className="h-full w-full object-cover"
            preload="metadata"
            muted
            playsInline
            aria-hidden="true"
            tabIndex={-1}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.posterUrl || item.thumbnail || '/lokswami-share-preview.png'}
            alt=""
            className="h-full w-full object-cover"
            loading={position === 1 ? 'eager' : 'lazy'}
          />
        )}
      </div>

      {active ? (
        <button
          type="button"
          className="reader-focus-ring absolute inset-0 z-10 cursor-default bg-transparent"
          onClick={onTogglePlayback}
          aria-label={paused ? 'Play video' : 'Pause video'}
        >
          {paused ? (
            <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
              <Play className="h-8 w-8 fill-current" />
            </span>
          ) : null}
        </button>
      ) : null}

      {active && !item.playbackUrl && !item.videoUrl ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black px-8 text-center text-white">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <p>यह वीडियो अभी उपलब्ध नहीं है।</p>
        </div>
      ) : null}
    </article>
  );
}
