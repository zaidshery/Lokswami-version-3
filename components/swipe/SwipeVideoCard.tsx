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
  onProgress: (currentTime: number, duration: number) => void;
  onError: () => void;
};

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
  const youtubeId = extractYouTubeVideoId(item.playbackUrl || item.videoUrl);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (paused) {
      video.pause();
      return;
    }
    const playResult = video.play();
    if (playResult && typeof playResult.then === 'function') {
      void playResult.then(onPlay).catch(onError);
    } else {
      onPlay();
    }
  }, [muted, onError, onPlay, paused]);

  // Synchronize playback and mute state to YouTube iframe
  useEffect(() => {
    if (!active || !youtubeId || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const send = (func: string, args: unknown[] = []) => {
      try {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        );
      } catch {
        // PostMessage safely caught
      }
    };

    if (paused) {
      send('pauseVideo');
    } else {
      send('playVideo');
    }

    if (muted) {
      send('mute');
    } else {
      send('unMute');
      send('setVolume', [100]);
    }
  }, [active, youtubeId, paused, muted]);

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
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1&playsinline=1&controls=0&mute=${muted ? 1 : 0}&autoplay=${paused ? 0 : 1}&rel=0&modestbranding=1&loop=1&playlist=${youtubeId}`}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            onLoad={onPlay}
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
            onPlay={onPlay}
            onError={onError}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              onProgress(video.currentTime, Number.isFinite(video.duration) ? video.duration : item.duration);
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
