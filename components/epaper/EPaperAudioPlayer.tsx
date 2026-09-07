'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, Volume2, X } from 'lucide-react';

export interface EPaperAudioPlayerProps {
  title: string;
  audioUrl?: string | null;
  isLoading?: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * EPaperAudioPlayer: Floating audio player for Gemini AI Hindi Text-to-Speech narration.
 */
export default function EPaperAudioPlayer({
  title,
  audioUrl,
  isLoading = false,
  onClose,
  className = '',
}: EPaperAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 0.8];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  return (
    <div
      data-epaper-element="audio-player"
      className={`fixed bottom-20 left-1/2 z-50 flex w-[94vw] max-w-lg -translate-x-1/2 items-center gap-3 rounded-2xl border border-zinc-700/80 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl transition-all sm:bottom-24 sm:p-4 ${className}`}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading || !audioUrl}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-lg shadow-orange-600/30 transition hover:bg-orange-500 disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5 fill-current translate-x-0.5" />
        )}
      </button>

      {/* Title & Progress Bar */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-zinc-100">{title}</p>
          <span className="shrink-0 text-[10px] text-zinc-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Audio playback progress"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-orange-500"
        />
      </div>

      {/* Speed Button */}
      <button
        type="button"
        onClick={cyclePlaybackRate}
        aria-label={`Playback speed: ${playbackRate}x`}
        className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-bold text-zinc-300 transition hover:bg-zinc-800"
      >
        {playbackRate}x
      </button>

      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close audio player"
        className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
