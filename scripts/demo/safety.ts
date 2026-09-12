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
  return LOCAL_HOSTS.has(host.toLowerCase().trim());
}

/**
 * Determines whether a MongoDB URI points strictly to local loopback hosts.
 */
export function isLocalMongoUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const normalized = uri.replace(/^mongodb(\+srv)?:\/\//i, 'http://');
    const parsed = new URL(normalized);
    return isSafeLocalHost(parsed.hostname);
  } catch {
    const match = uri.match(/^mongodb(?:\+srv)?:\/\/([^/:@?#]+)/i);
    if (!match || !match[1]) return false;
    return isSafeLocalHost(match[1]);
  }
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
