import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import Story from '@/lib/models/Story';
import User from '@/lib/models/User';
import { normalizeAdminRole } from '@/lib/auth/roles';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  createEmptyCopyEditorMeta,
  createEmptyReporterMeta,
  normalizeCopyEditorMeta,
  normalizeCopyEditorMetaPartial,
  normalizeReporterMeta,
  normalizeReporterMetaPartial,
  validateCopyEditorMeta,
  validateReporterMeta,
} from '@/lib/content/newsroomMetadata';
import {
  derivePrimaryStoryMedia,
  normalizeStoryMediaAssets,
  validateStoryMediaAssets,
} from '@/lib/content/storyMedia';
import {
  createEmptyStoryVideoProduction,
  normalizeLinkedArticleStatus,
  normalizeStoryVideoProduction,
} from '@/lib/content/newsroomPublishing';
import {
  canDeleteContent,
  canEditContent,
  canReadContent,
  canTransitionContent,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
import { getBlockedStoryUpdateFields } from '@/lib/auth/storyEditing';
import {
  buildStoryActivityMessage,
  recordStoryActivity,
} from '@/lib/server/storyActivity';
import { notifyWorkflowEvent } from '@/lib/server/workflowNotificationEvents';
import type { CreateStoryInput } from '@/lib/storage/storiesFile';
import {
  deleteStoredStory,
  getStoredStoryById,
  updateStoredStory,
} from '@/lib/storage/storiesFile';
import { getStoryVideoMonthlyUsageSummary } from '@/lib/server/storyVideoUsage';
import {
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MIN_BYTES,
  STORY_VIDEO_STORAGE_PROVIDER,
} from '@/lib/storage/storyVideoUpload';
import {
  applyStoryWorkflowAction,
  resolveStoryWorkflow,
} from '@/lib/workflow/story';
import { validateFastPublish } from '@/lib/workflow/fastPublish';
import { validateEditorialPublishReadiness } from '@/lib/workflow/readiness';
import { isWorkflowPriority } from '@/lib/workflow/types';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type LeanStoryRecord = Record<string, unknown> & {
  author?: string;
  isPublished?: boolean;
  workflow?: Record<string, unknown> | null;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  mediaType?: 'image' | 'video';
  mediaKey?: string;
  mediaSizeBytes?: number;
  mediaMimeType?: string;
  storageProvider?: string;
  mediaAssets?: unknown;
  linkedArticleId?: string;
  linkedArticleStatus?: string;
  videoProduction?: unknown;
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

function toBoundedDuration(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(2, Math.min(180, parsed));
}

function normalizeMediaSizeBytes(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function validateStoryVideoMetadata(input: {
  mediaType: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: string;
}) {
  if (!input.storageProvider) {
    return null;
  }

  if (input.storageProvider !== STORY_VIDEO_STORAGE_PROVIDER) {
    return 'Unsupported story video storage provider';
  }

  if (input.mediaType !== 'video') {
    return 'DigitalOcean Spaces media can only be attached to video stories';
  }

  if (!input.mediaKey) {
    return 'Uploaded story videos must include a storage key';
  }

  if (input.mediaSizeBytes < STORY_VIDEO_MIN_BYTES || input.mediaSizeBytes > STORY_VIDEO_MAX_BYTES) {
    return 'Uploaded video must be larger than 0 bytes and 1.9 GB or smaller';
  }

  if (input.mediaMimeType !== 'video/mp4') {
    return 'Uploaded story videos must be MP4 files';
  }

  return null;
}

function normalizeStoryUpdate(
  body: unknown,
  user?: { role?: string } | null
) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const updates: Record<string, unknown> = {};

  if (typeof source.title === 'string') updates.title = source.title.trim();
  if (typeof source.caption === 'string') updates.caption = source.caption.trim();
  if (typeof source.thumbnail === 'string') updates.thumbnail = source.thumbnail.trim();
  if (typeof source.mediaUrl === 'string') updates.mediaUrl = source.mediaUrl.trim();
  if (typeof source.mediaKey === 'string') updates.mediaKey = source.mediaKey.trim();
  if (typeof source.mediaMimeType === 'string') {
    updates.mediaMimeType = source.mediaMimeType.trim().toLowerCase();
  }
  if (typeof source.storageProvider === 'string') {
    updates.storageProvider = source.storageProvider.trim();
  }
  if (source.mediaAssets !== undefined) {
    updates.mediaAssets = normalizeStoryMediaAssets(source.mediaAssets);
  }
  if (typeof source.linkUrl === 'string') updates.linkUrl = source.linkUrl.trim();
  if (typeof source.linkLabel === 'string') updates.linkLabel = source.linkLabel.trim();
  if (typeof source.category === 'string') updates.category = source.category.trim();
  if (typeof source.author === 'string') updates.author = source.author.trim();
  if (source.reporterMeta !== undefined) {
    updates.reporterMeta = normalizeReporterMetaPartial(source.reporterMeta);
  }
  if (source.copyEditorMeta !== undefined) {
    updates.copyEditorMeta = normalizeCopyEditorMetaPartial(source.copyEditorMeta);
  }

  if (source.mediaType !== undefined) {
    if (source.mediaType === 'image' || source.mediaType === 'video') {
      updates.mediaType = source.mediaType;
    } else {
      return { updates: null, error: 'Invalid media type' };
    }
  }

  if (source.durationSeconds !== undefined) {
    const duration = toBoundedDuration(source.durationSeconds);
    if (duration === null) return { updates: null, error: 'Invalid duration' };
    updates.durationSeconds = duration;
  }

  if (source.mediaSizeBytes !== undefined) {
    const mediaSizeBytes = normalizeMediaSizeBytes(source.mediaSizeBytes);
    if (mediaSizeBytes === null) return { updates: null, error: 'Invalid video size' };
    updates.mediaSizeBytes = mediaSizeBytes;
  }

  if (source.priority !== undefined) {
    const priority = Number.parseInt(String(source.priority), 10);
    if (!Number.isFinite(priority)) return { updates: null, error: 'Invalid priority' };
    updates.priority = priority;
  }

  if (source.views !== undefined) {
    const views = Number.parseInt(String(source.views), 10);
    if (!Number.isFinite(views) || views < 0) {
      return { updates: null, error: 'Invalid views count' };
    }
    updates.views = views;
  }

  if (typeof source.isPublished === 'boolean') {
    updates.isPublished = source.isPublished;
  }

  if (source.publishedAt !== undefined) {
    const publishedAt = new Date(String(source.publishedAt));
    if (Number.isNaN(publishedAt.getTime())) {
      return { updates: null, error: 'Invalid published date' };
    }
    updates.publishedAt = publishedAt;
  }

  if (typeof updates.title === 'string' && updates.title.length > 140) {
    return { updates: null, error: 'Title is too long (max 140 characters)' };
  }

  if (user?.role !== 'reporter' && typeof updates.caption === 'string' && updates.caption.length > 300) {
    return { updates: null, error: 'Caption is too long (max 300 characters)' };
  }

  if (typeof updates.linkUrl === 'string' && updates.linkUrl.length > 500) {
    return { updates: null, error: 'Link URL is too long' };
  }

  if (updates.reporterMeta && typeof updates.reporterMeta === 'object') {
    const reporterMetaError = validateReporterMeta(
      normalizeReporterMeta({
        ...createEmptyReporterMeta(),
        ...updates.reporterMeta,
      })
    );
    if (reporterMetaError) {
      return { updates: null, error: reporterMetaError };
    }
  }

  if (updates.copyEditorMeta && typeof updates.copyEditorMeta === 'object') {
    const copyEditorMetaError = validateCopyEditorMeta(
      normalizeCopyEditorMeta({
        ...createEmptyCopyEditorMeta(),
        ...updates.copyEditorMeta,
      })
    );
    if (copyEditorMetaError) {
      return { updates: null, error: copyEditorMetaError };
    }
  }

  return { updates, error: null };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

function applyDerivedStoryMediaUpdates(
  updates: Record<string, unknown>,
  currentStory: {
    mediaAssets?: unknown;
    thumbnail?: unknown;
    mediaType?: unknown;
    mediaUrl?: unknown;
    mediaKey?: unknown;
    mediaSizeBytes?: unknown;
    mediaMimeType?: unknown;
    storageProvider?: unknown;
  }
) {
  if (!Object.prototype.hasOwnProperty.call(updates, 'mediaAssets')) {
    return normalizeStoryMediaAssets(currentStory.mediaAssets);
  }

  const mediaAssets = normalizeStoryMediaAssets(updates.mediaAssets);
  const thumbnailFallback =
    typeof updates.thumbnail === 'string'
      ? updates.thumbnail
      : typeof currentStory.thumbnail === 'string'
        ? currentStory.thumbnail
        : '';
  const primary = derivePrimaryStoryMedia(mediaAssets, thumbnailFallback);

  updates.mediaAssets = mediaAssets;
  updates.thumbnail = primary.thumbnail;
  updates.mediaType = primary.mediaType;
  updates.mediaUrl = primary.mediaUrl;
  updates.mediaKey = primary.mediaKey;
  updates.mediaSizeBytes = primary.mediaSizeBytes;
  updates.mediaMimeType = primary.mediaMimeType;
  updates.storageProvider = primary.storageProvider;

  return mediaAssets;
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for story id route, using file store.', error);
    return true;
  }
}

function buildStoryPermissionRecord(story: {
  author?: unknown;
  isPublished?: unknown;
  workflow?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
}) {
  return {
    legacyAuthorName: typeof story.author === 'string' ? story.author : '',
    workflow: resolveStoryWorkflow({
      workflow:
        typeof story.workflow === 'object' && story.workflow
          ? (story.workflow as Record<string, unknown>)
          : null,
      isPublished: story.isPublished,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
    }),
  };
}

function resolveStoryResponse(
  story: {
    author?: string;
    isPublished?: boolean;
    workflow?: unknown;
    publishedAt?: unknown;
    updatedAt?: unknown;
    linkedArticleId?: string;
    linkedArticleStatus?: unknown;
    videoProduction?: unknown;
  }
) {
  const workflow = resolveStoryWorkflow({
    workflow:
      typeof story.workflow === 'object' && story.workflow
        ? (story.workflow as Record<string, unknown>)
        : null,
    isPublished: story.isPublished,
    publishedAt: story.publishedAt,
    updatedAt: story.updatedAt,
  });

  return {
    ...story,
    isPublished: workflow.status === 'published',
    linkedArticleId:
      typeof story.linkedArticleId === 'string' ? story.linkedArticleId.trim() : '',
    linkedArticleStatus: normalizeLinkedArticleStatus(story.linkedArticleStatus),
    videoProduction:
      story.videoProduction !== undefined
        ? normalizeStoryVideoProduction(story.videoProduction)
        : createEmptyStoryVideoProduction(),
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

function toStoredWorkflowUpdate(workflow: ReturnType<typeof resolveStoryWorkflow>) {
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

function formatBlockedFieldLabel(field: string) {
  switch (field) {
    case 'reporterMeta':
      return 'reporter source fields';
    case 'copyEditorMeta':
      return 'copy desk review fields';
    case 'mediaUrl':
    case 'mediaKey':
    case 'mediaSizeBytes':
    case 'mediaMimeType':
    case 'storageProvider':
    case 'mediaType':
    case 'mediaAssets':
      return 'story video fields';
    case 'linkUrl':
    case 'linkLabel':
      return 'story link fields';
    default:
      return field.replace(/([A-Z])/g, ' $1').toLowerCase();
  }
}

async function resolveAssignee(assignedToId: string) {
  const normalized = assignedToId.trim();
  if (!normalized) return null;

  const query = Types.ObjectId.isValid(normalized)
    ? { _id: normalized }
    : { email: normalized.toLowerCase() };
  const assignee = await User.findOne({ ...query, isActive: { $ne: false } })
    .select('_id name email role isActive')
    .lean();
  const role = normalizeAdminRole(assignee?.role);
  if (!assignee || !role || assignee.isActive === false) {
    return null;
  }

  return {
    id: String(assignee._id || ''),
    name: String(assignee.name || '').trim() || String(assignee.email || '').trim(),
    email: String(assignee.email || '').trim(),
    role,
  };
}

function applyLegacyPublishCompatibility(
  currentWorkflow: ReturnType<typeof resolveStoryWorkflow>,
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
      const story = await getStoredStoryById(id);
      if (!story) {
        return NextResponse.json(
          { success: false, error: 'Story not found' },
          { status: 404 }
        );
      }
      if (!canReadContent(user, buildStoryPermissionRecord(story), { allowViewerRead: true })) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      return NextResponse.json({ success: true, data: resolveStoryResponse(story) });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid story ID' },
        { status: 400 }
      );
    }

    const story = (await Story.findById(id).lean()) as LeanStoryRecord | null;
    if (!story) {
      return NextResponse.json(
        { success: false, error: 'Story not found' },
        { status: 404 }
      );
    }

    if (!canReadContent(user, buildStoryPermissionRecord(story), { allowViewerRead: true })) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: resolveStoryResponse(story) });
  } catch (error) {
    console.error('Error fetching story:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch story' },
      { status: 500 }
    );
  }
}

async function PATCHHandler(
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
      const currentStory = await getStoredStoryById(id);
      if (!currentStory) {
        return NextResponse.json(
          { success: false, error: 'Story not found' },
          { status: 404 }
        );
      }

      const permissionRecord = buildStoryPermissionRecord(currentStory);
      if (!action || !canTransitionContent(user, permissionRecord, action)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      const currentStoryWorkflow = resolveStoryWorkflow(currentStory);
      const readinessError = validateEditorialPublishReadiness({
        contentType: 'story',
        title: currentStory.title,
        category: currentStory.category,
        thumbnail: currentStory.thumbnail,
        mediaUrl: currentStory.mediaUrl,
        mediaAssets: currentStory.mediaAssets,
      }, action);
      if (readinessError) return NextResponse.json({ success: false, error: readinessError }, { status: 400 });
      if (action === 'fast_publish') {
        const urgentError = validateFastPublish({ role: user.role, workflow: currentStoryWorkflow, reason: actionBody.comment });
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
        const { fromStatus, toStatus, nextWorkflow } = applyStoryWorkflowAction({
          action,
          actor: user,
          currentWorkflow: currentStoryWorkflow,
          assignedTo,
          scheduledFor: parseOptionalDate(actionBody.scheduledFor),
          dueAt: parseOptionalDate(actionBody.dueAt),
          priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
          comment: actionBody.comment,
          rejectionReason: actionBody.rejectionReason,
        });

        const story = await updateStoredStory(
          id,
          {
            isPublished: toStatus === 'published',
            workflow: toStoredWorkflowUpdate(nextWorkflow),
            ...(toStatus === 'published'
              ? { publishedAt: new Date().toISOString() }
              : {}),
          },
          );

        if (!story) {
          return NextResponse.json(
            { success: false, error: 'Story not found' },
            { status: 404 }
          );
        }

        await recordStoryActivity({
          storyId: id,
          actor: user,
          action,
          fromStatus,
          toStatus,
          message: buildStoryActivityMessage({
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
          contentType: 'story',
          contentId: id,
          title: String(story.title || 'Story'),
          href: `/admin/stories/${encodeURIComponent(id)}/edit`,
          action,
          workflow: nextWorkflow,
          actor: user,
          previousAssignee: currentStoryWorkflow.assignedTo,
        });

        return NextResponse.json({
          success: true,
          data: resolveStoryResponse(story),
          message: `Story moved to ${toStatus}.`,
        });
      } catch (workflowError) {
        return NextResponse.json(
          {
            success: false,
            error:
              workflowError instanceof Error
                ? workflowError.message
                : 'Failed to update story workflow',
          },
          { status: 400 }
        );
      }
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid story ID' },
        { status: 400 }
      );
    }

    const current = (await Story.findById(id).lean()) as LeanStoryRecord | null;
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Story not found' },
        { status: 404 }
      );
    }

    const permissionRecord = buildStoryPermissionRecord(current);
    if (!action || !canTransitionContent(user, permissionRecord, action)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const currentStoryWorkflow = resolveStoryWorkflow(current);
    const readinessError = validateEditorialPublishReadiness({
      contentType: 'story',
      title: current.title,
      category: current.category,
      thumbnail: current.thumbnail,
      mediaUrl: current.mediaUrl,
      mediaAssets: current.mediaAssets,
    }, action);
    if (readinessError) return NextResponse.json({ success: false, error: readinessError }, { status: 400 });
    if (action === 'fast_publish') {
      const urgentError = validateFastPublish({ role: user.role, workflow: currentStoryWorkflow, reason: actionBody.comment });
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
      const { fromStatus, toStatus, nextWorkflow } = applyStoryWorkflowAction({
        action,
        actor: user,
        currentWorkflow: currentStoryWorkflow,
        assignedTo,
        scheduledFor: parseOptionalDate(actionBody.scheduledFor),
        dueAt: parseOptionalDate(actionBody.dueAt),
        priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
        comment: actionBody.comment,
        rejectionReason: actionBody.rejectionReason,
      });

      const story = await Story.findByIdAndUpdate(
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

      if (!story) {
        return NextResponse.json(
          { success: false, error: 'Story not found' },
          { status: 404 }
        );
      }

      await recordStoryActivity({
        storyId: id,
        actor: user,
        action,
        fromStatus,
        toStatus,
        message: buildStoryActivityMessage({
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
        contentType: 'story',
        contentId: id,
        title: String(story.title || 'Story'),
        href: `/admin/stories/${encodeURIComponent(id)}/edit`,
        action,
        workflow: nextWorkflow,
        actor: user,
        previousAssignee: currentStoryWorkflow.assignedTo,
      });

      return NextResponse.json({
        success: true,
        data: resolveStoryResponse(story.toObject()),
        message: `Story moved to ${toStatus}.`,
      });
    } catch (workflowError) {
      return NextResponse.json(
        {
          success: false,
          error:
            workflowError instanceof Error
              ? workflowError.message
              : 'Failed to update story workflow',
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('Error updating story workflow:', error);
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to update story workflow'
        : 'Failed to update story workflow';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function PUTHandler(
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
    const { updates, error } = normalizeStoryUpdate(body, user);

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    if (await shouldUseFileStore()) {
      const currentStory = await getStoredStoryById(id);
      if (!currentStory) {
        return NextResponse.json(
          { success: false, error: 'Story not found' },
          { status: 404 }
        );
      }
      if (!canEditContent(user, buildStoryPermissionRecord(currentStory))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      const blockedFields = getBlockedStoryUpdateFields(
        user,
        buildStoryPermissionRecord(currentStory),
        Object.keys(updates)
      );
      if (blockedFields.length > 0) {
        const blockedLabels = [...new Set(blockedFields.map((field) => formatBlockedFieldLabel(field)))];
        return NextResponse.json(
          {
            success: false,
            error: `You cannot edit ${blockedLabels.join(', ')} in the current workflow stage.`,
          },
          { status: 403 }
        );
      }

      const nextMediaAssets = applyDerivedStoryMediaUpdates(updates, currentStory);
      const mediaAssetsError = validateStoryMediaAssets(nextMediaAssets);
      if (mediaAssetsError) {
        return NextResponse.json({ success: false, error: mediaAssetsError }, { status: 400 });
      }

      const metadataError = validateStoryVideoMetadata({
        mediaType:
          typeof updates.mediaType === 'string' ? updates.mediaType : currentStory.mediaType,
        mediaKey:
          typeof updates.mediaKey === 'string'
            ? updates.mediaKey
            : String(currentStory.mediaKey || '').trim(),
        mediaSizeBytes:
          typeof updates.mediaSizeBytes === 'number'
            ? updates.mediaSizeBytes
            : Number(currentStory.mediaSizeBytes || 0),
        mediaMimeType:
          typeof updates.mediaMimeType === 'string'
            ? updates.mediaMimeType
            : String(currentStory.mediaMimeType || '').trim().toLowerCase(),
        storageProvider:
          typeof updates.storageProvider === 'string'
            ? updates.storageProvider
            : String(currentStory.storageProvider || '').trim(),
      });
      if (metadataError) {
        return NextResponse.json({ success: false, error: metadataError }, { status: 400 });
      }

      const publishedState =
        typeof updates.isPublished === 'boolean' ? Boolean(updates.isPublished) : undefined;
      const nextWorkflow = applyLegacyPublishCompatibility(
        resolveStoryWorkflow(currentStory),
        publishedState
      );

      const normalizedForStore = {
        ...(updates as Partial<CreateStoryInput> & {
          durationSeconds?: number;
          priority?: number;
          views?: number;
          publishedAt?: string;
        }),
        workflow: toStoredWorkflowUpdate(nextWorkflow),
        isPublished: nextWorkflow.status === 'published',
        ...(updates.publishedAt instanceof Date
          ? { publishedAt: updates.publishedAt.toISOString() }
          : {}),
      };

      const story = await updateStoredStory(id, normalizedForStore);
      if (!story) {
        return NextResponse.json(
          { success: false, error: 'Story not found' },
          { status: 404 }
        );
      }

      await recordStoryActivity({
        storyId: id,
        actor: user,
        action: 'saved',
        toStatus: resolveStoryWorkflow(story).status,
        message: buildStoryActivityMessage({ action: 'saved' }),
        metadata: {
          changedFields: Object.keys(updates),
        },
        });

      const usage = await getStoryVideoMonthlyUsageSummary();

      return NextResponse.json({
        success: true,
        data: resolveStoryResponse(story),
        message: 'Story updated successfully',
        usage,
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid story ID' },
        { status: 400 }
      );
    }

    const current = (await Story.findById(id).lean()) as LeanStoryRecord | null;
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Story not found' },
        { status: 404 }
      );
    }
    if (!canEditContent(user, buildStoryPermissionRecord(current))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const blockedFields = getBlockedStoryUpdateFields(
      user,
      buildStoryPermissionRecord(current),
      Object.keys(updates)
    );
    if (blockedFields.length > 0) {
      const blockedLabels = [...new Set(blockedFields.map((field) => formatBlockedFieldLabel(field)))];
      return NextResponse.json(
        {
          success: false,
          error: `You cannot edit ${blockedLabels.join(', ')} in the current workflow stage.`,
        },
        { status: 403 }
      );
    }

    const nextMediaAssets = applyDerivedStoryMediaUpdates(updates, current);
    const mediaAssetsError = validateStoryMediaAssets(nextMediaAssets);
    if (mediaAssetsError) {
      return NextResponse.json({ success: false, error: mediaAssetsError }, { status: 400 });
    }

    const metadataError = validateStoryVideoMetadata({
      mediaType:
        typeof updates.mediaType === 'string'
          ? updates.mediaType
          : String(current.mediaType === 'video' ? 'video' : 'image'),
      mediaKey:
        typeof updates.mediaKey === 'string'
          ? updates.mediaKey
          : String(current.mediaKey || '').trim(),
      mediaSizeBytes:
        typeof updates.mediaSizeBytes === 'number'
          ? updates.mediaSizeBytes
          : Number(current.mediaSizeBytes || 0),
      mediaMimeType:
        typeof updates.mediaMimeType === 'string'
          ? updates.mediaMimeType
          : String(current.mediaMimeType || '').trim().toLowerCase(),
      storageProvider:
        typeof updates.storageProvider === 'string'
          ? updates.storageProvider
          : String(current.storageProvider || '').trim(),
    });
    if (metadataError) {
      return NextResponse.json({ success: false, error: metadataError }, { status: 400 });
    }

    const publishedState =
      typeof updates.isPublished === 'boolean' ? Boolean(updates.isPublished) : undefined;
    const nextWorkflow = applyLegacyPublishCompatibility(
      resolveStoryWorkflow(current),
      publishedState
    );

    const story = await Story.findByIdAndUpdate(
      id,
      {
        ...updates,
        isPublished: nextWorkflow.status === 'published',
        workflow: nextWorkflow,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!story) {
      return NextResponse.json(
        { success: false, error: 'Story not found' },
        { status: 404 }
      );
    }

    await recordStoryActivity({
      storyId: id,
      actor: user,
      action: 'saved',
      toStatus: resolveStoryWorkflow(story.toObject()).status,
      message: buildStoryActivityMessage({ action: 'saved' }),
      metadata: {
        changedFields: Object.keys(updates),
      },
    });

    const usage = await getStoryVideoMonthlyUsageSummary();

    return NextResponse.json({
      success: true,
      data: resolveStoryResponse(story.toObject()),
      message: 'Story updated successfully',
      usage,
    });
  } catch (error: unknown) {
    console.error('Error updating story:', error);
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to update story'
        : 'Failed to update story';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function DELETEHandler(
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
      const deleted = await deleteStoredStory(id);
      if (!deleted) {
        return NextResponse.json(
          { success: false, error: 'Story not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Story deleted successfully',
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid story ID' },
        { status: 400 }
      );
    }

    const story = await Story.findByIdAndDelete(id);
    if (!story) {
      return NextResponse.json(
        { success: false, error: 'Story not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Story deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Error deleting story:', error);
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to delete story'
        : 'Failed to delete story';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const PATCH = withAdminMutation(PATCHHandler);
export const PUT = withAdminMutation(PUTHandler);
export const DELETE = withAdminMutation(DELETEHandler);
