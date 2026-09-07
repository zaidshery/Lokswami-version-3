import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import ArticleLock from '@/lib/models/ArticleLock';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canTakeOverArticleLock } from '@/lib/auth/permissions';
import {
  acquireOrRenewStoredLock,
  getActiveStoredLock,
  releaseStoredLock,
} from '@/lib/storage/articleLocksFile';

const LOCK_TTL_MS = 60_000;

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;
  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for article lock route, using file store.', error);
    return true;
  }
}

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

  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const activeLock = await getActiveStoredLock(articleId);
    if (!activeLock) {
      return NextResponse.json({ isLocked: false, lock: null });
    }

    const isCurrentUser = activeLock.userId === session.id;
    return NextResponse.json({
      isLocked: true,
      lock: {
        userId: activeLock.userId,
        userName: activeLock.userName,
        userRole: activeLock.userRole,
        lockedAt: activeLock.lockedAt,
        expiresAt: activeLock.expiresAt,
        isCurrentUser,
      },
    });
  }

  const now = new Date();
  const activeLock = await ArticleLock.findOne({
    articleId,
    expiresAt: { $gt: now },
  }).lean<{
    userId: string;
    userName: string;
    userRole: string;
    lockedAt: Date;
    expiresAt: Date;
  }>();

  if (!activeLock) {
    return NextResponse.json({ isLocked: false, lock: null });
  }

  const isCurrentUser = activeLock.userId === session.id;
  return NextResponse.json({
    isLocked: true,
    lock: {
      userId: activeLock.userId,
      userName: activeLock.userName,
      userRole: activeLock.userRole,
      lockedAt: activeLock.lockedAt.toISOString(),
      expiresAt: activeLock.expiresAt.toISOString(),
      isCurrentUser,
    },
  });
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

  const useFileStore = await shouldUseFileStore();

  // Action: Release
  if (action === 'release') {
    const canForce = canTakeOverArticleLock(session.role);
    if (useFileStore) {
      const released = await releaseStoredLock(articleId, session.id, canForce);
      if (!released) {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
      }
      return NextResponse.json({ success: true });
    }

    const existing = await ArticleLock.findOne({ articleId });
    if (existing) {
      if (existing.userId === session.id || canForce) {
        await ArticleLock.deleteOne({ _id: existing._id });
      } else {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
      }
    }
    return NextResponse.json({ success: true });
  }

  // Action: Take Over
  if (action === 'take_over') {
    if (!canTakeOverArticleLock(session.role)) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Only admins can take over article editing locks.',
        },
        { status: 403 }
      );
    }

    if (useFileStore) {
      const newLock = await acquireOrRenewStoredLock({
        articleId,
        userId: session.id,
        userName: session.name,
        userRole: session.role,
        expiresInMs: LOCK_TTL_MS,
      });

      return NextResponse.json({
        success: true,
        hasLock: true,
        lock: {
          userId: newLock.userId,
          userName: newLock.userName,
          userRole: newLock.userRole,
          lockedAt: newLock.lockedAt,
          expiresAt: newLock.expiresAt,
          isCurrentUser: true,
        },
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

    const lock = await ArticleLock.findOneAndUpdate(
      { articleId },
      {
        articleId,
        userId: session.id,
        userName: session.name,
        userRole: session.role,
        lockedAt: now,
        expiresAt,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      hasLock: true,
      lock: {
        userId: lock.userId,
        userName: lock.userName,
        userRole: lock.userRole,
        lockedAt: lock.lockedAt.toISOString(),
        expiresAt: lock.expiresAt.toISOString(),
        isCurrentUser: true,
      },
    });
  }

  // Action: Acquire or Heartbeat
  if (useFileStore) {
    const existing = await getActiveStoredLock(articleId);

    // If locked by another user and not expired
    if (existing && existing.userId !== session.id) {
      return NextResponse.json(
        {
          error: 'LOCKED_BY_OTHER',
          holder: {
            userId: existing.userId,
            userName: existing.userName,
            userRole: existing.userRole,
            lockedAt: existing.lockedAt,
            expiresAt: existing.expiresAt,
          },
        },
        { status: 423 }
      );
    }

    // Unlocked or owned by current user -> acquire / renew lease
    const updated = await acquireOrRenewStoredLock({
      articleId,
      userId: session.id,
      userName: session.name,
      userRole: session.role,
      expiresInMs: LOCK_TTL_MS,
    });

    return NextResponse.json({
      success: true,
      hasLock: true,
      lock: {
        userId: updated.userId,
        userName: updated.userName,
        userRole: updated.userRole,
        lockedAt: updated.lockedAt,
        expiresAt: updated.expiresAt,
        isCurrentUser: true,
      },
    });
  }

  // MongoDB path for acquire / heartbeat
  const now = new Date();
  const existing = await ArticleLock.findOne({
    articleId,
    expiresAt: { $gt: now },
  });

  if (existing && existing.userId !== session.id) {
    return NextResponse.json(
      {
        error: 'LOCKED_BY_OTHER',
        holder: {
          userId: existing.userId,
          userName: existing.userName,
          userRole: existing.userRole,
          lockedAt: existing.lockedAt.toISOString(),
          expiresAt: existing.expiresAt.toISOString(),
        },
      },
      { status: 423 }
    );
  }

  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  const lock = await ArticleLock.findOneAndUpdate(
    { articleId },
    {
      articleId,
      userId: session.id,
      userName: session.name,
      userRole: session.role,
      lockedAt: existing ? existing.lockedAt : now,
      expiresAt,
    },
    { upsert: true, new: true }
  );

  return NextResponse.json({
    success: true,
    hasLock: true,
    lock: {
      userId: lock.userId,
      userName: lock.userName,
      userRole: lock.userRole,
      lockedAt: lock.lockedAt.toISOString(),
      expiresAt: lock.expiresAt.toISOString(),
      isCurrentUser: true,
    },
  });
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

  const canForce = canTakeOverArticleLock(session.role);
  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const released = await releaseStoredLock(articleId, session.id, canForce);
    if (!released) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    return NextResponse.json({ success: true });
  }

  const existing = await ArticleLock.findOne({ articleId });
  if (existing) {
    if (existing.userId === session.id || canForce) {
      await ArticleLock.deleteOne({ _id: existing._id });
    } else {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
  }

  return NextResponse.json({ success: true });
}
