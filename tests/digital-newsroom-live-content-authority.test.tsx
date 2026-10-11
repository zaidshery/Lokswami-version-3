import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article } from '@/lib/mock/data';
import { articles as repositoryMocks } from '@/lib/mock/data';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import DigitalNewsroomPage from '@/app/(reader)/main/digital-newsroom/page';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => ({ language: 'en' }) }));
vi.mock('@/lib/content/liveArticles', () => ({ fetchMergedLiveArticles: mocks.fetch }));
vi.mock('@/components/ui/HeroCard', () => ({
  default: ({ article }: { article: Article }) => createElement('a', {
    href: buildArticlePublicPath(article), 'data-testid': 'lead',
  }, article.title),
}));
vi.mock('@/components/ui/NewsCard', () => ({
  default: ({ article }: { article: Article }) => createElement('a', {
    href: buildArticlePublicPath(article), 'data-testid': 'story',
  }, article.title),
}));

function article(index: number, overrides: Partial<Article> = {}): Article {
  return {
    id: `real-${index}`, slug: `desk-story-${index}`, title: `Desk story ${index}`,
    summary: 'Published summary', image: '/story.jpg', category: 'Politics',
    author: { id: 'desk', name: 'Desk', avatar: '/avatar.svg' },
    publishedAt: `2026-10-0${index + 1}T10:00:00.000Z`, views: index,
    ...overrides,
  };
}
function expectNoMocks() {
  for (const mock of repositoryMocks) expect(screen.queryByText(mock.title)).not.toBeInTheDocument();
}
function countFor(label: string) {
  return screen.getByText(label).parentElement?.lastElementChild?.textContent;
}

describe('R01 Digital Newsroom content authority', () => {
  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('starts without repository headlines, flags, or counts while the request is pending', async () => {
    let resolve!: (articles: Article[]) => void;
    mocks.fetch.mockReturnValue(new Promise<Article[]>((done) => { resolve = done; }));
    render(<DigitalNewsroomPage />);
    expectNoMocks();
    expect(countFor('Stories')).toBe('0');
    expect(countFor('Live Alerts')).toBe('0');
    expect(screen.queryByTestId('lead')).not.toBeInTheDocument();
    await act(async () => resolve([]));
    expectNoMocks();
    expect(mocks.fetch).toHaveBeenCalledWith(120);
  });

  it('preserves the honest empty treatment and zero stories without mock rails', async () => {
    render(<DigitalNewsroomPage />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(screen.getAllByText('No stories available for this filter.')).toHaveLength(2);
    expect(countFor('Stories')).toBe('0');
    expect(screen.queryAllByTestId('story')).toHaveLength(0);
    expectNoMocks();
  });

  it('uses a single authoritative story as lead and legitimate rail backfill', async () => {
    mocks.fetch.mockResolvedValue([article(0)]);
    render(<DigitalNewsroomPage />);
    expect(await screen.findByTestId('lead')).toHaveTextContent('Desk story 0');
    expect(screen.getByTestId('lead')).toHaveAttribute('href', '/main/article/desk-story-0');
    expect(countFor('Stories')).toBe('1');
    expect(screen.getAllByTestId('story').map((item) => item.textContent))
      .toEqual(['Desk story 0', 'Desk story 0']);
    expectNoMocks();
  });

  it('derives latest, popular, Breaking/Trending rails, and categories solely from authoritative input', async () => {
    mocks.fetch.mockResolvedValue([
      article(0, { isBreaking: true, views: 50 }),
      article(1, { isTrending: true, views: 20, category: 'Sports' }),
      article(2),
    ]);
    render(<DigitalNewsroomPage />);
    expect(await screen.findByTestId('lead')).toHaveTextContent('Desk story 2');
    expect(countFor('Stories')).toBe('3');
    expect(countFor('Live Alerts')).toBe('1');
    const liveDesk = screen.getByRole('heading', { name: 'Live Desk' }).parentElement!;
    expect(within(liveDesk).getAllByTestId('story').map((item) => item.textContent)).toEqual(['Desk story 0']);
    const popular = screen.getByRole('heading', { name: 'Popular In Desk' }).parentElement!;
    expect(within(popular).getAllByTestId('story').map((item) => item.textContent)).toEqual(['Desk story 1']);
    fireEvent.click(screen.getByRole('button', { name: 'Trending' }));
    expect(screen.getByTestId('lead')).toHaveTextContent('Desk story 0');
    fireEvent.click(screen.getByRole('button', { name: 'Sports' }));
    expect(countFor('Stories')).toBe('1');
    expect(screen.getByTestId('lead')).toHaveTextContent('Desk story 1');
    expectNoMocks();
  });
});
