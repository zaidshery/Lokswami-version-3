import 'server-only';

export const EPAPER_PROCESSING_ERROR_CODES = {
  ALREADY_CLAIMED: 'EPAPER_PROCESSING_ALREADY_CLAIMED',
  STALE: 'EPAPER_PROCESSING_STALE',
  NOT_RETRYABLE: 'EPAPER_PROCESSING_NOT_RETRYABLE',
  PAGE_COUNT_MISMATCH: 'EPAPER_PAGE_COUNT_MISMATCH',
  PAGE_DUPLICATE: 'EPAPER_PAGE_DUPLICATE',
  PAGE_SEQUENCE_INVALID: 'EPAPER_PAGE_SEQUENCE_INVALID',
  PAGE_COUNT_INVALID: 'EPAPER_PAGE_COUNT_INVALID',
  RENDER_FAILED: 'EPAPER_RENDER_FAILED',
  RENDER_TIMEOUT: 'EPAPER_RENDER_TIMEOUT',
  RENDER_MEMORY_EXCEEDED: 'EPAPER_RENDER_MEMORY_EXCEEDED',
  EDITION_IMMUTABLE: 'EPAPER_EDITION_IMMUTABLE',
  SOURCE_INVALID: 'EPAPER_SOURCE_INVALID',
} as const;

export type EpaperProcessingErrorCode =
  (typeof EPAPER_PROCESSING_ERROR_CODES)[keyof typeof EPAPER_PROCESSING_ERROR_CODES];

export class EpaperProcessingError extends Error {
  readonly code: EpaperProcessingErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EpaperProcessingErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(`${code}: ${message}`);
    this.name = 'EpaperProcessingError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
