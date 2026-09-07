'use client';

import { type RefObject } from 'react';
import { ChevronLeft } from 'lucide-react';
import VideoPlayer, { type VideoPlayerHandle } from '@/components/ui/VideoPlayer';
import {
  type VideoItem,
  PLAYER_SPEED_OPTIONS,
  isLiveVideo,
} from './types';

export interface VideoDetailHeroProps {
  selectedVideo: VideoItem;
  playerRef: RefObject<VideoPlayerHandle | null>;
  isPaused: boolean;
  isMuted: boolean;
  autoAdvance: boolean;
  captionsEnabled: boolean;
  playbackRate: (typeof PLAYER_SPEED_OPTIONS)[number];
  progressCurrent?: number;
  progressDuration?: number;
  initialStartTime?: number;
  isSavedWatchLater?: boolean;
  language?: 'hi' | 'en';
  copy?: {
    liveNow?: string;
    liveStream?: string;
    nowPlaying?: string;
    views?: string;
    autoAdvance?: string;
    save?: string;
    saved?: string;
    showMore?: string;
    showLess?: string;
    shorts?: string;
  };
  onSeek?: (seconds: number) => void;
  onPausedChange: (paused: boolean) => void;
  onMutedChange: (muted: boolean) => void;
  onTimeChange?: (current: number, duration: number) => void;
  onAutoAdvanceChange?: (autoAdvance: boolean) => void;
  onCaptionsChange: (enabled: boolean) => void;
  onPlaybackRateChange: (rate: (typeof PLAYER_SPEED_OPTIONS)[number]) => void;
  onToggleWatchLater?: (videoId: string) => void;
  onAdvanceToNext: () => void;
  onBackToList?: () => void;
  isMobileModal?: boolean;
}

export default function VideoDetailHero({
  selectedVideo,
  playerRef,
  isPaused,
  isMuted,
  autoAdvance,
  captionsEnabled,
  playbackRate,
  initialStartTime = 0,
  onPausedChange,
  onMutedChange,
  onTimeChange,
  onCaptionsChange,
  onPlaybackRateChange,
  onAdvanceToNext,
  onBackToList,
  isMobileModal = false,
}: VideoDetailHeroProps) {
  const isLive = isLiveVideo(selectedVideo);

  return (
    <article
      className={`overflow-hidden ${
        isMobileModal
          ? 'bg-black'
          : 'rounded-2xl lg:rounded-3xl border border-zinc-200/80 bg-black shadow-sm dark:border-white/10'
      }`}
      data-testid="video-detail-hero"
    >
      {/* Video Player Container: 16:9 for landscape, 9:16 centered frame for Shorts */}
      <div
        className={`relative w-full overflow-hidden bg-black ${
          selectedVideo.isShort
            ? 'flex justify-center items-center py-2 sm:py-3 bg-zinc-950/95'
            : 'aspect-video'
        }`}
      >
        <div
          className={
            selectedVideo.isShort
              ? 'relative w-full max-w-[340px] xs:max-w-[360px] sm:max-w-[380px] aspect-[9/16] max-h-[70vh] sm:max-h-[75vh] overflow-hidden rounded-2xl shadow-2xl border border-white/10'
              : 'relative h-full w-full'
          }
        >
          <VideoPlayer
            key={selectedVideo.id}
            ref={playerRef as RefObject<VideoPlayerHandle>}
            videoId={selectedVideo.id}
            title={selectedVideo.title}
            src={selectedVideo.videoUrl}
            poster={selectedVideo.thumbnail}
            fallbackDuration={selectedVideo.duration}
            isActive={true}
            isPaused={isPaused}
            isMuted={isMuted}
            autoAdvance={autoAdvance}
            playbackRate={playbackRate}
            defaultVolume={1}
            captionsEnabled={captionsEnabled}
            shouldPersistProgress={true}
            startTime={initialStartTime}
            isLive={isLive}
            isShort={selectedVideo.isShort}
            className="h-full w-full object-contain"
            onPausedChange={onPausedChange}
            onMutedChange={onMutedChange}
            onTimeChange={(current, dur) => {
              if (onTimeChange) onTimeChange(current, dur);
            }}
            onEnded={() => {
              if (!autoAdvance) {
                onPausedChange(true);
                return;
              }
              onAdvanceToNext();
            }}
            onPlaybackRateChange={(speed) => {
              const matched = PLAYER_SPEED_OPTIONS.find((option) => option === speed);
              if (matched) {
                onPlaybackRateChange(matched);
              }
            }}
            onCaptionsChange={onCaptionsChange}
          />
        </div>

        {onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="absolute left-3 top-3 z-50 rounded-full bg-black/60 p-2 backdrop-blur transition-all hover:bg-black/80 active:scale-90"
            aria-label="Back to list"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
        )}
      </div>
    </article>
  );
}
