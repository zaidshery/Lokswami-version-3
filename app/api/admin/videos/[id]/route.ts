import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import Video from '@/lib/models/Video';
import User from '@/lib/models/User';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  canDeleteContent,
  canEditContent,
  canReadContent,
  canTransitionContent,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
import {
  buildVideoActivityMessage,
  recordVideoActivity,
} from '@/lib/server/videoActivity';
import { notifyWorkflowEvent } from '@/lib/server/workflowNotificationEvents';
import { getPublicArticleBySlug } from '@/lib/server/publicArticles';
import type { CreateVideoInput } from '@/lib/storage/videosFile';
import {
  deleteStoredVideo,
  getStoredVideoById,
  updateStoredVideo,
} from '@/lib/storage/videosFile';
import {
  applyVideoWorkflowAction,
  resolveVideoWorkflow,
} from '@/lib/workflow/video';
import { validateFastPublish } from '@/lib/workflow/fastPublish';
import { validateEditorialPublishReadiness } from '@/lib/workflow/readiness';
import { isWorkflowPriority } from '@/lib/workflow/types';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type LeanVideoRecord = Record<string, unknown> & {
  isPublished?: boolean;
  workflow?: Record<string, unknown> | null;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
};

type WorkflowActionBody = {
  action?: ContentTransitionAction;
  assignedToId?: string;
  scheduledFor?: string;
  dueAt?: string;
  priority?: string;
  rejectionReason?: string;
  comment?: string;
};

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

import {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
} from '@/lib/utils/youtube';
import {
  inferVideoMediaProvider,
  normalizeVideoAspectRatio,
  normalizeVideoProcessingStatus,
  normalizeVideoSlug,
  validateSwipePublishFields,
} from '@/lib/content/videoPublication';

function normalizeVideoUpdate(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const updates: Record<string, unknown> = {};

  if (typeof source.title === 'string') updates.title = source.title.trim();
  if (typeof source.description === 'string') updates.description = source.description.trim();
  if (typeof source.thumbnail === 'string') updates.thumbnail = source.thumbnail.trim();
  if (typeof source.videoUrl === 'string') {
    const videoUrl = source.videoUrl.trim();
    const isDirectHttpsVideo = /^https:\/\/[^\s]+(?:\.mp4)(?:[?#].*)?$/i.test(videoUrl);
    if (!videoUrl || (!extractYouTubeVideoId(videoUrl) && !isDirectHttpsVideo)) {
      return { updates: null, error: 'Video must use a valid YouTube URL or an HTTPS MP4 playback URL' };
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

  if (typeof source.category === 'string') {
    updates.category = source.category.trim();
  }

  if (source.duration !== undefined) {
    const duration = Number.parseInt(String(source.duration), 10);
    if (!Number.isFinite(duration) || duration < 0) {
      return { updates: null, error: 'Invalid duration' };
    }
    updates.duration = duration;
  }

  if (typeof source.isShort === 'boolean') {
    updates.isShort = source.isShort;
  }

  if (typeof source.isPublished === 'boolean') {
    updates.isPublished = source.isPublished;
  }

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

function validateSwipeReadiness(record: Record<string, unknown>, action?: string) {
  if (action !== 'publish' && action !== 'fast_publish' && record.isPublished !== true) return null;
  return validateSwipePublishFields(record);
}

async function validatePublishedSwipeArticle(record: Record<string, unknown>) {
  if (!record.isShort) return null;
  const articleId = String(record.articleId || '').trim();
  if (!articleId || !(await getPublicArticleBySlug(articleId))) {
    return 'Swipe News requires a related article that is already published.';
  }
  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for video id route, using file store.', error);
    return true;
  }
}

function applyAutoThumbnail(updates: Record<string, unknown>) {
  if (
    typeof updates.videoUrl === 'string' &&
    (updates.thumbnail === undefined || String(updates.thumbnail).trim() === '')
  ) {
    const youtubeThumbnail = getYouTubeThumbnail(updates.videoUrl);
    if (youtubeThumbnail) {
      updates.thumbnail = youtubeThumbnail;
    }
  }
}

function buildVideoPermissionRecord(video: {
  isPublished?: unknown;
  workflow?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
}) {
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

function resolveVideoResponse(video: {
  isPublished?: boolean;
  workflow?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
}) {
  const workflow = resolveVideoWorkflow({
    workflow:
      typeof video.workflow === 'object' && video.workflow
        ? (video.workflow as Record<string, unknown>)
        : null,
    isPublished: video.isPublished,
    publishedAt: video.publishedAt,
    updatedAt: video.updatedAt,
  });

  return {
    ...video,
    isPublished: workflow.status === 'published',
    workflow,
  };
}

function isWorkflowAction(value: unknown): value is ContentTransitionAction {
  return typeof value === 'string' && WORKFLOW_ACTIONS.has(value as ContentTransitionAction);
}

function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toStoredWorkflowUpdate(workflow: ReturnType<typeof resolveVideoWorkflow>) {
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

function compactMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) return false;
      if (typeof entry === 'string') return entry.trim().length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    })
  );
}

async function resolveAssignee(assignedToId: string) {
  const normalized = assignedToId.trim();
  if (!normalized) return null;

  const query = Types.ObjectId.isValid(normalized)
    ? { _id: normalized }
    : { email: normalized.toLowerCase() };
  const assignee = await User.findOne(query).select('_id name email role').lean();
  if (!assignee || typeof assignee.role !== 'string' || assignee.role === 'reader') {
    return null;
  }

  return {
    id: String(assignee._id || ''),
    name: String(assignee.name || '').trim() || String(assignee.email || '').trim(),
    email: String(assignee.email || '').trim(),
    role: assignee.role,
  };
}

function applyLegacyPublishCompatibility(
  currentWorkflow: ReturnType<typeof resolveVideoWorkflow>,
  explicitPublishedState: boolean | undefined
) {
  if (typeof explicitPublishedState !== 'boolean') {
    return currentWorkflow;
  }

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

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (await shouldUseFileStore()) {
      const video = await getStoredVideoById(id);
      if (!video) {
        return NextResponse.json(
          { success: false, error: 'Video not found' },
          { status: 404 }
        );
      }
      if (!canReadContent(user, buildVideoPermissionRecord(video), { allowViewerRead: true })) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      return NextResponse.json({ success: true, data: resolveVideoResponse(video) });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    const video = (await Video.findById(id).lean()) as LeanVideoRecord | null;
    if (!video) {
      return NextResponse.json(
        { success: false, error: 'Video not found' },
        { status: 404 }
      );
    }

    if (!canReadContent(user, buildVideoPermissionRecord(video), { allowViewerRead: true })) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: resolveVideoResponse(video) });
  } catch (error) {
    console.error('Error fetching video:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch video' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    if (!isWorkflowAction((body as WorkflowActionBody).action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid workflow action' },
        { status: 400 }
      );
    }

    const actionBody = body as WorkflowActionBody;
    const action = actionBody.action;

    if (await shouldUseFileStore()) {
      const currentVideo = await getStoredVideoById(id);
      if (!currentVideo) {
        return NextResponse.json(
          { success: false, error: 'Video not found' },
          { status: 404 }
        );
      }

      const permissionRecord = buildVideoPermissionRecord(currentVideo);
      if (!action || !canTransitionContent(user, permissionRecord, action)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      const currentVideoWorkflow = resolveVideoWorkflow(currentVideo);
      const swipeReadinessError = validateSwipeReadiness(
        currentVideo as unknown as Record<string, unknown>,
        action
      );
      if (swipeReadinessError) {
        return NextResponse.json({ success: false, error: swipeReadinessError }, { status: 400 });
      }
      if (action === 'publish' || action === 'fast_publish') {
        const articleReadinessError = await validatePublishedSwipeArticle(
          currentVideo as unknown as Record<string, unknown>
        );
        if (articleReadinessError) {
          return NextResponse.json({ success: false, error: articleReadinessError }, { status: 400 });
        }
      }
      const readinessError = validateEditorialPublishReadiness({
        contentType: 'video',
        title: currentVideo.title,
        description: currentVideo.description,
        thumbnail: currentVideo.thumbnail,
        videoUrl: currentVideo.videoUrl,
        category: currentVideo.category,
      }, action);
      if (readinessError) return NextResponse.json({ success: false, error: readinessError }, { status: 400 });
      if (action === 'fast_publish') {
        const urgentError = validateFastPublish({ role: user.role, workflow: currentVideoWorkflow, reason: actionBody.comment });
        if (urgentError) return NextResponse.json({ success: false, error: urgentError }, { status: 400 });
      }

      let assignedTo = null;
      if (action === 'assign') {
        if (!process.env.MONGODB_URI?.trim()) {
          return NextResponse.json(
            { success: false, error: 'Assignments require MongoDB-backed users.' },
            { status: 503 }
          );
        }

        await connectDB();
        assignedTo = await resolveAssignee(String(actionBody.assignedToId || ''));
        if (!assignedTo) {
          return NextResponse.json(
            { success: false, error: 'Valid assignedToId is required' },
            { status: 400 }
          );
        }
      }

      try {
        const { fromStatus, toStatus, nextWorkflow } = applyVideoWorkflowAction({
          action,
          actor: user,
          currentWorkflow: currentVideoWorkflow,
          assignedTo,
          scheduledFor: parseOptionalDate(actionBody.scheduledFor),
          dueAt: parseOptionalDate(actionBody.dueAt),
          priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
          comment: actionBody.comment,
          rejectionReason: actionBody.rejectionReason,
        });

        const video = await updateStoredVideo(
          id,
          {
            isPublished: toStatus === 'published',
            workflow: toStoredWorkflowUpdate(nextWorkflow),
            ...(toStatus === 'published'
              ? { publishedAt: new Date().toISOString() }
              : {}),
          }
        );

        if (!video) {
          return NextResponse.json(
            { success: false, error: 'Video not found' },
            { status: 404 }
          );
        }

        await recordVideoActivity({
          videoId: id,
          actor: user,
          action,
          fromStatus,
          toStatus,
          message: buildVideoActivityMessage({
            action,
            toStatus,
            assignedTo: nextWorkflow.assignedTo,
            rejectionReason: nextWorkflow.rejectionReason,
          }),
          metadata: compactMetadata({
            assignedToId: nextWorkflow.assignedTo?.id || '',
            assignedToName: nextWorkflow.assignedTo?.name || '',
            priority: nextWorkflow.priority,
            dueAt: nextWorkflow.dueAt?.toISOString() || '',
            scheduledFor: nextWorkflow.scheduledFor?.toISOString() || '',
            rejectionReason: nextWorkflow.rejectionReason || '',
            comment: actionBody.comment?.trim() || '',
          }),
        });
        await notifyWorkflowEvent({
          contentType: 'video',
          contentId: id,
          title: String(video.title || 'Video'),
          href: `/admin/videos/${encodeURIComponent(id)}/edit`,
          action,
          workflow: nextWorkflow,
          actor: user,
        });

        return NextResponse.json({
          success: true,
          data: resolveVideoResponse(video),
          message: `Video moved to ${toStatus}.`,
        });
      } catch (workflowError) {
        return NextResponse.json(
          {
            success: false,
            error:
              workflowError instanceof Error
                ? workflowError.message
                : 'Failed to update video workflow',
          },
          { status: 400 }
        );
      }
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    const current = (await Video.findById(id).lean()) as LeanVideoRecord | null;
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Video not found' },
        { status: 404 }
      );
    }

    const permissionRecord = buildVideoPermissionRecord(current);
    if (!action || !canTransitionContent(user, permissionRecord, action)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const currentVideoWorkflow = resolveVideoWorkflow(current);
    const swipeReadinessError = validateSwipeReadiness(current, action);
    if (swipeReadinessError) {
      return NextResponse.json({ success: false, error: swipeReadinessError }, { status: 400 });
    }
    if (action === 'publish' || action === 'fast_publish') {
      const articleReadinessError = await validatePublishedSwipeArticle(current);
      if (articleReadinessError) {
        return NextResponse.json({ success: false, error: articleReadinessError }, { status: 400 });
      }
    }
    const readinessError = validateEditorialPublishReadiness({
      contentType: 'video',
      title: current.title,
      description: current.description,
      thumbnail: current.thumbnail,
      videoUrl: current.videoUrl,
      category: current.category,
    }, action);
    if (readinessError) return NextResponse.json({ success: false, error: readinessError }, { status: 400 });
    if (action === 'fast_publish') {
      const urgentError = validateFastPublish({ role: user.role, workflow: currentVideoWorkflow, reason: actionBody.comment });
      if (urgentError) return NextResponse.json({ success: false, error: urgentError }, { status: 400 });
    }

    let assignedTo = null;
    if (action === 'assign') {
      assignedTo = await resolveAssignee(String(actionBody.assignedToId || ''));
      if (!assignedTo) {
        return NextResponse.json(
          { success: false, error: 'Valid assignedToId is required' },
          { status: 400 }
        );
      }
    }

    try {
      const { fromStatus, toStatus, nextWorkflow } = applyVideoWorkflowAction({
        action,
        actor: user,
        currentWorkflow: currentVideoWorkflow,
        assignedTo,
        scheduledFor: parseOptionalDate(actionBody.scheduledFor),
        dueAt: parseOptionalDate(actionBody.dueAt),
        priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
        comment: actionBody.comment,
        rejectionReason: actionBody.rejectionReason,
      });

      const video = await Video.findByIdAndUpdate(
        id,
        {
          $set: {
            workflow: nextWorkflow,
            isPublished: toStatus === 'published',
            updatedAt: new Date(),
            ...(toStatus === 'published' ? { publishedAt: new Date() } : {}),
          },
        },
        { new: true, runValidators: true }
      );

      if (!video) {
        return NextResponse.json(
          { success: false, error: 'Video not found' },
          { status: 404 }
        );
      }

      await recordVideoActivity({
        videoId: id,
        actor: user,
        action,
        fromStatus,
        toStatus,
        message: buildVideoActivityMessage({
          action,
          toStatus,
          assignedTo: nextWorkflow.assignedTo,
          rejectionReason: nextWorkflow.rejectionReason,
        }),
        metadata: compactMetadata({
          assignedToId: nextWorkflow.assignedTo?.id || '',
          assignedToName: nextWorkflow.assignedTo?.name || '',
          priority: nextWorkflow.priority,
          dueAt: nextWorkflow.dueAt?.toISOString() || '',
          scheduledFor: nextWorkflow.scheduledFor?.toISOString() || '',
          rejectionReason: nextWorkflow.rejectionReason || '',
          comment: actionBody.comment?.trim() || '',
        }),
      });
      await notifyWorkflowEvent({
        contentType: 'video',
        contentId: id,
        title: String(video.title || 'Video'),
        href: `/admin/videos/${encodeURIComponent(id)}/edit`,
        action,
        workflow: nextWorkflow,
        actor: user,
      });

      return NextResponse.json({
        success: true,
        data: resolveVideoResponse(video.toObject()),
        message: `Video moved to ${toStatus}.`,
      });
    } catch (workflowError) {
      return NextResponse.json(
        {
          success: false,
          error:
            workflowError instanceof Error
              ? workflowError.message
              : 'Failed to update video workflow',
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('Error updating video workflow:', error);
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to update video workflow'
        : 'Failed to update video workflow';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { updates, error } = normalizeVideoUpdate(body);

    if (error) {
      return NextResponse.json(
        { success: false, error },
        { status: 400 }
      );
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    applyAutoThumbnail(updates);

    if (await shouldUseFileStore()) {
      const currentVideo = await getStoredVideoById(id);
      if (!currentVideo) {
        return NextResponse.json(
          { success: false, error: 'Video not found' },
          { status: 404 }
        );
      }
      if (!canEditContent(user, buildVideoPermissionRecord(currentVideo))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      const publishedState =
        typeof updates.isPublished === 'boolean' ? Boolean(updates.isPublished) : undefined;
      const nextWorkflow = applyLegacyPublishCompatibility(
        resolveVideoWorkflow(currentVideo),
        publishedState
      );
      const requiresSwipeReadiness =
        nextWorkflow.status === 'published' &&
        ((publishedState === true && resolveVideoWorkflow(currentVideo).status !== 'published') ||
          (updates.isShort === true && currentVideo.isShort !== true));
      const swipeReadinessError = requiresSwipeReadiness
        ? validateSwipeReadiness({
            ...(currentVideo as unknown as Record<string, unknown>),
            ...updates,
            isPublished: true,
          })
        : null;
      if (swipeReadinessError) {
        return NextResponse.json({ success: false, error: swipeReadinessError }, { status: 400 });
      }
      if (requiresSwipeReadiness) {
        const articleReadinessError = await validatePublishedSwipeArticle({
          ...(currentVideo as unknown as Record<string, unknown>),
          ...updates,
        });
        if (articleReadinessError) {
          return NextResponse.json({ success: false, error: articleReadinessError }, { status: 400 });
        }
      }

      const normalizedForFileStore = {
        ...(updates as Partial<CreateVideoInput> & { publishedAt?: string; updatedAt?: string }),
        workflow: toStoredWorkflowUpdate(nextWorkflow),
        isPublished: nextWorkflow.status === 'published',
        ...(updates.publishedAt instanceof Date
          ? { publishedAt: updates.publishedAt.toISOString() }
          : {}),
      };

      const video = await updateStoredVideo(id, normalizedForFileStore);

      if (!video) {
        return NextResponse.json(
          { success: false, error: 'Video not found' },
          { status: 404 }
        );
      }

      await recordVideoActivity({
        videoId: id,
        actor: user,
        action: 'saved',
        toStatus: resolveVideoWorkflow(video).status,
        message: buildVideoActivityMessage({ action: 'saved' }),
        metadata: {
          changedFields: Object.keys(updates),
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Video updated successfully',
        data: resolveVideoResponse(video),
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    const current = (await Video.findById(id).lean()) as LeanVideoRecord | null;
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Video not found' },
        { status: 404 }
      );
    }
    if (!canEditContent(user, buildVideoPermissionRecord(current))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const publishedState =
      typeof updates.isPublished === 'boolean' ? Boolean(updates.isPublished) : undefined;
    const nextWorkflow = applyLegacyPublishCompatibility(
      resolveVideoWorkflow(current),
      publishedState
    );
    const requiresSwipeReadiness =
      nextWorkflow.status === 'published' &&
      ((publishedState === true && resolveVideoWorkflow(current).status !== 'published') ||
        (updates.isShort === true && current.isShort !== true));
    const swipeReadinessError = requiresSwipeReadiness
      ? validateSwipeReadiness({
          ...current,
          ...updates,
          isPublished: true,
        })
      : null;
    if (swipeReadinessError) {
      return NextResponse.json({ success: false, error: swipeReadinessError }, { status: 400 });
    }
    if (requiresSwipeReadiness) {
      const articleReadinessError = await validatePublishedSwipeArticle({ ...current, ...updates });
      if (articleReadinessError) {
        return NextResponse.json({ success: false, error: articleReadinessError }, { status: 400 });
      }
    }

    const video = await Video.findByIdAndUpdate(
      id,
      {
        ...updates,
        isPublished: nextWorkflow.status === 'published',
        workflow: nextWorkflow,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!video) {
      return NextResponse.json(
        { success: false, error: 'Video not found' },
        { status: 404 }
      );
    }

    await recordVideoActivity({
      videoId: id,
      actor: user,
      action: 'saved',
      toStatus: resolveVideoWorkflow(video.toObject()).status,
      message: buildVideoActivityMessage({ action: 'saved' }),
      metadata: {
        changedFields: Object.keys(updates),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Video updated successfully',
      data: resolveVideoResponse(video.toObject()),
    });
  } catch (error: unknown) {
    console.error('Error updating video:', error);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'That Swipe slug is already in use. Choose a unique slug.' },
        { status: 409 }
      );
    }
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to update video'
        : 'Failed to update video';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (!canDeleteContent(user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (await shouldUseFileStore()) {
      const deleted = await deleteStoredVideo(id);
      if (!deleted) {
        return NextResponse.json(
          { success: false, error: 'Video not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Video deleted successfully',
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    const video = await Video.findByIdAndDelete(id);

    if (!video) {
      return NextResponse.json(
        { success: false, error: 'Video not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Video deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Error deleting video:', error);
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to delete video'
        : 'Failed to delete video';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
