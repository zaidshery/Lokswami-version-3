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
        'homepage_top',
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

    it('applies anonymous privacy rules to homepage_top events with bounded share metadata (CASE P1-C)', async () => {
      await service.trackPublicEvent(
        {
          event: 'share_click',
          page: '/main',
          source: 'homepage_top',
          metadata: {
            platform: 'whatsapp',
            contentType: 'article',
            contentId: 'story-lead-01',
            placement: 'lead_story',
            unauthorizedKey: 'drop_this',
          },
        },
        {
          clientIp: '198.51.100.77',
          userAgent: 'Mozilla/5.0 HomepageTopTest',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('homepage_top');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.metadata).toEqual({
        platform: 'whatsapp',
        contentType: 'article',
        contentId: 'story-lead-01',
        placement: 'lead_story',
      });
      expect(saved.metadata).not.toHaveProperty('unauthorizedKey');
    });

    it('strictly applies anonymous privacy protections to UNLISTED caller-controlled sources (CASE P1-B)', async () => {
      await service.trackPublicEvent(
        {
          event: 'custom_ping',
          page: '/main/search?q=private+keyword#secret',
          source: 'attacker_controlled_source',
          metadata: {
            email: 'victim@example.com',
            token: 'secret-token-value',
            arbitrary: { key: 'nested' },
          },
        },
        {
          clientIp: '203.0.113.55',
          userAgent: 'Mozilla/5.0 ExploitBot',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('attacker_controlled_source');
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.page).toBe('/main/search'); // Query string and hash stripped
      expect(saved.metadata).not.toHaveProperty('email');
      expect(saved.metadata).not.toHaveProperty('token');
      expect(saved.metadata).not.toHaveProperty('arbitrary');
      expect(saved.metadata).toEqual({});
    });

    it('guarantees caller cannot regain raw request context or unrestricted metadata merely by changing source string (CASE P1-D)', async () => {
      await service.trackPublicEvent(
        {
          event: 'internal_audit_log',
          page: '/admin/system?secret=admin_bypass#panel',
          source: 'internal_admin_console',
          metadata: { customField: 'attempt_bypass', secretToken: 'forbidden' },
        },
        {
          clientIp: '10.0.0.1',
          userAgent: 'InternalAgent/1.0',
        }
      );

      expect(mockSavedEvents).toHaveLength(1);
      const saved = mockSavedEvents[0];
      expect(saved.source).toBe('internal_admin_console');
      // Public ingestion endpoint unconditionally zeroes IP/UA and sanitizes page
      expect(saved.ipAddress).toBe('');
      expect(saved.userAgent).toBe('');
      expect(saved.page).toBe('/admin/system');
      expect(saved.metadata).not.toHaveProperty('customField');
      expect(saved.metadata).not.toHaveProperty('secretToken');
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

  describe('Strict runtime numeric metadata validation (P2-A)', () => {
    it('retains valid finite numbers within bounds and applies rounding per contract', async () => {
      // 1. duration: 12 on video hub
      await service.trackPublicEvent({
        event: 'video_play',
        page: '/main/videos/1',
        source: 'lokswami_video_hub',
        metadata: { duration: 12, watchedSeconds: 4.5 },
      });

      expect(mockSavedEvents).toHaveLength(1);
      expect(mockSavedEvents[0].metadata).toMatchObject({
        duration: 12,
        watchedSeconds: 5, // rounded
      });

      // 2. pathnameDepth: 3 on page_view
      mockSavedEvents.length = 0;
      await service.trackPublicEvent({
        event: 'page_view',
        page: '/main/news/topic/subtopic',
        source: 'reader_page',
        metadata: { pathnameDepth: 3 },
      });

      expect(mockSavedEvents).toHaveLength(1);
      expect(mockSavedEvents[0].metadata).toMatchObject({
        pathnameDepth: 3,
      });

      // 3. status: 200 on contact_submit_fail
      mockSavedEvents.length = 0;
      await service.trackPublicEvent({
        event: 'contact_submit_fail',
        page: '/contact',
        source: 'contact_form',
        metadata: { status: 200, reason: 'Temporary outage' },
      });

      expect(mockSavedEvents).toHaveLength(1);
      expect(mockSavedEvents[0].metadata).toMatchObject({
        status: 200,
        reason: 'Temporary outage',
      });
    });

    it('strictly drops non-number types without coercion (booleans, strings, arrays, objects)', async () => {
      // Test duration and watchedSeconds with booleans, strings, arrays, objects
      const invalidTypes = [
        true,
        false,
        '12',
        [],
        [12],
        {},
        { value: 12 },
        null,
        undefined,
      ];

      for (const invalidVal of invalidTypes) {
        mockSavedEvents.length = 0;
        await service.trackPublicEvent({
          event: 'video_play',
          page: '/main/videos/1',
          source: 'lokswami_video_hub',
          metadata: {
            duration: invalidVal,
            watchedSeconds: invalidVal,
          },
        });

        expect(mockSavedEvents).toHaveLength(1);
        expect(mockSavedEvents[0].metadata).not.toHaveProperty('duration');
        expect(mockSavedEvents[0].metadata).not.toHaveProperty('watchedSeconds');
      }

      // Test pathnameDepth with [] and "3"
      for (const invalidDepth of [[], '3', [3], true]) {
        mockSavedEvents.length = 0;
        await service.trackPublicEvent({
          event: 'page_view',
          page: '/main',
          source: 'reader_page',
          metadata: { pathnameDepth: invalidDepth },
        });

        expect(mockSavedEvents).toHaveLength(1);
        expect(mockSavedEvents[0].metadata).not.toHaveProperty('pathnameDepth');
      }

      // Test status with [200] and "200"
      for (const invalidStatus of [[200], '200', true, {}]) {
        mockSavedEvents.length = 0;
        await service.trackPublicEvent({
          event: 'contact_submit_fail',
          page: '/contact',
          source: 'contact_form',
          metadata: { status: invalidStatus, reason: 'error' },
        });

        expect(mockSavedEvents).toHaveLength(1);
        expect(mockSavedEvents[0].metadata).not.toHaveProperty('status');
        expect(mockSavedEvents[0].metadata).toMatchObject({ reason: 'error' });
      }
    });

    it('drops non-finite numbers (NaN, Infinity, -Infinity) and out-of-range numbers', async () => {
      const nonFiniteValues = [NaN, Infinity, -Infinity];

      for (const nonFinite of nonFiniteValues) {
        mockSavedEvents.length = 0;
        await service.trackPublicEvent({
          event: 'video_play',
          page: '/main/videos/1',
          source: 'lokswami_video_hub',
          metadata: { duration: nonFinite, watchedSeconds: nonFinite },
        });

        expect(mockSavedEvents).toHaveLength(1);
        expect(mockSavedEvents[0].metadata).not.toHaveProperty('duration');
        expect(mockSavedEvents[0].metadata).not.toHaveProperty('watchedSeconds');
      }

      // Out of range: negative duration (< 0)
      mockSavedEvents.length = 0;
      await service.trackPublicEvent({
        event: 'video_play',
        page: '/main/videos/1',
        source: 'lokswami_video_hub',
        metadata: { duration: -10 },
      });
      expect(mockSavedEvents[0].metadata).not.toHaveProperty('duration');

      // Out of range: excessive duration (> 86400)
      mockSavedEvents.length = 0;
      await service.trackPublicEvent({
        event: 'video_play',
        page: '/main/videos/1',
        source: 'lokswami_video_hub',
        metadata: { duration: 100000 },
      });
      expect(mockSavedEvents[0].metadata).not.toHaveProperty('duration');

      // Out of range: status < 100 or status > 599
      for (const outOfRangeStatus of [99, 600, -500]) {
        mockSavedEvents.length = 0;
        await service.trackPublicEvent({
          event: 'contact_submit_fail',
          page: '/contact',
          source: 'contact_form',
          metadata: { status: outOfRangeStatus },
        });
        expect(mockSavedEvents[0].metadata).not.toHaveProperty('status');
      }
    });
  });
});
