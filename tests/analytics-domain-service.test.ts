import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnalyticsService,
  AnalyticsValidationError,
} from '@/lib/server/analytics/analyticsService';
import type { AnalyticsRepository } from '@/lib/server/analytics/analyticsRepository';
import type { AnalyticsEventPayload } from '@/lib/server/analytics/analyticsTypes';

describe('AnalyticsService domain boundaries', () => {
  let mockSavedEvents: AnalyticsEventPayload[];
  let mockRepository: AnalyticsRepository;
  let service: AnalyticsService;

  beforeEach(() => {
    mockSavedEvents = [];
    mockRepository = {
      saveEvent: vi.fn(async (payload: AnalyticsEventPayload) => {
        mockSavedEvents.push(payload);
      }),
    } as unknown as AnalyticsRepository;
    service = new AnalyticsService(mockRepository);
  });

  describe('trackPublicEvent', () => {
    it('rejects invalid event names', async () => {
      await expect(
        service.trackPublicEvent({ event: 'ab', page: '/home' })
      ).rejects.toThrow(AnalyticsValidationError);

      await expect(
        service.trackPublicEvent({ event: 'INVALID!CHARS', page: '/home' })
      ).rejects.toThrow('Invalid analytics event');
    });

    it('rejects empty page', async () => {
      await expect(
        service.trackPublicEvent({ event: 'article_read', page: '' })
      ).rejects.toThrow('Invalid analytics page');
    });

    it('enriches non-swipe events with IP, User-Agent, language, and country', async () => {
      const result = await service.trackPublicEvent(
        {
          event: 'page_view',
          page: '/main/news/story-1',
          source: 'web',
          metadata: { category: 'politics' },
        },
        {
          clientIp: '198.51.100.25',
          userAgent: 'Mozilla/5.0 TestBrowser',
          acceptLanguage: 'en-US,en;q=0.9',
          countryCode: 'IN',
        }
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toMatch(/^sess_[a-f0-9]{24}$/);
      expect(mockSavedEvents).toHaveLength(1);

      const saved = mockSavedEvents[0];
      expect(saved.event).toBe('page_view');
      expect(saved.page).toBe('/main/news/story-1');
      expect(saved.source).toBe('web');
      expect(saved.ipAddress).toBe('198.51.100.25');
      expect(saved.userAgent).toBe('Mozilla/5.0 TestBrowser');
      expect(saved.metadata).toMatchObject({
        category: 'politics',
        browserLanguage: 'en-US',
        countryCode: 'IN',
      });
    });

    it('strictly redacts IP, User-Agent, and unallowed metadata for anonymous swipe events', async () => {
      const result = await service.trackPublicEvent(
        {
          event: 'swipe_next',
          page: '/main/shorts/video-123',
          source: 'lokswami_swipe',
          sessionId: 'client-specified-session',
          metadata: {
            videoId: 'vid-123',
            videoSlug: 'short-123',
            mediaProvider: 'spaces',
            deviceCategory: 'mobile',
            viewportBucket: 'sm',
            secretToken: 'sensitive-token',
            readerEmail: 'reader@example.com',
          },
        },
        {
          clientIp: '198.51.100.99',
          userAgent: 'Mozilla/5.0 SwipeApp',
          acceptLanguage: 'hi-IN',
          countryCode: 'IN',
        }
      );

      expect(result.success).toBe(true);
      // Session ID must be freshly generated, NOT using client's session
      expect(result.sessionId).not.toBe('client-specified-session');
      expect(mockSavedEvents).toHaveLength(1);

      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('lokswami_swipe');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata).toEqual({
        videoId: 'vid-123',
        videoSlug: 'short-123',
        mediaProvider: 'spaces',
        deviceCategory: 'mobile',
        viewportBucket: 'sm',
      });
      expect(saved.metadata).not.toHaveProperty('secretToken');
      expect(saved.metadata).not.toHaveProperty('readerEmail');
      expect(saved.metadata).not.toHaveProperty('browserLanguage');
      expect(saved.metadata).not.toHaveProperty('countryCode');
    });
  });

  describe('trackWebVital', () => {
    it('rejects invalid web vitals metric payloads', async () => {
      await expect(service.trackWebVital(null)).rejects.toThrow(
        'Invalid web vitals metric payload'
      );
      await expect(service.trackWebVital({ name: 'INVALID' })).rejects.toThrow(
        AnalyticsValidationError
      );
    });

    it('records valid web vitals with zero IP and zero User-Agent', async () => {
      const result = await service.trackWebVital({
        name: 'LCP',
        value: 2400.5,
        rating: 'good',
        delta: 100,
        id: 'vitals-lcp-123',
        navigationType: 'navigate',
        path: '/main/news/breaking-headline',
      });

      expect(result.success).toBe(true);
      expect(result.metric.name).toBe('LCP');
      expect(mockSavedEvents).toHaveLength(1);

      const saved = mockSavedEvents[0];
      expect(saved.event).toBe('web_vital_lcp');
      expect(saved.page).toBe('/main/news/breaking-headline');
      expect(saved.source).toBe('web_vitals_beacon');
      expect(saved.sessionId).toBe('vitals-lcp-123');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata).toMatchObject({
        metric: 'LCP',
        value: 2401,
        rating: 'good',
        navigationType: 'navigate',
      });
    });
  });
});
