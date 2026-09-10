import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  canReadContent,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import {
  buildVideoSlug,
  inferVideoMediaProvider,
  normalizeVideoAspectRatio,
  normalizeVideoProcessingStatus,
  normalizeVideoSlug,
  validateSwipePublishFields,
} from '@/lib/content/videoPublication';
import { getPublicArticleBySlug } from '@/lib/server/publicArticles';
import {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  isYouTubeLiveUrl,
} from '@/lib/utils/youtube';
import { isWorkflowStatus } from '@/lib/workflow/types';
import {
  resolveVideoWorkflow,
  toWorkflowActorRef,
} from '@/lib/workflow/video';
import type { VideoLike } from './videoTypes';

const VIDEO_CATEGORIES = NEWS_CATEGORIES.map((category) => category.nameEn);

export const FILE_STORE_UNBOUNDED_LIMIT = Number.MAX_SAFE_INTEGER;

const WORKFLOW_ACTIONS = new Set<ContentTransitionAction>([
  'submit',
  'assign',
  'start_review',
  'move_to_copy_edit',
  'request_changes',
  'mark_ready_for_approval',
  'approve',
  'reject',
  'schedule',
  'publish',
  'fast_publish',
  'archive',
]);

export type CreateIntent = 'draft' | 'submit' | 'publish';

function isValidCategory(value: string) {
  return VIDEO_CATEGORIES.includes(value);
}

export function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isWorkflowAction(value: unknown): value is ContentTransitionAction {
  return typeof value === 'string' && WORKFLOW_ACTIONS.has(value as ContentTransitionAction);
}

export function normalizeCreateIntent(value: unknown, legacyPublished: boolean): CreateIntent {
  if (value === 'draft' || value === 'submit' || value === 'publish') {
    return value;
  }
  return legacyPublished ? 'publish' : 'draft';
}

export function normalizeVideoInput(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const description = typeof source.description === 'string' ? source.description.trim() : '';
  const videoUrl = typeof source.videoUrl === 'string' ? source.videoUrl.trim() : '';
  const playbackUrl =
    typeof source.playbackUrl === 'string' && source.playbackUrl.trim()
      ? source.playbackUrl.trim()
      : videoUrl;
  let thumbnail = typeof source.thumbnail === 'string' ? source.thumbnail.trim() : '';
  if (!thumbnail && videoUrl) {
    thumbnail = getYouTubeThumbnail(videoUrl) || '';
  }

  const category = typeof source.category === 'string' ? source.category.trim() : '';
  const isLive = isYouTubeLiveUrl(videoUrl);
  const parsedDuration = Number.parseInt(String(source.duration ?? ''), 10);
  const duration =
    Number.isFinite(parsedDuration) && parsedDuration >= 0
      ? parsedDuration
      : isLive
        ? 0
        : 60;

  const shortsRank = Number.isFinite(Number(source.shortsRank))
    ? Number.parseInt(String(source.shortsRank), 10)
    : 0;
  const isShort = Boolean(source.isShort);
  const isPublished =
    typeof source.isPublished === 'boolean' ? source.isPublished : true;

  const publishedAt =
    typeof source.publishedAt === 'string' || source.publishedAt instanceof Date
      ? new Date(source.publishedAt)
      : new Date();

  return {
    title,
    description,
    thumbnail,
    videoUrl,
    category,
    duration,
    shortsRank: Number.isFinite(shortsRank) ? shortsRank : 0,
    isShort,
    isPublished,
    publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
    slug: normalizeVideoSlug(source.slug) || buildVideoSlug(title, Date.now().toString(36)),
    articleId: typeof source.articleId === 'string' ? source.articleId.trim() : '',
    posterUrl:
      typeof source.posterUrl === 'string' && source.posterUrl.trim()
        ? source.posterUrl.trim()
        : thumbnail,
    mediaProvider: inferVideoMediaProvider(source.mediaProvider || playbackUrl),
    playbackUrl,
    hlsUrl: typeof source.hlsUrl === 'string' ? source.hlsUrl.trim() : '',
    aspectRatio: normalizeVideoAspectRatio(source.aspectRatio),
    captionUrl: typeof source.captionUrl === 'string' ? source.captionUrl.trim() : '',
    transcript: typeof source.transcript === 'string' ? source.transcript.trim() : '',
    processingStatus: normalizeVideoProcessingStatus(source.processingStatus),
    instagramUrl: typeof source.instagramUrl === 'string' ? source.instagramUrl.trim() : '',
    youtubeUrl: typeof source.youtubeUrl === 'string' ? source.youtubeUrl.trim() : '',
  };
}

export function validateVideoInput(input: ReturnType<typeof normalizeVideoInput>) {
  if (!input.title || !input.description || !input.videoUrl || !input.category) {
    return 'Missing required fields';
  }

  if (!isValidCategory(input.category)) {
    return 'Invalid category';
  }

  if (!Number.isFinite(input.duration) || input.duration < 0) {
    return 'Invalid duration';
  }

  const youtubeId = extractYouTubeVideoId(input.playbackUrl);
  const isDirectHttpsVideo = /^https:\/\/[^\s]+(?:\.mp4)(?:[?#].*)?$/i.test(input.playbackUrl);
  if (input.mediaProvider === 'youtube' ? !youtubeId : !isDirectHttpsVideo) {
    return 'Video must use a valid YouTube URL or an HTTPS MP4 playback URL';
  }

  return null;
}

export function validateSwipePublishReadiness(
  input: ReturnType<typeof normalizeVideoInput>,
  intent: CreateIntent
) {
  if (intent !== 'publish' || !input.isShort) return null;
  return validateSwipePublishFields(input);
}

export function buildInitialWorkflow(intent: CreateIntent, user: AdminSessionIdentity) {
  const actor = toWorkflowActorRef(user);
  const now = new Date();

  if (intent === 'draft') {
    return {
      status: 'draft' as const,
      priority: 'normal' as const,
      createdBy: actor,
    };
  }

  if (intent === 'submit') {
    return {
      status: 'submitted' as const,
      priority: 'normal' as const,
      createdBy: actor,
      submittedAt: now,
    };
  }

  return {
    status: 'published' as const,
    priority: 'normal' as const,
    createdBy: actor,
    publishedAt: now,
  };
}

export function resolveVideoRecord(
  video: VideoLike,
  createdBy?: ReturnType<typeof toWorkflowActorRef>
) {
  const workflow = resolveVideoWorkflow({
    workflow:
      typeof video.workflow === 'object' && video.workflow
        ? (video.workflow as Record<string, unknown>)
        : null,
    isPublished: video.isPublished,
    publishedAt: video.publishedAt,
    updatedAt: video.updatedAt,
    createdBy,
  });

  return {
    ...video,
    isPublished: workflow.status === 'published',
    workflow,
  };
}

export function buildVideoPermissionRecord(video: VideoLike) {
  return {
    workflow: resolveVideoWorkflow({
      workflow:
        typeof video.workflow === 'object' && video.workflow
          ? (video.workflow as Record<string, unknown>)
          : null,
      isPublished: video.isPublished,
      publishedAt: video.publishedAt,
      updatedAt: video.updatedAt,
    }),
  };
}

export function matchesVideoFilters(
  video: ReturnType<typeof resolveVideoRecord>,
  user: AdminSessionIdentity,
  filters: {
    category?: string | null;
    type?: string | null;
    search?: string;
    published?: boolean;
    workflowStatus?: string;
  }
) {
  if (!canReadContent(user, buildVideoPermissionRecord(video), { allowViewerRead: true })) {
    return false;
  }

  if (filters.category && filters.category !== 'all' && video.category !== filters.category) {
    return false;
  }

  if (filters.type === 'shorts' && !video.isShort) return false;
  if (filters.type === 'standard' && video.isShort) return false;
  if (typeof filters.published === 'boolean' && video.isPublished !== filters.published) {
    return false;
  }
  if (filters.workflowStatus && video.workflow.status !== filters.workflowStatus) {
    return false;
  }

  if (!filters.search) return true;
  const needle = filters.search.toLowerCase();
  return (
    String(video.title || '').toLowerCase().includes(needle) ||
    String(video.description || '').toLowerCase().includes(needle) ||
    String(video.category || '').toLowerCase().includes(needle)
  );
}

export function sortVideos(
  videos: ReturnType<typeof resolveVideoRecord>[],
  sort: string | null | undefined,
  type: string | null | undefined
) {
  return [...videos].sort((left, right) => {
    if (sort === 'trending') {
      return (
        Number(right.views || 0) - Number(left.views || 0) ||
        new Date(String(right.updatedAt || right.publishedAt || 0)).getTime() -
          new Date(String(left.updatedAt || left.publishedAt || 0)).getTime()
      );
    }

    if (sort === 'shorts' || type === 'shorts') {
      return (
        Number(right.shortsRank || 0) - Number(left.shortsRank || 0) ||
        new Date(String(right.updatedAt || right.publishedAt || 0)).getTime() -
          new Date(String(left.updatedAt || left.publishedAt || 0)).getTime()
      );
    }

    return (
      new Date(String(right.updatedAt || right.publishedAt || 0)).getTime() -
      new Date(String(left.updatedAt || left.publishedAt || 0)).getTime()
    );
  });
}

export function normalizeVideoUpdate(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const updates: Record<string, unknown> = {};

  if (typeof source.title === 'string') updates.title = source.title.trim();
  if (typeof source.description === 'string') updates.description = source.description.trim();
  if (typeof source.thumbnail === 'string') updates.thumbnail = source.thumbnail.trim();
  if (typeof source.videoUrl === 'string') {
    const videoUrl = source.videoUrl.trim();
    const isDirectHttpsVideo = /^https:\/\/[^\s]+(?:\.mp4)(?:[?#].*)?$/i.test(videoUrl);
    if (!videoUrl || (!extractYouTubeVideoId(videoUrl) && !isDirectHttpsVideo)) {
      return {
        updates: null,
        error: 'Video must use a valid YouTube URL or an HTTPS MP4 playback URL',
      };
    }
    updates.videoUrl = videoUrl;
    if (!updates.thumbnail) {
      updates.thumbnail = getYouTubeThumbnail(videoUrl) || '';
    }
  }

  if (typeof source.slug === 'string') updates.slug = normalizeVideoSlug(source.slug);
  if (typeof source.articleId === 'string') updates.articleId = source.articleId.trim();
  if (typeof source.posterUrl === 'string') updates.posterUrl = source.posterUrl.trim();
  if (typeof source.playbackUrl === 'string') updates.playbackUrl = source.playbackUrl.trim();
  if (typeof source.hlsUrl === 'string') updates.hlsUrl = source.hlsUrl.trim();
  if (typeof source.captionUrl === 'string') updates.captionUrl = source.captionUrl.trim();
  if (typeof source.transcript === 'string') updates.transcript = source.transcript.trim();
  if (typeof source.instagramUrl === 'string') updates.instagramUrl = source.instagramUrl.trim();
  if (typeof source.youtubeUrl === 'string') updates.youtubeUrl = source.youtubeUrl.trim();
  if (source.mediaProvider !== undefined) {
    updates.mediaProvider = inferVideoMediaProvider(source.mediaProvider);
  }
  if (source.aspectRatio !== undefined) {
    updates.aspectRatio = normalizeVideoAspectRatio(source.aspectRatio);
  }
  if (source.processingStatus !== undefined) {
    updates.processingStatus = normalizeVideoProcessingStatus(source.processingStatus);
  }
  if (typeof source.category === 'string') updates.category = source.category.trim();

  if (source.duration !== undefined) {
    const duration = Number.parseInt(String(source.duration), 10);
    if (!Number.isFinite(duration) || duration < 0) {
      return { updates: null, error: 'Invalid duration' };
    }
    updates.duration = duration;
  }
  if (typeof source.isShort === 'boolean') updates.isShort = source.isShort;
  if (typeof source.isPublished === 'boolean') updates.isPublished = source.isPublished;

  if (source.shortsRank !== undefined) {
    const shortsRank = Number.parseInt(String(source.shortsRank), 10);
    if (!Number.isFinite(shortsRank)) {
      return { updates: null, error: 'Invalid shorts rank' };
    }
    updates.shortsRank = shortsRank;
  }

  if (source.views !== undefined) {
    const views = Number.parseInt(String(source.views), 10);
    if (!Number.isFinite(views) || views < 0) {
      return { updates: null, error: 'Invalid views count' };
    }
    updates.views = views;
  }

  if (source.publishedAt !== undefined) {
    const publishedAt = new Date(String(source.publishedAt));
    if (Number.isNaN(publishedAt.getTime())) {
      return { updates: null, error: 'Invalid published date' };
    }
    updates.publishedAt = publishedAt;
  }

  return { updates, error: null };
}

export function applyAutoThumbnail(updates: Record<string, unknown>) {
  if (
    typeof updates.videoUrl === 'string' &&
    (updates.thumbnail === undefined || String(updates.thumbnail).trim() === '')
  ) {
    const youtubeThumbnail = getYouTubeThumbnail(updates.videoUrl);
    if (youtubeThumbnail) updates.thumbnail = youtubeThumbnail;
  }
}

export function validateSwipeReadiness(record: Record<string, unknown>, action?: string) {
  if (action !== 'publish' && action !== 'fast_publish' && record.isPublished !== true) return null;
  return validateSwipePublishFields(record);
}

export async function validatePublishedSwipeArticle(record: Record<string, unknown>) {
  if (!record.isShort) return null;
  const articleId = String(record.articleId || '').trim();
  if (!articleId || !(await getPublicArticleBySlug(articleId))) {
    return 'Swipe News requires a related article that is already published.';
  }
  return null;
}

export function applyLegacyPublishCompatibility(
  currentWorkflow: ReturnType<typeof resolveVideoWorkflow>,
  explicitPublishedState: boolean | undefined
) {
  if (typeof explicitPublishedState !== 'boolean') return currentWorkflow;

  if (explicitPublishedState) {
    return {
      ...currentWorkflow,
      status: 'published' as const,
      publishedAt: new Date(),
      scheduledFor: null,
      rejectionReason: '',
    };
  }

  if (currentWorkflow.status === 'published') {
    return {
      ...currentWorkflow,
      status: 'draft' as const,
      publishedAt: null,
    };
  }

  return currentWorkflow;
}

export function compactMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) return false;
      if (typeof entry === 'string') return entry.trim().length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    })
  );
}

export function toStoredWorkflowUpdate(workflow: ReturnType<typeof resolveVideoWorkflow>) {
  return {
    ...workflow,
    submittedAt: workflow.submittedAt?.toISOString() || null,
    approvedAt: workflow.approvedAt?.toISOString() || null,
    rejectedAt: workflow.rejectedAt?.toISOString() || null,
    publishedAt: workflow.publishedAt?.toISOString() || null,
    scheduledFor: workflow.scheduledFor?.toISOString() || null,
    dueAt: workflow.dueAt?.toISOString() || null,
    comments: workflow.comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
    })),
  };
}

export function normalizeWorkflowStatus(value: string | undefined) {
  return value && isWorkflowStatus(value) ? value : '';
}
