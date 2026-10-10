import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article } from '@/lib/mock/data';
import { articles as repositoryMocks } from '@/lib/mock/data';
import FtaftafPage from '@/app/(reader)/main/ftaftaf/page';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), language: 'en', observed: vi.fn() }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => ({ language: mocks.language }) }));
vi.mock('@/lib/content/liveArticles', () => ({ fetchMergedLiveArticles: mocks.fetch }));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => createElement('div', { role: 'img', 'aria-label': alt }),
}));
vi.mock('@/components/ui/ArticleMetaRow', () => ({
  default: ({ readHref }: { readHref: string }) => createElement('a', { href: readHref }, 'Read article'),
}));

function article(index: number): Article {
  return {
    id: `real-${index}`, slug: `real-story-${index}`, title: `Authoritative story ${index}`,
    summary: 'Published summary', image: '/story.jpg', category: 'Politics',
    author: { id: 'desk', name: 'Desk', avatar: '/avatar.svg' },
    publishedAt: '2026-10-01T10:00:00.000Z', views: 0,
  };
}
function expectNoMocks() {
  for (const mock of repositoryMocks) expect(screen.queryByText(mock.title)).not.toBeInTheDocument();
}
function expectNoStoryControls() {
  expect(screen.queryByText(/1\s*\/\s*0/)).not.toBeInTheDocument();
  expect(screen.queryByText('Swipe Up')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Previous story' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Next story' })).not.toBeInTheDocument();
}

describe('R01 Ftaftaf content authority', () => {
  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue([]);
    mocks.language = 'en';
    mocks.observed.mockClear();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
    vi.stubGlobal('IntersectionObserver', class {
      observe = mocks.observed;
      disconnect = vi.fn();
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('starts without mock headlines or story controls while fetching', async () => {
    let resolve!: (articles: Article[]) => void;
    mocks.fetch.mockReturnValue(new Promise<Article[]>((done) => { resolve = done; }));
    render(<FtaftafPage />);
    expectNoMocks();
    expectNoStoryControls();
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(false);
    await act(async () => resolve([]));
    expectNoStoryControls();
    expect(mocks.fetch).toHaveBeenCalledWith(30);
  });

  it.each([
    ['en', 'No stories available right now.'],
    ['hi', 'अभी कोई खबर उपलब्ध नहीं है।'],
  ])('shows an honest %s empty state without 1/0, swipe, or navigation controls', async (language, copy) => {
    mocks.language = language;
    render(<FtaftafPage />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(screen.getByText(copy)).toBeInTheDocument();
    expectNoStoryControls();
    expectNoMocks();
  });

  it.each([1, 3, 12])('renders only the first ten of %i authoritative stories, without mock backfill', async (count) => {
    mocks.fetch.mockResolvedValue(Array.from({ length: count }, (_, index) => article(index)));
    const { container } = render(<FtaftafPage />);
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(Math.min(count, 10)));
    expect(container.querySelectorAll('article')).toHaveLength(Math.min(count, 10));
    expect(screen.getAllByRole('link', { name: 'Read article' })[0])
      .toHaveAttribute('href', '/main/article/real-story-0');
    expect(screen.getByRole('button', { name: 'Next story' })).toBeInTheDocument();
    expect(mocks.observed).toHaveBeenCalledTimes(Math.min(count, 10));
    expectNoMocks();
  });
});
