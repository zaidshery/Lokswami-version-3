import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireLock,
  releaseLock,
  resetInMemoryLocks,
  withDistributedLock,
} from '@/lib/security/distributedLock';
import { resetRedisCircuitBreaker } from '@/lib/security/redisClient';

const { mockSet, mockEval } = vi.hoisted(() => ({
  mockSet: vi.fn(),
  mockEval: vi.fn(),
}));

vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      set = mockSet;
      eval = mockEval;
    },
  };
});

describe('Distributed Mutual Exclusion Locks', () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryLocks();
    resetRedisCircuitBreaker();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (originalUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    else delete process.env.UPSTASH_REDIS_REST_URL;

    if (originalToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    else delete process.env.UPSTASH_REDIS_REST_TOKEN;

    resetInMemoryLocks();
    resetRedisCircuitBreaker();
  });

  describe('Redis Distributed Locks (Mocked Redis)', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    });

    it('acquires lock via atomic SET NX EX and rejects duplicate claims', async () => {
      // First attempt succeeds
      mockSet.mockResolvedValueOnce('OK');
      const token1 = await acquireLock('lock:job-1', 30);
      expect(token1).toBeTruthy();
      expect(mockSet).toHaveBeenCalledWith(
        'lock:job-1',
        token1,
        expect.objectContaining({ nx: true, ex: 30 })
      );

      // Second attempt while lock is held returns null
      mockSet.mockResolvedValueOnce(null);
      const token2 = await acquireLock('lock:job-1', 30);
      expect(token2).toBeNull();
    });

    it('releases lock using atomic Lua script verification', async () => {
      // Mock Lua script return: 1 for successful token match & deletion
      mockEval.mockResolvedValueOnce(1);

      const released = await releaseLock('lock:job-1', 'valid-token-123');
      expect(released).toBe(true);
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1]'),
        ['lock:job-1'],
        ['valid-token-123']
      );

      // When token does not match or lock expired, Lua returns 0
      mockEval.mockResolvedValueOnce(0);
      const wrongRelease = await releaseLock('lock:job-1', 'wrong-token');
      expect(wrongRelease).toBe(false);
    });

    it('withDistributedLock acquires and releases in finally block on success', async () => {
      mockSet.mockResolvedValueOnce('OK');
      mockEval.mockResolvedValueOnce(1);

      let executed = false;
      const result = await withDistributedLock('lock:task-success', async () => {
        executed = true;
        return 'task-output';
      });

      expect(executed).toBe(true);
      expect(result).toBe('task-output');
      expect(mockSet).toHaveBeenCalled();
      expect(mockEval).toHaveBeenCalled();
    });

    it('withDistributedLock ensures release even when callback throws', async () => {
      mockSet.mockResolvedValueOnce('OK');
      mockEval.mockResolvedValueOnce(1);

      await expect(
        withDistributedLock('lock:task-error', async () => {
          throw new Error('Simulated task error');
        })
      ).rejects.toThrow('Simulated task error');

      // Verify releaseLock was called in finally
      expect(mockEval).toHaveBeenCalledWith(
        expect.any(String),
        ['lock:task-error'],
        [expect.any(String)]
      );
    });
  });

  describe('In-Memory Fallback Queue (Offline / Unconfigured Mode)', () => {
    it('handles in-memory acquire and duplicate lock rejection', async () => {
      const token1 = await acquireLock('in-mem-lock-1', 5);
      expect(token1).toBeTruthy();

      // Duplicate acquire on same key returns null
      const token2 = await acquireLock('in-mem-lock-1', 5);
      expect(token2).toBeNull();

      // Release with wrong token fails
      const failedRelease = await releaseLock('in-mem-lock-1', 'wrong-token');
      expect(failedRelease).toBe(false);

      // Release with correct token succeeds
      const successfulRelease = await releaseLock('in-mem-lock-1', token1!);
      expect(successfulRelease).toBe(true);

      // Now can be re-acquired
      const token3 = await acquireLock('in-mem-lock-1', 5);
      expect(token3).toBeTruthy();
    });

    it('serializes tasks sequentially using in-memory Promise queue in withDistributedLock', async () => {
      const executionOrder: number[] = [];

      const task1 = withDistributedLock('job:sync-queue', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionOrder.push(1);
        return 1;
      });

      const task2 = withDistributedLock('job:sync-queue', async () => {
        executionOrder.push(2);
        return 2;
      });

      const [res1, res2] = await Promise.all([task1, task2]);

      expect(res1).toBe(1);
      expect(res2).toBe(2);
      expect(executionOrder).toEqual([1, 2]);
    });
  });
});
