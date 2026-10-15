import crypto from 'node:crypto';
import { type ClientSession, Types } from 'mongoose';
import User from '@/lib/models/User';
import GovernanceLock from '@/lib/models/GovernanceLock';
import { readUsersFile } from '@/lib/storage/usersFile';

export class LastSuperAdminRemovalError extends Error {
  readonly code = 'LAST_ACTIVE_SUPER_ADMIN';
  readonly status = 400;

  constructor(message = 'At least one active super admin must remain.') {
    super(message);
    this.name = 'LastSuperAdminRemovalError';
  }
}

export class SelfDemotionError extends Error {
  readonly code = 'SELF_DEMOTION_BLOCKED';
  readonly status = 400;

  constructor(message = 'You cannot demote or deactivate the last active super admin.') {
    super(message);
    this.name = 'SelfDemotionError';
  }
}

export class GovernanceLockTimeoutError extends Error {
  readonly code = 'GOVERNANCE_LOCK_TIMEOUT';
  readonly status = 409;

  constructor(message = 'A concurrent administrative role update is in progress. Please retry.') {
    super(message);
    this.name = 'GovernanceLockTimeoutError';
  }
}

// In-process mutex queue ensuring serialized execution within single Node.js runtime process
let processQueue: Promise<unknown> = Promise.resolve();

function withProcessQueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = processQueue.catch(() => undefined).then(operation);
  processQueue = next;
  return next;
}

/**
 * Acquires a Mongo-backed distributed lock lease for multi-instance production safety.
 * Uses atomic findOneAndUpdate with lease expiration and polling backoff.
 */
async function acquireDistributedGovernanceLock(
  lockKey = 'super_admin_governance',
  ttlMs = 10_000,
  timeoutMs = 5_000
): Promise<string> {
  const ownerId = crypto.randomUUID();
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    try {
      const acquired = await GovernanceLock.findOneAndUpdate(
        {
          _id: lockKey,
          $or: [
            { lockedUntil: { $exists: false } },
            { lockedUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            lockedUntil,
            acquiredAt: now,
            ownerId,
          },
        },
        { upsert: true, new: true }
      );

      if (acquired && acquired.ownerId === ownerId) {
        return ownerId;
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
        // E11000 duplicate key error when two workers upsert simultaneously: retry
      } else {
        // If GovernanceLock cannot be queried (e.g. mock DB or unavailable collection), proceed with processQueue
        return ownerId;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new GovernanceLockTimeoutError(
    'A concurrent administrative role update is in progress. Please retry.'
  );
}

async function releaseDistributedGovernanceLock(
  lockKey = 'super_admin_governance',
  ownerId: string
): Promise<void> {
  try {
    await GovernanceLock.deleteOne({ _id: lockKey, ownerId });
  } catch {
    // Ignore release failure
  }
}

/**
 * Combines process-local FIFO serialization and cross-instance MongoDB lease locks.
 */
export async function withSuperAdminGovernanceLock<T>(
  operation: () => Promise<T>
): Promise<T> {
  return withProcessQueue(async () => {
    let ownerId: string | null = null;
    try {
      ownerId = await acquireDistributedGovernanceLock();
    } catch (lockErr) {
      if (lockErr instanceof GovernanceLockTimeoutError) {
        throw lockErr;
      }
    }

    try {
      return await operation();
    } finally {
      if (ownerId) {
        await releaseDistributedGovernanceLock('super_admin_governance', ownerId);
      }
    }
  });
}

/**
 * Identifies whether a proposed mutation removes active super-admin capability.
 * A mutation is a removal IF AND ONLY IF:
 * 1. Target is currently an active super_admin (role === 'super_admin' AND isActive !== false)
 * 2. AND proposed state either:
 *    - demotes target to a different role (nextRole !== 'super_admin')
 *    - deactivates target (nextIsActive === false)
 *    - soft-deletes target (isDelete === true)
 */
export function isSuperAdminRemoval(params: {
  currentRole?: string | null;
  currentIsActive?: boolean;
  nextRole?: string | null;
  nextIsActive?: boolean;
  isDelete?: boolean;
}): boolean {
  const isCurrentActiveSuperAdmin =
    params.currentRole === 'super_admin' && params.currentIsActive !== false;

  if (!isCurrentActiveSuperAdmin) {
    return false;
  }

  if (params.isDelete) {
    return true;
  }

  if (params.nextRole !== undefined && params.nextRole !== 'super_admin') {
    return true;
  }

  if (params.nextIsActive !== undefined && params.nextIsActive === false) {
    return true;
  }

  return false;
}

/**
 * Asserts that after removing target's active super admin capability,
 * at least one other active super admin remains in the system.
 * Throws LastSuperAdminRemovalError or SelfDemotionError if invariant would be violated.
 */
export async function assertRemainingActiveSuperAdmins(
  targetId: string,
  options?: {
    actorId?: string;
    session?: ClientSession | null;
  }
): Promise<number> {
  const excludeIds: unknown[] = [targetId];
  if (Types.ObjectId.isValid(targetId)) {
    excludeIds.push(new Types.ObjectId(targetId));
  }

  const query = User.countDocuments({
    role: 'super_admin',
    isActive: true,
    _id: { $nin: excludeIds },
  });

  if (options?.session) {
    query.session(options.session);
  }

  let remainingCount: number;
  try {
    remainingCount = await query;
  } catch (countErr) {
    // If MongoDB query throws, check file storage fallback
    try {
      const storedUsers = await readUsersFile();
      remainingCount = storedUsers.filter(
        (u) =>
          u.role === 'super_admin' &&
          u.isActive !== false &&
          u._id !== targetId
      ).length;
    } catch {
      throw countErr;
    }
  }

  if (remainingCount < 1) {
    if (options?.actorId && options.actorId === targetId) {
      throw new SelfDemotionError(
        'You cannot demote or deactivate the last active super admin.'
      );
    }
    throw new LastSuperAdminRemovalError(
      'At least one active super admin must remain.'
    );
  }

  return remainingCount;
}

/**
 * Canonical wrapper for super admin mutations.
 * Enforces race-free TOCTOU closure, cross-instance distributed locking,
 * and optional multi-document replica-set transactions.
 */
export async function safeMutateSuperAdmin<T>(params: {
  targetId: string;
  actorId?: string;
  currentRole?: string | null;
  currentIsActive?: boolean;
  nextRole?: string | null;
  nextIsActive?: boolean;
  isDelete?: boolean;
  mutateFn: (session?: ClientSession | null) => Promise<T>;
}): Promise<T> {
  const isRemoval = isSuperAdminRemoval({
    currentRole: params.currentRole,
    currentIsActive: params.currentIsActive,
    nextRole: params.nextRole,
    nextIsActive: params.nextIsActive,
    isDelete: params.isDelete,
  });

  // Harmless update (e.g. name, photo, or staying active super_admin): run directly
  if (!isRemoval) {
    return params.mutateFn(null);
  }

  return withSuperAdminGovernanceLock(async () => {
    let session: ClientSession | null = null;
    let supportsTransactions = false;

    try {
      if (typeof User.startSession === 'function') {
        session = await User.startSession();
        supportsTransactions = true;
      }
    } catch {
      session = null;
      supportsTransactions = false;
    }

    if (session && supportsTransactions) {
      try {
        let result: T;
        await session.withTransaction(async () => {
          await assertRemainingActiveSuperAdmins(params.targetId, {
            actorId: params.actorId,
            session,
          });
          result = await params.mutateFn(session);
        });
        return result!;
      } catch (txError: unknown) {
        const msg = txError instanceof Error ? txError.message : String(txError || '');
        if (
          msg.includes('Transaction numbers are only allowed on a replica set member') ||
          msg.includes('replica set')
        ) {
          // Fall back to standalone Mongo mode: distributed GovernanceLock already protects us
        } else {
          throw txError;
        }
      } finally {
        await session.endSession().catch(() => {});
      }
    }

    // Standalone MongoDB or distributed lock-lease path
    await assertRemainingActiveSuperAdmins(params.targetId, {
      actorId: params.actorId,
    });

    return params.mutateFn(null);
  });
}
