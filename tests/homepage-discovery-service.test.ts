import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ articles: vi.fn(), media: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/publicArticles', () => ({ listPublicArticles: mocks.articles }));
vi.mock('@/lib/server/video/videoService', () => ({ videoService: { getHomeFeedVideos: mocks.media } }));
import { getHomepageDiscovery } from '@/lib/server/content/homepageDiscoveryService';

describe('homepage discovery service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.articles.mockResolvedValue({ items: [] });
    mocks.media.mockResolvedValue({ rawVideos: [], rawShorts: [] });
  });

  it('bounds all eight canonical category requests and both media candidate lists', async () => {
    const result = await getHomepageDiscovery();
    expect(mocks.articles).toHaveBeenCalledTimes(8);
    expect(mocks.articles.mock.calls.map(([options]) => options)).toEqual([
      'regional', 'national', 'politics', 'business', 'technology', 'sports', 'entertainment', 'international',
    ].map((category) => ({ category, limit: 13 })));
    expect(mocks.media).toHaveBeenCalledWith({ videos: 12, shorts: 12 });
    expect(result.videoError).toBe(false);
    expect(result.videos).toEqual([]);
    expect(result.shorts).toEqual([]);
  });

  it('keeps category discovery available when the media service fails', async () => {
    mocks.media.mockRejectedValue(new Error('unavailable'));
    const result = await getHomepageDiscovery();
    expect(Object.keys(result.categoryArticles)).toHaveLength(8);
    expect(result).toMatchObject({ videoError: true, videos: [], shorts: [] });
  });

  it('isolates one category failure without misreporting a media error', async () => {
    mocks.articles.mockImplementation(({ category }) => category === 'regional'
      ? Promise.reject(new Error('unavailable')) : Promise.resolve({ items: [] }));
    const result = await getHomepageDiscovery();
    expect(result.categoryArticles.regional).toEqual([]);
    expect(Object.keys(result.categoryArticles)).toHaveLength(8);
    expect(result.videoError).toBe(false);
  });
});
