import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { getAdminSession } from '@/lib/auth/admin';
import { canReadContent } from '@/lib/auth/permissions';
import { isCopyEditorRole, isSuperAdminRole, normalizeAdminRole } from '@/lib/auth/roles';
import {
  createEmptyStoryVideoProduction,
  isStoryReadyForArticleCreation,
  normalizeStoryVideoProduction,
  normalizeStoryVideoProductionStatus,
  type StoryVideoProduction,
} from '@/lib/content/newsroomPublishing';
import {
  buildStoryPermissionRecord,
  buildStoryRevisionSnapshot,
  getStoryForMutation,
  isStoryVersionConflictError,
  resolveStoryStore,
  resolveStoryVersion,
  updateStoryWithCas,
  type StoryRecord,
} from '@/lib/server/storyEditorialService';
import { updateStoredStory } from '@/lib/storage/storiesFile';
import { resolveStoryWorkflow } from '@/lib/workflow/story';
import { storyVideoProductionService } from '@/lib/server/media/storyVideoProductionService';
import { MediaValidationError } from '@/lib/server/media/mediaService';
import { recordStoryActivity } from '@/lib/server/storyActivity';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function canManageVideoProduction(role: string | null | undefined) {
  return role === 'admin' || isSuperAdminRole(role) || isCopyEditorRole(role);
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
    id: String(assignee._id),
    name: assignee.name || '',
    email: assignee.email || '',
    role,
  };
}

function validateStoryIsReadyForProduction(story: StoryRecord) {
  const workflow = resolveStoryWorkflow({
    workflow:
      typeof story.workflow === 'object' && story.workflow
        ? (story.workflow as Record<string, unknown>)
        : null,
    isPublished:
      typeof story.isPublished === 'boolean' ? story.isPublished : undefined,
    publishedAt: story.publishedAt as Date | string | undefined,
    updatedAt: story.updatedAt as Date | string | undefined,
  });

  if (!isStoryReadyForArticleCreation(workflow.status)) {
    return 'Only approved stories can start video production.';
  }

  return null;
}

function normalizeVideoProductionUpdate(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const updates: Partial<StoryVideoProduction> & {
    assignedToId?: string;
    expectedVersion?: number;
    clearError?: boolean;
  } = {};

  if (source.status !== undefined) {
    updates.status = normalizeStoryVideoProductionStatus(source.status);
  }
  if (typeof source.editorNotes === 'string') {
    updates.editorNotes = source.editorNotes.trim();
  }
  if (typeof source.masterAssetId === 'string' && source.masterAssetId.trim()) {
    updates.masterAssetId = source.masterAssetId.trim();
  }
  if (typeof source.masterExportUrl === 'string') {
    updates.masterExportUrl = source.masterExportUrl.trim();
  }
  if (typeof source.thumbnailUrl === 'string') {
    updates.thumbnailUrl = source.thumbnailUrl.trim();
  }
  if (typeof source.assignedToId === 'string') {
    updates.assignedToId = source.assignedToId.trim();
  }
  if (typeof source.expectedVersion === 'number' && Number.isInteger(source.expectedVersion)) {
    updates.expectedVersion = source.expectedVersion;
  }
  if (source.clearError === true) {
    updates.clearError = true;
  }

  return updates;
}

async function POSTHandler(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getAdminSession();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageVideoProduction(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const effectiveStore = await resolveStoryStore();
    const story = await getStoryForMutation(id, effectiveStore);
    if (!story) {
      return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 });
    }
    if (!canReadContent(user, buildStoryPermissionRecord(story), { allowViewerRead: true })) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const readinessError = validateStoryIsReadyForProduction(story);
    if (readinessError) {
      return NextResponse.json({ success: false, error: readinessError }, { status: 400 });
    }

    const currentProduction = normalizeStoryVideoProduction(story.videoProduction);
    const targetStatus = currentProduction.status === 'not_started' ? 'editing' : currentProduction.status;

    storyVideoProductionService.validateTransition(
      currentProduction.status,
      targetStatus,
      user,
      currentProduction
    );

    const nextProduction: StoryVideoProduction = {
      ...currentProduction,
      status: targetStatus,
      assignedTo: currentProduction.assignedTo || {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      updatedAt: new Date().toISOString(),
    };

    const updated =
      story.version !== undefined && story.version !== null
        ? await updateStoryWithCas(
            id,
            { videoProduction: nextProduction },
            resolveStoryVersion(story.version),
            effectiveStore,
            {
              skipRevision: false,
              revisionSnapshot: buildStoryRevisionSnapshot(story, user, 'Started video production'),
            }
          )
        : effectiveStore === 'file'
          ? await updateStoredStory(id, { videoProduction: nextProduction })
          : await updateStoryWithCas(
              id,
              { videoProduction: nextProduction },
              resolveStoryVersion(story.version),
              effectiveStore
            );

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 });
    }

    await recordStoryActivity({
      storyId: id,
      actor: user,
      action: 'video_production_started',
      toStatus: resolveStoryWorkflow(updated).status,
      message: 'Video production started',
      metadata: { targetStatus },
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      data: {
        storyId: id,
        videoProduction: normalizeStoryVideoProduction(updated.videoProduction),
      },
    });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (isStoryVersionConflictError(error)) {
      return NextResponse.json(
        { success: false, error: 'A version conflict occurred. Please reload and retry.' },
        { status: 409 }
      );
    }
    console.error('Error starting story video production:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start video production' },
      { status: 500 }
    );
  }
}

async function PATCHHandler(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getAdminSession();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageVideoProduction(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const updates = normalizeVideoProductionUpdate(await req.json());
    const effectiveStore = await resolveStoryStore();
    const story = await getStoryForMutation(id, effectiveStore);
    if (!story) {
      return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 });
    }
    if (!canReadContent(user, buildStoryPermissionRecord(story), { allowViewerRead: true })) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const readinessError = validateStoryIsReadyForProduction(story);
    if (readinessError) {
      return NextResponse.json({ success: false, error: readinessError }, { status: 400 });
    }

    let assignedTo = undefined;
    if (updates.assignedToId) {
      if (!process.env.MONGODB_URI?.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: 'Video production assignment requires MongoDB-backed users.',
          },
          { status: 503 }
        );
      }
      await connectDB();
      assignedTo = await resolveAssignee(updates.assignedToId);
      if (!assignedTo) {
        return NextResponse.json(
          { success: false, error: 'Valid assignedToId is required' },
          { status: 400 }
        );
      }
    }

    const currentProduction = normalizeStoryVideoProduction(
      story.videoProduction || createEmptyStoryVideoProduction()
    );

    let nextProduction: StoryVideoProduction = { ...currentProduction };

    // 1. Master export attachment
    if (updates.masterAssetId) {
      nextProduction = await storyVideoProductionService.attachMaster(
        id,
        updates.masterAssetId,
        user,
        nextProduction
      );
    } else if (updates.masterExportUrl !== undefined) {
      nextProduction.masterExportUrl = updates.masterExportUrl;
    }

    // 2. Metadata updates
    if (updates.editorNotes !== undefined) {
      nextProduction.editorNotes = updates.editorNotes;
    }
    if (updates.thumbnailUrl !== undefined) {
      nextProduction.thumbnailUrl = updates.thumbnailUrl;
    }
    if (assignedTo !== undefined) {
      nextProduction.assignedTo = assignedTo;
    }
    if (updates.clearError) {
      nextProduction.lastError = null;
    }

    // 3. Status transition validation
    if (updates.status && updates.status !== currentProduction.status) {
      storyVideoProductionService.validateTransition(
        currentProduction.status,
        updates.status,
        user,
        nextProduction
      );
      nextProduction.status = updates.status;
    }

    nextProduction.updatedAt = new Date().toISOString();

    // 4. Concurrency CAS check & persistence
    const hasExplicitVersion =
      updates.expectedVersion !== undefined ||
      (story.version !== undefined && story.version !== null);

    const updated = hasExplicitVersion
      ? await updateStoryWithCas(
          id,
          { videoProduction: nextProduction },
          updates.expectedVersion ?? resolveStoryVersion(story.version),
          effectiveStore,
          {
            skipRevision: false,
            revisionSnapshot: buildStoryRevisionSnapshot(
              story,
              user,
              `Video production updated: ${nextProduction.status}`
            ),
          }
        )
      : effectiveStore === 'file'
        ? await updateStoredStory(id, { videoProduction: nextProduction })
        : await updateStoryWithCas(
            id,
            { videoProduction: nextProduction },
            resolveStoryVersion(story.version),
            effectiveStore
          );

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 });
    }

    await recordStoryActivity({
      storyId: id,
      actor: user,
      action: 'video_production_updated',
      toStatus: resolveStoryWorkflow(updated).status,
      message: `Video production updated to ${nextProduction.status}`,
      metadata: { status: nextProduction.status },
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      data: {
        storyId: id,
        videoProduction: normalizeStoryVideoProduction(updated.videoProduction),
      },
    });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (isStoryVersionConflictError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: 'A version conflict occurred. Please reload and retry.',
          code: 'STORY_VERSION_CONFLICT',
        },
        { status: 409 }
      );
    }
    console.error('Error updating story video production:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update video production' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
export const PATCH = withAdminMutation(PATCHHandler);
