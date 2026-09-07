import { describe, expect, it } from 'vitest';
import {
  buildVideoSlug,
  buildCollisionSafeVideoSlug,
  isPubliclyPublishedVideo,
  isSwipeFeedEligibleVideo,
  toPublicVideoItem,
  normalizeVideoSlug,
  validateSwipePublishFields,
} from '@/lib/content/videoPublication';

const NOW = new Date('2026-09-01T10:00:00.000Z');

function video(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'video-123456',
    title: 'इंदौर की बड़ी खबर',
    description: 'Published Swipe summary',
    thumbnail: '/poster.jpg',
    videoUrl: 'https://cdn.example.com/swipe.mp4',
    duration: 60,
    category: 'Regional',
    isShort: true,
    isPublished: true,
    publishedAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    workflow: { status: 'published' },
    ...overrides,
  };
}

describe('Swipe video publication contract', () => {
  it('preserves Devanagari vowel marks in readable canonical slugs', () => {
    expect(normalizeVideoSlug('पूरी खबर पढ़ें')).toBe('पूरी-खबर-पढ़ें');
  });
  it('maps legacy video fields into the backward-compatible public contract', () => {
    const item = toPublicVideoItem(video(), { requireShort: true, now: NOW });
    expect(item).toEqual(
      expect.objectContaining({
        _id: 'video-123456',
        slug: buildVideoSlug('इंदौर की बड़ी खबर', 'video-123456'),
        posterUrl: '/poster.jpg',
        playbackUrl: 'https://cdn.example.com/swipe.mp4',
        mediaProvider: 'spaces-mp4',
        processingStatus: 'ready',
      })
    );
  });

  it.each([
    ['draft workflow', { workflow: { status: 'draft' } }],
    ['future publish date', { publishedAt: '2026-09-02T09:00:00.000Z' }],
    ['future schedule', { workflow: { status: 'published', scheduledFor: '2026-09-02T09:00:00.000Z' } }],
    ['processing media', { processingStatus: 'processing' }],
    ['failed media', { processingStatus: 'failed' }],
    ['unpublished flag', { isPublished: false }],
  ])('keeps %s out of the public feed', (_label, overrides) => {
    expect(isPubliclyPublishedVideo(video(overrides), NOW)).toBe(false);
    expect(toPublicVideoItem(video(overrides), { requireShort: true, now: NOW })).toBeNull();
  });

  it('excludes known landscape video while retaining unknown legacy ratios', () => {
    expect(isSwipeFeedEligibleVideo(video({ aspectRatio: '16:9' }), NOW)).toBe(false);
    expect(isSwipeFeedEligibleVideo(video({ aspectRatio: 'unknown' }), NOW)).toBe(true);
  });

  it('generates collision-safe migration slugs without unpublishing records', () => {
    const usedSlugs = new Set<string>();
    expect(
      buildCollisionSafeVideoSlug({
        title: 'Same headline',
        identity: 'video-1',
        preferred: 'same-headline',
        usedSlugs,
      })
    ).toBe('same-headline');
    expect(
      buildCollisionSafeVideoSlug({
        title: 'Same headline',
        identity: 'video-2',
        preferred: 'same-headline',
        usedSlugs,
      })
    ).toBe('same-headline-video-2');
  });

  it('explains every missing Swipe publication requirement', () => {
    const ready = video({
      slug: 'ready-story',
      articleId: 'published-article',
      posterUrl: '/poster.jpg',
      playbackUrl: 'https://cdn.example.com/swipe.mp4',
      processingStatus: 'ready',
      aspectRatio: '9:16',
    });
    expect(validateSwipePublishFields(ready)).toBeNull();
    expect(validateSwipePublishFields({ ...ready, articleId: '' })).toMatch(/related published article/i);
    expect(validateSwipePublishFields({ ...ready, processingStatus: 'failed' })).toMatch(/ready/i);
    expect(validateSwipePublishFields({ ...ready, aspectRatio: '16:9' })).toMatch(/9:16/i);
  });
});
