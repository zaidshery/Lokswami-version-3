'use client';

import { useEffect, useRef } from 'react';
import { Bookmark, Play, Trash2, X } from 'lucide-react';
import ReaderImage from '@/components/ui/ReaderImage';
import {
  type VideoItem,
  formatDurationLabel,
  getCategoryLabel,
} from './types';

export interface VideoWatchLaterDrawerProps {
  open: boolean;
  onClose: () => void;
  videos: VideoItem[];
  savedVideoIds: Record<string, boolean>;
  onSelectVideo: (videoId: string, mode?: 'feed' | 'shorts') => void;
  onRemoveVideo: (videoId: string) => void;
  language: 'hi' | 'en';
}

export default function VideoWatchLaterDrawer({
  open,
  onClose,
  videos,
  savedVideoIds,
  onSelectVideo,
  onRemoveVideo,
  language,
}: VideoWatchLaterDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const savedVideos = videos.filter((v) => savedVideoIds[v.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={language === 'hi' ? 'बाद में देखें सूची' : 'Watch Later Playlist'}
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={drawerRef}
        className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform dark:border-white/10 dark:bg-zinc-950 sm:rounded-l-3xl animate-in slide-in-from-right duration-250"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
              <Bookmark className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                {language === 'hi' ? 'बाद में देखें' : 'Watch Later'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-white/50">
                {savedVideos.length} {language === 'hi' ? 'सहेजे गए वीडियो' : 'saved videos'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-white/60 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="scrollbar-hide flex-1 overflow-y-auto p-4 space-y-3">
          {savedVideos.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <Bookmark className="h-10 w-10 text-zinc-300 dark:text-white/20" />
              <p className="mt-3 text-sm font-semibold text-zinc-700 dark:text-white/70">
                {language === 'hi'
                  ? 'कोई वीडियो सहेजा नहीं गया है'
                  : 'No videos saved yet'}
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-white/40 max-w-xs">
                {language === 'hi'
                  ? 'वीडियो पर बुकमार्क आइकन दबाकर उन्हें यहां जोड़ें।'
                  : 'Tap the bookmark icon on any video to add it to your watch later queue.'}
              </p>
            </div>
          ) : (
            savedVideos.map((video) => (
              <div
                key={video.id}
                className="group flex gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-2.5 transition hover:border-zinc-300 dark:border-white/5 dark:bg-white/5 dark:hover:border-white/15"
              >
                {/* Thumbnail */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectVideo(video.id, video.isShort ? 'shorts' : 'feed');
                    onClose();
                  }}
                  className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-black"
                >
                  <ReaderImage
                    src={video.thumbnail}
                    alt={video.title}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                    <Play className="h-6 w-6 fill-current text-white" />
                  </div>
                  {video.duration > 0 && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-semibold text-white">
                      {formatDurationLabel(video.duration)}
                    </span>
                  )}
                </button>

                {/* Details */}
                <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectVideo(video.id, video.isShort ? 'shorts' : 'feed');
                        onClose();
                      }}
                      className="text-left font-bold text-xs leading-snug line-clamp-2 text-zinc-950 hover:text-red-600 dark:text-white dark:hover:text-red-400"
                    >
                      {video.title}
                    </button>
                    <span className="mt-1 inline-block text-[10px] text-zinc-500 dark:text-white/50">
                      {getCategoryLabel(video.category, language)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectVideo(video.id, video.isShort ? 'shorts' : 'feed');
                        onClose();
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline dark:text-red-400"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>{language === 'hi' ? 'देखें' : 'Play'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemoveVideo(video.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-red-600 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-red-400"
                      aria-label="Remove from watch later"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
