import crypto from 'crypto';
import { normalizeVitalMetric } from '@/lib/analytics/webVitals';
import {
  analyticsRepository,
  type AnalyticsRepository,
} from './analyticsRepository';
import type {
  TrackPublicEventInput,
  TrackPublicEventResult,
  TrackPublicRequestContext,
  TrackWebVitalResult,
} from './analyticsTypes';

const EVENT_REGEX = /^[a-z0-9_\-]{3,80}$/;
const SOURCE_REGEX = /^[a-z0-9_\-]{2,80}$/;
const SESSION_ID_REGEX = /^[a-z0-9_\-]{8,120}$/i;

const SWIPE_METADATA_KEYS = new Set([
  'videoId',
  'videoSlug',
  'mediaProvider',
  'fromVideoId',
  'toVideoId',
  'articleId',
  'articleSlug',
  'deviceCategory',
  'viewportBucket',
]);

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function generateSessionId(): string {
  const raw =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : crypto.randomBytes(16).toString('hex');
  return `sess_${raw.slice(0, 24)}`;
}

function cleanMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const safe: Record<string, unknown> = {};
  const entries = Object.entries(input).slice(0, 20);

  for (const [key, value] of entries) {
    const normalizedKey = clean(key, 64);
    if (!normalizedKey) continue;

    if (value == null) {
      safe[normalizedKey] = null;
      continue;
    }

    if (typeof value === 'string') {
      safe[normalizedKey] = clean(value, 300);
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      safe[normalizedKey] = value;
      continue;
    }

    if (Array.isArray(value)) {
      safe[normalizedKey] = value
        .slice(0, 10)
        .map((item) => (typeof item === 'string' ? clean(item, 120) : item))
        .filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean');
      continue;
    }

    safe[normalizedKey] = clean(JSON.stringify(value), 300);
  }

  return safe;
}

function cleanAnonymousSwipeMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => SWIPE_METADATA_KEYS.has(key))
  );
}

export class AnalyticsValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AnalyticsValidationError';
    this.status = status;
  }
}

export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository = analyticsRepository) {}

  async trackPublicEvent(
    input: TrackPublicEventInput,
    context: TrackPublicRequestContext = {}
  ): Promise<TrackPublicEventResult> {
    const eventInput = clean(input.event, 80).toLowerCase();
    const pageInput = clean(input.page, 1024);
    const sourceInput = clean(input.source, 80).toLowerCase();
    const sessionInput = clean(input.sessionId, 120);

    if (!EVENT_REGEX.test(eventInput)) {
      throw new AnalyticsValidationError('Invalid analytics event', 400);
    }

    if (!pageInput) {
      throw new AnalyticsValidationError('Invalid analytics page', 400);
    }

    const source = SOURCE_REGEX.test(sourceInput) ? sourceInput : 'web';
    const isAnonymousSwipeEvent = source === 'lokswami_swipe';
    const sessionId = isAnonymousSwipeEvent
      ? generateSessionId()
      : SESSION_ID_REGEX.test(sessionInput)
        ? sessionInput
        : generateSessionId();

    const baseMetadata = cleanMetadata(input.metadata);
    const cleanedMetadata = isAnonymousSwipeEvent
      ? cleanAnonymousSwipeMetadata(baseMetadata)
      : baseMetadata;

    if (!isAnonymousSwipeEvent && !cleanedMetadata.browserLanguage && context.acceptLanguage) {
      cleanedMetadata.browserLanguage = clean(context.acceptLanguage.split(',')[0], 32);
    }
    if (!isAnonymousSwipeEvent && !cleanedMetadata.countryCode && context.countryCode) {
      cleanedMetadata.countryCode = clean(context.countryCode, 8).toUpperCase();
    }

    const savePayload = {
      event: eventInput,
      page: pageInput,
      source,
      sessionId,
      ipAddress: isAnonymousSwipeEvent ? '' : clean(context.clientIp, 120),
      userAgent: isAnonymousSwipeEvent ? '' : clean(context.userAgent, 500),
      metadata: cleanedMetadata,
    };

    await this.repository.saveEvent(savePayload);

    return {
      success: true,
      sessionId,
    };
  }

  async trackWebVital(body: unknown): Promise<TrackWebVitalResult> {
    const metric = normalizeVitalMetric(body);
    if (!metric) {
      throw new AnalyticsValidationError('Invalid web vitals metric payload', 400);
    }

    const eventPayload = {
      event: `web_vital_${metric.name.toLowerCase()}`,
      page: (metric.path || '/').slice(0, 1024),
      source: 'web_vitals_beacon',
      sessionId: metric.id,
      ipAddress: '', // Privacy safeguard: do not store IP addresses for vitals
      userAgent: '', // Privacy safeguard: do not store user agent for vitals
      metadata: {
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
        deviceType: metric.deviceType,
        navigationType: metric.navigationType,
        timestamp: metric.timestamp,
      },
    };

    await this.repository.saveEvent(eventPayload);

    return {
      success: true,
      metric,
    };
  }
}

export const analyticsService = new AnalyticsService();
