import crypto from 'crypto';
import { getRedisClient, isRedisConfigured } from './redisClient';

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`.trim();

interface InMemoryLockEntry {
  token: string;
  expiresAt: number;
}

// In-memory mutex entries for offline/fallback mode
const inMemoryLocks = new Map<string, InMemoryLockEntry>();

// In-memory Promise queues for fallback serialized execution
const inMemoryQueues = new Map<string, Promise<unknown>>();

/**
 * Resets all in-memory lock entries and queues (primarily for test cleanup).
 */
export function resetInMemoryLocks(): void {
  inMemoryLocks.clear();
  inMemoryQueues.clear();
}

/**
 * Clean up expired in-memory entries.
 */
function cleanExpiredInMemoryLocks(): void {
  const now = Date.now();
  for (const [key, entry] of inMemoryLocks.entries()) {
    if (entry.expiresAt <= now) {
      inMemoryLocks.delete(key);
    }
  }
}

/**
 * Acquires a distributed lock for the specified key with an expiration TTL.
 * Uses atomic Redis `SET key token NX EX ttlSeconds`.
 * Falls back to in-memory mutex tracking if Redis is unconfigured or unreachable.
 *
 * @param key The lock identifier
 * @param ttlSeconds Lease duration in seconds (default: 30)
 * @returns Unique UUID token if lock was acquired, or null if already held.
 */
export async function acquireLock(
  key: string,
  ttlSeconds = 30
): Promise<string | null> {
  const token = crypto.randomUUID();

  if (isRedisConfigured()) {
    try {
      const client = getRedisClient();
      if (client) {
        const result = await client.set(key, token, {
          nx: true,
          ex: ttlSeconds,
        });

        if (result === 'OK' || (result as unknown) === true) {
          return token;
        }
        return null;
      }
    } catch (error) {
      console.warn(
        `[DistributedLock] Failed to acquire Redis lock for '${key}', falling back to in-memory:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fallback: In-memory mutex tracking
  cleanExpiredInMemoryLocks();
  const existing = inMemoryLocks.get(key);
  const now = Date.now();

  if (existing && existing.expiresAt > now) {
    return null; // Lock already held
  }

  inMemoryLocks.set(key, {
    token,
    expiresAt: now + ttlSeconds * 1000,
  });

  return token;
}

/**
 * Releases a distributed lock if and only if the provided token matches.
 * Uses an atomic Lua script to prevent accidentally releasing a lock acquired by another worker.
 *
 * @param key The lock identifier
 * @param token The token obtained during acquireLock
 * @returns true if the lock was successfully released, false otherwise.
 */
export async function releaseLock(key: string, token: string): Promise<boolean> {
  if (!key || !token) return false;

  if (isRedisConfigured()) {
    try {
      const client = getRedisClient();
      if (client) {
        const result = await client.eval(RELEASE_LOCK_LUA, [key], [token]);
        return result === 1 || result === '1' || result === true;
      }
    } catch (error) {
      console.warn(
        `[DistributedLock] Failed to release Redis lock for '${key}', falling back to in-memory:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fallback: In-memory mutex release
  cleanExpiredInMemoryLocks();
  const entry = inMemoryLocks.get(key);
  if (entry && entry.token === token) {
    inMemoryLocks.delete(key);
    return true;
  }

  return false;
}

/**
 * Executes an asynchronous function within a distributed mutual exclusion lock.
 * Automatically releases the lock when fn completes or throws.
 *
 * If Redis is unconfigured or unavailable, serializes tasks sequentially using
 * an in-memory Promise queue for the given key.
 *
 * @param key The lock identifier
 * @param fn The async callback to execute
 * @param ttlSeconds Maximum lease duration in seconds (default: 30)
 */
export async function withDistributedLock<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds = 30
): Promise<T> {
  if (isRedisConfigured()) {
    const token = await acquireLock(key, ttlSeconds);
    if (!token) {
      throw new Error(`Could not acquire distributed lock for '${key}'.`);
    }

    try {
      return await fn();
    } finally {
      await releaseLock(key, token).catch((err) => {
        console.warn(`[DistributedLock] Failed to release lock in finally for '${key}':`, err);
      });
    }
  }

  // Fallback: In-memory serialized Promise queue
  const previousQueue = inMemoryQueues.get(key) || Promise.resolve();

  let finishCurrentTask: () => void;
  const currentTaskPromise = new Promise<void>((resolve) => {
    finishCurrentTask = resolve;
  });

  // Chain the current task after the previous queue item
  inMemoryQueues.set(
    key,
    previousQueue.then(
      () => currentTaskPromise,
      () => currentTaskPromise
    )
  );

  await previousQueue;

  try {
    return await fn();
  } finally {
    finishCurrentTask!();
    // Clean up queue entry if it's still the tail
    if (inMemoryQueues.get(key) === currentTaskPromise) {
      inMemoryQueues.delete(key);
    }
  }
}
