import { describe, expect, it, vi, beforeEach } from 'vitest';

const getPublicVideoFeedPageMock = vi.fn();

vi.mock('@/lib/server/publicVideos', () => ({
  getPublicVideoFeedPage: (...args: unknown[]) => getPublicVideoFeedPageMock(...args),
}));

describe('GET /video-sitemap.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lokswami.com';
  });

  it('renders standard Google Video sitemap XML with video nodes', async () => {
    getPublicVideoFeedPageMock.mockResolvedValue({
      items: [
        {
          _id: 'v1',
          slug: 'indore-metro-shorts',
          title: 'इंदौर मेट्रो का नया ट्रायल रन',
          description: 'मध्य प्रदेश इंदौर मेट्रो ट्रायल रन विवरण',
          thumbnail: 'https://images.unsplash.com/photo-1.jpg',
          videoUrl: 'https://example.com/video1.mp4',
          duration: 45,
          publishedAt: '2026-03-01T10:00:00.000Z',
        },
      ],
      limit: 1000,
      hasMore: false,
      nextCursor: null,
    });

    const { GET } = await import('@/app/video-sitemap.xml/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/xml');

    const xml = await response.text();
    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"');
    expect(xml).toContain('<loc>https://lokswami.com/main/shorts/indore-metro-shorts</loc>');
    expect(xml).toContain('<video:title>इंदौर मेट्रो का नया ट्रायल रन</video:title>');
    expect(xml).toContain('<video:thumbnail_loc>https://images.unsplash.com/photo-1.jpg</video:thumbnail_loc>');
    expect(xml).toContain('<video:content_loc>https://example.com/video1.mp4</video:content_loc>');
    expect(xml).toContain('<video:duration>45</video:duration>');
  });

  it('handles relative thumbnails by prefixing siteUrl', async () => {
    getPublicVideoFeedPageMock.mockResolvedValue({
      items: [
        {
          _id: 'v2',
          title: 'Title',
          description: 'Desc',
          thumbnail: '/images/thumb.jpg',
          videoUrl: '',
          duration: 60,
          publishedAt: '2026-03-02T10:00:00.000Z',
        },
      ],
      limit: 1000,
      hasMore: false,
      nextCursor: null,
    });

    const { GET } = await import('@/app/video-sitemap.xml/route');
    const response = await GET();
    const xml = await response.text();

    expect(xml).toContain('<video:thumbnail_loc>https://lokswami.com/images/thumb.jpg</video:thumbnail_loc>');
  });
});
