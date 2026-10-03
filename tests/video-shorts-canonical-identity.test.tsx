import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoShortsFeed, { type ShortsVideoItem } from '@/components/ui/VideoShortsFeed';
import { mapApiVideo } from '@/components/video/types';

vi.mock('@/components/ui/ShareMenu', () => ({
  default: ({ url }: { url: string }) => <button data-testid="short-share" data-url={url}>Share</button>,
}));
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const video: ShortsVideoItem = {
  id: 'video-123', slug: 'bhopal-major-news-today', title: 'भोपाल की बड़ी खबर आज',
  description: 'Public report', thumbnail: '/poster.jpg', videoUrl: 'https://youtu.be/abcdefghijk',
  duration: 30, category: 'National', views: 1, publishedAt: '2026-09-01', shortsRank: 1,
};
describe('Short canonical identity', () => {
  it.each([
    ['भोपाल की बड़ी खबर आज', 'bhopal-major-news-today'],
    ['A completely different English headline', 'bbc-example-short'],
    ['Unrelated headline', 'हिंदी-समाचार'],
    ['Do not fabricate a title slug', undefined],
  ])('uses the slug for links and shares: %s', (title, slug) => {
    render(<VideoShortsFeed videos={[{ ...video, title, slug }]} language="en" />);
    const expected = slug ? `/main/shorts/${encodeURIComponent(slug)}` : '/main/videos?video=video-123';
    expect(screen.getByRole('link', { name: 'Read Story' })).toHaveAttribute('href', expected);
    expect(screen.getByTestId('short-share')).toHaveAttribute('data-url', expected);
    expect(expected).not.toContain(encodeURIComponent(title));
  });
  it('preserves the public feed slug through the reader video adapter', () => {
    const adapted = mapApiVideo({ ...video, _id: video.id, slug: video.slug, isShort: true, isPublished: true });
    expect(adapted.slug).toBe(video.slug);
  });
});
