import { createElement } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { articles as repositoryMocks } from '@/lib/mock/data';
import { mapPublicArticlesToUiArticles } from '@/lib/content/publicArticles';
import CategoryPageClient from '@/app/(reader)/main/category/[slug]/CategoryPageClient';

const mocks = vi.hoisted(() => ({
  fetchPublicArticlesPage: vi.fn(),
  fetchMergedLiveArticles: vi.fn(),
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({ language: 'en' }),
}));

vi.mock('@/lib/content/publicArticles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/content/publicArticles')>(
    '@/lib/content/publicArticles'
  );
  return {
    ...actual,
    fetchPublicArticlesPage: mocks.fetchPublicArticlesPage,
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

vi.mock('@/components/ui/HeroCard', () => ({
  default: ({ article }: { article: { title: string } }) =>
    createElement('div', { 'data-testid': 'hero-card' }, article.title),
}));

vi.mock('@/components/ui/NewsCard', () => ({
  default: ({ article }: { article: { title: string } }) =>
    createElement('article', { 'data-testid': 'news-card' }, article.title),
}));

const usable = {
  id: 'real-politics', slug: 'real-politics-story', title: 'Authoritative Politics',
  summary: 'Published summary', image: '/story.jpg', category: 'Politics', author: 'Desk',
  publishedAt: '2026-10-01T10:00:00.000Z',
};
function expectNoMocks() {
  for (const article of repositoryMocks) expect(screen.queryByText(article.title)).not.toBeInTheDocument();
}

describe('CategoryPageClient v1 article integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPublicArticlesPage.mockResolvedValue(null);
    mocks.fetchMergedLiveArticles.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('renders initial v1 category items without falling back to legacy latest fetches', async () => {
    const CategoryPageClient = (
      await import('@/app/(reader)/main/category/[slug]/CategoryPageClient')
    ).default;

    render(
      createElement(CategoryPageClient, {
        slug: 'politics',
        initialItems: [
          {
            id: 'article-1',
            slug: 'lead-story',
            title: 'Political Lead',
            summary: 'Lead summary',
            image: '/lead.jpg',
            category: 'Politics',
            author: 'Desk',
            publishedAt: '2026-05-09T10:00:00.000Z',
          },
        ],
      })
    );

    expect(screen.getByTestId('hero-card')).toHaveTextContent('Political Lead');
    expect(mocks.fetchPublicArticlesPage).not.toHaveBeenCalled();
    expect(mocks.fetchMergedLiveArticles).not.toHaveBeenCalled();
  });

  it.each([{ initialItems: [] }, { initialItems: [{ ...usable, title: '' }] }])(
    'fetches v1 when initial raw items have zero usable mapped articles: %j', async ({ initialItems }) => {
      expect(mapPublicArticlesToUiArticles(initialItems)).toEqual([]);
      mocks.fetchPublicArticlesPage.mockResolvedValue({ items: [usable] });
      render(<CategoryPageClient slug="politics" initialItems={initialItems} />);
      expectNoMocks();
      expect(await screen.findByTestId('hero-card')).toHaveTextContent(usable.title);
      expect(mocks.fetchPublicArticlesPage).toHaveBeenCalledWith({ limit: 120, category: 'politics' });
      expect(mocks.fetchMergedLiveArticles).not.toHaveBeenCalled();
      expectNoMocks();
    }
  );

  it('falls through raw non-empty but unmappable v1 items to genuine legacy data', async () => {
    mocks.fetchPublicArticlesPage.mockResolvedValue({ items: [{ ...usable, title: '' }] });
    mocks.fetchMergedLiveArticles.mockResolvedValue(mapPublicArticlesToUiArticles([
      usable, { ...usable, id: 'sports', title: 'Sports excluded', category: 'Sports' },
    ]));
    render(<CategoryPageClient slug="politics" initialItems={[]} />);
    expect(await screen.findByTestId('hero-card')).toHaveTextContent(usable.title);
    expect(mocks.fetchMergedLiveArticles).toHaveBeenCalledWith(120);
    expect(screen.queryByText('Sports excluded')).not.toBeInTheDocument();
    expectNoMocks();
  });

  it.each([null, { items: [] }, { items: [{ ...usable, image: '' }] }])(
    'keeps v1 unavailable/empty/unmappable plus empty legacy data honestly empty: %j', async (feed) => {
      mocks.fetchPublicArticlesPage.mockResolvedValue(feed);
      render(<CategoryPageClient slug="politics" initialItems={[]} />);
      await waitFor(() => expect(mocks.fetchMergedLiveArticles).toHaveBeenCalledWith(120));
      expect(screen.getByText('No articles found in this category')).toBeInTheDocument();
      expect(screen.queryByTestId('hero-card')).not.toBeInTheDocument();
      expect(screen.queryAllByTestId('news-card')).toHaveLength(0);
      expectNoMocks();
    }
  );

  it('contains no mocks during pending v1 or pending legacy requests', async () => {
    let resolveV1!: (feed: null) => void;
    let resolveLegacy!: (articles: []) => void;
    mocks.fetchPublicArticlesPage.mockReturnValue(new Promise<null>((done) => { resolveV1 = done; }));
    mocks.fetchMergedLiveArticles.mockReturnValue(new Promise<[]>((done) => { resolveLegacy = done; }));
    render(<CategoryPageClient slug="politics" initialItems={[]} />);
    expectNoMocks();
    expect(screen.queryAllByTestId('news-card')).toHaveLength(0);
    await act(async () => resolveV1(null));
    expectNoMocks();
    expect(screen.queryByTestId('hero-card')).not.toBeInTheDocument();
    await act(async () => resolveLegacy([]));
    expect(screen.getByText('No articles found in this category')).toBeInTheDocument();
    expectNoMocks();
  });
});
