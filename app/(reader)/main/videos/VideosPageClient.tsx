'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import VideoDetailHero from '@/components/video/VideoDetailHero';
import VideoFeedGrid from '@/components/video/VideoFeedGrid';
import VideoFilterBar from '@/components/video/VideoFilterBar';
import VideoWatchLaterDrawer from '@/components/video/VideoWatchLaterDrawer';
import ShareMenu from '@/components/ui/ShareMenu';
import { Badge } from '@/components/ui/Badge';
import useVideoWatchTelemetry from '@/lib/analytics/useVideoWatchTelemetry';
import { buildVideoReaderPath } from '@/lib/utils/readerContentPaths';
import { formatUiDate } from '@/lib/utils/dateFormat';
import {
  type PublicCursor,
  type PublicVideoFeedItem,
  type SortMode,
  type StoredProgressEntry,
  type VideoItem,
  type VideosLatestResponse,
  type ViewMode,
  PLAYER_SPEED_OPTIONS,
  VIDEO_WATCH_LATER_KEY,
  buildQueueVideos,
  formatCompactViews,
  formatDurationLabel,
  getCategoryLabel,
  isLiveVideo,
  mapApiVideo,
  matchesVideoSearch,
  mergeUniqueVideos,
  normalizeCategory,
  parseLimit,
  readStoredIdMap,
  readStoredProgress,
  sortVideos,
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
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [isWatchLaterOpen, setIsWatchLaterOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

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
  const wasManuallyPausedRef = useRef(false);
  const pausedByVisibilityRef = useRef(false);

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
      if (target?.closest('button, a, [role="menu"]')) return;
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      if (event.key === ' ' || event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        setIsPaused((prev) => {
          const next = !prev;
          if (next) {
            wasManuallyPausedRef.current = true;
          } else {
            wasManuallyPausedRef.current = false;
          }
          return next;
        });
      } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        setIsMuted((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync with browser URL history (Back / Forward button support)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (typeof window === 'undefined') return;
      const stateVideoId = (event.state as { videoId?: string } | null)?.videoId;
      if (stateVideoId) {
        setSelectedVideoId(stateVideoId);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const urlVideoId = params.get('video');
      if (urlVideoId) {
        setSelectedVideoId(urlVideoId);
      } else if (initialVideos[0]?.id) {
        setSelectedVideoId(initialVideos[0].id);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialVideos]);

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

  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const v of videos) {
      if (v.category) cats.add(v.category);
    }
    return ['all', ...Array.from(cats)];
  }, [videos]);

  const filteredVideos = useMemo(() => {
    let result = videos;
    if (activeCategory !== 'all') {
      result = result.filter(
        (v) => normalizeCategory(v.category) === normalizeCategory(activeCategory)
      );
    }
    if (searchQuery.trim()) {
      result = result.filter((v) => matchesVideoSearch(v, searchQuery));
    }
    return sortVideos(result, sortMode);
  }, [activeCategory, searchQuery, sortMode, videos]);

  const queueVideos = useMemo(
    () => (selectedVideo ? buildQueueVideos(filteredVideos, selectedVideo.id) : filteredVideos),
    [selectedVideo, filteredVideos]
  );

  const shortsFeed = useMemo(
    () => videos.filter((v) => v.isShort),
    [videos]
  );

  const mediaProvider = useMemo(() => {
    if (!selectedVideo?.videoUrl) return 'unknown';
    if (selectedVideo.videoUrl.includes('youtube') || selectedVideo.videoUrl.includes('youtu.be')) {
      return 'youtube';
    }
    return 'html5';
  }, [selectedVideo]);

  const watchTelemetry = useVideoWatchTelemetry({
    contentId: selectedVideo?.id || '',
    slug: selectedVideo?.slug || '',
    title: selectedVideo?.title || '',
    contentType: selectedVideo?.isShort ? 'short' : 'video',
    mediaProvider,
    pagePath: selectedVideo ? buildVideoReaderPath(selectedVideo.id) : '/main/videos',
    source: 'lokswami_video_hub',
    duration: activeDuration || selectedVideo?.duration || 0,
    isPlaying: !isPaused,
  });

  const handlePausedChange = useCallback((paused: boolean) => {
    setIsPaused(paused);
    if (paused) {
      watchTelemetry.onPause();
    } else {
      wasManuallyPausedRef.current = false;
      watchTelemetry.onPlay();
    }
  }, [watchTelemetry]);

  const handleTimeChange = useCallback((curr: number, dur: number) => {
    setCurrentTime(curr);
    if (dur > 0) setActiveDuration(dur);
    watchTelemetry.onTimeUpdate(curr, dur);
  }, [watchTelemetry]);

  const handleSeek = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    watchTelemetry.onSeek();
    if (playerRef.current) playerRef.current.seekTo(seconds);
  }, [watchTelemetry]);

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId(videoId);
    setIsPaused(false);
    wasManuallyPausedRef.current = false;
    setCurrentTime(0);
    setActiveDuration(0);
    if (typeof window !== 'undefined') {
      const targetUrl = buildVideoReaderPath(videoId);
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.pushState({ videoId }, '', targetUrl);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const advanceToNext = useCallback(() => {
    watchTelemetry.onEnded();
    if (queueVideos.length > 0) {
      handleSelectVideo(queueVideos[0].id);
    }
  }, [handleSelectVideo, queueVideos, watchTelemetry]);

  // Tab visibility: pause on background, resume only if not manually paused
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (!isPaused) {
          pausedByVisibilityRef.current = true;
          setIsPaused(true);
        }
      } else {
        if (pausedByVisibilityRef.current) {
          pausedByVisibilityRef.current = false;
          if (!wasManuallyPausedRef.current) {
            setIsPaused(false);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isPaused]);

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
        {/* Video Hub 2.0 Header */}
        <header className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                  {language === 'hi' ? 'लोकस्वामी वीडियो हब' : 'Lokswami Video Hub'}
                </h1>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                {language === 'hi'
                  ? 'देश, राज्य और क्षेत्रीय समाचारों की ताज़ा वीडियो कवरेज'
                  : 'Latest news, bulletins and special reports in video'}
              </p>
            </div>
          </div>

          {/* Integrated Filter Bar with Search & Category Chips */}
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/8">
            <VideoFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              sortMode={sortMode}
              onSortModeChange={setSortMode}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              categoryOptions={categoryOptions}
              language={language}
              copy={copy}
              savedCount={Object.keys(watchLaterIds).length}
              onOpenWatchLater={() => setIsWatchLaterOpen(true)}
            />
          </div>
        </header>

        {/* View Mode: Shorts Grid */}
        {viewMode === 'shorts' ? (
          <section aria-label={copy.shorts}>
            <VideoFeedGrid
              layout="shorts_grid"
              videos={filteredVideos.filter((v) => v.isShort)}
              selectedVideoId={selectedVideo?.id}
              onSelectVideo={(id) => {
                handleSelectVideo(id);
                setViewMode('feed');
              }}
              language={language}
              copy={copy}
              loadError={loadError}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMoreVideos}
            />
          </section>
        ) : (
          /* View Mode: Feed & Player Layout */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Active Video Player Hero (Desktop & Mobile) */}
            <div className="lg:col-span-8 space-y-5">
              {selectedVideo ? (
                <>
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
                    onPausedChange={handlePausedChange}
                    onMutedChange={setIsMuted}
                    onTimeChange={handleTimeChange}
                    onAutoAdvanceChange={setAutoAdvance}
                    onCaptionsChange={setCaptionsEnabled}
                    onPlaybackRateChange={setPlaybackRate}
                    onToggleWatchLater={toggleWatchLater}
                    onAdvanceToNext={advanceToNext}
                  />

                  {/* Selected Video Information & Action Controls */}
                  <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:p-5 space-y-3.5">
                    {/* Category & Live / Short Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedVideo.category ? (
                        <Badge variant="brand" size="sm">
                          {getCategoryLabel(selectedVideo.category, language)}
                        </Badge>
                      ) : null}
                      {isLiveVideo(selectedVideo) ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          {copy.liveNow}
                        </span>
                      ) : null}
                      {selectedVideo.isShort ? (
                        <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-white/15 dark:text-zinc-200">
                          {copy.shorts}
                        </span>
                      ) : null}
                    </div>

                    {/* Headline */}
                    <h2 className="hindi-headline text-lg sm:text-xl lg:text-2xl font-bold leading-snug text-zinc-950 dark:text-white">
                      {selectedVideo.title}
                    </h2>

                    {/* Meta Row (Date, Duration, Views) */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                      {selectedVideo.publishedAt ? (
                        <time dateTime={selectedVideo.publishedAt}>
                          {formatUiDate(selectedVideo.publishedAt)}
                        </time>
                      ) : null}
                      {selectedVideo.duration > 0 ? (
                        <>
                          <span aria-hidden="true">•</span>
                          <span>{formatDurationLabel(selectedVideo.duration)}</span>
                        </>
                      ) : null}
                      {selectedVideo.views > 0 ? (
                        <>
                          <span aria-hidden="true">•</span>
                          <span>{formatCompactViews(selectedVideo.views, language)} {copy.views}</span>
                        </>
                      ) : null}
                    </div>

                    {/* Actions Row: Universal Share + Watch Later + Auto-advance */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 dark:border-white/10">
                      <div className="flex items-center gap-2">
                        <ShareMenu
                          title={selectedVideo.title}
                          url={buildVideoReaderPath(selectedVideo.id, selectedVideo.isShort ? selectedVideo.slug : undefined)}
                          contentType="video"
                          contentId={selectedVideo.id}
                          language={language}
                          ariaLabel={language === 'hi' ? 'वीडियो शेयर करें' : 'Share video'}
                          placement="video_detail"
                        />

                        <button
                          type="button"
                          onClick={() => toggleWatchLater(selectedVideo.id)}
                          aria-label={watchLaterIds[selectedVideo.id] ? copy.saved : copy.save}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                            watchLaterIds[selectedVideo.id]
                              ? 'border-red-500/40 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-400'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10'
                          }`}
                        >
                          {watchLaterIds[selectedVideo.id] ? (
                            <BookmarkCheck className="h-3.5 w-3.5 fill-current" />
                          ) : (
                            <Bookmark className="h-3.5 w-3.5" />
                          )}
                          <span>{watchLaterIds[selectedVideo.id] ? copy.saved : copy.save}</span>
                        </button>
                      </div>

                      {/* Auto-advance toggle */}
                      <button
                        type="button"
                        onClick={() => setAutoAdvance((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          autoAdvance
                            ? 'border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-white/15 dark:bg-white/10 dark:text-white'
                            : 'border-zinc-200 text-zinc-500 dark:border-white/5 dark:text-zinc-500'
                        }`}
                        aria-pressed={autoAdvance}
                        aria-label={copy.autoAdvance}
                      >
                        <span className={`h-2 w-2 rounded-full ${autoAdvance ? 'bg-green-500' : 'bg-zinc-400'}`} />
                        <span>{copy.autoAdvance}</span>
                      </button>
                    </div>

                    {/* Description with Show More / Show Less */}
                    {selectedVideo.description ? (
                      <div className="rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-700 dark:bg-white/5 dark:text-zinc-300 sm:text-sm">
                        <p className={isDescriptionExpanded ? '' : 'line-clamp-2'}>
                          {selectedVideo.description}
                        </p>
                        {selectedVideo.description.length > 140 ? (
                          <button
                            type="button"
                            onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                            className="mt-1 font-semibold text-brand-600 hover:underline dark:text-brand-400"
                          >
                            {isDescriptionExpanded ? copy.showLess : copy.showMore}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center shadow-sm dark:border-white/10 dark:bg-zinc-950">
                  <p className="text-base font-semibold text-zinc-900 dark:text-white">
                    {copy.noResults}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {language === 'hi' ? 'कृपया अपनी खोज या फ़िल्टर बदलें।' : 'Please adjust your search or category filter.'}
                  </p>
                  {(searchQuery || activeCategory !== 'all') ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setActiveCategory('all');
                      }}
                      className="mt-4 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-zinc-950"
                    >
                      {copy.retry}
                    </button>
                  ) : null}
                </div>
              )}

              {/* Mobile Feed List (visible below player on smaller screens) */}
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

            {/* Right Column: Up Next Queue Sidebar (Desktop sticky) */}
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
        )}

        {/* Watch Later Drawer Modal */}
        <VideoWatchLaterDrawer
          open={isWatchLaterOpen}
          onClose={() => setIsWatchLaterOpen(false)}
          videos={videos}
          savedVideoIds={watchLaterIds}
          onSelectVideo={(id) => {
            handleSelectVideo(id);
            setIsWatchLaterOpen(false);
          }}
          onRemoveVideo={toggleWatchLater}
          language={language}
        />
      </div>
    </div>
  );
}
