import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getPublicVideoFeedPageMock = vi.fn();
const getPublicVideosByIdsMock = vi.fn();

vi.mock('@/lib/server/publicVideos', () => ({
  getPublicVideoFeedPage: (...args: unknown[]) => getPublicVideoFeedPageMock(...args),
  getPublicVideosByIds: (...args: unknown[]) => getPublicVideosByIdsMock(...args),
}));

describe('GET /api/videos/latest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a bounded noncached public lookup for saved IDs', async () => {
    getPublicVideosByIdsMock.mockResolvedValue([{ _id: 'off-page' }]);
    const { GET } = await import('@/app/api/v1/public/videos/route');
    const response = await GET(new NextRequest('http://localhost/api/v1/public/videos?ids=off-page,off-page'));
    expect(await response.json()).toEqual({ items: [{ _id: 'off-page' }] });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(getPublicVideosByIdsMock).toHaveBeenCalledWith(['off-page']);
  });

  it.each(['', '../private', Array.from({ length: 51 }, (_, i) => `video-${i}`).join(',')])('rejects invalid or oversized saved ID lists: %s', async (ids) => {
    const { GET } = await import('@/app/api/v1/public/videos/route');
    expect((await GET(new NextRequest(`http://localhost/api/v1/public/videos?ids=${encodeURIComponent(ids)}`))).status).toBe(400);
    expect(getPublicVideosByIdsMock).not.toHaveBeenCalled();
  });

  it('delegates to getPublicVideoFeedPage and returns cached JSON payload', async () => {
    getPublicVideoFeedPageMock.mockResolvedValue({
      items: [
        {
          _id: 'v1',
          title: 'Latest video',
          description: 'Description',
          thumbnail: '/thumb.jpg',
          videoUrl: 'https://video.mp4',
          duration: 30,
          category: 'National',
          isShort: false,
          isPublished: true,
          shortsRank: 0,
          views: 120,
          publishedAt: '2026-03-01T10:00:00.000Z',
        },
      ],
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });

    const { GET } = await import('@/app/api/videos/latest/route');
    const req = new NextRequest('http://localhost:3000/api/videos/latest?limit=20');
    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=300');

    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]._id).toBe('v1');
    expect(getPublicVideoFeedPageMock).toHaveBeenCalledWith({
      limit: '20',
      cursorPublishedAt: null,
      cursorId: null,
    });
  });
});
