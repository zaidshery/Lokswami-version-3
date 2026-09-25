import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  acquireOrRenewStoryLock,
  getActiveStoryLock,
  releaseStoryLock,
  takeOverStoryLock,
} from '@/lib/server/storyLockService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/stories/[id]/lock
 * Returns active lock status for this story.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getAdminSessionFromReq(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id: storyId } = await params;
  if (!storyId) {
    return NextResponse.json({ success: false, error: 'MISSING_ID' }, { status: 400 });
  }

  const result = await getActiveStoryLock(storyId, session.id);
  return NextResponse.json({
    success: true,
    hasLock: result.isLocked,
    isLocked: result.isLocked,
    lock: result.lock,
  });
}

/**
 * POST /api/admin/stories/[id]/lock
 * Acquires, renews heartbeat, takes over, or releases a lock.
 */
async function POSTHandler(req: NextRequest, { params }: RouteParams) {
  const session = await getAdminSessionFromReq(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id: storyId } = await params;
  if (!storyId) {
    return NextResponse.json({ success: false, error: 'MISSING_ID' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'acquire' | 'heartbeat' | 'take_over' | 'release';
  };
  const action = body.action || 'acquire';

  if (action === 'release') {
    const res = await releaseStoryLock(storyId, session);
    if (!res.success) {
      return NextResponse.json(
        { success: false, error: res.error || 'FORBIDDEN' },
        { status: res.status || 403 }
      );
    }
    return NextResponse.json({ success: true, message: 'Story lock released' });
  }

  if (action === 'take_over') {
    const res = await takeOverStoryLock(storyId, session);
    if (!res.success) {
      return NextResponse.json(
        {
          success: false,
          error: res.error,
          ...('message' in res && res.message ? { message: res.message } : {}),
        },
        { status: res.status }
      );
    }
    return NextResponse.json(res);
  }

  // Acquire or heartbeat
  const res = await acquireOrRenewStoryLock(storyId, session);
  if (!res.success) {
    return NextResponse.json(
      {
        success: false,
        error: res.error,
        code: 'STORY_EDIT_LEASE_CONFLICT',
        ...('holder' in res ? { holder: res.holder, lease: res.holder } : {}),
      },
      { status: res.status }
    );
  }
  return NextResponse.json(res);
}

/**
 * DELETE /api/admin/stories/[id]/lock
 * Releases lock held by current user or admin.
 */
async function DELETEHandler(req: NextRequest, { params }: RouteParams) {
  const session = await getAdminSessionFromReq(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id: storyId } = await params;
  if (!storyId) {
    return NextResponse.json({ success: false, error: 'MISSING_ID' }, { status: 400 });
  }

  const res = await releaseStoryLock(storyId, session);
  if (!res.success) {
    return NextResponse.json(
      { success: false, error: res.error || 'FORBIDDEN' },
      { status: res.status || 403 }
    );
  }

  return NextResponse.json({ success: true, message: 'Story lock released' });
}

export const POST = withAdminMutation(POSTHandler);
export const DELETE = withAdminMutation(DELETEHandler);
