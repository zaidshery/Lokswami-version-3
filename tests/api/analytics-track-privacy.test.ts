import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createStoredAnalyticsEventMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/AnalyticsEvent', () => ({ default: { create: vi.fn() } }));
vi.mock('@/lib/storage/analyticsEventsFile', () => ({
  createStoredAnalyticsEvent: createStoredAnalyticsEventMock,
}));

const originalMongoUri = process.env.MONGODB_URI;

describe('POST /api/analytics/track privacy & validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    createStoredAnalyticsEventMock.mockResolvedValue({});
  });

  afterEach(() => {
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  it('stores blank IP and blank User-Agent for public page views even when request headers contain them', async () => {
    const { POST } = await import('@/app/api/analytics/track/route');
    const request = new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 IdentifiableBrowser/1.0',
        'x-forwarded-for': '198.51.100.42, 10.0.0.1',
        'accept-language': 'en-US,en;q=0.9',
        'x-country-code': 'IN',
      },
      body: JSON.stringify({
        event: 'page_view',
        page: '/main/search?q=sensitive+query#top',
        source: 'reader_page',
        metadata: {
          section: 'main',
          pageType: 'reader_surface',
          pathnameDepth: 2,
          leakedEmail: 'user@example.com',
          nestedConfig: { token: 'abc' },
        },
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.sessionId).toMatch(/^sess_[a-f0-9]{24}$/);

    expect(createStoredAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'page_view',
        page: '/main/search', // query string and hash stripped
        source: 'reader_page',
        ipAddress: '', // blank IP
        userAgent: '', // blank UA
        metadata: {
          section: 'main',
          pageType: 'reader_surface',
          pathnameDepth: 2,
          browserLanguage: 'en-US',
          countryCode: 'IN',
        },
      })
    );
  });

  it('rejects invalid request payload with 400', async () => {
    const { POST } = await import('@/app/api/analytics/track/route');
    const request = new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid-json{',
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('rejects invalid event payload with 400', async () => {
    const { POST } = await import('@/app/api/analytics/track/route');
    const request = new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'bad event with spaces!',
        page: '/main',
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid analytics event');
  });

  it('enforces blank IP and User-Agent, sanitized page, and drops unsafe metadata for unlisted caller-supplied sources', async () => {
    const { POST } = await import('@/app/api/analytics/track/route');
    const request = new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'AttackerBrowser/1.0',
        'x-forwarded-for': '198.51.100.200',
      },
      body: JSON.stringify({
        event: 'custom_event',
        page: '/main/search?q=secret_data#results',
        source: 'attacker_custom_source',
        metadata: {
          victimEmail: 'user@example.com',
          apiKey: 'key-12345',
          arbitrary: { test: 1 },
        },
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(createStoredAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'custom_event',
        page: '/main/search',
        source: 'attacker_custom_source',
        ipAddress: '',
        userAgent: '',
        metadata: {},
      })
    );
  });

  it('drops malformed non-number metadata types without coercing booleans, arrays, or strings (P2-A)', async () => {
    const { POST } = await import('@/app/api/analytics/track/route');
    const request = new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: 'video_play',
        page: '/main/videos/test',
        source: 'lokswami_video_hub',
        metadata: {
          duration: true, // boolean should be dropped
          watchedSeconds: '12', // string should be dropped
          mediaProvider: 'spaces',
        },
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(createStoredAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video_play',
        source: 'lokswami_video_hub',
        metadata: {
          mediaProvider: 'spaces',
        },
      })
    );
  });

  it('drops malformed non-string values in string metadata fields without coercing numbers, booleans, or objects', async () => {
    const { POST } = await import('@/app/api/analytics/track/route');
    const request = new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: 'share_click',
        page: '/main/search?secret=1#hash',
        source: 'share_menu',
        metadata: {
          platform: 1,
          contentType: true,
          contentId: [123],
          placement: 'bottom_bar',
          arbitraryField: 'blocked',
        },
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(createStoredAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'share_click',
        page: '/main/search',
        source: 'share_menu',
        ipAddress: '',
        userAgent: '',
        metadata: {
          placement: 'bottom_bar',
        },
      })
    );
  });
});
