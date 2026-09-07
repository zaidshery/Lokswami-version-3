'use client';

import { Zap, Play, Loader2 } from 'lucide-react';
import ReaderImage from '@/components/ui/ReaderImage';
import {
  type StoredProgressEntry,
  type VideoItem,
  isLiveVideo,
} from './types';

export interface VideoFeedGridProps {
  layout: 'up_next_sidebar' | 'feed_list' | 'shorts_grid';
  videos: VideoItem[];
  selectedVideoId?: string;
  onSelectVideo: (videoId: string, mode?: 'feed' | 'shorts') => void;
  language: 'hi' | 'en';
  copy: {
    upNext: string;
    videos: string;
    retry: string;
    noResults: string;
    liveNow: string;
    shorts: string;
    resume: string;
    loadMore: string;
    loading: string;
  };
  resumeProgressById?: Record<string, StoredProgressEntry>;
  loadError?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  shortsFeed?: VideoItem[];
}

export default function VideoFeedGrid({
  layout,
  videos,
  selectedVideoId,
  onSelectVideo,
  language,
  copy,
  resumeProgressById = {},
  loadError,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  shortsFeed = [],
}: VideoFeedGridProps) {
  // 1. Desktop "Up Next" Queue Sidebar
  if (layout === 'up_next_sidebar') {
    return (
      <section className="rounded-[30px] border border-zinc-200 bg-white px-3 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.1)] dark:border-white/8 dark:bg-[#141418] dark:shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ff6b5f]">
              {copy.upNext}
            </p>
            <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
              {videos.length} {copy.videos}
            </h2>
          </div>

          {loadError && onLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="rounded-full bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 dark:bg-white/8 dark:text-white"
            >
              {copy.retry}
            </button>
          )}
        </div>

        {!videos.length ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-[#101014] dark:text-white/56">
            {copy.noResults}
          </div>
        ) : null}

        <div className="space-y-3">
          {videos.map((video) => {
            const savedProgress = resumeProgressById[video.id];
            const savedPercent =
              savedProgress?.duration
                ? Math.min(100, (savedProgress.currentTime / savedProgress.duration) * 100)
                : 0;

            const isSelected = video.id === selectedVideoId;

            return (
              <button
                key={video.id}
                type="button"
                onClick={() => onSelectVideo(video.id, 'feed')}
                className={`flex w-full gap-3 rounded-[24px] border p-2 text-left transition ${
                  isSelected
                    ? 'border-red-500/50 bg-red-50/60 dark:border-red-500/30 dark:bg-red-950/20'
                    : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-white/8 dark:bg-[#0f0f12] dark:hover:border-white/16'
                }`}
              >
                <div className="relative w-[42%] shrink-0 overflow-hidden rounded-[18px] bg-black">
                  <div className="relative aspect-video">
                    <ReaderImage
                      src={video.thumbnail}
                      alt={video.title}
                      fill
                      sizes="180px"
                      className="object-cover"
                    />
                  </div>
                  {isLiveVideo(video) ? (
                    <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white shadow">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      {copy.liveNow}
                    </span>
                  ) : null}
                </div>

                {/* Clean Title Only */}
                <div className="min-w-0 flex-1 py-1">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-zinc-950 dark:text-white">
                    {video.title}
                  </h3>

                  {savedPercent > 0 ? (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-zinc-500 dark:text-white/46">
                        <span>{copy.resume}</span>
                        <span>{Math.round(savedPercent)}%</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/8">
                        <div
                          className="h-full rounded-full bg-[#ff6257]"
                          style={{ width: `${savedPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // 2. Full Shorts Grid
  if (layout === 'shorts_grid') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {videos.map((short) => (
            <button
              key={short.id}
              type="button"
              onClick={() => onSelectVideo(short.id, 'feed')}
              className="w-full text-left block group"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-md dark:border-white/5 dark:bg-black/40">
                <ReaderImage
                  src={short.thumbnail}
                  alt={short.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  className="object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />

                <div className="absolute bottom-2.5 left-2.5 right-2.5">
                  <p className="line-clamp-2 text-xs sm:text-sm font-bold leading-snug text-white drop-shadow">
                    {short.title}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {hasMore && onLoadMore && (
          <div className="py-4 text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isLoadingMore ? copy.loading : copy.loadMore}
            </button>
          </div>
        )}
      </div>
    );
  }

  // 3. Mobile / Standard Feed List (with interleaved Lokswami Shorts carousel)
  const mobileShortsPreview = shortsFeed.slice(0, 6);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
      {videos.map((video, index) => {
        const isSelected = video.id === selectedVideoId;
        const shouldShowShorts = index === 1 && mobileShortsPreview.length > 0;

        return (
          <div key={video.id} className={`space-y-4 ${shouldShowShorts ? 'col-span-full' : ''}`}>
            <button
              type="button"
              onClick={() => onSelectVideo(video.id, 'feed')}
              className={`w-full text-left block group overflow-hidden rounded-2xl border transition-all ${
                isSelected
                  ? 'border-red-500/60 bg-red-50/40 dark:border-red-500/40 dark:bg-red-950/20'
                  : 'border-zinc-200/80 bg-white shadow-sm hover:border-zinc-300 dark:border-white/8 dark:bg-[#141418] dark:hover:border-white/16'
              }`}
            >
              {/* Thumbnail 16:9 */}
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                <ReaderImage
                  src={video.thumbnail}
                  alt={video.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 600px"
                  className="object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {isLiveVideo(video) ? (
                  <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white shadow">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    {copy.liveNow}
                  </span>
                ) : null}

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/40">
                    <Play className="ml-1 h-5 w-5 fill-current" />
                  </div>
                </div>
              </div>

              {/* Clean Title Only */}
              <div className="p-3 sm:p-4">
                <h3 className="line-clamp-2 text-sm sm:text-base font-bold leading-snug text-zinc-950 transition-colors group-hover:text-red-600 dark:text-white dark:group-hover:text-red-400">
                  {video.title}
                </h3>
              </div>
            </button>

            {/* Interleaved "Lokswami Shorts" Carousel */}
            {shouldShowShorts && (
              <section className="my-2 rounded-2xl border border-zinc-200 bg-zinc-50 py-3.5 dark:border-white/5 dark:bg-[#0a0a0a]">
                <div className="flex items-center justify-between px-3.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-[#ff3b30] rounded-lg">
                      <Zap className="h-3.5 w-3.5 text-white fill-current" />
                    </div>
                    <h2 className="text-sm font-extrabold tracking-tight text-zinc-950 dark:text-white">
                      Lokswami Shorts
                    </h2>
                  </div>
                </div>

                <div className="scrollbar-hide flex gap-2.5 overflow-x-auto px-3.5 pb-2" data-reader-scroll="x">
                  {mobileShortsPreview.map((short) => (
                    <button
                      key={short.id}
                      type="button"
                      onClick={() => onSelectVideo(short.id, 'feed')}
                      className="w-[125px] sm:w-[145px] shrink-0 text-left block group"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm dark:border-white/5 dark:bg-black/40">
                        <ReaderImage
                          src={short.thumbnail}
                          alt={short.title}
                          fill
                          sizes="145px"
                          className="object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />

                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="line-clamp-2 text-[11px] sm:text-xs font-bold leading-snug text-white drop-shadow">
                            {short.title}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        );
      })}

      {hasMore && onLoadMore && (
        <div className="py-4 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLoadingMore ? copy.loading : copy.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}
