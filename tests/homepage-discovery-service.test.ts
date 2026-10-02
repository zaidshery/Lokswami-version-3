import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ articles: vi.fn(), media: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/publicArticles', () => ({ listPublicCategoryArticles: mocks.articles }));
vi.mock('@/lib/server/video/videoService', () => ({ videoService: { getHomeFeedVideos: mocks.media } }));
import { getHomepageDiscovery } from '@/lib/server/content/homepageDiscoveryService';

describe('homepage discovery service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.articles.mockResolvedValue({});
    mocks.media.mockResolvedValue({ rawVideos: [], rawShorts: [] });
  });

  it('bounds all canonical category requests and both media candidate lists', async () => {
    const result = await getHomepageDiscovery();
    expect(mocks.articles).toHaveBeenCalledTimes(1);
    expect(mocks.articles).toHaveBeenCalledWith([
      'madhya-pradesh', 'maharashtra', 'crime', 'national', 'politics', 'international', 'rajasthan', 'uttar-pradesh', 'gujarat', 'entertainment', 'sports', 'business', 'technology',
    ], { limit: 13 });
    expect(mocks.media).toHaveBeenCalledWith({ videos: 12, shorts: 12 });
    expect(result.videoError).toBe(false);
    expect(result.videos).toEqual([]);
    expect(result.shorts).toEqual([]);
  });

  it('supplies canonical preview metadata without serializing unused article bodies', async () => {
    mocks.articles.mockResolvedValue({
      national: { items: [{
        id: 'national', slug: 'story-national', title: 'Published headline', summary: 'Summary',
        image: '/image.jpg', category: 'national', publishedAt: '2026-01-01', content: 'Full article body'.repeat(1000),
      }] },
    });
    const result = await getHomepageDiscovery();
    const preview = result.categoryArticles.national![0];
    expect(preview).toMatchObject({ id: 'national', slug: 'story-national', title: 'Published headline', category: 'national' });
    expect(preview).not.toHaveProperty('content');
    expect(mocks.articles).toHaveBeenCalledWith(expect.any(Array), { limit: 13 });
  });

  it('keeps category discovery available when the media service fails', async () => {
    mocks.media.mockRejectedValue(new Error('unavailable'));
    const result = await getHomepageDiscovery();
    expect(Object.keys(result.categoryArticles)).toHaveLength(13);
    expect(result).toMatchObject({ videoError: true, videos: [], shorts: [] });
  });

  it('isolates category failure without misreporting a media error', async () => {
    mocks.articles.mockRejectedValue(new Error('unavailable'));
    const result = await getHomepageDiscovery();
    expect(result.categoryArticles['madhya-pradesh']).toEqual([]);
    expect(Object.keys(result.categoryArticles)).toHaveLength(13);
    expect(result.videoError).toBe(false);
  });
});
