import type { WebVitalMetric } from '@/lib/analytics/webVitals';

export interface AnalyticsEventPayload {
  event: string;
  page: string;
  source: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  createdAt?: Date;
}

export interface TrackPublicEventInput {
  event?: unknown;
  page?: unknown;
  source?: unknown;
  sessionId?: unknown;
  metadata?: unknown;
}

export interface TrackPublicRequestContext {
  clientIp?: string;
  userAgent?: string;
  acceptLanguage?: string;
  countryCode?: string;
}

export interface TrackPublicEventResult {
  success: boolean;
  sessionId: string;
}

export interface TrackWebVitalResult {
  success: boolean;
  metric: WebVitalMetric;
}
