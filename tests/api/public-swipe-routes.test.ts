import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listAllStoredVideosMock = vi.fn();
const getPublicSwipeStoryMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/storage/videosFile', () => ({ listAllStoredVideos: listAllStoredVideosMock }));
vi.mock('@/lib/server/publicVideos', () => ({ getPublicSwipeStory: getPublicSwipeStoryMock }));
vi.mock('@/lib/models/Video', () => ({ default: {} }));

function request(path: string) {
  return new Request(`http://localhost${path}`) as unknown as NextRequest;
}

describe('public Swipe routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
  });

  it('uses eight items by default and excludes non-public rows', async () => {
    listAllStoredVideosMock.mockResolvedValue([
      {
        _id: 'published-short',
        title: 'Published short',
        description: 'Summary',
        thumbnail: '/poster.jpg',
        videoUrl: 'https://cdn.example.com/short.mp4',
        duration: 30,
        category: 'National',
        isShort: true,
        isPublished: true,
        publishedAt: '2026-08-31T10:00:00.000Z',
        workflow: { status: 'published' },
      },
      {
        _id: 'draft-short',
        title: 'Draft short',
        description: 'Private',
        thumbnail: '/draft.jpg',
        videoUrl: 'https://cdn.example.com/draft.mp4',
        duration: 30,
        category: 'National',
        isShort: true,
        isPublished: false,
        publishedAt: '2026-08-31T09:00:00.000Z',
        workflow: { status: 'draft' },
      },
    ]);

    const { GET } = await import('@/app/api/shorts/latest/route');
    const response = await GET(request('/api/v1/public/shorts'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    expect(payload.limit).toBe(8);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toEqual(
      expect.objectContaining({ _id: 'published-short', processingStatus: 'ready' })
    );
  });

  it('keeps canonical, latest, and legacy cursor aliases compatible', async () => {
    const canonical = await import('@/app/api/v1/public/shorts/route');
    const latest = await import('@/app/api/v1/public/shorts/latest/route');
    const legacy = await import('@/app/api/shorts/latest/route');
    expect(canonical.GET).toBe(legacy.GET);
    expect(latest.GET).toBe(legacy.GET);
  });

  it('returns a published story with its article preview by slug', async () => {
    getPublicSwipeStoryMock.mockResolvedValue({
      video: { _id: 'video-1', slug: 'story-one' },
      article: { id: 'article-1', title: 'Full report' },
    });
    const { GET } = await import('@/app/api/v1/public/shorts/[slug]/route');
    const response = await GET(request('/api/v1/public/shorts/story-one'), {
      params: Promise.resolve({ slug: 'story-one' }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        video: { _id: 'video-1', slug: 'story-one' },
        article: { id: 'article-1', title: 'Full report' },
      },
    });
  });

  it('does not CDN-cache missing or temporarily unavailable slug responses', async () => {
    const { GET } = await import('@/app/api/v1/public/shorts/[slug]/route');
    getPublicSwipeStoryMock.mockResolvedValueOnce(null);
    const missing = await GET(request('/api/v1/public/shorts/missing'), {
      params: Promise.resolve({ slug: 'missing' }),
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toContain('no-store');

    getPublicSwipeStoryMock.mockRejectedValueOnce(new Error('store unavailable'));
    const unavailable = await GET(request('/api/v1/public/shorts/unavailable'), {
      params: Promise.resolve({ slug: 'unavailable' }),
    });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('cache-control')).toContain('no-store');
  });
});
