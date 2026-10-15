import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ArticleRelatedStories from '@/components/article/ArticleRelatedStories';
import type { Article } from '@/lib/mock/data';

const stories: Article[] = Array.from({ length: 10 }, (_, index) => ({
  id: `public-${index}`, slug: `canonical-story-${index}`, title: `A long related headline ${index} about community participation and newsroom coverage`, summary: 'Existing summary', content: '',
  image: '/placeholders/news-16x9.svg', category: 'Regional', author: { id: 'desk', name: 'News Desk', avatar: '' }, publishedAt: '2026-09-10T08:00:00Z', views: 0,
}));
afterEach(cleanup);
describe('article related stories presentation', () => {
  it.each(['hi', 'en'] as const)('renders one localized editorial section with canonical public links in %s', language => {
    const { container } = render(<ArticleRelatedStories articles={stories} language={language} />);
    expect(screen.getByRole('heading', { level: 2, name: language === 'hi' ? 'संबंधित खबरें' : 'Related News' })).toBeInTheDocument();
    const cards = container.querySelectorAll('[data-related-story]');
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveAttribute('href', '/main/article/canonical-story-0');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-10T08:00:00.000Z');
    expect(container.textContent).toContain(language === 'hi' ? 'क्षेत्रीय' : 'Regional');
    expect(container.querySelectorAll('[data-related-articles]')).toHaveLength(1);
  });

  it('retains four-item increments without fetching or changing source order', () => {
    const { container } = render(<ArticleRelatedStories articles={stories} language="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Load More Stories' }));
    expect(container.querySelectorAll('[data-related-story]')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Load More Stories' }));
    const cards = container.querySelectorAll('[data-related-story]');
    expect(cards).toHaveLength(10);
    expect([...cards].map(card => card.getAttribute('href'))).toEqual(stories.map(item => `/main/article/${item.slug}`));
    expect(screen.queryByRole('button', { name: 'Load More Stories' })).toBeNull();
  });

  it('omits empty results and avoids load more for a partial result', () => {
    const view = render(<ArticleRelatedStories articles={[]} language="en" />);
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<ArticleRelatedStories articles={stories.slice(0, 2)} language="en" />);
    expect(view.container.querySelectorAll('[data-related-story]')).toHaveLength(2);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('omits malformed dates and uses existing image fallback', () => {
    const { container } = render(<ArticleRelatedStories articles={[{ ...stories[0], image: '', publishedAt: 'invalid' }]} language="en" />);
    expect(container.querySelector('time')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toContain('news-16x9');
  });
});
