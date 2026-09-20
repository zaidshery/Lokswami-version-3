import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import Story from '@/lib/models/Story';
import User from '@/lib/models/User';
import { getAdminSession } from '@/lib/auth/admin';
import { canReadContent } from '@/lib/auth/permissions';
import { isCopyEditorRole, isSuperAdminRole } from '@/lib/auth/roles';
import {
  createEmptyStoryVideoProduction,
  isStoryReadyForArticleCreation,
  normalizeStoryVideoProduction,
  normalizeStoryVideoProductionStatus,
  type StoryVideoProduction,
} from '@/lib/content/newsroomPublishing';
import {
  getStoredStoryById,
  updateStoredStory,
} from '@/lib/storage/storiesFile';
import { resolveStoryWorkflow } from '@/lib/workflow/story';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type StoryRecord = {
  _id?: unknown;
  author?: string;
  title?: string;
  workflow?: unknown;
  isPublished?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
  videoProduction?: unknown;
};

function asStoryRecord(value: unknown): StoryRecord | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as StoryRecord;
}

function buildStoryPermissionRecord(story: StoryRecord) {
  return {
    legacyAuthorName: typeof story.author === 'string' ? story.author : '',
    workflow: resolveStoryWorkflow({
      workflow:
        typeof story.workflow === 'object' && story.workflow
          ? (story.workflow as Record<string, unknown>)
          : null,
      isPublished:
        typeof story.isPublished === 'boolean' ? story.isPublished : undefined,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
    }),
  };
}

function canManageVideoProduction(role: string | null | undefined) {
  return role === 'admin' || isSuperAdminRole(role) || isCopyEditorRole(role);
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch {
    return true;
  }
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

function validateStoryIsReadyForProduction(story: StoryRecord) {
  const workflow = resolveStoryWorkflow({
    workflow:
      typeof story.workflow === 'object' && story.workflow
        ? (story.workflow as Record<string, unknown>)
        : null,
    isPublished:
      typeof story.isPublished === 'boolean' ? story.isPublished : undefined,
    publishedAt: story.publishedAt,
    updatedAt: story.updatedAt,
  });

  if (!isStoryReadyForArticleCreation(workflow.status)) {
    return 'Only approved stories can start video production.';
  }

  return null;
}

function normalizeVideoProductionUpdate(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const updates: Partial<StoryVideoProduction> & { assignedToId?: string } = {};

  if (source.status !== undefined) {
    updates.status = normalizeStoryVideoProductionStatus(source.status);
  }
  if (typeof source.editorNotes === 'string') {
    updates.editorNotes = source.editorNotes.trim();
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

    const useFileStore = await shouldUseFileStore();
    const story = asStoryRecord(
      useFileStore
      ? await getStoredStoryById(id)
      : !Types.ObjectId.isValid(id)
        ? null
        : await Story.findById(id).lean()
    );

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
    const nextProduction: StoryVideoProduction = {
      ...currentProduction,
      status:
        currentProduction.status === 'not_started' ? 'editing' : currentProduction.status,
      assignedTo:
        currentProduction.assignedTo ||
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      updatedAt: new Date().toISOString(),
    };

    const updated = useFileStore
      ? await updateStoredStory(id, { videoProduction: nextProduction })
      : asStoryRecord(await Story.findByIdAndUpdate(
          id,
          { $set: { videoProduction: nextProduction, updatedAt: new Date() } },
          { new: true }
        ).lean());

    return NextResponse.json({
      success: true,
      data: {
        storyId: id,
        videoProduction: normalizeStoryVideoProduction(updated?.videoProduction),
      },
    });
  } catch (error) {
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
    const useFileStore = await shouldUseFileStore();
    const story = asStoryRecord(
      useFileStore
      ? await getStoredStoryById(id)
      : !Types.ObjectId.isValid(id)
        ? null
        : await Story.findById(id).lean()
    );

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
    const nextProduction: StoryVideoProduction = {
      ...currentProduction,
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.editorNotes !== undefined ? { editorNotes: updates.editorNotes } : {}),
      ...(updates.masterExportUrl !== undefined
        ? { masterExportUrl: updates.masterExportUrl }
        : {}),
      ...(updates.thumbnailUrl !== undefined ? { thumbnailUrl: updates.thumbnailUrl } : {}),
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      updatedAt: new Date().toISOString(),
    };

    const updated = useFileStore
      ? await updateStoredStory(id, { videoProduction: nextProduction })
      : asStoryRecord(await Story.findByIdAndUpdate(
          id,
          { $set: { videoProduction: nextProduction, updatedAt: new Date() } },
          { new: true }
        ).lean());

    return NextResponse.json({
      success: true,
      data: {
        storyId: id,
        videoProduction: normalizeStoryVideoProduction(updated?.videoProduction),
      },
    });
  } catch (error) {
    console.error('Error updating story video production:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update video production' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
export const PATCH = withAdminMutation(PATCHHandler);
