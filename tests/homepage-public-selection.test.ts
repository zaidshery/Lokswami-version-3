import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import HomepageTopPackage from '@/components/home/HomepageTopPackage';

const mocks = vi.hoisted(() => ({
  available: vi.fn(), rows: vi.fn(), find: vi.fn(),
}));
vi.mock('@/lib/db/mongoAvailability', () => ({ isMongoAvailable: mocks.available }));
vi.mock('@/lib/models/Article', () => ({ default: { find: mocks.find } }));
vi.mock('@/lib/storage/articlesFile', () => ({ listAllStoredArticles: mocks.rows }));
vi.mock('@/lib/server/video/videoService', () => ({ videoService: { getHomeFeedVideos: async () => ({ rawVideos: [], rawShorts: [] }) } }));
vi.mock('@/lib/server/epaper/epaperService', () => ({ epaperService: { getHomeFeedEditions: async () => ({ epaper: null, emagazine: null }) } }));

describe('homepage public selection integration', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['file', 'mongo'] as const)('filters publication and flag expiry before selecting in %s storage', async (source) => {
    const row = (id: string, views = 0) => ({
      _id: id, slug: id, title: id, summary: 'Summary', image: '/image.jpg',
      category: 'National', author: 'Desk', publishedAt: '2026-01-01T00:00:00Z', views,
      workflow: { status: 'published' },
    });
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row(String(i))),
      { ...row('expired', 1000), isTrending: true, editorial: { trendingExpiresAt: '2026-01-02T00:00:00Z' } },
      { ...row('active'), isTrending: true },
      { ...row('draft', 9000), workflow: { status: 'draft' } },
      { ...row('scheduled'), workflow: { status: 'scheduled', scheduledFor: '2099-01-01T00:00:00Z' } },
    ];
    mocks.available.mockResolvedValue(source === 'mongo');
    mocks.rows.mockResolvedValue(rows);
    const query = { select: vi.fn(), sort: vi.fn(), limit: vi.fn(), lean: vi.fn().mockResolvedValue(rows) };
    query.select.mockReturnValue(query); query.sort.mockReturnValue(query); query.limit.mockReturnValue(query);
    mocks.find.mockReturnValue(query);
    const { publicHomeFeedService } = await import('@/lib/server/content/publicHomeFeedService');
    const result = await publicHomeFeedService.getPublicHomepageInitialFeed();
    expect(result.source).toBe(source);
    const { lead, latest, popular } = result.feed.topPackage;
    expect([lead, ...latest, ...popular].every((item) => item && !['draft', 'scheduled'].includes(item.id))).toBe(true);
    const expired = [lead, ...latest, ...popular].find((item) => item?.id === 'expired');
    expect(expired?.isTrending).toBe(false);
    expect(new Set([lead!.id, ...latest.map((item) => item.id), ...popular.map((item) => item.id)]).size).toBe(9);
    const { mapHomeFeedToHomePageState } = await import('@/lib/content/homeFeed');
    const mapped = mapHomeFeedToHomePageState(result.feed)!;
    expect(popular.every((item) => mapped.articles.some((article) => article.id === item.id))).toBe(true);
    render(createElement(HomepageTopPackage, { articles: mapped.articles, language: 'en' }));
    const popularRows = within(screen.getByTestId('popular-news-rail')).getAllByRole('listitem');
    expect(popularRows.map(row => row.getAttribute('data-story-id'))).toEqual(popular.map(item => item.id));
    expect(popularRows).toHaveLength(4);
    expect(popularRows.every(row => !['draft', 'scheduled'].includes(row.getAttribute('data-story-id')!))).toBe(true);
    expect(mocks.available).toHaveBeenCalledWith({ label: 'public home feed' });
  });
});
