import { createElement, type ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  language: 'en' as 'en' | 'hi',
  fetchHomeFeedForHomePage: vi.fn(),
  fetchMergedLiveArticles: vi.fn(),
  fetchPublicArticlesPage: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    createElement('img', { alt, src }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => createElement('a', { href, ...props }, children),
}));

vi.mock('framer-motion', () => {
  const motionComponent = (tag: string) => {
    const MotionMock = ({
      children,
      ...props
    }: Record<string, unknown> & { children?: ReactNode }) => {
      const forwardedProps = { ...props };
      delete forwardedProps.initial;
      delete forwardedProps.animate;
      delete forwardedProps.transition;
      delete forwardedProps.viewport;
      delete forwardedProps.whileInView;
      return createElement(tag, forwardedProps, children);
    };
    MotionMock.displayName = `MotionMock(${tag})`;
    return MotionMock;
  };

  return {
    motion: {
      div: motionComponent('div'),
      section: motionComponent('section'),
      article: motionComponent('article'),
    },
  };
});

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({ language: mocks.language }),
}));

vi.mock('@/lib/content/homeFeed', async () => {
  const actual = await vi.importActual<typeof import('@/lib/content/homeFeed')>(
    '@/lib/content/homeFeed'
  );
  return {
    ...actual,
    fetchHomeFeedForHomePage: mocks.fetchHomeFeedForHomePage,
  };
});

vi.mock('@/lib/content/liveArticles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/content/liveArticles')>(
    '@/lib/content/liveArticles'
  );
  return {
    ...actual,
    fetchMergedLiveArticles: mocks.fetchMergedLiveArticles,
  };
});

vi.mock('@/lib/content/publicArticles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/content/publicArticles')>(
    '@/lib/content/publicArticles'
  );
  return {
    ...actual,
    fetchPublicArticlesPage: mocks.fetchPublicArticlesPage,
  };
});

vi.mock('@/lib/utils/articleMedia', () => ({
  buildArticleImageVariantUrl: (value: string) => value,
  isLegacyCloudinaryImageUrl: () => false,
  resolveArticleImageSrc: (value: string) => value,
}));

vi.mock('@/components/ui/HeroCarousel', () => ({
  default: ({ articles }: { articles: Array<{ title: string }> }) =>
    createElement(
      'div',
      { 'data-testid': 'hero-carousel' },
      articles.map((article) => article.title).join('|')
    ),
}));

vi.mock('@/components/ui/NewsCard', () => ({
  default: ({ article }: { article: { title: string } }) =>
    createElement('article', { 'data-testid': 'news-card' }, article.title),
}));

vi.mock('@/components/ui/DesktopHeroEpaperCard', () => ({
  default: ({
    editionLabel,
    ariaLabel,
  }: {
    editionLabel: string;
    ariaLabel: string;
  }) =>
    createElement(
      'div',
      {
        'data-testid': ariaLabel.toLowerCase().includes('magazine')
          ? 'emagazine-card'
          : 'epaper-card',
      },
      editionLabel
    ),
}));

vi.mock('@/components/ui/NewsPoll', () => ({
  default: () => createElement('div', { 'data-testid': 'news-poll' }),
}));

describe('HomePageClient v1 home-feed integration', () => {
  const intersectionCallbacks: IntersectionObserverCallback[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.language = 'en';
    intersectionCallbacks.length = 0;
    mocks.fetchHomeFeedForHomePage.mockResolvedValue(null);
    mocks.fetchMergedLiveArticles.mockResolvedValue([]);
    mocks.fetchPublicArticlesPage.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      })
    );
    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [];

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallbacks.push(callback);
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps an empty or unavailable public feed free of demo stories', async () => {
    const { default: HomePageClient } = await import('@/app/(reader)/main/HomePageClient');
    await act(async () => {
      render(createElement(HomePageClient, {
        initialHomeFeed: { articles: [], epaper: null, emagazine: null },
      }));
    });
    await waitFor(() => expect(mocks.fetchPublicArticlesPage).toHaveBeenCalledWith({ limit: 100 }));
    expect(screen.queryByTestId('hero-carousel')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('lead-story')).queryByRole('article')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('lead-story')).queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('live-updates-rail')).queryByRole('link')).not.toBeInTheDocument();
    expect(mocks.fetchMergedLiveArticles).not.toHaveBeenCalled();
  });

  it('renders initial v1 home-feed state through the existing homepage slots', async () => {
    const HomePageClient = (await import('@/app/(reader)/main/HomePageClient'))
      .default;

    render(
      createElement(HomePageClient, {
        initialHomeFeed: {
          articles: [
            {
              id: 'article-1',
              slug: 'lead-story',
              title: 'Lead Story From Feed',
              summary: 'Lead summary',
              image: '/lead.jpg',
              category: 'Regional',
              author: { id: 'desk', name: 'Desk', avatar: '/logo-icon-final.png' },
              publishedAt: '2026-05-09T10:00:00.000Z',
              views: 20,
              isTrending: true,
            },
            {
              id: 'article-2',
              slug: 'latest-story',
              title: 'Second Story From Feed',
              summary: 'Latest summary',
              image: '/latest.jpg',
              category: 'National',
              author: {
                id: 'reporter',
                name: 'Reporter',
                avatar: '/logo-icon-final.png',
              },
              publishedAt: '2026-05-09T09:00:00.000Z',
              views: 8,
            },
            {
              id: 'article-3',
              title: 'Third Story From Feed',
              summary: 'Third summary',
              image: '/third.jpg',
              category: 'National',
              author: {
                id: 'reporter',
                name: 'Reporter',
                avatar: '/logo-icon-final.png',
              },
              publishedAt: '2026-05-09T08:00:00.000Z',
              views: 7,
            },
            {
              id: 'article-4',
              title: 'Fourth Story From Feed',
              summary: 'Fourth summary',
              image: '/fourth.jpg',
              category: 'National',
              author: {
                id: 'reporter',
                name: 'Reporter',
                avatar: '/logo-icon-final.png',
              },
              publishedAt: '2026-05-09T07:00:00.000Z',
              views: 6,
            },
            {
              id: 'article-5',
              title: 'Fifth Story From Feed',
              summary: 'Fifth summary',
              image: '/fifth.jpg',
              category: 'National',
              author: {
                id: 'reporter',
                name: 'Reporter',
                avatar: '/logo-icon-final.png',
              },
              publishedAt: '2026-05-09T06:00:00.000Z',
              views: 5,
            },
            {
              id: 'article-6',
              title: 'Latest Story From Feed',
              summary: 'Sixth summary',
              image: '/sixth.jpg',
              category: 'National',
              author: {
                id: 'reporter',
                name: 'Reporter',
                avatar: '/logo-icon-final.png',
              },
              publishedAt: '2026-05-09T05:00:00.000Z',
              views: 4,
              isBreaking: true,
            },
          ],
          epaper: {
            _id: 'paper-1',
            publicationType: 'epaper',
            citySlug: 'indore',
            cityName: 'Indore',
            title: 'Indore Edition',
            publishDate: '2026-05-09',
            thumbnailPath: '/paper.jpg',
            pageCount: 12,
          },
          emagazine: {
            _id: 'magazine-1',
            publicationType: 'emagazine',
            citySlug: 'global',
            cityName: 'Lokswami',
            title: 'Lokswami E-Magazine',
            publishDate: '2026-05-01',
            thumbnailPath: '/magazine.jpg',
            pageCount: 36,
          },
        },
      })
    );

    const leadSection = screen.getByTestId('lead-story');
    expect(leadSection).toHaveTextContent('Lead Story From Feed');
    expect(
      within(leadSection).getByRole('heading', {
        level: 1,
        name: 'Lead Story From Feed',
      })
    ).toBeInTheDocument();
    expect(within(leadSection).queryByRole('heading', { level: 2 })).toBeNull();
    for (const link of screen.getAllByRole('link', { name: /Latest Story From Feed/ })) {
      expect(link).toHaveAttribute('href', '/main/article/article-6');
    }
    expect(screen.getAllByTestId('indore-epaper')).toHaveLength(1);
    expect(screen.getByTestId('indore-epaper')).toHaveTextContent('Indore Edition');
    expect(screen.queryByTestId('epaper-card')).not.toBeInTheDocument();
    const emagazineLink = screen.getByRole('link', {
      name: /read latest e-magazine/i,
    });
    expect(emagazineLink).toHaveAttribute('href', '/main/e-magazine?month=2026-05');
    const magazine = within(screen.getByTestId('homepage-emagazine'));
    expect(magazine.getByRole('heading', { level: 2 })).toHaveTextContent('Monthly E-Magazine');
    expect(magazine.getByRole('heading', { level: 3 })).toHaveTextContent('Lokswami E-Magazine');
    expect(magazine.getByText('May 2026')).toBeInTheDocument();
    expect(magazine.getByText('Latest Issue')).toBeInTheDocument();
    expect(magazine.queryByText(/Published monthly/)).not.toBeInTheDocument();
    expect(magazine.getByRole('link', { name: 'All Issues' })).toHaveAttribute('href', '/main/e-magazine');
    expect(magazine.getAllByText('Read Magazine')).toHaveLength(1);
    expect(emagazineLink).toHaveTextContent('Read Magazine');
    expect(emagazineLink).not.toHaveTextContent('May 2026');
    expect(emagazineLink.querySelector('a')).toBeNull();
    expect(magazine.getByRole('img')).toHaveAttribute('src', '/magazine.jpg');
    const liveUpdateRows = within(screen.getByTestId('live-updates-rail')).getAllByRole('listitem');
    expect(liveUpdateRows).toHaveLength(4);
    expect(liveUpdateRows[0]).toHaveTextContent('Latest Story From Feed');
    expect(within(screen.getByTestId('latest-news-rail')).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByTestId('hero-carousel')).not.toBeInTheDocument();
    expect(mocks.fetchHomeFeedForHomePage).not.toHaveBeenCalled();
    expect(mocks.fetchMergedLiveArticles).not.toHaveBeenCalled();
  });

  it.each([
    { language: 'en' as const, heading: 'Monthly E-Magazine', archive: 'All Issues', read: 'Read Magazine', eyebrow: 'Latest Issue', month: 'September 2026' },
    { language: 'hi' as const, heading: 'मासिक ई-मैगज़ीन', archive: 'सभी अंक', read: 'मैगज़ीन पढ़ें', eyebrow: 'ताज़ा अंक', month: 'सितंबर 2026' },
  ])('separates archive navigation from the primary issue action in $language', async (copy) => {
    mocks.language = copy.language;
    const { default: HomePageClient } = await import('@/app/(reader)/main/HomePageClient');
    render(createElement(HomePageClient, {
      initialHomeFeed: {
        articles: [], epaper: null,
        emagazine: { _id: 'issue', publicationType: 'emagazine', citySlug: 'global', cityName: 'Lokswami', title: 'Lokswami', publishDate: '2026-09-01', thumbnailPath: '/cover.jpg', pageCount: 36 },
      },
    }));
    const magazine = within(screen.getByTestId('homepage-emagazine'));
    expect(magazine.getByRole('heading', { level: 2 })).toHaveTextContent(copy.heading);
    expect(magazine.getByRole('link', { name: copy.archive })).toHaveAttribute('href', '/main/e-magazine');
    const primaryText = magazine.getAllByText(copy.read);
    expect(primaryText).toHaveLength(1);
    expect(primaryText[0].closest('a')).toHaveAttribute('href', '/main/e-magazine?month=2026-09');
    expect(magazine.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(magazine.getByText(copy.month)).toBeInTheDocument();
  });

  it.each([
    'Lokswami Special Edition: Culture, Literature and Life Across India',
    'लोकस्वामी विशेषांक: संस्कृति, साहित्य और भारतीय जीवन की कहानियाँ',
  ])('preserves the complete issue title and month for %s', async (title) => {
    const { default: HomePageClient } = await import('@/app/(reader)/main/HomePageClient');
    render(createElement(HomePageClient, {
      initialHomeFeed: {
        articles: [], epaper: null,
        emagazine: { _id: 'long-title', publicationType: 'emagazine', citySlug: 'global', cityName: 'Lokswami', title, publishDate: '2026-09-01', thumbnailPath: '/cover.jpg', pageCount: 36 },
      },
    }));
    const magazine = within(screen.getByTestId('homepage-emagazine'));
    const heading = magazine.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent(title);
    expect(heading).toHaveAttribute('title', title);
    expect(magazine.getByText('September 2026')).toBeInTheDocument();
    expect(magazine.getByRole('link', { name: 'Read latest e-magazine' })).toHaveAttribute('href', '/main/e-magazine?month=2026-09');
  });

  it('renders server discovery categories immediately without viewport-triggered fetches', async () => {
    const { default: HomePageClient } = await import('@/app/(reader)/main/HomePageClient');
    const article = {
      id: 'regional-public', slug: 'regional-public', title: 'Published Regional Story',
      summary: 'Summary', image: '/image.jpg', category: 'Madhya Pradesh', views: 0,
      publishedAt: '2026-01-01', author: { id: 'desk', name: 'Desk', avatar: '' },
    };
    render(createElement(HomePageClient, {
      initialHomeFeed: { articles: [article], epaper: { _id: 'paper', citySlug: 'indore', cityName: 'Indore', title: 'Edition', publishDate: '2026-01-01', thumbnailPath: '', pageCount: 1 },
        emagazine: { _id: 'magazine', citySlug: 'global', cityName: 'Lokswami', title: 'Issue', publishDate: '2026-01-01', thumbnailPath: '', pageCount: 1 } },
      initialDiscovery: { categoryArticles: { 'madhya-pradesh': [article] }, videos: [], shorts: [], videoError: false },
    }));
    expect(screen.getByTestId('home-category-madhya-pradesh')).toHaveTextContent('Published Regional Story');
    expect(mocks.fetchPublicArticlesPage).not.toHaveBeenCalled();
    expect(intersectionCallbacks).toHaveLength(0);
    expect(screen.queryByTestId('home-shorts-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-videos-section')).not.toBeInTheDocument();
  });

  it('places Videos before Shorts and full-width state/category rows while preserving Live Updates', async () => {
    const { default: HomePageClient } = await import('@/app/(reader)/main/HomePageClient');
    const article = {
      id: 'regional-public', slug: 'regional-public', title: 'Published Regional Story',
      summary: 'Summary', image: '/image.jpg', category: 'Madhya Pradesh', views: 0,
      publishedAt: '2026-01-01', author: { id: 'desk', name: 'Desk', avatar: '' },
    };
    const nationalArticle = { ...article, id: 'national-public', slug: 'national-public', title: 'Published National Story', category: 'National' };
    render(createElement(HomePageClient, {
      initialHomeFeed: { articles: [article, nationalArticle], epaper: { _id: 'paper', publicationType: 'epaper', citySlug: 'indore', cityName: 'Indore', title: 'Edition', publishDate: '2026-01-01', thumbnailPath: '/cover.jpg', pageCount: 1 }, emagazine: null },
      initialDiscovery: {
        categoryArticles: { 'madhya-pradesh': [article], national: [nationalArticle] },
        videos: Array.from({ length: 3 }, (_, index) => ({ id: `video-${index}`, title: `Published Video ${index}`, thumbnail: '/video.jpg', duration: 42, category: 'Regional', publishedAt: '2026-01-01' })),
        videoError: false,
        shorts: [{ id: 'short-1', slug: 'short-1', title: 'Published Short', thumbnail: '/short.jpg', duration: 42, category: 'Regional', publishedAt: '2026-01-01' }],
      },
    }));

    const videos = screen.getAllByTestId('home-videos-section');
    const shorts = screen.getAllByTestId('home-shorts-section');
    const regional = screen.getAllByTestId('home-category-madhya-pradesh');
    expect(videos).toHaveLength(1);
    expect(shorts).toHaveLength(1);
    expect(regional).toHaveLength(1);
    expect(videos[0].parentElement).toBe(shorts[0].parentElement);
    const mediaColumn = screen.getByTestId('homepage-media-column');
    const composition = screen.getByTestId('homepage-composition');
    const fullWidthRegion = screen.getByTestId('homepage-full-width-category-region');
    const national = screen.getByTestId('home-category-national');
    expect(mediaColumn).toContainElement(videos[0]);
    expect(mediaColumn).toContainElement(shorts[0]);
    expect(composition).not.toContainElement(national);
    expect(fullWidthRegion).toContainElement(national);
    expect(fullWidthRegion.parentElement).toBe(composition.parentElement);
    expect(fullWidthRegion.className).not.toMatch(/col-start|grid-cols|absolute|fixed/);
    expect(composition.compareDocumentPosition(fullWidthRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fullWidthRegion).toContainElement(regional[0]);
    expect(composition).not.toContainElement(regional[0]);
    expect(regional[0].compareDocumentPosition(national) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('homepage-lower-category-region')).not.toBeInTheDocument();
    expect(screen.getByTestId('lead-story').compareDocumentPosition(videos[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(videos[0].compareDocumentPosition(shorts[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(videos[0]).getAllByTestId('home-video-card')).toHaveLength(3);
    expect(within(videos[0]).getByRole('link', { name: 'View All Videos' })).toHaveAttribute('href', '/main/videos');
    expect(screen.getByTestId('home-category-national')).toBeInTheDocument();
    expect(shorts[0].compareDocumentPosition(regional[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(shorts[0]).getByRole('link', { name: 'View All' })).toHaveAttribute('href', '/main/videos');
    expect(within(regional[0]).getByRole('link', { name: 'View All' })).toHaveAttribute('href', '/main/category/madhya-pradesh');
    expect(within(regional[0]).getByRole('link', { name: /Published Regional Story/ })).toHaveAttribute('href', '/main/article/regional-public');
    const liveUpdates = screen.getByTestId('live-updates-section');
    expect(screen.getAllByTestId('live-updates-section')).toHaveLength(1);
    expect(screen.getAllByTestId('homepage-emagazine')).toHaveLength(1);
    expect(liveUpdates).toBeInTheDocument();
    expect(liveUpdates.closest('aside')?.className).not.toContain('sticky');
    const epaper = screen.getAllByTestId('indore-epaper');
    expect(epaper).toHaveLength(1);
    expect(screen.queryByTestId('epaper-card')).not.toBeInTheDocument();
    expect(epaper[0].className).not.toMatch(/sticky|fixed/);
    expect(epaper[0].contains(liveUpdates)).toBe(false);
    const rail = screen.getByTestId('homepage-publication-rail');
    expect(rail).toContainElement(epaper[0]);
    expect(rail).toContainElement(liveUpdates);
    expect(Array.from(rail.children).slice(0, 3).map((child) => child.getAttribute('data-testid'))).toEqual(['indore-epaper', 'homepage-emagazine', 'live-updates-section']);
    expect(within(rail).getByTestId('news-poll').compareDocumentPosition(epaper[0]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByTestId('homepage-top-package')).not.toContainElement(epaper[0]);
    expect(rail.className).not.toMatch(/sticky|fixed/);
    const epaperActions = within(epaper[0]);
    expect(epaperActions.getByRole('link', { name: 'Read E-Paper' })).toHaveAttribute('href', '/main/epaper?city=indore&date=2026-01-01');
    const share = epaperActions.getByRole('link', { name: 'Share Indore E-Paper on WhatsApp' });
    expect(new URL(share.getAttribute('href')!).searchParams.get('text')).toContain('https://lokswami.com/main/epaper?city=indore&date=2026-01-01');
  });

  it('renders the mapped Homepage categories in exact order after Top Package, Videos and Shorts', async () => {
    const slugs = ['madhya-pradesh', 'maharashtra', 'crime', 'national', 'politics', 'international', 'rajasthan', 'uttar-pradesh', 'gujarat', 'entertainment', 'sports', 'business', 'technology'] as const;
    const { default: HomePageClient } = await import('@/app/(reader)/main/HomePageClient');
    const articles = slugs.map((slug) => ({ id: `order-${slug}`, slug: `order-${slug}`, title: slug, summary: 'Summary', image: '/image.jpg', category: slug, views: 0, publishedAt: '2026-01-01', author: { id: 'desk', name: 'Desk', avatar: '' } }));
    render(createElement(HomePageClient, {
      initialHomeFeed: { articles, epaper: null, emagazine: null },
      initialDiscovery: { categoryArticles: Object.fromEntries(articles.map((article) => [article.category, [article]])), videos: [{ id: 'order-video', title: 'Video', thumbnail: '/video.jpg', duration: 42, category: 'National', publishedAt: '2026-01-01' }], shorts: [{ id: 'order-short', title: 'Short', thumbnail: '/short.jpg', duration: 42, category: 'National', publishedAt: '2026-01-01' }], videoError: false },
    }));
    const top = screen.getByTestId('homepage-top-package');
    const videos = screen.getByTestId('home-videos-section');
    const shorts = screen.getByTestId('home-shorts-section');
    const region = screen.getByTestId('homepage-full-width-category-region');
    expect(top.compareDocumentPosition(videos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(videos.compareDocumentPosition(shorts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(shorts.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(region.children).map(el => el.getAttribute('data-testid'))).toEqual(slugs.map(slug => `home-category-${slug}`));
  });

  it('renders four priority-first Live Updates as compact rows with public WhatsApp links', async () => {
    const { default: HomePageClient } = await import('@/app/(reader)/main/HomePageClient');
    const articles = Array.from({ length: 5 }, (_, index) => ({
      id: `update-${index}`, slug: `update-${index}`, title: `Update ${index}`,
      summary: 'Summary', image: `/update-${index}.jpg`, category: 'National', views: 0,
      publishedAt: `2026-05-0${index + 1}T10:00:00.000Z`,
      author: { id: 'desk', name: 'Desk', avatar: '' }, isBreaking: index === 0,
    }));
    render(createElement(HomePageClient, {
      initialHomeFeed: { articles, epaper: null, emagazine: null },
      initialDiscovery: { categoryArticles: {}, videos: [], shorts: [], videoError: false },
    }));

    expect(screen.getAllByTestId('live-updates-section')).toHaveLength(1);
    const live = within(screen.getByTestId('live-updates-section'));
    const rail = screen.getByTestId('live-updates-rail');
    const rows = within(rail).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.getAttribute('data-story-id'))).toEqual(['update-0', 'update-4', 'update-3', 'update-2']);
    expect(rail.className).toContain('divide-y');
    expect(rows.every((row) => !row.className.includes('border'))).toBe(true);
    for (const row of rows) {
      const item = within(row);
      expect(item.getByRole('img', { hidden: true })).toHaveAttribute('alt', expect.stringMatching(/^Update /));
      expect(item.getAllByRole('link', { name: /^Update \d$/ })).toHaveLength(1);
      expect(item.getAllByRole('link', { name: /^Update \d$/ })[0]).toHaveAttribute('href', expect.stringMatching(/^\/main\/article\/update-/));
      expect(item.getByText('National')).toBeInTheDocument();
      expect(row.querySelector('time')).toHaveAttribute('datetime', expect.stringMatching(/^2026-05-/));
      const share = item.getByRole('link', { name: 'Share on WhatsApp' });
      expect(share.querySelector('[data-brand-icon="whatsapp"]')).toBeInTheDocument();
      expect(share).toHaveClass('bg-transparent');
      expect(new URL(share.getAttribute('href')!).searchParams.get('text')).toContain(`https://lokswami.com/main/article/${row.getAttribute('data-story-id')}`);
    }
    expect(live.getByRole('link', { name: 'View all live updates' })).toHaveAttribute('href', '/main/latest');
    expect(screen.getByTestId('latest-news-rail')).toBeInTheDocument();
    expect(mocks.fetchMergedLiveArticles).not.toHaveBeenCalled();
  });
});
