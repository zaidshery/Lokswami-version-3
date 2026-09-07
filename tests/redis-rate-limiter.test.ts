import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  destroyAllLimiters,
  getRateLimitHeaders,
  resetAllLimiters,
} from '@/lib/security/getRateLimiter';
import {
  isRedisConfigured,
  resetRedisCircuitBreaker,
} from '@/lib/security/redisClient';

// Mock Upstash dependencies
const { mockLimit, mockSlidingWindow, mockPing, mockSet, mockEval } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockSlidingWindow: vi.fn().mockReturnValue('sliding-window-fn'),
  mockPing: vi.fn(),
  mockSet: vi.fn(),
  mockEval: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => {
  return {
    Ratelimit: class MockRatelimit {
      static slidingWindow = mockSlidingWindow;
      limit = mockLimit;
    },
  };
});

vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      ping = mockPing;
      set = mockSet;
      eval = mockEval;
    },
  };
});

describe('Distributed Rate Limiting & Fail-Open Fallback', () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRedisCircuitBreaker();
    resetAllLimiters();
    // Default to unconfigured for local in-memory tests
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (originalUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    else delete process.env.UPSTASH_REDIS_REST_URL;

    if (originalToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    else delete process.env.UPSTASH_REDIS_REST_TOKEN;

    destroyAllLimiters();
    resetRedisCircuitBreaker();
  });

  it('detects when Redis is configured vs unconfigured', () => {
    expect(isRedisConfigured()).toBe(false);

    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    expect(isRedisConfigured()).toBe(true);
  });

  it('allows requests and emits standard headers with Upstash Redis', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

    const now = Date.now();
    mockLimit.mockResolvedValueOnce({
      success: true,
      limit: 10,
      remaining: 9,
      reset: now + 60_000,
    });

    const result = await checkRateLimit({
      scope: 'auth',
      identifier: '198.51.100.1',
    });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    expect(result.retryAfter).toBeUndefined();

    const headers = getRateLimitHeaders(result);
    expect(headers['X-RateLimit-Limit']).toBe('10');
    expect(headers['X-RateLimit-Remaining']).toBe('9');
    expect(headers['X-RateLimit-Reset']).toBe(String(Math.ceil((now + 60_000) / 1000)));
    expect(headers['Retry-After']).toBeUndefined();
  });

  it('returns 429 retryAfter when Upstash Redis limit is exhausted', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

    const now = Date.now();
    mockLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: now + 45_000,
    });

    const result = await checkRateLimit({
      scope: 'auth',
      identifier: '198.51.100.2',
    });

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThanOrEqual(44);

    const headers = getRateLimitHeaders(result);
    expect(headers['X-RateLimit-Limit']).toBe('10');
    expect(headers['X-RateLimit-Remaining']).toBe('0');
    expect(headers['Retry-After']).toBeDefined();
  });

  it('gracefully falls back to in-memory limiter when Redis rejects or throws', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

    // Simulate Redis network / connection exception
    mockLimit.mockRejectedValue(new Error('Upstash REST connection timeout'));

    const result = await checkRateLimit({
      scope: 'public_write',
      identifier: '198.51.100.3',
    });

    // Fail-open guarantee: Should not throw, should succeed via in-memory fallback
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20);
    expect(result.remaining).toBe(19);

    const headers = getRateLimitHeaders(result);
    expect(headers['X-RateLimit-Limit']).toBe('20');
    expect(headers['X-RateLimit-Remaining']).toBe('19');
  });

  it('operates seamlessly in offline/unconfigured environment using in-memory token bucket', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const ip = '198.51.100.4';

    // Auth limit is 10 requests / 60s
    for (let i = 0; i < 10; i += 1) {
      const res = await checkRateLimit({ scope: 'auth', identifier: ip });
      expect(res.allowed).toBe(true);
    }

    // 11th request should be blocked
    const blocked = await checkRateLimit({ scope: 'auth', identifier: ip });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});
