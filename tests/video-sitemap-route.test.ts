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
          isShort: true,
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

  describe('GAP-011: Video Sitemap Path Correctness', () => {
    it('distinguishes short vs regular video paths even when slug is present on both', async () => {
      getPublicVideoFeedPageMock.mockResolvedValue({
        items: [
          {
            _id: 'reg-123',
            slug: 'breaking-investigation-report',
            title: 'विशेष ग्राउंड रिपोर्ट',
            description: 'विशेष रिपोर्ट विवरण',
            thumbnail: 'https://images.unsplash.com/photo-reg.jpg',
            videoUrl: 'https://example.com/reg.mp4',
            duration: 180,
            isShort: false,
            publishedAt: '2026-03-01T10:00:00.000Z',
          },
          {
            _id: 'short-456',
            slug: 'quick-news-update',
            title: 'त्वरित समाचार',
            description: 'शॉर्ट्स विवरण',
            thumbnail: 'https://images.unsplash.com/photo-short.jpg',
            videoUrl: 'https://example.com/short.mp4',
            duration: 30,
            isShort: true,
            publishedAt: '2026-03-01T11:00:00.000Z',
          },
        ],
        limit: 50,
        hasMore: false,
        nextCursor: null,
      });

      const { GET } = await import('@/app/video-sitemap.xml/route');
      const response = await GET();
      const xml = await response.text();

      // Regular video MUST NOT use /main/shorts/ even with a slug
      expect(xml).toContain('<loc>https://lokswami.com/main/videos?video=reg-123</loc>');
      expect(xml).not.toContain('<loc>https://lokswami.com/main/shorts/breaking-investigation-report</loc>');

      // Short video MUST use /main/shorts/<slug>
      expect(xml).toContain('<loc>https://lokswami.com/main/shorts/quick-news-update</loc>');
    });

    it('escapes special XML characters in title, description, and URLs', async () => {
      getPublicVideoFeedPageMock.mockResolvedValue({
        items: [
          {
            _id: 'xml-safe-1',
            slug: 'xml-safe-slug',
            title: 'News & Updates: "Special" <Report> \'Exclusive\'',
            description: 'Detail & Summary <More>',
            thumbnail: 'https://example.com/thumb?w=100&h=100',
            videoUrl: 'https://example.com/video?a=1&b=2',
            duration: 90,
            isShort: false,
            publishedAt: '2026-03-01T12:00:00.000Z',
          },
        ],
        limit: 50,
        hasMore: false,
        nextCursor: null,
      });

      const { GET } = await import('@/app/video-sitemap.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('&amp; Updates: &quot;Special&quot; &lt;Report&gt; &apos;Exclusive&apos;');
      expect(xml).toContain('Detail &amp; Summary &lt;More&gt;');
      expect(xml).toContain('https://example.com/thumb?w=100&amp;h=100');
      expect(xml).toContain('https://example.com/video?a=1&amp;b=2');
    });
  });

  describe('GAP-012: Video Sitemap Bounded Cursor Pagination', () => {
    it('paginates beyond 50 items using cursor contract to retrieve all videos', async () => {
      const page1Items = Array.from({ length: 50 }, (_, i) => ({
        _id: `page1-v${i + 1}`,
        slug: `page1-slug-${i + 1}`,
        title: `Page 1 Video ${i + 1}`,
        description: `Page 1 Video Desc ${i + 1}`,
        thumbnail: 'https://images.unsplash.com/thumb.jpg',
        videoUrl: 'https://example.com/v.mp4',
        duration: 60,
        isShort: true,
        publishedAt: `2026-03-01T${String(i).padStart(2, '0')}:00:00.000Z`,
      }));

      const page2Items = Array.from({ length: 15 }, (_, i) => ({
        _id: `page2-v${i + 1}`,
        slug: `page2-slug-${i + 1}`,
        title: `Page 2 Video ${i + 1}`,
        description: `Page 2 Video Desc ${i + 1}`,
        thumbnail: 'https://images.unsplash.com/thumb.jpg',
        videoUrl: 'https://example.com/v.mp4',
        duration: 60,
        isShort: false,
        publishedAt: `2026-02-28T${String(i).padStart(2, '0')}:00:00.000Z`,
      }));

      getPublicVideoFeedPageMock.mockImplementation((opts) => {
        if (!opts?.cursorId) {
          return Promise.resolve({
            items: page1Items,
            limit: 50,
            hasMore: true,
            nextCursor: {
              publishedAt: '2026-03-01T49:00:00.000Z',
              id: 'page1-v50',
            },
          });
        }
        if (opts.cursorId === 'page1-v50') {
          return Promise.resolve({
            items: page2Items,
            limit: 50,
            hasMore: false,
            nextCursor: null,
          });
        }
        return Promise.resolve({
          items: [],
          limit: 50,
          hasMore: false,
          nextCursor: null,
        });
      });

      const { GET } = await import('@/app/video-sitemap.xml/route');
      const response = await GET();
      const xml = await response.text();

      // Verify that all 65 videos are included in sitemap
      expect(getPublicVideoFeedPageMock).toHaveBeenCalledTimes(2);
      expect(xml).toContain('<loc>https://lokswami.com/main/shorts/page1-slug-1</loc>');
      expect(xml).toContain('<loc>https://lokswami.com/main/shorts/page1-slug-50</loc>');
      expect(xml).toContain('<loc>https://lokswami.com/main/videos?video=page2-v1</loc>');
      expect(xml).toContain('<loc>https://lokswami.com/main/videos?video=page2-v15</loc>');
    });

    it('prevents infinite loops if cursor returns the same token', async () => {
      getPublicVideoFeedPageMock.mockResolvedValue({
        items: [
          {
            _id: 'loop-v1',
            slug: 'loop-slug',
            title: 'Loop Video',
            description: 'Loop Desc',
            thumbnail: 'https://images.unsplash.com/thumb.jpg',
            videoUrl: '',
            duration: 60,
            isShort: false,
            publishedAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        limit: 50,
        hasMore: true,
        nextCursor: {
          publishedAt: '2026-03-01T00:00:00.000Z',
          id: 'loop-v1',
        },
      });

      const { GET } = await import('@/app/video-sitemap.xml/route');
      const response = await GET();
      expect(response.status).toBe(200);
      // Must terminate after cycle detection rather than hanging or blowing call stack
      expect(getPublicVideoFeedPageMock).toHaveBeenCalledTimes(2);
    });

    it('deduplicates URLs in the generated sitemap', async () => {
      getPublicVideoFeedPageMock.mockResolvedValue({
        items: [
          {
            _id: 'dup-1',
            slug: 'dup-slug',
            title: 'Dup Video 1',
            description: 'Dup Desc',
            thumbnail: 'https://images.unsplash.com/thumb.jpg',
            videoUrl: '',
            duration: 60,
            isShort: true,
            publishedAt: '2026-03-01T00:00:00.000Z',
          },
          {
            _id: 'dup-1',
            slug: 'dup-slug',
            title: 'Dup Video 1 Repeated',
            description: 'Dup Desc',
            thumbnail: 'https://images.unsplash.com/thumb.jpg',
            videoUrl: '',
            duration: 60,
            isShort: true,
            publishedAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        limit: 50,
        hasMore: false,
        nextCursor: null,
      });

      const { GET } = await import('@/app/video-sitemap.xml/route');
      const response = await GET();
      const xml = await response.text();

      const occurrences = (xml.match(/https:\/\/lokswami\.com\/main\/shorts\/dup-slug/g) || []).length;
      expect(occurrences).toBe(1);
    });
  });
});
