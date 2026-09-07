export type WebVitalMetricName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';

export type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

export type WebVitalMetric = {
  id: string;
  name: WebVitalMetricName;
  value: number;
  rating: WebVitalRating;
  path: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  navigationType?: string;
  timestamp: string;
};

export const WEB_VITALS_THRESHOLDS: Record<
  WebVitalMetricName,
  { good: number; needsImprovement: number }
> = {
  LCP: { good: 2500, needsImprovement: 4000 },
  INP: { good: 200, needsImprovement: 500 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
};

export function getMetricRating(name: WebVitalMetricName, value: number): WebVitalRating {
  const thresholds = WEB_VITALS_THRESHOLDS[name];
  if (!thresholds) return 'needs-improvement';

  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needs-improvement';
  return 'poor';
}

export function sanitizeMetricPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return '/';
  const trimmed = rawPath.trim();
  if (!trimmed || !trimmed.startsWith('/')) return '/';

  try {
    const url = new URL(trimmed, 'https://lokswami.com');
    // Strip framework-only query parameters and retain safe pathname
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    try {
      return decodeURI(cleanPath).slice(0, 1024);
    } catch {
      return cleanPath.slice(0, 1024);
    }
  } catch {
    return '/';
  }
}

export function normalizeVitalMetric(input: unknown): WebVitalMetric | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;

  const rawName = String(source.name || '').toUpperCase();
  if (!['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].includes(rawName)) {
    return null;
  }
  const name = rawName as WebVitalMetricName;

  const numValue = Number(source.value);
  if (Number.isNaN(numValue) || numValue < 0) {
    return null;
  }
  // Round to 3 decimal places for CLS, or integer for ms
  const value = name === 'CLS' ? Math.round(numValue * 1000) / 1000 : Math.round(numValue);

  const rating = getMetricRating(name, value);
  const path = sanitizeMetricPath(source.path);
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim().slice(0, 64) : `v_${Date.now()}`;

  const rawDevice = String(source.deviceType || '').toLowerCase();
  const deviceType = ['mobile', 'desktop', 'tablet'].includes(rawDevice)
    ? (rawDevice as WebVitalMetric['deviceType'])
    : 'unknown';

  const navigationType = typeof source.navigationType === 'string'
    ? source.navigationType.slice(0, 32)
    : undefined;

  return {
    id,
    name,
    value,
    rating,
    path,
    deviceType,
    navigationType,
    timestamp: new Date().toISOString(),
  };
}
