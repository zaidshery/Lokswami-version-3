import connectDB from '@/lib/db/mongoose';

type MongoAvailabilityState = {
  status: 'available' | 'unavailable' | null;
  checkedAt: number;
  inFlight: Promise<boolean> | null;
  lastReason: string;
  lastLogAt: number;
};

const DEFAULT_PROBE_TIMEOUT_MS = 3000;
const DEFAULT_AVAILABLE_TTL_MS = 15_000;
const DEFAULT_UNAVAILABLE_TTL_MS = 45_000;
const LOG_THROTTLE_MS = 60_000;

const state: MongoAvailabilityState = {
  status: null,
  checkedAt: 0,
  inFlight: null,
  lastReason: '',
  lastLogAt: 0,
};

function parsePositiveEnvInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redactMongoReason(reason: string): string {
  if (!reason) return '';
  return reason
    .replace(/mongodb(\+srv)?:\/\/[^\s"'<>]+/gi, 'mongodb[REDACTED_URI]')
    .replace(/(password|secret|key|token|credential)(=|:\s*)([^\s&,;]+)/gi, '$1$2[REDACTED]')
    .slice(0, 300);
}

function getErrorMessage(error: unknown) {
  const raw = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : String(error);
  return redactMongoReason(raw);
}

function shouldUseCachedStatus(now: number, availableTtlMs: number, unavailableTtlMs: number) {
  if (!state.status) return false;
  const age = now - state.checkedAt;
  return state.status === 'available'
    ? age < availableTtlMs
    : age < unavailableTtlMs;
}

function markStatus(status: 'available' | 'unavailable', reason = '') {
  state.status = status;
  state.checkedAt = Date.now();
  state.lastReason = redactMongoReason(reason);
}

function logUnavailable(label: string, reason: string) {
  const now = Date.now();
  if (now - state.lastLogAt < LOG_THROTTLE_MS) return;
  state.lastLogAt = now;
  console.warn(`[MongoDB] ${label} unavailable, using fallback storage. ${redactMongoReason(reason)}`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export async function isMongoAvailable(
  options: {
    label?: string;
    timeoutMs?: number;
    availableTtlMs?: number;
    unavailableTtlMs?: number;
  } = {}
) {
  if (!process.env.MONGODB_URI?.trim()) {
    markStatus('unavailable', 'MONGODB_URI is not set.');
    return false;
  }

  const label = options.label || 'MongoDB probe';
  const timeoutMs =
    options.timeoutMs ??
    parsePositiveEnvInt('MONGODB_PUBLIC_PROBE_TIMEOUT_MS', DEFAULT_PROBE_TIMEOUT_MS);
  const availableTtlMs =
    options.availableTtlMs ??
    parsePositiveEnvInt('MONGODB_AVAILABLE_TTL_MS', DEFAULT_AVAILABLE_TTL_MS);
  const unavailableTtlMs =
    options.unavailableTtlMs ??
    parsePositiveEnvInt('MONGODB_UNAVAILABLE_TTL_MS', DEFAULT_UNAVAILABLE_TTL_MS);
  const now = Date.now();

  if (shouldUseCachedStatus(now, availableTtlMs, unavailableTtlMs)) {
    return state.status === 'available';
  }

  if (!state.inFlight) {
    const probe = connectDB()
      .then(() => {
        markStatus('available');
        return true;
      })
      .catch((error) => {
        const reason = getErrorMessage(error);
        markStatus('unavailable', reason);
        logUnavailable(label, reason);
        return false;
      })
      .finally(() => {
        if (state.inFlight === probe) {
          state.inFlight = null;
        }
      });

    state.inFlight = probe;
  }

  try {
    return await withTimeout(state.inFlight, timeoutMs, label);
  } catch (error) {
    const reason = getErrorMessage(error);
    markStatus('unavailable', reason);
    logUnavailable(label, reason);
    return false;
  }
}

export function getMongoAvailabilitySnapshot() {
  return {
    status: state.status,
    checkedAt: state.checkedAt ? new Date(state.checkedAt).toISOString() : null,
    reason: state.lastReason || null,
  };
}

export function reportMongoUnavailable(error: unknown, label = 'MongoDB query') {
  const reason = getErrorMessage(error);
  markStatus('unavailable', reason);
  logUnavailable(label, reason);
}
