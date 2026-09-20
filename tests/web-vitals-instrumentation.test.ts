import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMetricRating,
  normalizeVitalMetric,
  sanitizeMetricPath,
} from '@/lib/analytics/webVitals';
import { POST as handleVitalPost } from '@/app/api/v1/public/analytics/vitals/route';

const saveAnalyticsEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/analytics/analyticsRepository', () => ({
  analyticsRepository: {
    saveEvent: saveAnalyticsEventMock,
  },
}));

beforeEach(() => {
  saveAnalyticsEventMock.mockReset();
  saveAnalyticsEventMock.mockResolvedValue(undefined);
});

describe('SEO Phase 4 - Core Web Vitals Classification & Rating', () => {
  it('correctly classifies LCP ratings based on standard thresholds', () => {
    expect(getMetricRating('LCP', 1500)).toBe('good');
    expect(getMetricRating('LCP', 2500)).toBe('good');
    expect(getMetricRating('LCP', 3200)).toBe('needs-improvement');
    expect(getMetricRating('LCP', 4000)).toBe('needs-improvement');
    expect(getMetricRating('LCP', 4500)).toBe('poor');
  });

  it('correctly classifies INP ratings', () => {
    expect(getMetricRating('INP', 100)).toBe('good');
    expect(getMetricRating('INP', 200)).toBe('good');
    expect(getMetricRating('INP', 350)).toBe('needs-improvement');
    expect(getMetricRating('INP', 500)).toBe('needs-improvement');
    expect(getMetricRating('INP', 600)).toBe('poor');
  });

  it('correctly classifies CLS ratings', () => {
    expect(getMetricRating('CLS', 0.05)).toBe('good');
    expect(getMetricRating('CLS', 0.1)).toBe('good');
    expect(getMetricRating('CLS', 0.18)).toBe('needs-improvement');
    expect(getMetricRating('CLS', 0.25)).toBe('needs-improvement');
    expect(getMetricRating('CLS', 0.35)).toBe('poor');
  });

  it('correctly classifies FCP and TTFB ratings', () => {
    expect(getMetricRating('FCP', 1200)).toBe('good');
    expect(getMetricRating('FCP', 2200)).toBe('needs-improvement');
    expect(getMetricRating('FCP', 3500)).toBe('poor');

    expect(getMetricRating('TTFB', 500)).toBe('good');
    expect(getMetricRating('TTFB', 1200)).toBe('needs-improvement');
    expect(getMetricRating('TTFB', 2500)).toBe('poor');
  });

  it('sanitizes metric path cleanly', () => {
    expect(sanitizeMetricPath('/main/article/indore-news?_rsc=123')).toBe('/main/article/indore-news');
    expect(sanitizeMetricPath('invalid')).toBe('/');
    expect(sanitizeMetricPath('')).toBe('/');
    expect(sanitizeMetricPath('/main/epaper///')).toBe('/main/epaper');
  });

  it('normalizes valid telemetry input', () => {
    const valid = normalizeVitalMetric({
      name: 'lcp',
      value: 2100,
      path: '/main/article/indore-news',
      deviceType: 'mobile',
      navigationType: 'navigate',
    });

    expect(valid).not.toBeNull();
    expect(valid?.name).toBe('LCP');
    expect(valid?.value).toBe(2100);
    expect(valid?.rating).toBe('good');
    expect(valid?.deviceType).toBe('mobile');
    expect(valid?.path).toBe('/main/article/indore-news');
  });

  it('rejects invalid telemetry input', () => {
    expect(normalizeVitalMetric(null)).toBeNull();
    expect(normalizeVitalMetric({ name: 'UNKNOWN', value: 100 })).toBeNull();
    expect(normalizeVitalMetric({ name: 'LCP', value: -50 })).toBeNull();
    expect(normalizeVitalMetric({ name: 'LCP', value: 'not-a-number' })).toBeNull();
  });
});

describe('SEO Phase 4 - Vitals Ingestion Endpoint', () => {
  it('accepts valid web vital beacon and returns 200 with sanitized metric', async () => {
    const req = new Request('https://lokswami.com/api/v1/public/analytics/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LCP',
        value: 1800,
        path: '/main/article/sample-slug',
        deviceType: 'mobile',
      }),
    });

    const res = await handleVitalPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.metric.name).toBe('LCP');
    expect(data.metric.rating).toBe('good');
    expect(saveAnalyticsEventMock).toHaveBeenCalledOnce();
    expect(saveAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'web_vital_lcp',
        page: '/main/article/sample-slug',
        source: 'web_vitals_beacon',
      })
    );
  });

  it('rejects malformed payload with 400 status', async () => {
    const req = new Request('https://lokswami.com/api/v1/public/analytics/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'INVALID_METRIC',
        value: 1800,
      }),
    });

    const res = await handleVitalPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(saveAnalyticsEventMock).not.toHaveBeenCalled();
  });
});
