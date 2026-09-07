/**
 * Dual-engine rate limiting architecture:
 * Upstash Redis distributed sliding window with automatic in-memory token-bucket fallback.
 * Synchronizes rate limits across multi-process deployments (Hostinger PM2 and Vercel serverless)
 * while ensuring strict fail-open operation when Redis is unreachable.
 */

import { Ratelimit } from '@upstash/ratelimit';
import type { Redis } from '@upstash/redis';
import RateLimiter from './rateLimiter';
import { getRedisClient, isRedisConfigured, tripCircuitBreaker } from './redisClient';

export type RateLimitScope =
  | 'auth'
  | 'heavy'
  | 'heavy_strict'
  | 'public_write'
  | 'api'
  | 'admin';

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfter?: number; // In seconds
}

export interface CheckRateLimitOptions {
  scope: RateLimitScope;
  identifier: string; // IP or account identifier
}

// In-memory fallback singletons
let loginLimiter: RateLimiter | null = null;
let authRouteLimiter: RateLimiter | null = null;
let apiLimiter: RateLimiter | null = null;
let adminLimiter: RateLimiter | null = null;
let heavyRouteLimiter: RateLimiter | null = null;
let heavyStrictLimiter: RateLimiter | null = null;
let publicWriteLimiter: RateLimiter | null = null;

// Distributed Ratelimit singletons cached by scope
const distributedLimiters = new Map<RateLimitScope, Ratelimit>();

/**
 * Standard HTTP response headers for rate limiting.
 */
export function getRateLimitHeaders(
  result: RateLimitCheckResult
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'X-RateLimit-Reset': String(result.reset),
  };

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter);
  }

  return headers;
}

/**
 * Creates or retrieves a distributed sliding-window Ratelimit instance for a scope.
 */
function getDistributedLimiter(
  scope: RateLimitScope,
  redis: Redis
): Ratelimit {
  const existing = distributedLimiters.get(scope);
  if (existing) return existing;

  let limiter: Ratelimit;

  switch (scope) {
    case 'auth':
      // 10 requests / 60 seconds
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'),
        prefix: 'lokswami:ratelimit:auth',
      });
      break;

    case 'heavy_strict':
      // 5 requests / 60 seconds for expensive OCR & PDF renders
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        prefix: 'lokswami:ratelimit:heavy',
      });
      break;

    case 'heavy':
      // 20 requests / 60 seconds for general heavy routes
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '60 s'),
        prefix: 'lokswami:ratelimit:heavy',
      });
      break;

    case 'public_write':
      // 20 requests / 60 seconds for public forms/comments
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '60 s'),
        prefix: 'lokswami:ratelimit:api',
      });
      break;

    case 'admin':
      // 20,000 requests / 60 seconds for admin CMS operations
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20000, '60 s'),
        prefix: 'lokswami:ratelimit:admin',
      });
      break;

    case 'api':
    default:
      // 100 requests / 60 seconds for public API
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, '60 s'),
        prefix: 'lokswami:ratelimit:api',
      });
      break;
  }

  distributedLimiters.set(scope, limiter);
  return limiter;
}

/**
 * Checks rate limits with automatic Redis -> in-memory fallback.
 * Guarantees fail-open operation with standardized headers.
 */
export async function checkRateLimit(
  options: CheckRateLimitOptions
): Promise<RateLimitCheckResult> {
  const { scope, identifier } = options;

  // 1. Attempt Upstash Redis distributed sliding-window check
  if (isRedisConfigured()) {
    const client = getRedisClient();
    if (client) {
      try {
        const distributed = getDistributedLimiter(scope, client);
        const res = await distributed.limit(identifier);

        const resetInSeconds = Math.ceil(res.reset / 1000);
        const retryAfter = res.success
          ? undefined
          : Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));

        return {
          allowed: res.success,
          limit: res.limit,
          remaining: res.remaining,
          reset: resetInSeconds,
          retryAfter,
        };
      } catch (error) {
        console.warn(
          `[RateLimit] Redis limit check failed for scope '${scope}'. Tripping circuit breaker and falling back to in-memory:`,
          error instanceof Error ? error.message : error
        );
        tripCircuitBreaker();
      }
    }
  }

  // 2. Fallback: In-memory token-bucket check
  return checkInMemoryRateLimit(scope, identifier);
}

/**
 * Fallback rate limit verification using in-memory RateLimiter instances.
 */
function checkInMemoryRateLimit(
  scope: RateLimitScope,
  identifier: string
): RateLimitCheckResult {
  const now = Date.now();

  switch (scope) {
    case 'auth': {
      if (!authRouteLimiter) {
        authRouteLimiter = new RateLimiter({
          windowMs: 60 * 1000,
          maxAttempts: 10,
          blockDurationMs: 60 * 1000,
          keyPrefix: 'auth_v2',
        });
      }
      const res = authRouteLimiter.check(identifier);
      return {
        allowed: res.allowed,
        limit: 10,
        remaining: res.remaining ?? 0,
        reset: Math.ceil((now + (res.retryAfter ? res.retryAfter * 1000 : 60_000)) / 1000),
        retryAfter: res.retryAfter,
      };
    }

    case 'heavy_strict': {
      if (!heavyStrictLimiter) {
        heavyStrictLimiter = new RateLimiter({
          windowMs: 60 * 1000,
          maxAttempts: 5,
          blockDurationMs: 60 * 1000,
          keyPrefix: 'heavy_strict',
        });
      }
      const res = heavyStrictLimiter.check(identifier);
      return {
        allowed: res.allowed,
        limit: 5,
        remaining: res.remaining ?? 0,
        reset: Math.ceil((now + (res.retryAfter ? res.retryAfter * 1000 : 60_000)) / 1000),
        retryAfter: res.retryAfter,
      };
    }

    case 'heavy': {
      const limiter = getHeavyRouteLimiter();
      const res = limiter.check(identifier);
      return {
        allowed: res.allowed,
        limit: 20,
        remaining: res.remaining ?? 0,
        reset: Math.ceil((now + (res.retryAfter ? res.retryAfter * 1000 : 60_000)) / 1000),
        retryAfter: res.retryAfter,
      };
    }

    case 'public_write': {
      if (!publicWriteLimiter) {
        publicWriteLimiter = new RateLimiter({
          windowMs: 60 * 1000,
          maxAttempts: 20,
          blockDurationMs: 60 * 1000,
          keyPrefix: 'public_write',
        });
      }
      const res = publicWriteLimiter.check(identifier);
      return {
        allowed: res.allowed,
        limit: 20,
        remaining: res.remaining ?? 0,
        reset: Math.ceil((now + (res.retryAfter ? res.retryAfter * 1000 : 60_000)) / 1000),
        retryAfter: res.retryAfter,
      };
    }

    case 'admin': {
      const limiter = getAdminLimiter();
      const res = limiter.check(identifier);
      return {
        allowed: res.allowed,
        limit: 20000,
        remaining: res.remaining ?? 0,
        reset: Math.ceil((now + (res.retryAfter ? res.retryAfter * 1000 : 60_000)) / 1000),
        retryAfter: res.retryAfter,
      };
    }

    case 'api':
    default: {
      const limiter = getApiLimiter();
      const res = limiter.check(identifier);
      return {
        allowed: res.allowed,
        limit: 100,
        remaining: res.remaining ?? 0,
        reset: Math.ceil((now + (res.retryAfter ? res.retryAfter * 1000 : 60_000)) / 1000),
        retryAfter: res.retryAfter,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Backward-compatible In-Memory API (Preserved for existing routes & unit tests)
// ---------------------------------------------------------------------------

/**
 * Get or create the login rate limiter
 * Limits: 5 attempts per 15 minutes per IP
 */
export function getLoginLimiter(): RateLimiter {
  if (!loginLimiter) {
    loginLimiter = new RateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxAttempts: 5,
      blockDurationMs: 15 * 60 * 1000,
      keyPrefix: 'login',
    });
  }
  return loginLimiter;
}

/**
 * Get or create the public API rate limiter
 * Limits: 100 requests per minute per route/IP for non-cacheable public APIs
 */
export function getApiLimiter(): RateLimiter {
  if (!apiLimiter) {
    apiLimiter = new RateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 100,
      blockDurationMs: 5 * 60 * 1000, // 5 minute block
      keyPrefix: 'api',
    });
  }
  return apiLimiter;
}

/**
 * Get or create the admin/authenticated rate limiter
 * Limits: 20000 requests per minute per user
 */
export function getAdminLimiter(): RateLimiter {
  if (!adminLimiter) {
    adminLimiter = new RateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 20000,
      blockDurationMs: 10 * 60 * 1000, // 10 minute block
      keyPrefix: 'admin_v2',
    });
  }
  return adminLimiter;
}

/**
 * Get or create the heavy route limiter
 * Limits: 20 expensive operations per minute per feature and user/IP
 */
export function getHeavyRouteLimiter(): RateLimiter {
  if (!heavyRouteLimiter) {
    heavyRouteLimiter = new RateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxAttempts: 20,
      blockDurationMs: 60 * 1000, // 1 minute cooldown
      keyPrefix: 'heavy_v2',
    });
  }
  return heavyRouteLimiter;
}

/**
 * Reset all rate limiters (for testing or emergency purposes)
 */
export function resetAllLimiters(): void {
  loginLimiter?.resetAll();
  authRouteLimiter?.resetAll();
  apiLimiter?.resetAll();
  adminLimiter?.resetAll();
  heavyRouteLimiter?.resetAll();
  heavyStrictLimiter?.resetAll();
  publicWriteLimiter?.resetAll();
  distributedLimiters.clear();
}

/**
 * Cleanup all limiter instances
 */
export function destroyAllLimiters(): void {
  loginLimiter?.destroy();
  authRouteLimiter?.destroy();
  apiLimiter?.destroy();
  adminLimiter?.destroy();
  heavyRouteLimiter?.destroy();
  heavyStrictLimiter?.destroy();
  publicWriteLimiter?.destroy();

  loginLimiter = null;
  authRouteLimiter = null;
  apiLimiter = null;
  adminLimiter = null;
  heavyRouteLimiter = null;
  heavyStrictLimiter = null;
  publicWriteLimiter = null;
  distributedLimiters.clear();
}
