import { describe, expect, it } from 'vitest';
import { validatePushPayload, validatePushRecipient } from '@/lib/server/push/pushSafetyService';

describe('Phase 3.8D - Push Payload & Recipient Validation', () => {
  describe('Payload Validation', () => {
    it('accepts valid headline, body, and relative deep link', () => {
      const result = validatePushPayload({
        title: 'Breaking: Major Cabinet Reshuffle Announced',
        body: 'Full analysis and state-by-state implications reported by the political desk.',
        deepLink: '/main/article/cabinet-reshuffle-2026',
      });
      expect(result.valid).toBe(true);
      expect(result.sanitizedPayload).toBeDefined();
      expect(result.sanitizedPayload?.title).toBe('Breaking: Major Cabinet Reshuffle Announced');
    });

    it('rejects headlines that are too short (<3 chars)', () => {
      const result = validatePushPayload({
        title: 'Hi',
        body: 'Valid body text for this alert.',
        deepLink: '/main/article/1',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('title must be between 3 and 120 characters');
    });

    it('rejects headlines that exceed 120 characters', () => {
      const result = validatePushPayload({
        title: 'A'.repeat(121),
        body: 'Valid body text for this alert.',
        deepLink: '/main/article/1',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('title must be between 3 and 120 characters');
    });

    it('rejects body that is too short (<5 chars)', () => {
      const result = validatePushPayload({
        title: 'Valid Headline',
        body: 'No',
        deepLink: '/main/article/1',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('body must be between 5 and 250 characters');
    });

    it('rejects body that exceeds 250 characters', () => {
      const result = validatePushPayload({
        title: 'Valid Headline',
        body: 'B'.repeat(251),
        deepLink: '/main/article/1',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('body must be between 5 and 250 characters');
    });

    it('rejects absolute URLs or external links in deepLink', () => {
      const result = validatePushPayload({
        title: 'Valid Headline',
        body: 'Valid summary text for the newsroom alert.',
        deepLink: 'https://malicious-external-site.com/phish',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a canonical relative reader path');
    });

    it('rejects protocol-relative URLs in deepLink', () => {
      const result = validatePushPayload({
        title: 'Valid Headline',
        body: 'Valid summary text for the newsroom alert.',
        deepLink: '//evil.com/payload',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a canonical relative reader path');
    });

    it('rejects javascript: pseudo-protocols in deepLink', () => {
      const result = validatePushPayload({
        title: 'Valid Headline',
        body: 'Valid summary text for the newsroom alert.',
        deepLink: 'javascript:alert(1)',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a canonical relative reader path');
    });

    it('rejects non-https external image URLs', () => {
      const result = validatePushPayload({
        title: 'Valid Headline',
        body: 'Valid summary text for the newsroom alert.',
        deepLink: '/main/article/1',
        imageUrl: 'http://insecure.test/image.jpg',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('imageUrl must be HTTPS or relative path');
    });

    it('accepts relative or https image URLs', () => {
      const resHttps = validatePushPayload({
        title: 'Valid Headline',
        body: 'Valid summary text for the newsroom alert.',
        deepLink: '/main/article/1',
        imageUrl: 'https://images.lokswami.com/cover.webp',
      });
      expect(resHttps.valid).toBe(true);

      const resRel = validatePushPayload({
        title: 'Valid Headline',
        body: 'Valid summary text for the newsroom alert.',
        deepLink: '/main/article/1',
        imageUrl: '/uploads/cover.webp',
      });
      expect(resRel.valid).toBe(true);
    });
  });

  describe('Recipient Validation', () => {
    it('accepts all_subscribers audience', () => {
      const res = validatePushRecipient({ audience: 'all_subscribers' });
      expect(res.valid).toBe(true);
    });

    it('accepts test_recipients with non-empty user IDs', () => {
      const res = validatePushRecipient({
        audience: 'test_recipients',
        testUserIds: ['user-1', 'user-2'],
      });
      expect(res.valid).toBe(true);
    });

    it('rejects test_recipients without user IDs', () => {
      const res = validatePushRecipient({
        audience: 'test_recipients',
        testUserIds: [],
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('at least one recipient ID');
    });

    it('rejects invalid audience category', () => {
      const res = validatePushRecipient({
        audience: 'unknown_segment',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid audience');
    });
  });
});
