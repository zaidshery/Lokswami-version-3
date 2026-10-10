import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article } from '@/lib/mock/data';
import { articles as repositoryMocks } from '@/lib/mock/data';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import SearchClient from '@/app/(reader)/main/search/SearchClient';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), query: '', language: 'en' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ q: mocks.query }),
}));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => ({ language: mocks.language }) }));
vi.mock('@/lib/content/liveArticles', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/content/liveArticles')>(),
  fetchMergedLiveArticles: mocks.fetch,
}));
vi.mock('@/components/ui/NewsCard', () => ({
  default: ({ article }: { article: Article }) => createElement('a', {
    href: buildArticlePublicPath(article), 'data-testid': 'result',
  }, article.title),
}));

const real: Article = {
  id: '507f1f77bcf86cd799439011', slug: 'civic-report', title: 'Civic report',
  summary: 'Civic reporting from the desk', image: '/story.jpg', category: 'Politics',
  author: { id: 'desk', name: 'Desk', avatar: '/avatar.svg' },
  publishedAt: '2026-10-01T10:00:00.000Z', views: 2,
};
function expectNoMocks() {
  for (const article of repositoryMocks) expect(screen.queryByText(article.title)).not.toBeInTheDocument();
}

describe('R01 Search content authority', () => {
  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue([]);
    mocks.query = 'Civic';
    mocks.language = 'en';
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows no repository mock result while the authoritative request is pending', async () => {
    let resolve!: (articles: Article[]) => void;
    mocks.fetch.mockReturnValue(new Promise<Article[]>((done) => { resolve = done; }));
    render(<SearchClient />);
    expectNoMocks();
    expect(screen.queryAllByTestId('result')).toHaveLength(0);
    await act(async () => resolve([real]));
    expect(screen.getByRole('link', { name: real.title })).toHaveAttribute('href', '/main/article/civic-report');
    expectNoMocks();
    expect(mocks.fetch).toHaveBeenCalledWith(120);
  });

  it.each(['en', 'hi'])('keeps empty results mock-free with polite %s announcements', async (language) => {
    mocks.language = language;
    mocks.query = repositoryMocks[0].title;
    render(<SearchClient />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(mocks.query));
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryAllByTestId('result')).toHaveLength(0);
    expectNoMocks();
  });

  it('does not return a repository-only headline when genuine articles exist', async () => {
    mocks.query = repositoryMocks[0].title;
    mocks.fetch.mockResolvedValue([real]);
    render(<SearchClient />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No results found'));
    expect(screen.queryAllByTestId('result')).toHaveLength(0);
    expectNoMocks();
  });

  it('preserves genuine query matches, category filtering, latest/popular sorting, and result status', async () => {
    mocks.fetch.mockResolvedValue([
      real,
      { ...real, id: 'second', slug: 'civic-second', title: 'Civic second',
        publishedAt: '2026-10-02T10:00:00.000Z', views: 10 },
      { ...real, id: 'sports', title: 'Civic sports', category: 'Sports' },
    ]);
    render(<SearchClient />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 results found'));
    fireEvent.change(screen.getByLabelText('Choose category'), { target: { value: 'politics' } });
    expect(screen.getByRole('status')).toHaveTextContent('2 results found');
    for (const sort of ['latest', 'popular']) {
      fireEvent.change(screen.getByLabelText('Sort articles'), { target: { value: sort } });
      expect(screen.getAllByTestId('result').map((item) => item.textContent))
        .toEqual(['Civic second', 'Civic report']);
    }
    expectNoMocks();
  });
});
