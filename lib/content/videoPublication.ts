import { resolveVideoWorkflow } from '@/lib/workflow/video';

export const VIDEO_MEDIA_PROVIDERS = ['youtube', 'spaces-mp4'] as const;
export const VIDEO_ASPECT_RATIOS = ['9:16', '16:9', '1:1', 'unknown'] as const;
export const VIDEO_PROCESSING_STATUSES = ['ready', 'processing', 'failed'] as const;

export type VideoMediaProvider = (typeof VIDEO_MEDIA_PROVIDERS)[number];
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];
export type VideoProcessingStatus = (typeof VIDEO_PROCESSING_STATUSES)[number];

export type PublicVideoSource = Record<string, unknown> & {
  _id?: unknown;
  id?: unknown;
  title?: unknown;
  description?: unknown;
  thumbnail?: unknown;
  videoUrl?: unknown;
  duration?: unknown;
  category?: unknown;
  isShort?: unknown;
  isPublished?: unknown;
  shortsRank?: unknown;
  views?: unknown;
  createdAt?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
  workflow?: unknown;
  slug?: unknown;
  articleId?: unknown;
  posterUrl?: unknown;
  mediaProvider?: unknown;
  playbackUrl?: unknown;
  hlsUrl?: unknown;
  aspectRatio?: unknown;
  captionUrl?: unknown;
  transcript?: unknown;
  processingStatus?: unknown;
  instagramUrl?: unknown;
  youtubeUrl?: unknown;
};

export type PublicVideoItem = {
  _id: string;
  slug: string;
  articleId: string;
  title: string;
  description: string;
  thumbnail: string;
  posterUrl: string;
  videoUrl: string;
  playbackUrl: string;
  hlsUrl: string;
  mediaProvider: VideoMediaProvider;
  aspectRatio: VideoAspectRatio;
  captionUrl: string;
  transcript: string;
  processingStatus: VideoProcessingStatus;
  instagramUrl: string;
  youtubeUrl: string;
  duration: number;
  category: string;
  isShort: boolean;
  isPublished: true;
  shortsRank: number;
  views: number;
  createdAt: string;
  publishedAt: string;
  updatedAt: string;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toId(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'toString' in value) {
    return String(value).trim();
  }
  return '';
}

function toIsoDate(value: unknown, fallback = new Date()) {
  const parsed = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

export function normalizeVideoSlug(value: unknown) {
  return text(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function buildVideoSlug(title: unknown, identity?: unknown) {
  const base = normalizeVideoSlug(title) || 'lokswami-swipe';
  const suffix = normalizeVideoSlug(toId(identity)).slice(-12);
  return suffix ? `${base.slice(0, Math.max(1, 180 - suffix.length - 1))}-${suffix}` : base;
}

export function buildCollisionSafeVideoSlug(input: {
  title: unknown;
  identity: unknown;
  preferred?: unknown;
  usedSlugs: Set<string>;
}) {
  const preferred = normalizeVideoSlug(input.preferred);
  const derived = buildVideoSlug(input.title, input.identity);
  let candidate = preferred || derived;
  if (input.usedSlugs.has(candidate) && candidate !== derived) {
    candidate = derived;
  }
  const collisionBase = candidate;
  let counter = 2;
  while (input.usedSlugs.has(candidate)) {
    const suffix = `-${counter}`;
    candidate = `${collisionBase.slice(0, Math.max(1, 180 - suffix.length))}${suffix}`;
    counter += 1;
  }
  input.usedSlugs.add(candidate);
  return candidate;
}

export function inferVideoMediaProvider(value: unknown): VideoMediaProvider {
  const normalized = text(value).toLowerCase();
  if (normalized === 'youtube' || normalized === 'spaces-mp4') return normalized;
  return /(?:youtube\.com|youtu\.be)/i.test(normalized) ? 'youtube' : 'spaces-mp4';
}

export function normalizeVideoAspectRatio(value: unknown): VideoAspectRatio {
  const normalized = text(value);
  return VIDEO_ASPECT_RATIOS.includes(normalized as VideoAspectRatio)
    ? (normalized as VideoAspectRatio)
    : 'unknown';
}

export function normalizeVideoProcessingStatus(value: unknown): VideoProcessingStatus {
  const normalized = text(value).toLowerCase();
  return VIDEO_PROCESSING_STATUSES.includes(normalized as VideoProcessingStatus)
    ? (normalized as VideoProcessingStatus)
    : 'ready';
}

export function isPubliclyPublishedVideo(source: PublicVideoSource, now = new Date()) {
  if (source.isPublished === false) return false;
  const workflow = resolveVideoWorkflow(source);
  if (workflow.status !== 'published') return false;
  if (workflow.scheduledFor && workflow.scheduledFor.getTime() > now.getTime()) return false;

  const publishedAt = new Date(String(source.publishedAt || ''));
  if (!Number.isNaN(publishedAt.getTime()) && publishedAt.getTime() > now.getTime()) return false;

  return normalizeVideoProcessingStatus(source.processingStatus) === 'ready';
}

export function isSwipeFeedEligibleVideo(source: PublicVideoSource, now = new Date()) {
  return (
    Boolean(source.isShort) &&
    isPubliclyPublishedVideo(source, now) &&
    normalizeVideoAspectRatio(source.aspectRatio) !== '16:9'
  );
}

export function validateSwipePublishFields(source: PublicVideoSource) {
  if (!source.isShort) return null;
  if (!normalizeVideoSlug(source.slug)) return 'Swipe News requires a unique slug before publishing.';
  if (!toId(source.articleId)) return 'Swipe News requires a related published article before publishing.';
  if (!text(source.posterUrl) && !text(source.thumbnail)) return 'Swipe News requires a poster before publishing.';
  if (!text(source.playbackUrl) && !text(source.videoUrl)) return 'Swipe News requires ready media before publishing.';
  if (normalizeVideoProcessingStatus(source.processingStatus) !== 'ready') {
    return 'Swipe News media must be ready before publishing.';
  }
  if (normalizeVideoAspectRatio(source.aspectRatio) !== '9:16') {
    return 'Swipe News requires a 9:16 vertical video before publishing.';
  }
  return null;
}

export function toPublicVideoItem(
  source: PublicVideoSource,
  options: { requireShort?: boolean; now?: Date } = {}
): PublicVideoItem | null {
  if (!isPubliclyPublishedVideo(source, options.now)) return null;
  if (options.requireShort && !source.isShort) return null;
  if (options.requireShort && normalizeVideoAspectRatio(source.aspectRatio) === '16:9') return null;

  const id = toId(source._id) || toId(source.id);
  const title = text(source.title);
  const category = text(source.category);
  const legacyVideoUrl = text(source.videoUrl);
  const playbackUrl = text(source.playbackUrl) || legacyVideoUrl;
  if (!id || !title || !category || !playbackUrl) return null;

  const publishedAt = toIsoDate(source.publishedAt);
  const thumbnail = text(source.thumbnail);
  const posterUrl = text(source.posterUrl) || thumbnail;
  const explicitSlug = normalizeVideoSlug(source.slug);

  return {
    _id: id,
    slug: explicitSlug || buildVideoSlug(title, id),
    articleId: toId(source.articleId),
    title,
    description: text(source.description),
    thumbnail: posterUrl || thumbnail,
    posterUrl: posterUrl || thumbnail,
    videoUrl: legacyVideoUrl || playbackUrl,
    playbackUrl,
    hlsUrl: text(source.hlsUrl),
    mediaProvider: inferVideoMediaProvider(source.mediaProvider || playbackUrl),
    aspectRatio: normalizeVideoAspectRatio(source.aspectRatio),
    captionUrl: text(source.captionUrl),
    transcript: text(source.transcript),
    processingStatus: 'ready',
    instagramUrl: text(source.instagramUrl),
    youtubeUrl: text(source.youtubeUrl),
    duration: Math.max(1, Math.floor(number(source.duration, 1))),
    category,
    isShort: Boolean(source.isShort),
    isPublished: true,
    shortsRank: Math.floor(number(source.shortsRank)),
    views: Math.max(0, Math.floor(number(source.views))),
    createdAt: toIsoDate(source.createdAt || publishedAt),
    publishedAt,
    updatedAt: toIsoDate(source.updatedAt || publishedAt),
  };
}

export const PUBLIC_VIDEO_PROJECTION = [
  '_id',
  'slug',
  'articleId',
  'title',
  'description',
  'thumbnail',
  'posterUrl',
  'videoUrl',
  'playbackUrl',
  'hlsUrl',
  'mediaProvider',
  'aspectRatio',
  'captionUrl',
  'transcript',
  'processingStatus',
  'instagramUrl',
  'youtubeUrl',
  'duration',
  'category',
  'isShort',
  'isPublished',
  'shortsRank',
  'views',
  'createdAt',
  'publishedAt',
  'updatedAt',
  'workflow.status',
  'workflow.scheduledFor',
].join(' ');
