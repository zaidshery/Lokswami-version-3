import { Redis } from '@upstash/redis';

let redisInstance: Redis | null = null;
let circuitBreakerTrippedUntil = 0;
let hasLoggedCircuitBreakerWarning = false;

const DEFAULT_CIRCUIT_COOLDOWN_MS = 60_000;
const DEFAULT_PING_TIMEOUT_MS = 150;

/**
 * Checks if Upstash Redis credentials are configured in the current environment.
 */
export function isRedisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return Boolean(url && token);
}

/**
 * Trips the circuit breaker so subsequent operations immediately fail-open/fallback
 * without repeating network delays.
 */
export function tripCircuitBreaker(cooldownMs = DEFAULT_CIRCUIT_COOLDOWN_MS): void {
  circuitBreakerTrippedUntil = Date.now() + cooldownMs;
}

/**
 * Resets circuit breaker and cached client instance (primarily for testing).
 */
export function resetRedisCircuitBreaker(): void {
  circuitBreakerTrippedUntil = 0;
  hasLoggedCircuitBreakerWarning = false;
  redisInstance = null;
}

/**
 * Returns the singleton Redis client if configured and circuit breaker is healthy.
 * Returns null if unconfigured or circuit is open.
 */
export function getRedisClient(): Redis | null {
  if (!isRedisConfigured()) {
    return null;
  }

  if (Date.now() < circuitBreakerTrippedUntil) {
    return null;
  }

  if (!redisInstance) {
    try {
      const url = process.env.UPSTASH_REDIS_REST_URL!.trim();
      const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
      redisInstance = new Redis({ url, token });
    } catch (error) {
      if (!hasLoggedCircuitBreakerWarning) {
        console.warn(
          '[Redis] Failed to initialize Upstash Redis client. Falling back to in-memory mode.',
          error instanceof Error ? error.message : error
        );
        hasLoggedCircuitBreakerWarning = true;
      }
      tripCircuitBreaker();
      return null;
    }
  }

  return redisInstance;
}

/**
 * Pings Redis with a fast, bounded timeout (default 150ms).
 * If Redis is unconfigured or errors, marks the circuit breaker as tripped
 * and returns false without throwing.
 */
export async function isRedisAvailable(
  timeoutMs = DEFAULT_PING_TIMEOUT_MS
): Promise<boolean> {
  if (!isRedisConfigured()) {
    return false;
  }

  if (Date.now() < circuitBreakerTrippedUntil) {
    return false;
  }

  const client = getRedisClient();
  if (!client) {
    return false;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const pingPromise = client.ping();
    const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => {
      timer = setTimeout(() => resolve('TIMEOUT'), timeoutMs);
    });

    const result = await Promise.race([pingPromise, timeoutPromise]);

    if (result === 'TIMEOUT') {
      if (!hasLoggedCircuitBreakerWarning) {
        console.warn(
          `[Redis] Ping timed out after ${timeoutMs}ms. Tripping circuit breaker for ${DEFAULT_CIRCUIT_COOLDOWN_MS}ms.`
        );
        hasLoggedCircuitBreakerWarning = true;
      }
      tripCircuitBreaker();
      return false;
    }

    // Ping succeeded
    return true;
  } catch (error) {
    if (!hasLoggedCircuitBreakerWarning) {
      console.warn(
        '[Redis] Connectivity probe failed. Tripping circuit breaker for fallback.',
        error instanceof Error ? error.message : error
      );
      hasLoggedCircuitBreakerWarning = true;
    }
    tripCircuitBreaker();
    return false;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
