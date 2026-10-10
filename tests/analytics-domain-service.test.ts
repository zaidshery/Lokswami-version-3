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
      upsertWebVital: vi.fn(async (payload: AnalyticsEventPayload) => {
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

    it('strictly stores blank IP and User-Agent and normalizes metadata for anonymous page view events', async () => {
      const result = await service.trackPublicEvent(
        {
          event: 'page_view',
          page: '/main/news/story-1?utm_source=test&secret=123#content',
          source: 'web',
          metadata: {
            section: 'politics',
            pageType: 'article_detail',
            pathnameDepth: 3,
            deviceCategory: 'mobile',
            viewportBucket: 'sm',
            arbitrarySecret: 'should_be_dropped',
            nestedObject: { key: 'drop_me' },
          },
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
      expect(saved.page).toBe('/main/news/story-1'); // Query and hash stripped
      expect(saved.source).toBe('web');
      expect(saved.ipAddress).toBe(''); // Privacy hardened: blank IP
      expect(saved.userAgent).toBe(''); // Privacy hardened: blank UA
      expect(saved.metadata).toEqual({
        section: 'politics',
        pageType: 'article_detail',
        pathnameDepth: 3,
        deviceCategory: 'mobile',
        viewportBucket: 'sm',
        browserLanguage: 'en-US',
        countryCode: 'IN',
      });
      expect(saved.metadata).not.toHaveProperty('arbitrarySecret');
      expect(saved.metadata).not.toHaveProperty('nestedObject');
    });

    it('strips query strings and hashes from incoming page paths, never persisting search terms', async () => {
      await service.trackPublicEvent({
        event: 'page_view',
        page: '/main/search?q=private+medical+topic#results',
        source: 'reader_page',
      });

      expect(mockSavedEvents).toHaveLength(1);
      expect(mockSavedEvents[0].page).toBe('/main/search');
    });

    it('stores blank IP and blank User-Agent for anonymous share events and restricts metadata', async () => {
      await service.trackPublicEvent(
        {
          event: 'share_click',
          page: '/main/article/breaking-news?ref=social#comment',
          source: 'share_menu',
          metadata: {
            platform: 'whatsapp',
            contentType: 'article',
            contentId: 'art-456',
            placement: 'sticky_bar',
            unknownKey: 'drop_me',
            nested: { attempt: 'bypass' },
          },
        },
        {
          clientIp: '203.0.113.88',
          userAgent: 'Mozilla/5.0 ShareTest',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.event).toBe('share_click');
      expect(saved.page).toBe('/main/article/breaking-news');
      expect(saved.source).toBe('share_menu');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata).toEqual({
        platform: 'whatsapp',
        contentType: 'article',
        contentId: 'art-456',
        placement: 'sticky_bar',
      });
      expect(saved.metadata).not.toHaveProperty('unknownKey');
      expect(saved.metadata).not.toHaveProperty('nested');
    });

    it('stores blank IP and UA for contact telemetry and safely normalizes validation fields', async () => {
      await service.trackPublicEvent(
        {
          event: 'contact_validation_fail',
          page: '/main/contact',
          source: 'contact_form',
          metadata: {
            fields: ['name', 'email', 'message', 'invalid_unbounded_field_string_that_exceeds_length'.repeat(2)],
            arbitrary: 'drop',
          },
        },
        {
          clientIp: '198.51.100.50',
          userAgent: 'Mozilla/5.0 FormTester',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('contact_form');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata?.fields).toEqual([
        'name',
        'email',
        'message',
        'invalid_unbounded_field_string_t', // safely bounded to 32 chars
      ]);
      expect(saved.metadata).not.toHaveProperty('arbitrary');
    });

    it('stores blank IP and UA for engagement popup telemetry', async () => {
      await service.trackPublicEvent(
        {
          event: 'engagement_popup_submit_fail',
          page: '/main',
          source: 'engagement_popup',
          metadata: {
            status: 400,
            reason: 'Invalid phone number format provided',
            spamKey: 'drop_this',
          },
        },
        {
          clientIp: '198.51.100.12',
          userAgent: 'Mozilla/5.0 PopupClient',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('engagement_popup');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata).toEqual({
        status: 400,
        reason: 'Invalid phone number format provided',
      });
      expect(saved.metadata).not.toHaveProperty('spamKey');
    });

    it('stores blank IP and UA for video hub telemetry', async () => {
      await service.trackPublicEvent(
        {
          event: 'video_play',
          page: '/main/videos/tech-talk',
          source: 'lokswami_video_hub',
          metadata: {
            videoId: 'vid-789',
            videoSlug: 'tech-talk',
            contentType: 'video',
            mediaProvider: 'youtube',
            duration: 120,
            watchedSeconds: 95,
            videoTitle: 'Should be dropped since unconsumed',
            nestedObj: { foo: 'bar' },
          },
        },
        {
          clientIp: '192.0.2.1',
          userAgent: 'Mozilla/5.0 VideoApp',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('lokswami_video_hub');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata).toEqual({
        videoId: 'vid-789',
        videoSlug: 'tech-talk',
        contentType: 'video',
        mediaProvider: 'youtube',
        duration: 120,
        watchedSeconds: 95,
      });
      expect(saved.metadata).not.toHaveProperty('videoTitle');
      expect(saved.metadata).not.toHaveProperty('nestedObj');
    });

    it('prevents server-supplied IP/UA headers from overriding the blank privacy rule for anonymous sources', async () => {
      const anonymousSources = [
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
        'contact_form',
        'engagement_popup',
        'lokswami_video_hub',
        'lokswami_swipe',
      ];

      for (const source of anonymousSources) {
        mockSavedEvents = [];
        await service.trackPublicEvent(
          {
            event: 'test_event',
            page: '/main',
            source,
          },
          {
            clientIp: '203.0.113.199',
            userAgent: 'Mozilla/5.0 LeakTest/1.0',
          }
        );

        expect(mockSavedEvents).toHaveLength(1);
        expect(mockSavedEvents[0].ipAddress).toBe('');
        expect(mockSavedEvents[0].userAgent).toBe('');
      }
    });

    it('preserves verified swipe platform metadata while keeping IP/UA blank', async () => {
      await service.trackPublicEvent(
        {
          event: 'swipe_share',
          page: '/main/shorts/headline-story',
          source: 'lokswami_swipe',
          metadata: {
            videoId: 'v-123',
            videoSlug: 'headline-story',
            platform: 'whatsapp',
            duration: 45,
            watchedSeconds: 40,
            unknownKey: 'drop',
          },
        },
        {
          clientIp: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata).toEqual({
        videoId: 'v-123',
        videoSlug: 'headline-story',
        platform: 'whatsapp',
        duration: 45,
        watchedSeconds: 40,
      });
    });

    it('preserves IP and UA for non-anonymous internal sources', async () => {
      await service.trackPublicEvent(
        {
          event: 'internal_audit_log',
          page: '/admin/system',
          source: 'internal_admin_console',
          metadata: { customField: 'allowed_for_internal' },
        },
        {
          clientIp: '10.0.0.1',
          userAgent: 'InternalAgent/1.0',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('internal_admin_console');
      expect(saved.ipAddress).toBe('10.0.0.1');
      expect(saved.userAgent).toBe('InternalAgent/1.0');
      expect(saved.metadata).toMatchObject({ customField: 'allowed_for_internal' });
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

    it('type-checks bounded numbers and drops non-finite or out-of-range values', async () => {
      await service.trackPublicEvent({
        event: 'swipe_next',
        page: '/main/shorts/v1',
        source: 'lokswami_swipe',
        metadata: {
          videoId: 'v1',
          duration: -50, // negative not allowed
          watchedSeconds: Infinity, // non-finite not allowed
        },
      });

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.metadata).toEqual({
        videoId: 'v1',
      });
      expect(saved.metadata).not.toHaveProperty('duration');
      expect(saved.metadata).not.toHaveProperty('watchedSeconds');
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
        reportSequence: 1,
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
        reportSequence: 1,
        navigationType: 'navigate',
      });
    });
  });
});
