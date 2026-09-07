import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

export type StoredArticleLock = {
  articleId: string;
  userId: string;
  userName: string;
  userRole: string;
  lockedAt: string;
  expiresAt: string;
};

const DEFAULT_TTL_MS = 60_000;

function getDataPath(): string {
  return path.join(process.cwd(), 'data', 'article-locks.json');
}

/**
 * Normalizes and filters a raw lock entry.
 */
function normalizeStoredLock(entry: unknown): StoredArticleLock | null {
  if (!entry || typeof entry !== 'object') return null;
  const source = entry as Record<string, unknown>;

  const articleId = typeof source.articleId === 'string' ? source.articleId.trim() : '';
  const userId = typeof source.userId === 'string' ? source.userId.trim() : '';
  const userName = typeof source.userName === 'string' ? source.userName.trim() : '';
  const userRole = typeof source.userRole === 'string' ? source.userRole.trim() : '';
  const lockedAt =
    typeof source.lockedAt === 'string'
      ? source.lockedAt
      : new Date().toISOString();
  const expiresAt =
    typeof source.expiresAt === 'string' ? source.expiresAt : '';

  if (!articleId || !userId || !expiresAt) {
    return null;
  }

  return {
    articleId,
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
async function readLocks(): Promise<StoredArticleLock[]> {
  const filePath = getDataPath();

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed
      .map(normalizeStoredLock)
      .filter((lock): lock is StoredArticleLock => {
        if (!lock) return false;
        const expiresTime = new Date(lock.expiresAt).getTime();
        return !Number.isNaN(expiresTime) && expiresTime > now;
      });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'ENOENT') {
      return [];
    }
    console.warn('Error reading article-locks.json, returning empty list:', error);
    return [];
  }
}

/**
 * Persists an array of locks atomically to data/article-locks.json.
 */
async function saveLocks(locks: StoredArticleLock[]): Promise<void> {
  const filePath = getDataPath();
  const now = Date.now();

  // Ensure expired locks are excluded before saving
  const active = locks.filter((lock) => {
    const expiresTime = new Date(lock.expiresAt).getTime();
    return !Number.isNaN(expiresTime) && expiresTime > now;
  });

  await writeJsonFileAtomically(filePath, active);
}

/**
 * Retrieves the currently active, unexpired lock for an article.
 */
export async function getActiveStoredLock(
  articleId: string
): Promise<StoredArticleLock | null> {
  if (!articleId) return null;
  const locks = await readLocks();
  return locks.find((l) => l.articleId === articleId) || null;
}

/**
 * Lists all active, unexpired article locks.
 */
export async function listActiveStoredLocks(): Promise<StoredArticleLock[]> {
  return await readLocks();
}

/**
 * Acquires a new lock or renews an existing lease for the specified editor.
 */
export async function acquireOrRenewStoredLock(params: {
  articleId: string;
  userId: string;
  userName: string;
  userRole: string;
  expiresInMs?: number;
}): Promise<StoredArticleLock> {
  const {
    articleId,
    userId,
    userName,
    userRole,
    expiresInMs = DEFAULT_TTL_MS,
  } = params;

  const locks = await readLocks();
  const existingIndex = locks.findIndex((l) => l.articleId === articleId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMs).toISOString();

  const newLock: StoredArticleLock = {
    articleId,
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
export async function releaseStoredLock(
  articleId: string,
  userId?: string,
  force = false
): Promise<boolean> {
  if (!articleId) return false;

  const locks = await readLocks();
  const existingIndex = locks.findIndex((l) => l.articleId === articleId);
  if (existingIndex === -1) {
    return true; // Already unlocked
  }

  const existing = locks[existingIndex];
  if (!force && userId && existing.userId !== userId) {
    return false; // Cannot release another user's lock without force permission
  }

  locks.splice(existingIndex, 1);
  await saveLocks(locks);
  return true;
}

/**
 * Explicitly purges expired locks and persists the clean state to disk.
 */
export async function purgeExpiredStoredLocks(): Promise<number> {
  const filePath = getDataPath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;

    const now = Date.now();
    const active: StoredArticleLock[] = [];
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
    console.warn('Error purging expired stored locks:', error);
    return 0;
  }
}
