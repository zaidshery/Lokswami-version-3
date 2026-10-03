import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ video: vi.fn(), short: vi.fn(), beta: vi.fn(), feed: vi.fn() }));
vi.mock('react', async (importOriginal) => ({ ...await importOriginal<typeof import('react')>(), cache: <T>(fn: T) => fn }));
vi.mock('@/lib/server/publicVideoMetadata', () => ({ getPublicVideoForMetadata: mocks.video }));
vi.mock('@/lib/server/publicVideos', () => ({ getPublicSwipeStory: mocks.short, getPublicVideoFeedPage: mocks.feed }));
vi.mock('@/lib/server/publicSwipeFeed', () => ({ getPublicSwipeFeedPage: vi.fn() }));
vi.mock('@/lib/content/swipeBeta', () => ({ isSwipeBetaEnabled: mocks.beta }));
vi.mock('@/app/(reader)/main/videos/VideosPageClient', () => ({ default: () => null }));
vi.mock('@/components/swipe/SwipeFeed', () => ({ default: () => null }));
beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://lokswami.com'); mocks.beta.mockReturnValue(true); mocks.video.mockResolvedValue(null); mocks.short.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());
describe('server social metadata route selectors', () => {
  it('preserves an exact Short canonical slug and injects it when absent from the initial feed', async () => {
    const short = { id: 'outside-feed', slug: 'अलग-शॉर्ट', isShort: true, title: 'Different headline', description: 'Description', thumbnail: '/poster.jpg', category: 'Regional' };
    mocks.video.mockResolvedValue(short);
    mocks.feed.mockResolvedValue({ items: [], limit: 20, hasMore: false, nextCursor: null });
    const { generateMetadata, default: VideosPage } = await import('@/app/(reader)/main/videos/page');
    const props = { searchParams: Promise.resolve({ video: short.id }) };
    const canonical = `https://lokswami.com/main/shorts/${encodeURIComponent(short.slug)}`;
    expect(await generateMetadata(props)).toMatchObject({ alternates: { canonical }, openGraph: { url: canonical } });
    const page = await VideosPage(props);
    expect(page.props.children[1].props.initialItems[0]).toMatchObject({ _id: short.id, slug: short.slug, isShort: true });
  });
  it('produces selected video A metadata and strips tracking parameters', async () => {
    mocks.video.mockResolvedValue({ id: 'video-A', title: 'Video A', description: '<p>Video A description</p>', thumbnail: '/video-A.jpg', category: 'Regional' });
    const { generateMetadata } = await import('@/app/(reader)/main/videos/page');
    expect(await generateMetadata({ searchParams: Promise.resolve({ video: 'video-A', utm_source: 'whatsapp' }) })).toMatchObject({ alternates: { canonical: 'https://lokswami.com/main/videos?video=video-A' }, openGraph: { title: 'Video A | Lokswami Video', url: 'https://lokswami.com/main/videos?video=video-A' }, description: 'Video A description' });
  });
  it.each(['missing', 'future', 'private'])('noindexes an unavailable exact %s video without its fields', async (video) => {
    const { generateMetadata } = await import('@/app/(reader)/main/videos/page');
    expect(await generateMetadata({ searchParams: Promise.resolve({ video }) })).toMatchObject({ robots: { index: false }, alternates: { canonical: 'https://lokswami.com/main/videos' } });
  });
  it('uses the resolved Short slug despite a different headline', async () => {
    mocks.short.mockResolvedValue({ video: { _id: 'video-short', slug: 'bhopal-major-news', title: 'भोपाल की बड़ी खबर', description: 'स्थानीय समाचार', posterUrl: '/poster.jpg' } });
    const { generateMetadata } = await import('@/app/(reader)/main/shorts/[slug]/page');
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'bhopal-major-news' }) })).toMatchObject({ alternates: { canonical: 'https://lokswami.com/main/shorts/bhopal-major-news' }, openGraph: { url: 'https://lokswami.com/main/shorts/bhopal-major-news', locale: 'hi_IN' } });
  });
  it('noindexes a missing Short', async () => {
    const { generateMetadata } = await import('@/app/(reader)/main/shorts/[slug]/page');
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'missing' }) })).toMatchObject({ robots: { index: false } });
  });
  it('noindexes the disabled Short route', async () => {
    mocks.beta.mockReturnValue(false);
    const { generateMetadata } = await import('@/app/(reader)/main/shorts/[slug]/page');
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'disabled' }) })).toMatchObject({ robots: { index: false } });
  });
  it('noindexes utility routes', async () => {
    const routes = await Promise.all([import('@/app/(reader)/main/search/page'), import('@/app/(reader)/main/account/layout'), import('@/app/(reader)/main/preferences/layout'), import('@/app/(reader)/main/saved/layout')]);
    for (const route of routes) expect(route.metadata.robots.index).toBe(false);
  });
});
