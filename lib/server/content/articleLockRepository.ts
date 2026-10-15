import connectDB from '@/lib/db/mongoose';
import ArticleLock from '@/lib/models/ArticleLock';
import { canTakeOverArticleLock } from '@/lib/auth/permissions';
import {
  acquireOrRenewStoredLock,
  getActiveStoredLock,
  releaseStoredLock,
} from '@/lib/storage/articleLocksFile';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

export const LOCK_TTL_MS = 60_000;

export async function shouldUseFileStore(): Promise<boolean> {
  if (!process.env.MONGODB_URI) return true;
  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for article lock repository, using file store.', error);
    return true;
  }
}

export interface LockDetails {
  userId: string;
  userName: string;
  userRole: string;
  lockedAt: string;
  expiresAt: string;
  isCurrentUser?: boolean;
}

export async function getActiveLock(
  articleId: string,
  currentUserId: string
): Promise<{ isLocked: boolean; lock: LockDetails | null }> {
  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const activeLock = await getActiveStoredLock(articleId);
    if (!activeLock) {
      return { isLocked: false, lock: null };
    }

    const isCurrentUser = activeLock.userId === currentUserId;
    return {
      isLocked: true,
      lock: {
        userId: activeLock.userId,
        userName: activeLock.userName,
        userRole: activeLock.userRole,
        lockedAt: activeLock.lockedAt,
        expiresAt: activeLock.expiresAt,
        isCurrentUser,
      },
    };
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
    return { isLocked: false, lock: null };
  }

  const isCurrentUser = activeLock.userId === currentUserId;
  return {
    isLocked: true,
    lock: {
      userId: activeLock.userId,
      userName: activeLock.userName,
      userRole: activeLock.userRole,
      lockedAt: activeLock.lockedAt.toISOString(),
      expiresAt: activeLock.expiresAt.toISOString(),
      isCurrentUser,
    },
  };
}

export type LockAcquireResult =
  | { success: true; hasLock: true; lock: LockDetails }
  | { success: false; status: 423; error: 'LOCKED_BY_OTHER'; holder: Omit<LockDetails, 'isCurrentUser'> }
  | { success: false; status: 403; error: 'FORBIDDEN'; message?: string };

export async function acquireOrRenewLock(
  articleId: string,
  session: AdminSessionIdentity
): Promise<LockAcquireResult> {
  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const existing = await getActiveStoredLock(articleId);
    if (existing && existing.userId !== session.id) {
      return {
        success: false,
        status: 423,
        error: 'LOCKED_BY_OTHER',
        holder: {
          userId: existing.userId,
          userName: existing.userName,
          userRole: existing.userRole,
          lockedAt: existing.lockedAt,
          expiresAt: existing.expiresAt,
        },
      };
    }

    const updated = await acquireOrRenewStoredLock({
      articleId,
      userId: session.id,
      userName: session.name,
      userRole: session.role,
      expiresInMs: LOCK_TTL_MS,
    });

    return {
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
    };
  }

  const now = new Date();
  const existing = await ArticleLock.findOne({
    articleId,
    expiresAt: { $gt: now },
  });

  if (existing && existing.userId !== session.id) {
    return {
      success: false,
      status: 423,
      error: 'LOCKED_BY_OTHER',
      holder: {
        userId: existing.userId,
        userName: existing.userName,
        userRole: existing.userRole,
        lockedAt: existing.lockedAt.toISOString(),
        expiresAt: existing.expiresAt.toISOString(),
      },
    };
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

  return {
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
  };
}

export async function takeOverLock(
  articleId: string,
  session: AdminSessionIdentity
): Promise<LockAcquireResult> {
  if (!canTakeOverArticleLock(session.role)) {
    return {
      success: false,
      status: 403,
      error: 'FORBIDDEN',
      message: 'Only admins can take over article editing locks.',
    };
  }

  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const newLock = await acquireOrRenewStoredLock({
      articleId,
      userId: session.id,
      userName: session.name,
      userRole: session.role,
      expiresInMs: LOCK_TTL_MS,
    });

    return {
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
    };
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

  return {
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
  };
}

export async function releaseLock(
  articleId: string,
  session: AdminSessionIdentity
): Promise<{ success: boolean; status?: number; error?: string }> {
  const canForce = canTakeOverArticleLock(session.role);
  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const released = await releaseStoredLock(articleId, session.id, canForce);
    if (!released) {
      return { success: false, status: 403, error: 'FORBIDDEN' };
    }
    return { success: true };
  }

  const existing = await ArticleLock.findOne({ articleId });
  if (existing) {
    if (existing.userId === session.id || canForce) {
      await ArticleLock.deleteOne({ _id: existing._id });
    } else {
      return { success: false, status: 403, error: 'FORBIDDEN' };
    }
  }
  return { success: true };
}
