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
} from '@/lib/server/storyEditorialService';

type RouteContext = {
  params: Promise<{ id: string; revisionId: string }>;
};

async function POSTHandler(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id, revisionId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const expectedVersion =
      parseExpectedStoryVersion(body?.expectedVersion) ??
      parseExpectedStoryVersion(new URL(req.url).searchParams.get('expectedVersion'));

    if (expectedVersion === null) {
      return NextResponse.json(
        { success: false, error: 'A valid expectedVersion is required.' },
        { status: 400 }
      );
    }

    const result = await StoryEditorialService.restoreStoryRevision(
      id,
      revisionId,
      expectedVersion,
      user
    );

    return NextResponse.json({
      success: true,
      data: result.story,
      message: 'Story revision restored successfully',
    });
  } catch (error) {
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
    if (error instanceof StoryExpectedVersionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error instanceof StoryValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof StoryForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    if (error instanceof StoryNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message || 'Story or revision not found' },
        { status: 404 }
      );
    }
    if (error instanceof StoryInvalidIdError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error('Error restoring story revision:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to restore story revision' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
