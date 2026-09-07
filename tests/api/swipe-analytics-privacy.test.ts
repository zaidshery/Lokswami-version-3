import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createStoredAnalyticsEventMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/AnalyticsEvent', () => ({ default: { create: vi.fn() } }));
vi.mock('@/lib/storage/analyticsEventsFile', () => ({
  createStoredAnalyticsEvent: createStoredAnalyticsEventMock,
}));

const originalMongoUri = process.env.MONGODB_URI;

describe('anonymous Swipe analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    createStoredAnalyticsEventMock.mockResolvedValue({});
  });

  afterEach(() => {
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  it('drops network, browser, campaign, and arbitrary personal metadata', async () => {
    const { POST } = await import('@/app/api/analytics/track/route');
    const request = new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Identifying browser string',
        'x-forwarded-for': '203.0.113.10',
        'accept-language': 'hi-IN',
      },
      body: JSON.stringify({
        event: 'video_play',
        page: '/main/shorts/story-one',
        source: 'lokswami_swipe',
        sessionId: 'persistent-session-id',
        metadata: {
          videoId: 'video-1',
          videoSlug: 'story-one',
          mediaProvider: 'youtube',
          deviceCategory: 'mobile',
          viewportBucket: 'sm',
          email: 'reader@example.com',
          referrerHost: 'private.example',
          utmCampaign: 'personal-campaign',
        },
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createStoredAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'lokswami_swipe',
        ipAddress: '',
        userAgent: '',
        metadata: {
          videoId: 'video-1',
          videoSlug: 'story-one',
          mediaProvider: 'youtube',
          deviceCategory: 'mobile',
          viewportBucket: 'sm',
        },
      })
    );
    const saved = createStoredAnalyticsEventMock.mock.calls[0]?.[0];
    expect(saved.sessionId).not.toBe('persistent-session-id');
  });
});
