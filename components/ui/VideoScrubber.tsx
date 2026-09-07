'use client';

import React, { useCallback, useRef, useState } from 'react';

interface VideoScrubberProps {
  currentTime: number;
  duration: number;
  bufferedTime?: number;
  onSeek: (seconds: number) => void;
  className?: string;
  isLive?: boolean;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }
  return `${paddedMins}:${paddedSecs}`;
}

export default function VideoScrubber({
  currentTime,
  duration,
  bufferedTime = 0,
  onSeek,
  className = '',
  isLive = false,
}: VideoScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number>(0);

  const safeDuration = Math.max(0.1, duration || 0);
  const currentPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));
  const bufferedPercent = Math.min(100, Math.max(0, (bufferedTime / safeDuration) * 100));

  const calculateTimeFromEvent = useCallback(
    (clientX: number): { seconds: number; percent: number } => {
      if (!trackRef.current) return { seconds: 0, percent: 0 };
      const rect = trackRef.current.getBoundingClientRect();
      const rawPercent = (clientX - rect.left) / rect.width;
      const clampedPercent = Math.min(1, Math.max(0, rawPercent));
      return {
        seconds: clampedPercent * safeDuration,
        percent: clampedPercent * 100,
      };
    },
    [safeDuration]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isLive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    const { seconds, percent } = calculateTimeFromEvent(event.clientX);
    setHoverPosition(percent);
    setHoverTime(seconds);
    onSeek(seconds);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isLive) return;
    const { seconds, percent } = calculateTimeFromEvent(event.clientX);
    setHoverPosition(percent);
    setHoverTime(seconds);

    if (isDragging) {
      onSeek(seconds);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isLive) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Safe ignore
    }
    setIsDragging(false);
  };

  const handlePointerEnter = () => {
    if (!isLive) setIsHovered(true);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setIsHovered(false);
      setHoverPosition(null);
    }
  };

  if (isLive) {
    return (
      <div className={`relative h-1.5 w-full overflow-hidden rounded-full bg-red-600/30 ${className}`}>
        <div className="h-full w-full bg-red-600 animate-pulse" />
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek video timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(currentTime)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onSeek(Math.max(0, currentTime - 5));
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onSeek(Math.min(safeDuration, currentTime + 5));
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={`group relative flex h-6 w-full cursor-pointer select-none items-center outline-none ${className}`}
    >
      {/* Floating Hover Timestamp Tooltip */}
      {(isHovered || isDragging) && hoverPosition !== null && (
        <div
          className="pointer-events-none absolute -top-8 z-30 -translate-x-1/2 rounded bg-black/90 px-2 py-0.5 text-[11px] font-mono font-semibold text-white shadow-lg backdrop-blur-sm transition-all"
          style={{ left: `${hoverPosition}%` }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Main Track Background */}
      <div
        className={`relative w-full overflow-hidden rounded-full bg-zinc-200/80 transition-all dark:bg-white/20 ${
          isHovered || isDragging ? 'h-2' : 'h-1'
        }`}
      >
        {/* Buffered Progress Track */}
        {bufferedPercent > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-zinc-400/50 transition-[width] dark:bg-white/40"
            style={{ width: `${bufferedPercent}%` }}
          />
        )}

        {/* Hover Highlight Track */}
        {isHovered && hoverPosition !== null && (
          <div
            className="absolute inset-y-0 left-0 bg-white/25"
            style={{ width: `${hoverPosition}%` }}
          />
        )}

        {/* Played Progress Track (Signature YouTube Red) */}
        <div
          className="absolute inset-y-0 left-0 bg-[#ff0000] transition-[width] duration-75"
          style={{ width: `${currentPercent}%` }}
        />
      </div>

      {/* Scrubber Knob / Thumb */}
      <div
        className={`pointer-events-none absolute -translate-x-1/2 rounded-full bg-[#ff0000] shadow-[0_0_8px_rgba(255,0,0,0.6)] transition-all ${
          isHovered || isDragging ? 'h-3.5 w-3.5 scale-100' : 'h-2.5 w-2.5 scale-0'
        }`}
        style={{ left: `${currentPercent}%` }}
      />
    </div>
  );
}
