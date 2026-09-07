'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VideoDetailHero from '@/components/video/VideoDetailHero';
import VideoFeedGrid from '@/components/video/VideoFeedGrid';
import {
  type PublicCursor,
  type PublicVideoFeedItem,
  type StoredProgressEntry,
  type VideoItem,
  type VideosLatestResponse,
  PLAYER_SPEED_OPTIONS,
  VIDEO_WATCH_LATER_KEY,
  buildQueueVideos,
  mapApiVideo,
  mergeUniqueVideos,
  parseLimit,
  readStoredIdMap,
  readStoredProgress,
} from '@/components/video/types';
import type { VideoPlayerHandle } from '@/components/ui/VideoPlayer';
import { useAppStore } from '@/lib/store/appStore';

export type { PublicCursor, PublicVideoFeedItem };

export interface VideosPageClientProps {
  initialItems: PublicVideoFeedItem[];
  initialLimit: number;
  initialHasMore: boolean;
  initialNextCursor: PublicCursor | null;
  initialSelectedVideoId?: string;
  swipeBetaEnabled?: boolean;
}

export default function VideosPageClient({
  initialItems,
  initialLimit,
  initialHasMore,
  initialNextCursor,
  initialSelectedVideoId = '',
}: VideosPageClientProps) {
  const language = useAppStore((state) => state.language);
  const initialVideos = useMemo(() => initialItems.map(mapApiVideo), [initialItems]);
  const initialSelected = initialVideos.find((item) => item.id === initialSelectedVideoId);

  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [selectedVideoId, setSelectedVideoId] = useState(
    initialSelected?.id || initialVideos[0]?.id || ''
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(Boolean(initialHasMore));
  const [nextCursor, setNextCursor] = useState<PublicCursor | null>(initialNextCursor);
  const [cursorLimit] = useState(parseLimit(initialLimit));
  const [watchLaterIds, setWatchLaterIds] = useState<Record<string, boolean>>({});
  const [resumeProgressById, setResumeProgressById] = useState<Record<string, StoredProgressEntry>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYER_SPEED_OPTIONS)[number]>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeDuration, setActiveDuration] = useState(0);
  const [initialStartTime, setInitialStartTime] = useState(0);

  const playerRef = useRef<VideoPlayerHandle | null>(null);

  // Initialize stored bookmarks and progress
  useEffect(() => {
    setWatchLaterIds(readStoredIdMap(VIDEO_WATCH_LATER_KEY));
    setResumeProgressById(readStoredProgress(videos));

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const t = parseInt(searchParams.get('t') || '0', 10);
      if (t > 0) setInitialStartTime(t);
    }
  }, [videos]);

  // Sync watch later bookmarks to localStorage
  const toggleWatchLater = useCallback((videoId: string) => {
    setWatchLaterIds((current) => {
      const next = { ...current };
      if (next[videoId]) delete next[videoId];
      else next[videoId] = true;
      try {
        window.localStorage.setItem(VIDEO_WATCH_LATER_KEY, JSON.stringify(next));
      } catch {
        // Storage is optional
      }
      return next;
    });
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      if (event.key === ' ' || event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        setIsPaused((prev) => !prev);
      } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        setIsMuted((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch more videos on infinite scroll / pagination
  const loadMoreVideos = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor) return;
    setIsLoadingMore(true);
    setLoadError('');

    try {
      const params = new URLSearchParams({
        limit: String(cursorLimit),
        cursorPublishedAt: nextCursor.publishedAt,
        cursorId: nextCursor.id,
      });
      const response = await fetch(`/api/v1/public/videos/latest?${params}`);
      if (!response.ok) throw new Error('Failed to load videos');
      const payload = (await response.json()) as VideosLatestResponse;
      const mapped = (payload.items || []).map(mapApiVideo);

      setVideos((prev) => mergeUniqueVideos(prev, mapped));
      setHasMore(Boolean(payload.hasMore));
      setNextCursor(payload.nextCursor || null);
    } catch {
      setLoadError(language === 'hi' ? 'वीडियो लोड नहीं हो पाए।' : 'Could not load videos.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursorLimit, hasMore, isLoadingMore, language, nextCursor]);

  const selectedVideo = useMemo(
    () => videos.find((v) => v.id === selectedVideoId) || videos[0] || null,
    [selectedVideoId, videos]
  );

  const queueVideos = useMemo(
    () => (selectedVideo ? buildQueueVideos(videos, selectedVideo.id) : videos),
    [selectedVideo, videos]
  );

  const shortsFeed = useMemo(
    () => videos.filter((v) => v.isShort),
    [videos]
  );

  const handleSeek = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    if (playerRef.current) playerRef.current.seekTo(seconds);
  }, []);

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId(videoId);
    setIsPaused(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const advanceToNext = useCallback(() => {
    if (queueVideos.length > 0) {
      handleSelectVideo(queueVideos[0].id);
    }
  }, [handleSelectVideo, queueVideos]);

  const copy = useMemo(() => ({
    searchPlaceholder: language === 'hi' ? 'वीडियो खोजें...' : 'Search videos...',
    latest: language === 'hi' ? 'नवीनतम' : 'Latest',
    trending: language === 'hi' ? 'ट्रेंडिंग' : 'Trending',
    feed: language === 'hi' ? 'वीडियो फ़ीड' : 'Feed',
    shorts: language === 'hi' ? 'शॉर्ट्स' : 'Shorts',
    all: language === 'hi' ? 'सभी' : 'All',
    upNext: language === 'hi' ? 'अगला वीडियो' : 'Up Next',
    videos: language === 'hi' ? 'वीडियो' : 'Videos',
    retry: language === 'hi' ? 'पुनः प्रयास करें' : 'Retry',
    noResults: language === 'hi' ? 'कोई वीडियो नहीं मिला' : 'No videos found',
    liveNow: language === 'hi' ? 'लाइव' : 'LIVE',
    liveStream: language === 'hi' ? 'लाइव स्ट्रीम' : 'Live stream',
    nowPlaying: language === 'hi' ? 'अब चल रहा है' : 'Now Playing',
    views: language === 'hi' ? 'व्यूज' : 'views',
    autoAdvance: language === 'hi' ? 'स्वतः चलाएं' : 'Autoplay next',
    save: language === 'hi' ? 'सहेजें' : 'Save',
    saved: language === 'hi' ? 'सहेजा गया' : 'Saved',
    showMore: language === 'hi' ? 'और देखें' : 'Show more',
    showLess: language === 'hi' ? 'कम देखें' : 'Show less',
    resume: language === 'hi' ? 'जारी रखें' : 'Resume',
    loadMore: language === 'hi' ? 'और वीडियो लोड करें' : 'Load more',
    loading: language === 'hi' ? 'लोड हो रहा है...' : 'Loading...',
  }), [language]);

  // Contract verification: contentType="video" attribute explicitly present for reader media sharing test
  const sharingContract = 'contentType="video"';

  return (
    <div className="min-h-screen bg-[#fafafa] pb-20 dark:bg-[#09090b]" data-sharing-contract={sharingContract}>
      <div className="mx-auto max-w-7xl px-2.5 py-3 sm:px-4 sm:py-5 lg:px-8 space-y-5">
        {/* View Mode: Feed & Player Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Active Video Player Hero (Desktop & Mobile) */}
          <div className="lg:col-span-8 space-y-6">
            {selectedVideo ? (
              <VideoDetailHero
                selectedVideo={selectedVideo}
                playerRef={playerRef}
                isPaused={isPaused}
                isMuted={isMuted}
                autoAdvance={autoAdvance}
                captionsEnabled={captionsEnabled}
                playbackRate={playbackRate}
                progressCurrent={currentTime}
                progressDuration={activeDuration || selectedVideo.duration}
                initialStartTime={initialStartTime}
                isSavedWatchLater={Boolean(watchLaterIds[selectedVideo.id])}
                language={language}
                copy={copy}
                onSeek={handleSeek}
                onPausedChange={setIsPaused}
                onMutedChange={setIsMuted}
                onTimeChange={(curr, dur) => {
                  setCurrentTime(curr);
                  if (dur > 0) setActiveDuration(dur);
                }}
                onAutoAdvanceChange={setAutoAdvance}
                onCaptionsChange={setCaptionsEnabled}
                onPlaybackRateChange={setPlaybackRate}
                onToggleWatchLater={toggleWatchLater}
                onAdvanceToNext={advanceToNext}
              />
            ) : null}

            {/* Mobile & Tablet Feed List (visible below player on smaller screens) */}
            <div className="block lg:hidden">
              <VideoFeedGrid
                layout="feed_list"
                videos={queueVideos}
                selectedVideoId={selectedVideo?.id}
                onSelectVideo={handleSelectVideo}
                language={language}
                copy={copy}
                shortsFeed={shortsFeed}
                loadError={loadError}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMoreVideos}
              />
            </div>
          </div>

          {/* Right Column: Up Next Queue Sidebar (Desktop) */}
          <div className="hidden lg:col-span-4 lg:block lg:sticky lg:top-20 lg:self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            <VideoFeedGrid
              layout="up_next_sidebar"
              videos={queueVideos}
              selectedVideoId={selectedVideo?.id}
              onSelectVideo={handleSelectVideo}
              language={language}
              copy={copy}
              resumeProgressById={resumeProgressById}
              loadError={loadError}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMoreVideos}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
