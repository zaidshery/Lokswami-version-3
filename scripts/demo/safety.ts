/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Safety & Production Refusal Guard
 */

export interface SafeEnvironmentResult {
  isMongoTarget: boolean;
  dbName: string | null;
  targetDescription: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Parses database name from MongoDB URI.
 * Handles standard and SRV connection strings.
 */
export function parseMongoDatabaseName(uri: string): string | null {
  if (!uri || typeof uri !== 'string') return null;
  try {
    // Replace mongodb+srv: or mongodb: with http: to parse with URL API safely
    const normalized = uri.replace(/^mongodb(\+srv)?:\/\//i, 'http://');
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.replace(/^\/+/, '').split('?')[0].trim();
    return pathname.length > 0 ? pathname : null;
  } catch {
    // Regex fallback
    const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?&#\s]+)/i);
    return match && match[1] ? match[1].trim() : null;
  }
}

/**
 * Determines whether a host string is a safe local loopback host.
 */
export function isSafeLocalHost(host: string): boolean {
  if (!host || typeof host !== 'string') return false;
  // Handle bracketed IPv6 e.g. [::1]
  const unbracketed = host.replace(/^\[|\]$/g, '').toLowerCase().trim();
  return LOCAL_HOSTS.has(unbracketed);
}

/**
 * Determines whether a MongoDB URI points strictly to local loopback hosts.
 * Validates EVERY host in single-host and multi-host replica set connection strings.
 */
export function isLocalMongoUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;

  // Extract the authority/hosts section: between protocol and path/query
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@\s]+@)?([^/?#\s]+)/i);
  if (!match || !match[1]) return false;

  const hostsSection = match[1].trim();
  if (!hostsSection) return false;

  // Multi-host connection strings are separated by commas
  const hostEntries = hostsSection.split(',').map((h) => h.trim()).filter(Boolean);
  if (hostEntries.length === 0) return false;

  for (const entry of hostEntries) {
    let hostName: string;
    if (entry.startsWith('[')) {
      // IPv6 bracketed format: [::1]:27017 or [::1]
      const ipv6Match = entry.match(/^\[([^\]]+)\](?::\d+)?$/);
      if (!ipv6Match || !ipv6Match[1]) return false;
      hostName = ipv6Match[1];
    } else {
      // Standard hostname:port or hostname
      const parts = entry.split(':');
      hostName = parts[0];
    }

    if (!isSafeLocalHost(hostName)) {
      return false;
    }
  }

  return true;
}

/**
 * Masks credentials or secrets from connection strings before logging.
 */
export function maskUri(uri: string): string {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:@\s]+):([^@\s]+)@/i, '$1***:***@');
}

export function assertDemoSafety(
  env: NodeJS.ProcessEnv = process.env
): SafeEnvironmentResult {
  return assertDemoEnvironmentSafe(env);
}

export function assertDemoEnvironmentSafe(
  env: NodeJS.ProcessEnv = process.env
): SafeEnvironmentResult {
  // 1. Production Mode Refusal
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Demo operations are strictly prohibited when NODE_ENV is "production".'
    );
  }

  // 2. Explicit Opt-In Required
  if (env.LOKSWAMI_DEMO_DATA !== 'true') {
    throw new Error(
      'Demo operations are disabled. Set LOKSWAMI_DEMO_DATA=true in your local environment to proceed.'
    );
  }

  // 3. Database Target Safety
  const mongoUri = env.MONGODB_URI ? env.MONGODB_URI.trim() : '';
  if (!mongoUri) {
    // No MongoDB configured: Safe local file storage fallback
    return {
      isMongoTarget: false,
      dbName: null,
      targetDescription: 'Local File Storage (data/*.json)',
    };
  }

  // MongoDB is configured. Evaluate target safety.
  const isLocal = isLocalMongoUri(mongoUri);
  const parsedDb = parseMongoDatabaseName(mongoUri);

  if (isLocal) {
    return {
      isMongoTarget: true,
      dbName: parsedDb,
      targetDescription: `Local MongoDB (localhost / ${parsedDb || 'default'})`,
    };
  }

  // Remote MongoDB target detected. Requires explicit double opt-in.
  if (env.LOKSWAMI_DEMO_REMOTE_MONGO !== 'true') {
    throw new Error(
      'Demo operations refused: remote MongoDB target detected without explicit LOKSWAMI_DEMO_REMOTE_MONGO=true opt-in.'
    );
  }

  if (!env.LOKSWAMI_DEMO_DB_NAME || !env.LOKSWAMI_DEMO_DB_NAME.trim()) {
    throw new Error(
      'Demo operations refused: remote MongoDB target requires explicit LOKSWAMI_DEMO_DB_NAME confirmation.'
    );
  }

  if (!parsedDb) {
    throw new Error(
      'Demo operations refused: unable to safely determine database name from MONGODB_URI.'
    );
  }

  const confirmedDb = env.LOKSWAMI_DEMO_DB_NAME.trim();
  if (parsedDb.toLowerCase() !== confirmedDb.toLowerCase()) {
    throw new Error(
      `Demo operations refused: target database name "${parsedDb}" does not match confirmed LOKSWAMI_DEMO_DB_NAME "${confirmedDb}".`
    );
  }

  return {
    isMongoTarget: true,
    dbName: parsedDb,
    targetDescription: `Remote Development MongoDB (${parsedDb} - confirmed)`,
  };
}
