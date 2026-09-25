import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

export type StoredStoryLock = {
  storyId: string;
  userId: string;
  userName: string;
  userRole: string;
  lockedAt: string;
  expiresAt: string;
};

const DEFAULT_TTL_MS = 60_000;

function getDataPath(): string {
  return path.join(process.cwd(), 'data', 'story-locks.json');
}

/**
 * Normalizes and filters a raw lock entry.
 */
function normalizeStoredLock(entry: unknown): StoredStoryLock | null {
  if (!entry || typeof entry !== 'object') return null;
  const source = entry as Record<string, unknown>;

  const storyId = typeof source.storyId === 'string' ? source.storyId.trim() : '';
  const userId = typeof source.userId === 'string' ? source.userId.trim() : '';
  const userName = typeof source.userName === 'string' ? source.userName.trim() : '';
  const userRole = typeof source.userRole === 'string' ? source.userRole.trim() : '';
  const lockedAt =
    typeof source.lockedAt === 'string'
      ? source.lockedAt
      : new Date().toISOString();
  const expiresAt =
    typeof source.expiresAt === 'string' ? source.expiresAt : '';

  if (!storyId || !userId || !expiresAt) {
    return null;
  }

  return {
    storyId,
    userId,
    userName: userName || 'Editor',
    userRole: userRole || 'reporter',
    lockedAt,
    expiresAt,
  };
}

/**
 * Reads all stored locks from disk, filtering out unexpired items.
 */
async function readLocks(): Promise<StoredStoryLock[]> {
  const filePath = getDataPath();

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed
      .map(normalizeStoredLock)
      .filter((lock): lock is StoredStoryLock => {
        if (!lock) return false;
        const expiresTime = new Date(lock.expiresAt).getTime();
        return !Number.isNaN(expiresTime) && expiresTime > now;
      });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'ENOENT') {
      return [];
    }
    console.warn('Error reading story-locks.json, returning empty list:', error);
    return [];
  }
}

/**
 * Persists an array of locks atomically to data/story-locks.json.
 */
async function saveLocks(locks: StoredStoryLock[]): Promise<void> {
  const filePath = getDataPath();
  const now = Date.now();

  const active = locks.filter((lock) => {
    const expiresTime = new Date(lock.expiresAt).getTime();
    return !Number.isNaN(expiresTime) && expiresTime > now;
  });

  await writeJsonFileAtomically(filePath, active);
}

/**
 * Retrieves the currently active, unexpired lock for a story.
 */
export async function getActiveStoredStoryLock(
  storyId: string
): Promise<StoredStoryLock | null> {
  if (!storyId) return null;
  const locks = await readLocks();
  return locks.find((l) => l.storyId === storyId) || null;
}

/**
 * Lists all active, unexpired story locks.
 */
export async function listActiveStoredStoryLocks(): Promise<StoredStoryLock[]> {
  return await readLocks();
}

/**
 * Acquires a new lock or renews an existing lease for the specified editor.
 */
export async function acquireOrRenewStoredStoryLock(params: {
  storyId: string;
  userId: string;
  userName: string;
  userRole: string;
  expiresInMs?: number;
}): Promise<StoredStoryLock> {
  const {
    storyId,
    userId,
    userName,
    userRole,
    expiresInMs = DEFAULT_TTL_MS,
  } = params;

  const locks = await readLocks();
  const existingIndex = locks.findIndex((l) => l.storyId === storyId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMs).toISOString();

  const newLock: StoredStoryLock = {
    storyId,
    userId,
    userName,
    userRole,
    lockedAt:
      existingIndex >= 0 && locks[existingIndex].userId === userId
        ? locks[existingIndex].lockedAt
        : now.toISOString(),
    expiresAt,
  };

  if (existingIndex >= 0) {
    locks[existingIndex] = newLock;
  } else {
    locks.push(newLock);
  }

  await saveLocks(locks);
  return newLock;
}

/**
 * Releases a lock if held by the given userId or if forced by an administrator.
 */
export async function releaseStoredStoryLock(
  storyId: string,
  userId?: string,
  force = false
): Promise<boolean> {
  if (!storyId) return false;

  const locks = await readLocks();
  const existingIndex = locks.findIndex((l) => l.storyId === storyId);
  if (existingIndex === -1) {
    return true;
  }

  const existing = locks[existingIndex];
  if (!force && userId && existing.userId !== userId) {
    return false;
  }

  locks.splice(existingIndex, 1);
  await saveLocks(locks);
  return true;
}

/**
 * Explicitly purges expired locks and persists clean state.
 */
export async function purgeExpiredStoredStoryLocks(): Promise<number> {
  const filePath = getDataPath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;

    const now = Date.now();
    const active: StoredStoryLock[] = [];
    let purgedCount = 0;

    for (const item of parsed) {
      const normalized = normalizeStoredLock(item);
      if (!normalized) {
        purgedCount += 1;
        continue;
      }
      const expiresTime = new Date(normalized.expiresAt).getTime();
      if (Number.isNaN(expiresTime) || expiresTime <= now) {
        purgedCount += 1;
      } else {
        active.push(normalized);
      }
    }

    if (purgedCount > 0) {
      await writeJsonFileAtomically(filePath, active);
    }

    return purgedCount;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'ENOENT') return 0;
    console.warn('Error purging expired stored story locks:', error);
    return 0;
  }
}
