import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  StoryEditorialService,
  StoryVersionConflictError,
  StoryExpectedVersionError,
  StoryForbiddenError,
  StoryValidationError,
  StoryNotFoundError,
  StoryInvalidIdError,
  StoryEditLeaseConflictError,
  parseExpectedStoryVersion,
  type WorkflowActionBody,
} from '@/lib/server/storyEditorialService';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function storyVersionConflictResponse(error: StoryVersionConflictError) {
  return NextResponse.json(
    {
      success: false,
      code: error.code || 'STORY_VERSION_CONFLICT',
      error: error.message,
      currentVersion: error.currentVersion,
    },
    { status: 409 }
  );
}

function handleStoryRouteError(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof StoryEditLeaseConflictError) {
    return NextResponse.json(
      {
        success: false,
        code: error.code || 'STORY_EDIT_LEASE_CONFLICT',
        error: error.message,
        lease: error.lease,
      },
      { status: 409 }
    );
  }
  if (error instanceof StoryVersionConflictError) {
    return storyVersionConflictResponse(error);
  }
  if (error instanceof StoryExpectedVersionError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  if (error instanceof StoryValidationError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  if (error instanceof StoryForbiddenError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  if (error instanceof StoryNotFoundError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }
  if (error instanceof StoryInvalidIdError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  console.error(`Error in story route (${fallbackMessage}):`, error);
  const message =
    process.env.NODE_ENV !== 'production' && error instanceof Error
      ? error.message || fallbackMessage
      : fallbackMessage;
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const story = await StoryEditorialService.getStoryEditorial(id, user);
    return NextResponse.json({ success: true, data: story });
  } catch (error) {
    return handleStoryRouteError(error, 'Failed to fetch story');
  }
}

async function PATCHHandler(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as WorkflowActionBody;
    const result = await StoryEditorialService.applyStoryWorkflowAction(id, body, user);

    return NextResponse.json({
      success: true,
      data: result.story,
      message: `Story moved to ${result.toStatus}.`,
    });
  } catch (error) {
    return handleStoryRouteError(error, 'Failed to update story workflow');
  }
}

async function PUTHandler(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const result = await StoryEditorialService.updateStoryEditorial(id, body, user);

    return NextResponse.json({
      success: true,
      data: result.story,
      message: 'Story updated successfully',
      usage: result.usage,
    });
  } catch (error) {
    return handleStoryRouteError(error, 'Failed to update story');
  }
}

async function DELETEHandler(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const queryExpectedVersion = parseExpectedStoryVersion(new URL(req.url).searchParams.get('expectedVersion'));
    const bodyExpectedVersion = parseExpectedStoryVersion(body?.expectedVersion);
    const expectedVersion = queryExpectedVersion ?? bodyExpectedVersion;

    await StoryEditorialService.deleteStoryEditorial(id, expectedVersion, user);

    return NextResponse.json({
      success: true,
      message: 'Story deleted successfully',
    });
  } catch (error) {
    return handleStoryRouteError(error, 'Failed to delete story');
  }
}

export const PATCH = withAdminMutation(PATCHHandler);
export const PUT = withAdminMutation(PUTHandler);
export const DELETE = withAdminMutation(DELETEHandler);
