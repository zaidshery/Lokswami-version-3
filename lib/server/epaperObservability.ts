import 'server-only';

export type EpaperMetricEvent =
  | 'epaper_upload_initiated'
  | 'epaper_upload_finalized'
  | 'upload_initialized'
  | 'upload_finalized'
  | 'upload_finalize_blocked'
  | 'duplicate_edition_blocked'
  | 'epaper_processing_queued'
  | 'epaper_processing_started'
  | 'epaper_processing_completed'
  | 'epaper_processing_failed'
  | 'conversion_completed'
  | 'conversion_failed'
  | 'conversion_stale_aborted'
  | 'conversion_retry_scheduled'
  | 'epaper_published'
  | 'epaper_archived'
  | 'publishing_completed'
  | 'publishing_blocked'
  | 'epaper_ocr_queued'
  | 'epaper_ocr_started'
  | 'epaper_ocr_completed'
  | 'epaper_ocr_failed'
  | 'ocr_suggestion_reviewed'
  | 'ocr_queue_reconciliation_needed'
  | 'epaper_cleanup_started'
  | 'epaper_cleanup_completed'
  | 'epaper_cleanup_failed'
  | 'qa_returned_after_edit';

export type EpaperMetricValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | number[]
  | Record<string, unknown>;

const SENSITIVE_KEY_PATTERN =
  /(password|secret|authorization|cookie|session|credential|signature|^key$|[-_]key|apiKey|privateKey)/i;

/**
 * Redacts potential credentials, signed URL query parameters, authorization headers,
 * and caps excessively long strings to prevent raw OCR dumps or PDF byte stream leaks.
 */
export function redactSensitiveEpaperValue(value: string): string {
  if (!value) return '';

  return value
    // Redact signed URLs containing AWS/Spaces credentials or signatures in query params
    .replace(
      /(https?:\/\/[^\s"'<>]+)\?(?:[^\s"'<>]*)(?:X-Amz-[^\s"'<>]+|Signature=[^\s"'<>]+|token=[^\s"'<>]+|secret=[^\s"'<>]+|key=[^\s"'<>]+)[^\s"'<>]*/gi,
      '$1?[REDACTED_SIGNED_URL_PARAMS]'
    )
    // Redact Bearer tokens in Authorization-style strings
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    // Redact secret assignments like password=..., token=..., api_key=...
    .replace(
      /(password|token|secret|api[-_]?key|cookie|session[-_]?id)(\s*[:=]\s*)([^\r\n,;'"}\s]+)/gi,
      '$1$2[REDACTED]'
    )
    // Truncate excessively long strings to at most 500 characters
    .slice(0, 500);
}

/**
 * Sanitizes arbitrary metric dictionary objects recursively so that sensitive keys
 * or values are never written to server logs.
 */
export function sanitizeMetricFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue;

    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'string') {
      sanitized[key] = redactSensitiveEpaperValue(val);
    } else if (Array.isArray(val)) {
      sanitized[key] = val.map((item) =>
        typeof item === 'string' ? redactSensitiveEpaperValue(item) : item
      );
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeMetricFields(val as Record<string, unknown>);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

export function logEpaperMetric(
  event: EpaperMetricEvent | string,
  fields: Record<string, EpaperMetricValue> = {}
) {
  const safeFields = sanitizeMetricFields(fields as Record<string, unknown>);
  console.info(
    JSON.stringify({
      type: 'epaper_metric',
      event,
      timestamp: new Date().toISOString(),
      ...safeFields,
    })
  );
}
