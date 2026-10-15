import 'server-only';

const SENSITIVE_KEY_ASSIGNMENT_PATTERN =
  /(password|passwordHash|setupToken|setupTokenHash|token|secret|secret[-_]?key|apiKey|accessKey|authorization|cookie|session[-_]?id|credential)(\s*[:=]\s*)([^\r\n,;'"}\s]+)/gi;

const SIGNED_URL_PATTERN =
  /(https?:\/\/[^\s"'<>]+)\?(?:[^\s"'<>]*)(?:X-Amz-[^\s"'<>]+|Signature=[^\s"'<>]+|token=[^\s"'<>]+|secret=[^\s"'<>]+|key=[^\s"'<>]+)[^\s"'<>]*/gi;

const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;

const MONGO_URI_PATTERN = /mongodb(\+srv)?:\/\/[^\s"'<>]+/gi;

const SYNTHETIC_SECRET_PATTERN =
  /(TEST_[A-Z0-9_]*SECRET|CRON_SECRET|STORAGE_SECRET|WEBHOOK_SECRET|AUTH_SECRET|JWT_SECRET)[A-Za-z0-9_]*/gi;

const USER_FILESYSTEM_PATH_PATTERN =
  /(?:[A-Za-z]:\\|\/)(?:Users|home|root)[\\/][^\s"'<>]*/gi;

/**
 * Sanitizes arbitrary text intended for operational diagnostics or health monitoring.
 * Strips database URIs, credentials, tokens, signed URLs, and local user paths.
 */
export function sanitizeDiagnosticsText(text: string | null | undefined): string {
  if (!text) return '';

  return String(text)
    // Redact MongoDB connection URIs
    .replace(MONGO_URI_PATTERN, 'mongodb[REDACTED_URI]')
    // Redact Bearer tokens
    .replace(BEARER_PATTERN, '$1[REDACTED]')
    // Redact signed URLs and sensitive query parameters
    .replace(SIGNED_URL_PATTERN, '$1?[REDACTED_SIGNED_URL]')
    // Redact key/secret/password assignments
    .replace(SENSITIVE_KEY_ASSIGNMENT_PATTERN, '$1$2[REDACTED]')
    // Redact explicit secret names/patterns
    .replace(SYNTHETIC_SECRET_PATTERN, '[REDACTED_SECRET]')
    // Redact user filesystem paths
    .replace(USER_FILESYSTEM_PATH_PATTERN, '[REDACTED_PATH]')
    // Cap string length to prevent stack dump leakage
    .slice(0, 1000);
}

/**
 * Recursively sanitizes diagnostic record objects or arrays.
 */
export function sanitizeDiagnosticsRecord<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeDiagnosticsText(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticsRecord(item)) as unknown as T;
  }

  if (typeof value === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (
        /password|secret|token|credential|authorization|cookie/i.test(key) &&
        typeof val === 'string'
      ) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizeDiagnosticsRecord(val);
      }
    }
    return sanitizedObj as T;
  }

  return value;
}
