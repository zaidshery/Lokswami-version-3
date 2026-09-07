import { createElement, type ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  useAppStore: () => ({ language: 'en' }),
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
    expect(screen.getByTestId('hero-carousel')).toBeEmptyDOMElement();
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

    expect(screen.getByTestId('hero-carousel')).toHaveTextContent(
      'Lead Story From Feed'
    );
    for (const link of screen.getAllByRole('link', { name: /Latest Story From Feed/ })) {
      expect(link).toHaveAttribute('href', '/main/article/article-6');
    }
    expect(await screen.findByTestId('epaper-card')).toHaveTextContent('Indore Edition');
    const emagazineLink = screen.getByRole('link', {
      name: /read latest e-magazine/i,
    });
    expect(emagazineLink).toHaveAttribute('href', '/main/e-magazine?month=2026-05');
    expect(emagazineLink).toHaveTextContent('May 2026 Issue');
    const liveUpdateLinks = within(screen.getByTestId('live-updates-rail')).getAllByRole('link');
    expect(liveUpdateLinks).toHaveLength(4);
    expect(liveUpdateLinks[0]).toHaveTextContent('Latest Story From Feed');
    const popularNewsRail = screen.queryByTestId('popular-news-rail');
    if (popularNewsRail) {
      const popularNewsLinks = within(popularNewsRail).getAllByRole('link');
      expect(popularNewsLinks).toHaveLength(6);
    }
    expect(mocks.fetchHomeFeedForHomePage).not.toHaveBeenCalled();
    expect(mocks.fetchMergedLiveArticles).not.toHaveBeenCalled();
  });

  it('loads category stories only when a category section nears the viewport', async () => {
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
            },
          ],
          epaper: {
            _id: 'paper-1',
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

    await waitFor(() => expect(intersectionCallbacks.length).toBeGreaterThan(0));
    expect(mocks.fetchPublicArticlesPage).not.toHaveBeenCalled();

    act(() => {
      intersectionCallbacks[0](
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    await waitFor(() =>
      expect(mocks.fetchPublicArticlesPage).toHaveBeenCalledWith({
        category: 'regional',
        limit: 12,
      })
    );
    expect(mocks.fetchPublicArticlesPage).toHaveBeenCalledTimes(1);
  });
});
