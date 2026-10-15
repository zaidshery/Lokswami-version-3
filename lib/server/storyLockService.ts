import connectDB from '@/lib/db/mongoose';
import StoryLock from '@/lib/models/StoryLock';
import { canTakeOverArticleLock } from '@/lib/auth/permissions';
import {
  acquireOrRenewStoredStoryLock,
  getActiveStoredStoryLock,
  releaseStoredStoryLock,
} from '@/lib/storage/storyLocksFile';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

export const LOCK_TTL_MS = 60_000;

export async function shouldUseFileStore(): Promise<boolean> {
  if (!process.env.MONGODB_URI) return true;
  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for story lock repository, using file store.', error);
    return true;
  }
}

export interface StoryLockDetails {
  userId: string;
  userName: string;
  userRole: string;
  lockedAt: string;
  expiresAt: string;
  isCurrentUser?: boolean;
}

export type StoryLockAcquireResult =
  | { success: true; hasLock: true; lock: StoryLockDetails }
  | {
      success: false;
      status: 409;
      code: 'STORY_EDIT_LEASE_CONFLICT';
      error: 'LOCKED_BY_OTHER';
      holder: Omit<StoryLockDetails, 'isCurrentUser'>;
    }
  | { success: false; status: 403; error: 'FORBIDDEN'; message?: string };

export class StoryEditLeaseConflictError extends Error {
  readonly code = 'STORY_EDIT_LEASE_CONFLICT';
  readonly status = 409;
  readonly holder?: Omit<StoryLockDetails, 'isCurrentUser'>;
  readonly lease?: Omit<StoryLockDetails, 'isCurrentUser'>;

  constructor(
    holder?: Omit<StoryLockDetails, 'isCurrentUser'>,
    message = 'This story is currently being edited by another user.'
  ) {
    super(message);
    this.name = 'StoryEditLeaseConflictError';
    this.holder = holder;
    this.lease = holder;
  }
}

export async function getActiveStoryLock(
  storyId: string,
  currentUserId: string
): Promise<{ isLocked: boolean; lock: StoryLockDetails | null }> {
  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const activeLock = await getActiveStoredStoryLock(storyId);
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
  const activeLock = await StoryLock.findOne({
    storyId,
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

export async function acquireOrRenewStoryLock(
  storyId: string,
  session: AdminSessionIdentity
): Promise<StoryLockAcquireResult> {
  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const existing = await getActiveStoredStoryLock(storyId);
    if (existing && existing.userId !== session.id) {
      return {
        success: false,
        status: 409,
        code: 'STORY_EDIT_LEASE_CONFLICT',
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

    const updated = await acquireOrRenewStoredStoryLock({
      storyId,
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
  const existing = await StoryLock.findOne({
    storyId,
    expiresAt: { $gt: now },
  });

  if (existing && existing.userId !== session.id) {
    return {
      success: false,
      status: 409,
      code: 'STORY_EDIT_LEASE_CONFLICT',
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

  const lock = await StoryLock.findOneAndUpdate(
    { storyId },
    {
      storyId,
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

export async function takeOverStoryLock(
  storyId: string,
  session: AdminSessionIdentity
): Promise<StoryLockAcquireResult> {
  if (!canTakeOverArticleLock(session.role)) {
    return {
      success: false,
      status: 403,
      error: 'FORBIDDEN',
      message: 'Only admins can take over story editing locks.',
    };
  }

  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const newLock = await acquireOrRenewStoredStoryLock({
      storyId,
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

  const lock = await StoryLock.findOneAndUpdate(
    { storyId },
    {
      storyId,
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

export async function releaseStoryLock(
  storyId: string,
  session: AdminSessionIdentity
): Promise<{ success: boolean; status?: number; error?: string }> {
  const canForce = canTakeOverArticleLock(session.role);
  const useFileStore = await shouldUseFileStore();

  if (useFileStore) {
    const released = await releaseStoredStoryLock(storyId, session.id, canForce);
    if (!released) {
      return { success: false, status: 403, error: 'FORBIDDEN' };
    }
    return { success: true };
  }

  const existing = await StoryLock.findOne({ storyId });
  if (existing) {
    if (existing.userId === session.id || canForce) {
      await StoryLock.deleteOne({ _id: existing._id });
    } else {
      return { success: false, status: 403, error: 'FORBIDDEN' };
    }
  }
  return { success: true };
}

export async function deleteStoryLock(storyId: string): Promise<void> {
  const useFileStore = await shouldUseFileStore();
  if (useFileStore) {
    await releaseStoredStoryLock(storyId, undefined, true);
    return;
  }
  await StoryLock.deleteMany({ storyId });
}

export async function assertStoryLeaseNotHeldByOther(
  storyId: string,
  session: AdminSessionIdentity
): Promise<void> {
  const { isLocked, lock } = await getActiveStoryLock(storyId, session.id);
  if (isLocked && lock && lock.userId !== session.id) {
    throw new StoryEditLeaseConflictError(lock);
  }
}
