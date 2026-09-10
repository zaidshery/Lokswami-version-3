import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { videoEditorialService } from '@/lib/server/video/videoEditorialService';
import {
  InvalidVideoIdError,
  MongoAssignmentUnavailableError,
  VideoForbiddenError,
  VideoNotFoundError,
  VideoValidationError,
  type WorkflowActionBody,
} from '@/lib/server/video/videoTypes';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function handleVideoError(error: unknown, defaultMessage: string) {
  if (error instanceof InvalidVideoIdError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof VideoNotFoundError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof VideoForbiddenError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof MongoAssignmentUnavailableError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof VideoValidationError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000) {
    return NextResponse.json(
      { success: false, error: 'That Swipe slug is already in use. Choose a unique slug.' },
      { status: 409 }
    );
  }

  console.error(defaultMessage, error);
  const message =
    process.env.NODE_ENV !== 'production'
      ? error instanceof Error ? error.message : defaultMessage
      : defaultMessage;
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const data = await videoEditorialService.getVideo(id, user);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleVideoError(error, 'Failed to fetch video');
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = (await req.json()) as WorkflowActionBody;
    const result = await videoEditorialService.applyWorkflowAction(id, body, user);

    return NextResponse.json({
      success: true,
      data: result.data,
      message: result.message,
    });
  } catch (error) {
    return handleVideoError(error, 'Failed to update video workflow');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const result = await videoEditorialService.updateVideo(id, body, user);

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    return handleVideoError(error, 'Failed to update video');
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const result = await videoEditorialService.deleteVideo(id, user);

    return NextResponse.json(result);
  } catch (error) {
    return handleVideoError(error, 'Failed to delete video');
  }
}
