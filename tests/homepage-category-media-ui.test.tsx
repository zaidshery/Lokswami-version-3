import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CategorySection from '@/components/home/CategorySection';
import HomeVideosSection from '@/components/home/HomeVideosSection';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import type { Article } from '@/lib/mock/data';

vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
const category = NEWS_CATEGORIES[0];
const stories: Article[] = Array.from({ length: 5 }, (_, i) => ({ id: String(i), slug: `news-${i}`, title: `खबर ${i}`, summary: 'Summary', image: '/image.jpg', category: 'Regional', publishedAt: '2026-01-01', views: 0, author: { id: 'desk', name: 'Desk', avatar: '' } }));
const videos = stories.map((a) => ({ id: a.id, slug: `standard-${a.id}`, title: a.title, thumbnail: '', duration: 0, category: a.category, publishedAt: a.publishedAt }));

describe('CategorySection', () => {
  it.each([0, 1, 2, 3, 4, 5])('renders %i Regional candidates with honest cardinality', (count) => {
    const { container } = render(<CategorySection category={category} articles={stories.slice(0, count)} variant="large" language="hi" />);
    expect(container.querySelectorAll('[data-story-id]').length).toBe(Math.min(count, 4));
    if (!count) expect(container).toBeEmptyDOMElement();
  });
  it('keeps compact sections bounded and rejects unrelated category items', () => {
    const { container } = render(<CategorySection category={category} articles={[...stories, { ...stories[0], id: 'foreign', category: 'Politics' }]} language="en" />);
    expect(container.querySelectorAll('[data-story-id]')).toHaveLength(3);
    expect(container.querySelector('[data-story-id="foreign"]')).toBeNull();
  });
  it('server renders canonical category/article anchors without viewport gating', () => {
    const html = renderToString(<CategorySection category={category} articles={stories.slice(0, 2)} variant="large" language="hi" />);
    expect(html).toContain('href="/main/category/regional"');
    expect(html).toContain('href="/main/article/news-0"');
    expect(html).toContain('href="/main/article/news-1"');
  });
});

describe('standard video previews', () => {
  it.each([0, 1, 2, 3, 4])('renders %i candidates capped at three with canonical standard links', (count) => {
    const { container } = render(<HomeVideosSection videos={videos.slice(0, count)} language="en" />);
    const cards = screen.queryAllByTestId('home-video-card');
    expect(cards).toHaveLength(Math.min(count, 3));
    for (const [index, card] of cards.entries()) expect(card).toHaveAttribute('href', `/main/videos?video=${index}`);
    expect(container.querySelector('video, iframe, audio')).toBeNull();
    if (count) expect(container.querySelector('img')).toHaveAttribute('src', '/placeholders/news-16x9.svg');
    else expect(container).toBeEmptyDOMElement();
  });
  it('shows a truthful compact service error and Video destination', () => {
    render(<HomeVideosSection videos={[]} error language="en" />);
    expect(screen.getByRole('status')).toHaveTextContent('Videos could not be loaded');
    expect(screen.getByRole('link', { name: 'View All Videos' })).toHaveAttribute('href', '/main/videos');
  });
  it('renders real duration only when supplied', () => {
    render(<HomeVideosSection videos={[{ ...videos[0], duration: 65 }]} language="en" />);
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });
});
