import 'server-only';

import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  canCreateContent,
  canDeleteContent,
  canEditContent,
  canReadContent,
  canTransitionContent,
} from '@/lib/auth/permissions';
import {
  buildVideoActivityMessage,
  listVideoActivity,
  recordVideoActivity,
} from '@/lib/server/videoActivity';
import { notifyWorkflowEvent } from '@/lib/server/workflowNotificationEvents';
import { getYouTubeThumbnail } from '@/lib/utils/youtube';
import { validateFastPublish } from '@/lib/workflow/fastPublish';
import { validateEditorialPublishReadiness } from '@/lib/workflow/readiness';
import { isWorkflowPriority } from '@/lib/workflow/types';
import {
  applyVideoWorkflowAction,
  resolveVideoWorkflow,
} from '@/lib/workflow/video';
import {
  FILE_STORE_UNBOUNDED_LIMIT,
  applyAutoThumbnail,
  applyLegacyPublishCompatibility,
  buildInitialWorkflow,
  buildVideoPermissionRecord,
  compactMetadata,
  isWorkflowAction,
  matchesVideoFilters,
  normalizeCreateIntent,
  normalizeVideoInput,
  normalizeVideoUpdate,
  normalizeWorkflowStatus,
  parseOptionalDate,
  resolveVideoRecord,
  sortVideos,
  toStoredWorkflowUpdate,
  validatePublishedSwipeArticle,
  validateSwipePublishReadiness,
  validateSwipeReadiness,
  validateVideoInput,
} from './videoEditorialPolicy';
import { videoRepository, VideoRepository } from './videoRepository';
import {
  VideoForbiddenError,
  VideoNotFoundError,
  VideoValidationError,
  type AdminVideoListQuery,
  type AdminVideoListResult,
  type VideoLike,
  type VideoStore,
  type WorkflowActionBody,
} from './videoTypes';

function createPayload(
  input: ReturnType<typeof normalizeVideoInput>,
  workflow: ReturnType<typeof buildInitialWorkflow>,
  store: VideoStore
) {
  const resolvedThumbnail = input.thumbnail || getYouTubeThumbnail(input.videoUrl);
  const common = {
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
  };

  if (store === 'file') {
    return {
      ...common,
      publishedAt: input.publishedAt.toISOString(),
      workflow: {
        ...workflow,
        submittedAt: workflow.submittedAt?.toISOString() || null,
        publishedAt: workflow.publishedAt?.toISOString() || null,
      },
    };
  }

  return {
    ...common,
    publishedAt: input.publishedAt,
    updatedAt: new Date(),
    workflow,
  };
}

function duplicateSlugError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export class VideoEditorialService {
  constructor(private readonly repo: VideoRepository = videoRepository) {}

  async listVideos(
    query: AdminVideoListQuery,
    user: AdminSessionIdentity
  ): Promise<AdminVideoListResult> {
    const store = await this.repo.resolveStore();
    const effectiveWorkflowStatus = normalizeWorkflowStatus(query.workflowStatus);
    const limitParsed = query.limit?.trim().toLowerCase() === 'all'
      ? null
      : (() => {
          const parsed = Number.parseInt(query.limit || '', 10);
          return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 20;
        })();
    const pageParsed = (() => {
      const parsed = Number.parseInt(query.page || '', 10);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100000) : 1;
    })();

    const isUnbounded = limitParsed === null;
    const effectivePage = isUnbounded ? 1 : pageParsed;
    const effectiveLimit = isUnbounded ? FILE_STORE_UNBOUNDED_LIMIT : limitParsed;
    const allVideos = await this.repo.findRawAdminVideos(
      { category: query.category, type: query.type, search: query.search },
      store
    );
    const filtered = sortVideos(
      allVideos
        .map((video) => resolveVideoRecord(video))
        .filter((video) =>
          matchesVideoFilters(video, user, {
            category: query.category,
            type: query.type,
            search: query.search,
            published: query.published,
            workflowStatus: effectiveWorkflowStatus,
          })
        ),
      query.sort,
      query.type
    );

    const total = filtered.length;
    const videos = isUnbounded
      ? filtered
      : filtered.slice(
          (effectivePage - 1) * effectiveLimit,
          (effectivePage - 1) * effectiveLimit + effectiveLimit
        );

    return {
      videos,
      pagination: {
        total,
        page: effectivePage,
        limit: isUnbounded ? total : effectiveLimit,
        pages: isUnbounded ? 1 : Math.ceil(total / effectiveLimit),
      },
    };
  }

  async getVideo(id: string, user: AdminSessionIdentity): Promise<VideoLike> {
    const store = await this.repo.resolveStore();
    const video = await this.repo.findById(id, store);
    if (!video) throw new VideoNotFoundError('Video not found');
    if (!canReadContent(user, buildVideoPermissionRecord(video), { allowViewerRead: true })) {
      throw new VideoForbiddenError('Forbidden');
    }
    return resolveVideoRecord(video);
  }

  async createVideo(
    body: unknown,
    user: AdminSessionIdentity
  ): Promise<{ data: VideoLike; message: string }> {
    if (!canCreateContent(user.role, 'video')) {
      throw new VideoForbiddenError('Forbidden');
    }

    const store = await this.repo.resolveStore();
    const input = normalizeVideoInput(body);
    const intent = normalizeCreateIntent(
      (body as Record<string, unknown>)?.intent,
      input.isPublished
    );
    const validationError = validateVideoInput(input);
    const readinessError = validateSwipePublishReadiness(input, intent);
    const workflow = buildInitialWorkflow(intent, user);

    if (intent === 'publish' && user.role !== 'admin' && user.role !== 'super_admin') {
      throw new VideoForbiddenError('You do not have permission to publish videos directly.');
    }
    if (validationError || readinessError) {
      throw new VideoValidationError(validationError || readinessError || 'Invalid input', 400);
    }
    if (intent === 'publish' && input.isShort) {
      const articleError = await validatePublishedSwipeArticle(input);
      if (articleError) throw new VideoValidationError(articleError, 400);
    }

    try {
      const created = await this.repo.create(createPayload(input, workflow, store), store);
      const videoId = String(created._id || created.id || '');
      await recordVideoActivity({
        videoId,
        actor: user,
        action: 'created',
        toStatus: workflow.status,
        message: buildVideoActivityMessage({ action: 'created', toStatus: workflow.status }),
        metadata: {
          intent,
          priority: workflow.priority,
          createdById: workflow.createdBy?.id || '',
          isShort: created.isShort,
        },
      });
      return {
        data: resolveVideoRecord(created),
        message: 'Video uploaded successfully',
      };
    } catch (error: unknown) {
      if (duplicateSlugError(error)) {
        throw new VideoValidationError(
          'That Swipe slug is already in use. Choose a unique slug.',
          409
        );
      }
      throw error;
    }
  }

  async updateVideo(
    id: string,
    body: unknown,
    user: AdminSessionIdentity
  ): Promise<{ data: VideoLike; message: string }> {
    const { updates, error } = normalizeVideoUpdate(body);
    if (error) throw new VideoValidationError(error, 400);
    if (!updates || Object.keys(updates).length === 0) {
      throw new VideoValidationError('No valid fields to update', 400);
    }
    applyAutoThumbnail(updates);

    const store = await this.repo.resolveStore();
    const currentVideo = await this.repo.findById(id, store);
    if (!currentVideo) throw new VideoNotFoundError('Video not found');
    if (!canEditContent(user, buildVideoPermissionRecord(currentVideo))) {
      throw new VideoForbiddenError('Forbidden');
    }

    const publishedState =
      typeof updates.isPublished === 'boolean' ? Boolean(updates.isPublished) : undefined;
    const currentWorkflow = resolveVideoWorkflow(currentVideo);
    const nextWorkflow = applyLegacyPublishCompatibility(currentWorkflow, publishedState);
    const requiresSwipeReadiness =
      nextWorkflow.status === 'published' &&
      ((publishedState === true && currentWorkflow.status !== 'published') ||
        (updates.isShort === true && currentVideo.isShort !== true));

    if (requiresSwipeReadiness) {
      const nextRecord = { ...currentVideo, ...updates, isPublished: true };
      const readinessError = validateSwipeReadiness(nextRecord);
      if (readinessError) throw new VideoValidationError(readinessError, 400);
      const articleError = await validatePublishedSwipeArticle(nextRecord);
      if (articleError) throw new VideoValidationError(articleError, 400);
    }

    const normalizedUpdates = store === 'file'
      ? {
          ...updates,
          workflow: toStoredWorkflowUpdate(nextWorkflow),
          isPublished: nextWorkflow.status === 'published',
          ...(updates.publishedAt instanceof Date
            ? { publishedAt: updates.publishedAt.toISOString() }
            : {}),
        }
      : {
          ...updates,
          isPublished: nextWorkflow.status === 'published',
          workflow: nextWorkflow,
          updatedAt: new Date(),
        };

    try {
      const updated = await this.repo.update(id, normalizedUpdates, store);
      if (!updated) throw new VideoNotFoundError('Video not found');
      await recordVideoActivity({
        videoId: id,
        actor: user,
        action: 'saved',
        toStatus: resolveVideoWorkflow(updated).status,
        message: buildVideoActivityMessage({ action: 'saved' }),
        metadata: { changedFields: Object.keys(updates) },
      });
      return {
        data: resolveVideoRecord(updated),
        message: 'Video updated successfully',
      };
    } catch (caught: unknown) {
      if (duplicateSlugError(caught)) {
        throw new VideoValidationError(
          'That Swipe slug is already in use. Choose a unique slug.',
          409
        );
      }
      throw caught;
    }
  }

  async applyWorkflowAction(
    id: string,
    body: WorkflowActionBody,
    user: AdminSessionIdentity
  ): Promise<{ data: VideoLike; message: string }> {
    if (!isWorkflowAction(body.action)) {
      throw new VideoValidationError('Invalid workflow action', 400);
    }

    const action = body.action;
    const store = await this.repo.resolveStore();
    const currentVideo = await this.repo.findById(id, store);
    if (!currentVideo) throw new VideoNotFoundError('Video not found');
    if (!canTransitionContent(user, buildVideoPermissionRecord(currentVideo), action)) {
      throw new VideoForbiddenError('Forbidden');
    }

    const currentVideoWorkflow = resolveVideoWorkflow(currentVideo);
    const swipeError = validateSwipeReadiness(currentVideo, action);
    if (swipeError) throw new VideoValidationError(swipeError, 400);
    if (action === 'publish' || action === 'fast_publish') {
      const articleError = await validatePublishedSwipeArticle(currentVideo);
      if (articleError) throw new VideoValidationError(articleError, 400);
    }

    const readinessError = validateEditorialPublishReadiness(
      {
        contentType: 'video',
        title: currentVideo.title || '',
        description: currentVideo.description || '',
        thumbnail: currentVideo.thumbnail || '',
        videoUrl: currentVideo.videoUrl || '',
        category: currentVideo.category || '',
      },
      action
    );
    if (readinessError) throw new VideoValidationError(readinessError, 400);
    if (action === 'fast_publish') {
      const urgentError = validateFastPublish({
        role: user.role,
        workflow: currentVideoWorkflow,
        reason: body.comment,
      });
      if (urgentError) throw new VideoValidationError(urgentError, 400);
    }

    let assignedTo = null;
    if (action === 'assign') {
      assignedTo = await this.repo.resolveAssignee(String(body.assignedToId || ''), store);
      if (!assignedTo) {
        throw new VideoValidationError('Valid assignedToId is required', 400);
      }
    }

    try {
      const { fromStatus, toStatus, nextWorkflow } = applyVideoWorkflowAction({
        action,
        actor: user,
        currentWorkflow: currentVideoWorkflow,
        assignedTo,
        scheduledFor: parseOptionalDate(body.scheduledFor),
        dueAt: parseOptionalDate(body.dueAt),
        priority: isWorkflowPriority(body.priority) ? body.priority : undefined,
        comment: body.comment,
        rejectionReason: body.rejectionReason,
      });
      const updates = store === 'file'
        ? {
            isPublished: toStatus === 'published',
            workflow: toStoredWorkflowUpdate(nextWorkflow),
            ...(toStatus === 'published' ? { publishedAt: new Date().toISOString() } : {}),
          }
        : {
            workflow: nextWorkflow,
            isPublished: toStatus === 'published',
            updatedAt: new Date(),
            ...(toStatus === 'published' ? { publishedAt: new Date() } : {}),
          };

      const updated = await this.repo.update(id, updates, store);
      if (!updated) throw new VideoNotFoundError('Video not found');
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
          comment: body.comment?.trim() || '',
        }),
      });
      await notifyWorkflowEvent({
        contentType: 'video',
        contentId: id,
        title: String(updated.title || 'Video'),
        href: `/admin/videos/${encodeURIComponent(id)}/edit`,
        action,
        workflow: nextWorkflow,
        actor: user,
      });

      return {
        data: resolveVideoRecord(updated),
        message: `Video moved to ${toStatus}.`,
      };
    } catch (error) {
      if (
        error instanceof VideoValidationError ||
        error instanceof VideoForbiddenError ||
        error instanceof VideoNotFoundError
      ) {
        throw error;
      }
      throw new VideoValidationError(
        error instanceof Error ? error.message : 'Failed to update video workflow',
        400
      );
    }
  }

  async deleteVideo(
    id: string,
    user: AdminSessionIdentity
  ): Promise<{ success: boolean; message: string }> {
    if (!canDeleteContent(user)) throw new VideoForbiddenError('Forbidden');
    const store = await this.repo.resolveStore();
    const deleted = await this.repo.delete(id, store);
    if (!deleted) throw new VideoNotFoundError('Video not found');
    return { success: true, message: 'Video deleted successfully' };
  }

  async getVideoActivity(id: string, user: AdminSessionIdentity): Promise<unknown[]> {
    const store = await this.repo.resolveStore();
    const video = await this.repo.findById(id, store);
    if (!video) throw new VideoNotFoundError('Video not found');
    if (!canReadContent(user, buildVideoPermissionRecord(video), { allowViewerRead: true })) {
      throw new VideoForbiddenError('Forbidden');
    }
    return listVideoActivity({ videoId: id, video });
  }
}

export const videoEditorialService = new VideoEditorialService();
