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

export const ANONYMOUS_PUBLIC_SOURCES = new Set([
  'web',
  'reader_home',
  'article_page',
  'category_page',
  'video_page',
  'epaper_page',
  'contact_page',
  'account_page',
  'reader_page',
  'marketing_page',
  'share_menu',
  'homepage_top',
  'contact_form',
  'engagement_popup',
  'lokswami_video_hub',
  'lokswami_swipe',
]);

export function isAnonymousPublicSource(source: string): boolean {
  return ANONYMOUS_PUBLIC_SOURCES.has(source);
}

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function cleanBoundedString(value: unknown, max: number): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const str = String(value).trim();
  if (!str) return undefined;
  return str.slice(0, max);
}

function cleanBoundedNumber(
  value: unknown,
  min: number,
  max: number,
  round = false
): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return undefined;
  return round ? Math.round(num) : num;
}

function cleanEnum<T extends string>(value: unknown, allowed: Set<T>): T | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase() as T;
  return allowed.has(trimmed) ? trimmed : undefined;
}

function cleanStringArray(value: unknown, maxItems: number, maxItemLen: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .slice(0, maxItems)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxItemLen))
    .filter(Boolean);
  return items.length ? items : undefined;
}

const DEVICE_CATEGORIES = new Set(['mobile', 'desktop', 'tablet', 'unknown']);
const VIEWPORT_BUCKETS = new Set(['sm', 'md', 'lg', 'unknown']);
const REFERRER_CATEGORIES = new Set([
  'direct',
  'search',
  'social',
  'messaging',
  'referral',
  'internal',
  'unknown',
]);

export function sanitizeAnalyticsPage(rawPage: unknown): string {
  if (typeof rawPage !== 'string') return '/';
  const trimmed = rawPage.trim();
  if (!trimmed) return '/';

  try {
    const url = new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, 'https://lokswami.com');
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    try {
      return decodeURI(cleanPath).slice(0, 512);
    } catch {
      return cleanPath.slice(0, 512);
    }
  } catch {
    return '/';
  }
}

function generateSessionId(): string {
  const raw =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : crypto.randomBytes(16).toString('hex');
  return `sess_${raw.slice(0, 24)}`;
}

/**
 * Normalizes metadata for explicitly classified anonymous public events according to typed contracts.
 * Unknown keys and arbitrary nested objects are dropped.
 */
function normalizeAnonymousPublicMetadata(
  event: string,
  source: string,
  input: unknown
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const raw = input as Record<string, unknown>;
  const safe: Record<string, unknown> = {};

  // Common UI environment dimensions (safely classified coarse client metrics)
  const device = cleanEnum(raw.deviceCategory, DEVICE_CATEGORIES);
  if (device) safe.deviceCategory = device;

  const viewport = cleanEnum(raw.viewportBucket, VIEWPORT_BUCKETS);
  if (viewport) safe.viewportBucket = viewport;

  // 1. Page view events
  if (event === 'page_view') {
    const pageType = cleanBoundedString(raw.pageType, 32);
    if (pageType) safe.pageType = pageType;

    const section = cleanBoundedString(raw.section, 32);
    if (section) safe.section = section;

    const pathnameDepth = cleanBoundedNumber(raw.pathnameDepth, 0, 20, true);
    if (pathnameDepth !== undefined) safe.pathnameDepth = pathnameDepth;

    const referrerCategory = cleanEnum(raw.referrerCategory, REFERRER_CATEGORIES);
    if (referrerCategory) safe.referrerCategory = referrerCategory;

    const referrerHost = cleanBoundedString(raw.referrerHost, 100);
    if (referrerHost) safe.referrerHost = referrerHost;

    const utmSource = cleanBoundedString(raw.utmSource || raw.utm_source, 120);
    if (utmSource) safe.utmSource = utmSource;

    const utmMedium = cleanBoundedString(raw.utmMedium || raw.utm_medium, 120);
    if (utmMedium) safe.utmMedium = utmMedium;

    const utmCampaign = cleanBoundedString(raw.utmCampaign || raw.utm_campaign, 160);
    if (utmCampaign) safe.utmCampaign = utmCampaign;

    const browserTimeZone = cleanBoundedString(raw.browserTimeZone, 80);
    if (browserTimeZone) safe.browserTimeZone = browserTimeZone;

    const browserLanguage = cleanBoundedString(raw.browserLanguage, 32);
    if (browserLanguage) safe.browserLanguage = browserLanguage;

    const countryCode = cleanBoundedString(raw.countryCode, 8);
    if (countryCode && /^[A-Z]{2,3}$/i.test(countryCode)) {
      safe.countryCode = countryCode.toUpperCase();
    }

    return safe;
  }

  // 2. Share events
  if (event === 'share_click' || event === 'share_complete' || event === 'swipe_share') {
    const platform = cleanBoundedString(raw.platform, 32);
    if (platform) safe.platform = platform;

    const contentType = cleanBoundedString(raw.contentType, 32);
    if (contentType) safe.contentType = contentType;

    const contentId = cleanBoundedString(raw.contentId, 64);
    if (contentId) safe.contentId = contentId;

    const placement = cleanBoundedString(raw.placement, 64);
    if (placement) safe.placement = placement;

    if (source === 'lokswami_swipe') {
      const videoId = cleanBoundedString(raw.videoId, 64);
      if (videoId) safe.videoId = videoId;
      const videoSlug = cleanBoundedString(raw.videoSlug, 120);
      if (videoSlug) safe.videoSlug = videoSlug;
      const mediaProvider = cleanBoundedString(raw.mediaProvider, 32);
      if (mediaProvider) safe.mediaProvider = mediaProvider;
      const duration = cleanBoundedNumber(raw.duration, 0, 86400, true);
      if (duration !== undefined) safe.duration = duration;
      const watchedSeconds = cleanBoundedNumber(raw.watchedSeconds, 0, 86400, true);
      if (watchedSeconds !== undefined) safe.watchedSeconds = watchedSeconds;
    }

    return safe;
  }

  // 3. Shorts / Swipe events
  if (source === 'lokswami_swipe') {
    const videoId = cleanBoundedString(raw.videoId, 64);
    if (videoId) safe.videoId = videoId;

    const videoSlug = cleanBoundedString(raw.videoSlug, 120);
    if (videoSlug) safe.videoSlug = videoSlug;

    const mediaProvider = cleanBoundedString(raw.mediaProvider, 32);
    if (mediaProvider) safe.mediaProvider = mediaProvider;

    const fromVideoId = cleanBoundedString(raw.fromVideoId, 64);
    if (fromVideoId) safe.fromVideoId = fromVideoId;

    const toVideoId = cleanBoundedString(raw.toVideoId, 64);
    if (toVideoId) safe.toVideoId = toVideoId;

    const articleId = cleanBoundedString(raw.articleId, 64);
    if (articleId) safe.articleId = articleId;

    const articleSlug = cleanBoundedString(raw.articleSlug, 120);
    if (articleSlug) safe.articleSlug = articleSlug;

    const platform = cleanBoundedString(raw.platform, 32);
    if (platform) safe.platform = platform;

    const duration = cleanBoundedNumber(raw.duration, 0, 86400, true);
    if (duration !== undefined) safe.duration = duration;

    const watchedSeconds = cleanBoundedNumber(raw.watchedSeconds, 0, 86400, true);
    if (watchedSeconds !== undefined) safe.watchedSeconds = watchedSeconds;

    return safe;
  }

  // 4. Video Hub telemetry
  if (source === 'lokswami_video_hub') {
    const videoId = cleanBoundedString(raw.videoId, 64);
    if (videoId) safe.videoId = videoId;

    const videoSlug = cleanBoundedString(raw.videoSlug, 120);
    if (videoSlug) safe.videoSlug = videoSlug;

    const contentType = cleanBoundedString(raw.contentType, 32);
    if (contentType) safe.contentType = contentType;

    const mediaProvider = cleanBoundedString(raw.mediaProvider, 32);
    if (mediaProvider) safe.mediaProvider = mediaProvider;

    const duration = cleanBoundedNumber(raw.duration, 0, 86400, true);
    if (duration !== undefined) safe.duration = duration;

    const watchedSeconds = cleanBoundedNumber(raw.watchedSeconds, 0, 86400, true);
    if (watchedSeconds !== undefined) safe.watchedSeconds = watchedSeconds;

    return safe;
  }

  // 5. Contact form telemetry
  if (source === 'contact_form') {
    if (event === 'contact_validation_fail') {
      const fields = cleanStringArray(raw.fields, 10, 32);
      if (fields) safe.fields = fields;
    } else if (event === 'contact_submit_fail') {
      const status = cleanBoundedNumber(raw.status, 100, 599, true);
      if (status !== undefined) safe.status = status;
      const reason = cleanBoundedString(raw.reason, 100);
      if (reason) safe.reason = reason;
    } else if (event === 'contact_submit_success') {
      const ticketId = cleanBoundedString(raw.ticketId, 64);
      if (ticketId) safe.ticketId = ticketId;
    }
    return safe;
  }

  // 6. Engagement popup telemetry
  if (source === 'engagement_popup') {
    if (event === 'engagement_popup_submit_fail') {
      const status = cleanBoundedNumber(raw.status, 100, 599, true);
      if (status !== undefined) safe.status = status;
      const reason = cleanBoundedString(raw.reason, 100);
      if (reason) safe.reason = reason;
    }
    return safe;
  }

  return safe;
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
    const rawPageInput = clean(input.page, 1024);
    const sourceInput = clean(input.source, 80).toLowerCase();
    const sessionInput = clean(input.sessionId, 120);

    if (!EVENT_REGEX.test(eventInput)) {
      throw new AnalyticsValidationError('Invalid analytics event', 400);
    }

    if (!rawPageInput) {
      throw new AnalyticsValidationError('Invalid analytics page', 400);
    }

    const source = SOURCE_REGEX.test(sourceInput) ? sourceInput : 'web';
    const isAnonymousSwipeEvent = source === 'lokswami_swipe';

    // Unconditional public privacy boundary: all events arriving via the public endpoint
    // are treated as anonymous public telemetry.
    const page = sanitizeAnalyticsPage(rawPageInput);

    const sessionId = isAnonymousSwipeEvent
      ? generateSessionId()
      : SESSION_ID_REGEX.test(sessionInput)
        ? sessionInput
        : generateSessionId();

    const cleanedMetadata = normalizeAnonymousPublicMetadata(
      eventInput,
      source,
      input.metadata
    );

    // Populate coarse geo / language for page views if available from context headers and not already in payload
    if (eventInput === 'page_view') {
      if (!cleanedMetadata.browserLanguage && context.acceptLanguage) {
        cleanedMetadata.browserLanguage = clean(context.acceptLanguage.split(',')[0], 32);
      }
      if (!cleanedMetadata.countryCode && context.countryCode) {
        const normalizedCountry = clean(context.countryCode, 8).toUpperCase();
        if (/^[A-Z]{2,3}$/.test(normalizedCountry)) {
          cleanedMetadata.countryCode = normalizedCountry;
        }
      }
    }

    const savePayload = {
      event: eventInput,
      page,
      source,
      sessionId,
      ipAddress: '',
      userAgent: '',
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
        reportSequence: metric.reportSequence,
        rating: metric.rating,
        deviceType: metric.deviceType,
        navigationType: metric.navigationType,
        timestamp: metric.timestamp,
      },
    };

    await this.repository.upsertWebVital(eventPayload);

    return {
      success: true,
      metric,
    };
  }
}

export const analyticsService = new AnalyticsService();
