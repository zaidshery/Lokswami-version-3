import type { ShortsVideoItem } from '@/components/ui/VideoShortsFeed';
import { resolveNewsCategory } from '@/lib/constants/newsCategories';
import formatNumber from '@/lib/utils/formatNumber';
import { extractYouTubeVideoId, isYouTubeLiveUrl } from '@/lib/utils/youtube';

export const FALLBACK_VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
export const FALLBACK_THUMBNAIL = '/lokswami-share-preview.png';
export const VIDEO_WATCH_LATER_KEY = 'lokswami.video.watch-later.v1';
export const VIDEO_PROGRESS_PREFIX = 'lokswami.video.progress.v1:';
export const PLAYER_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type ViewMode = 'feed' | 'shorts';
export type SortMode = 'latest' | 'trending';

export type StoredProgressEntry = {
  currentTime: number;
  duration: number;
  updatedAt: string;
};

export type PublicCursor = {
  publishedAt: string;
  id: string;
};

export type PublicVideoFeedItem = {
  _id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  category: string;
  isShort: boolean;
  isPublished: boolean;
  shortsRank: number;
  views: number;
  createdAt?: string;
  publishedAt: string;
  updatedAt?: string;
};

export type VideoItem = ShortsVideoItem & {
  isShort: boolean;
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type VideosLatestResponse = {
  items?: PublicVideoFeedItem[];
  limit?: number;
  hasMore?: boolean;
  nextCursor?: PublicCursor | null;
};

export function safeString(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

export function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseLimit(value: unknown, fallback = 20) {
  const parsed = Math.floor(safeNumber(value, fallback));
  return parsed > 0 ? parsed : fallback;
}

export function normalizeCategory(value: string) {
  return safeString(value).toLowerCase();
}

export function getCategoryLabel(value: string, language: 'hi' | 'en') {
  const resolved = resolveNewsCategory(value);
  if (!resolved) return value || (language === 'hi' ? 'वीडियो' : 'Video');
  return language === 'hi' ? resolved.name : resolved.nameEn;
}

export function isPdfThumbnail(value: string) {
  return /\.pdf($|[?#])/i.test(value) || /\/pdf\//i.test(value);
}

export function formatDurationLabel(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatPlaybackSpeedLabel(speed: number) {
  return speed === 1 ? '1x' : `${speed}x`;
}

export function formatCompactViews(value: number, language: 'hi' | 'en') {
  const safeValue = Math.max(0, Math.floor(value || 0));
  try {
    return new Intl.NumberFormat(language === 'hi' ? 'en-IN' : 'en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(safeValue);
  } catch {
    return formatNumber(safeValue, language === 'hi' ? 'en-IN' : 'en-US');
  }
}

export function formatRelativeTime(value: string, language: 'hi' | 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return language === 'hi' ? 'अभी' : 'Now';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return language === 'hi' ? 'अभी' : 'Now';
  }

  if (diffMinutes < 60) {
    return language === 'hi' ? `${diffMinutes} मिनट पहले` : `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return language === 'hi' ? `${diffHours} घंटे पहले` : `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return language === 'hi' ? `${diffDays} दिन पहले` : `${diffDays}d ago`;
  }

  return date.toLocaleDateString(language === 'hi' ? 'en-IN' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: diffDays > 365 ? 'numeric' : undefined,
  });
}

export function getYouTubeThumbnail(videoUrl: string) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) return '';
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function isLiveVideo(
  item?: { videoUrl?: string; duration?: number; title?: string; isLive?: boolean } | null
): boolean {
  if (!item) return false;
  if (item.isLive) return true;
  if (item.title && /(?:🔴|\blive\b|लाइव)/i.test(item.title)) return true;
  if (!item.videoUrl) return false;
  return isYouTubeLiveUrl(item.videoUrl) || item.duration === 0;
}

export function resolveThumbnail(item: Pick<PublicVideoFeedItem, 'thumbnail' | 'videoUrl'>) {
  const thumbnail = safeString(item.thumbnail);
  if (thumbnail && !isPdfThumbnail(thumbnail)) {
    return thumbnail;
  }

  return getYouTubeThumbnail(item.videoUrl) || FALLBACK_THUMBNAIL;
}

export function mapApiVideo(item: PublicVideoFeedItem): VideoItem {
  return {
    id: safeString(item._id),
    title: safeString(item.title, 'Lokswami Video'),
    description: safeString(item.description),
    thumbnail: resolveThumbnail(item),
    videoUrl: safeString(item.videoUrl, FALLBACK_VIDEO_URL),
    duration: Math.max(0, Math.floor(safeNumber(item.duration, 0))),
    category: safeString(item.category, 'regional'),
    views: Math.max(0, Math.floor(safeNumber(item.views, 0))),
    publishedAt: safeString(item.publishedAt, new Date().toISOString()),
    shortsRank: Math.max(0, Math.floor(safeNumber(item.shortsRank, 0))),
    isPublished: item.isPublished !== false,
    isShort: Boolean(item.isShort),
    createdAt: safeString(item.createdAt),
    updatedAt: safeString(item.updatedAt),
  };
}

export function mergeUniqueVideos(currentItems: VideoItem[], incomingItems: VideoItem[]) {
  const merged = new Map<string, VideoItem>();

  for (const item of currentItems) {
    if (item.id) {
      merged.set(item.id, item);
    }
  }

  for (const item of incomingItems) {
    if (!item.id) continue;
    const existing = merged.get(item.id);
    merged.set(item.id, existing ? { ...existing, ...item } : item);
  }

  return Array.from(merged.values());
}

export function sortVideos(items: VideoItem[], sortMode: SortMode) {
  return [...items].sort((left, right) => {
    if (sortMode === 'trending') {
      const viewDelta = right.views - left.views;
      if (viewDelta !== 0) return viewDelta;
    }

    const dateDelta =
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    if (dateDelta !== 0) return dateDelta;

    if (sortMode === 'trending') {
      return right.shortsRank - left.shortsRank;
    }

    return left.title.localeCompare(right.title);
  });
}

export function matchesVideoSearch(item: VideoItem, query: string) {
  const normalized = safeString(query).toLowerCase();
  if (!normalized) return true;

  return [item.title, item.description, item.category].some((value) =>
    safeString(value).toLowerCase().includes(normalized)
  );
}

export function buildQueueVideos(items: VideoItem[], selectedId: string) {
  if (!items.length) return [];
  const selectedIndex = items.findIndex((item) => item.id === selectedId);

  if (selectedIndex < 0) {
    return items;
  }

  return [...items.slice(selectedIndex + 1), ...items.slice(0, selectedIndex)].filter(
    (item) => item.id !== selectedId
  );
}

export function readStoredIdMap(storageKey: string) {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Record<
      string,
      boolean
    >;
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => safeString(key) && Boolean(value))
    );
  } catch {
    return {};
  }
}

export function readStoredProgress(videos: VideoItem[]) {
  if (typeof window === 'undefined') return {};

  const progressById: Record<string, StoredProgressEntry> = {};

  for (const video of videos) {
    try {
      const raw = window.localStorage.getItem(`${VIDEO_PROGRESS_PREFIX}:${video.id}`);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as Partial<StoredProgressEntry>;
      const currentTime = Math.max(0, safeNumber(parsed.currentTime, 0));
      const duration = Math.max(0, safeNumber(parsed.duration, video.duration));

      if (currentTime <= 0 && duration <= 0) continue;

      progressById[video.id] = {
        currentTime,
        duration,
        updatedAt: safeString(parsed.updatedAt, new Date().toISOString()),
      };
    } catch {
      // Ignore invalid local storage values.
    }
  }

  return progressById;
}
