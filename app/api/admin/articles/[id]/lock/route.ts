import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  acquireOrRenewLock,
  getActiveLock,
  releaseLock,
  takeOverLock,
} from '@/lib/server/content/articleLockRepository';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/articles/[id]/lock
 * Returns active lock status for this article.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getAdminSessionFromReq(req);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id: articleId } = await params;
  if (!articleId) {
    return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
  }

  const result = await getActiveLock(articleId, session.id);
  return NextResponse.json(result);
}

/**
 * POST /api/admin/articles/[id]/lock
 * Acquires, renews heartbeat, takes over, or releases a lock.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getAdminSessionFromReq(req);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id: articleId } = await params;
  if (!articleId) {
    return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'acquire' | 'heartbeat' | 'take_over' | 'release';
  };
  const action = body.action || 'acquire';

  if (action === 'release') {
    const res = await releaseLock(articleId, session);
    if (!res.success) {
      return NextResponse.json({ error: res.error || 'FORBIDDEN' }, { status: res.status || 403 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'take_over') {
    const res = await takeOverLock(articleId, session);
    if (!res.success) {
      return NextResponse.json(
        { error: res.error, ...('message' in res && res.message ? { message: res.message } : {}) },
        { status: res.status }
      );
    }
    return NextResponse.json(res);
  }

  // Acquire or heartbeat
  const res = await acquireOrRenewLock(articleId, session);
  if (!res.success) {
    return NextResponse.json(
      { error: res.error, ...('holder' in res ? { holder: res.holder } : {}) },
      { status: res.status }
    );
  }
  return NextResponse.json(res);
}

/**
 * DELETE /api/admin/articles/[id]/lock
 * Releases lock held by current user or admin.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getAdminSessionFromReq(req);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id: articleId } = await params;
  if (!articleId) {
    return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
  }

  const res = await releaseLock(articleId, session);
  if (!res.success) {
    return NextResponse.json({ error: res.error || 'FORBIDDEN' }, { status: res.status || 403 });
  }
  return NextResponse.json({ success: true });
}
