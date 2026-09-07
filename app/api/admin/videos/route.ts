import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import Video from '@/lib/models/Video';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  canCreateContent,
  canReadContent,
} from '@/lib/auth/permissions';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import {
  createStoredVideo,
  listAllStoredVideos,
} from '@/lib/storage/videosFile';
import {
  buildVideoActivityMessage,
  recordVideoActivity,
} from '@/lib/server/videoActivity';
import { getPublicArticleBySlug } from '@/lib/server/publicArticles';
import {
  resolveVideoWorkflow,
  toWorkflowActorRef,
} from '@/lib/workflow/video';
import { isWorkflowStatus } from '@/lib/workflow/types';
import {
  buildVideoSlug,
  inferVideoMediaProvider,
  normalizeVideoAspectRatio,
  normalizeVideoProcessingStatus,
  normalizeVideoSlug,
  validateSwipePublishFields,
} from '@/lib/content/videoPublication';

import {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  isYouTubeLiveUrl,
} from '@/lib/utils/youtube';

const VIDEO_CATEGORIES = NEWS_CATEGORIES.map((category) => category.nameEn);
const FILE_STORE_UNBOUNDED_LIMIT = Number.MAX_SAFE_INTEGER;

type CreateIntent = 'draft' | 'submit' | 'publish';

type VideoLike = {
  _id?: string;
  id?: string;
  isPublished?: boolean;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  workflow?: unknown;
  title?: string;
  description?: string;
  thumbnail?: string;
  videoUrl?: string;
  duration?: number;
  category?: string;
  isShort?: boolean;
  shortsRank?: number;
  views?: number;
};

function parsePositiveInt(value: string | null, fallback: number, max = 100) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseListLimit(value: string | null, fallback: number, max = 200) {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'all') return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function isValidCategory(value: string) {
  return VIDEO_CATEGORIES.includes(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

function normalizeCreateIntent(value: unknown, legacyPublished: boolean): CreateIntent {
  if (value === 'draft' || value === 'submit' || value === 'publish') {
    return value;
  }

  return legacyPublished ? 'publish' : 'draft';
}

function normalizeVideoInput(body: unknown) {
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
  const duration = Number.isFinite(parsedDuration) && parsedDuration >= 0
    ? parsedDuration
    : isLive ? 0 : 60;

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

function validateVideoInput(input: ReturnType<typeof normalizeVideoInput>) {
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

function validateSwipePublishReadiness(
  input: ReturnType<typeof normalizeVideoInput>,
  intent: CreateIntent
) {
  if (intent !== 'publish' || !input.isShort) return null;
  return validateSwipePublishFields(input);
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for videos route, using file store.', error);
    return true;
  }
}

function buildInitialWorkflow(
  intent: CreateIntent,
  user: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>
) {
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

function resolveVideoRecord(video: VideoLike, createdBy?: ReturnType<typeof toWorkflowActorRef>) {
  const workflow = resolveVideoWorkflow({
    workflow: video.workflow,
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

function buildVideoPermissionRecord(video: ReturnType<typeof resolveVideoRecord>) {
  return {
    workflow: video.workflow,
  };
}

function matchesFilters(
  video: ReturnType<typeof resolveVideoRecord>,
  user: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>,
  filters: {
    category: string | null;
    type: string | null;
    search: string;
    published?: boolean;
    workflowStatus: string;
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

function sortVideos(videos: ReturnType<typeof resolveVideoRecord>[], sort: string | null, type: string | null) {
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort');
    const publishedParam = parseBooleanParam(searchParams.get('published'));
    const workflowStatus = String(searchParams.get('workflowStatus') || '').trim().toLowerCase();
    const effectiveWorkflowStatus = isWorkflowStatus(workflowStatus) ? workflowStatus : '';
    const limit = parseListLimit(searchParams.get('limit'), 20, 200);
    const page = parsePositiveInt(searchParams.get('page'), 1, 100000);
    const isUnbounded = limit === null;
    const effectivePage = isUnbounded ? 1 : page;
    const effectiveLimit = isUnbounded ? FILE_STORE_UNBOUNDED_LIMIT : limit;

    if (await shouldUseFileStore()) {
      const allVideos = await listAllStoredVideos();
      const filteredVideos = sortVideos(
        allVideos
          .map((video) => resolveVideoRecord(video))
          .filter((video) =>
            matchesFilters(video, user, {
              category,
              type,
              search,
              published: publishedParam,
              workflowStatus: effectiveWorkflowStatus,
            })
          ),
        sort,
        type
      );
      const total = filteredVideos.length;
      const videos = isUnbounded
        ? filteredVideos
        : filteredVideos.slice(
            (effectivePage - 1) * effectiveLimit,
            (effectivePage - 1) * effectiveLimit + effectiveLimit
          );

      return NextResponse.json({
        success: true,
        data: videos,
        pagination: {
          total,
          page: effectivePage,
          limit: isUnbounded ? total : effectiveLimit,
          pages: isUnbounded ? 1 : Math.ceil(total / effectiveLimit),
        },
      });
    }

    const query: Record<string, unknown> = {};
    if (category && category !== 'all') {
      query.category = category;
    }

    if (type === 'shorts') {
      query.isShort = true;
    } else if (type === 'standard') {
      query.isShort = false;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const allVideos = (await Video.find(query)
      .sort({ updatedAt: -1, publishedAt: -1, _id: -1 })
      .lean()) as VideoLike[];

    const filteredVideos = sortVideos(
      allVideos
        .map((video) => resolveVideoRecord(video))
        .filter((video) =>
          matchesFilters(video, user, {
            category,
            type,
            search,
            published: publishedParam,
            workflowStatus: effectiveWorkflowStatus,
          })
        ),
      sort,
      type
    );

    const total = filteredVideos.length;
    const videos = isUnbounded
      ? filteredVideos
      : filteredVideos.slice(
          (effectivePage - 1) * effectiveLimit,
          (effectivePage - 1) * effectiveLimit + effectiveLimit
        );

    return NextResponse.json({
      success: true,
      data: videos,
      pagination: {
        total,
        page: effectivePage,
        limit: isUnbounded ? total : effectiveLimit,
        pages: isUnbounded ? 1 : Math.ceil(total / effectiveLimit),
      },
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (!canCreateContent(user.role, 'video')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const input = normalizeVideoInput(body);
    const validationError = validateVideoInput(input);
    const intent = normalizeCreateIntent((body as Record<string, unknown>)?.intent, input.isPublished);
    const readinessError = validateSwipePublishReadiness(input, intent);
    const workflow = buildInitialWorkflow(intent, user);

    if (
      intent === 'publish' &&
      user.role !== 'admin' &&
      user.role !== 'super_admin'
    ) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to publish videos directly.' },
        { status: 403 }
      );
    }

    if (validationError || readinessError) {
      return NextResponse.json(
        { success: false, error: validationError || readinessError },
        { status: 400 }
      );
    }

    if (intent === 'publish' && input.isShort && !(await getPublicArticleBySlug(input.articleId))) {
      return NextResponse.json(
        { success: false, error: 'Swipe News requires a related article that is already published.' },
        { status: 400 }
      );
    }

    const resolvedThumbnail =
      input.thumbnail || getYouTubeThumbnail(input.videoUrl);

    if (await shouldUseFileStore()) {
      const stored = await createStoredVideo({
        title: input.title,
        description: input.description,
        thumbnail: resolvedThumbnail,
        videoUrl: input.videoUrl,
        duration: input.duration,
        category: input.category,
        isShort: input.isShort,
        isPublished: workflow.status === 'published',
        shortsRank: input.isShort ? input.shortsRank : 0,
        views: 0,
        publishedAt: input.publishedAt.toISOString(),
        workflow: {
          ...workflow,
          submittedAt: workflow.submittedAt?.toISOString() || null,
          publishedAt: workflow.publishedAt?.toISOString() || null,
        },
        slug: input.slug,
        articleId: input.articleId,
        posterUrl: input.posterUrl || resolvedThumbnail,
        mediaProvider: input.mediaProvider,
        playbackUrl: input.playbackUrl,
        hlsUrl: input.hlsUrl,
        aspectRatio: input.aspectRatio,
        captionUrl: input.captionUrl,
        transcript: input.transcript,
        processingStatus: input.processingStatus,
        instagramUrl: input.instagramUrl,
        youtubeUrl: input.youtubeUrl,
      });

      await recordVideoActivity({
        videoId: stored._id,
        actor: user,
        action: 'created',
        toStatus: stored.workflow.status,
        message: buildVideoActivityMessage({
          action: 'created',
          toStatus: stored.workflow.status,
        }),
        metadata: {
          intent,
          priority: stored.workflow.priority,
          createdById: stored.workflow.createdBy?.id || '',
          isShort: stored.isShort,
        },
      });

      return NextResponse.json(
        {
          success: true,
          data: resolveVideoRecord(stored),
          message: 'Video uploaded successfully',
        },
        { status: 201 }
      );
    }

    const video = new Video({
      title: input.title,
      description: input.description,
      thumbnail: resolvedThumbnail,
      videoUrl: input.videoUrl,
      duration: input.duration,
      category: input.category,
      isShort: input.isShort,
      isPublished: workflow.status === 'published',
      shortsRank: input.isShort ? input.shortsRank : 0,
      views: 0,
      publishedAt: input.publishedAt,
      updatedAt: new Date(),
      workflow,
      slug: input.slug,
      articleId: input.articleId,
      posterUrl: input.posterUrl || resolvedThumbnail,
      mediaProvider: input.mediaProvider,
      playbackUrl: input.playbackUrl,
      hlsUrl: input.hlsUrl,
      aspectRatio: input.aspectRatio,
      captionUrl: input.captionUrl,
      transcript: input.transcript,
      processingStatus: input.processingStatus,
      instagramUrl: input.instagramUrl,
      youtubeUrl: input.youtubeUrl,
    });

    const savedVideo = await video.save();

    await recordVideoActivity({
      videoId: String(savedVideo._id),
      actor: user,
      action: 'created',
      toStatus: workflow.status,
      message: buildVideoActivityMessage({
        action: 'created',
        toStatus: workflow.status,
      }),
      metadata: {
        intent,
        priority: workflow.priority,
        createdById: workflow.createdBy?.id || '',
        isShort: input.isShort,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: resolveVideoRecord(savedVideo.toObject()),
        message: 'Video uploaded successfully',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating video:', error);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'That Swipe slug is already in use. Choose a unique slug.' },
        { status: 409 }
      );
    }
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to create video'
        : 'Failed to create video';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
