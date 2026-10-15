import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CategorySection from '@/components/home/CategorySection';
import HomeVideosSection from '@/components/home/HomeVideosSection';
import { NEWS_CATEGORIES, resolveNewsCategory } from '@/lib/constants/newsCategories';
import { HOMEPAGE_CATEGORY_MODULES } from '@/lib/content/homepageDiscovery';
import type { Article } from '@/lib/mock/data';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/trackClient', () => ({ trackClientEvent: trackEvent }));

vi.mock('next/image', () => ({
  // Test double verifies image metadata without fetching assets.
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
const category = NEWS_CATEGORIES[0];
const stories: Article[] = Array.from({ length: 5 }, (_, i) => ({ id: String(i), slug: `news-${i}`, title: `खबर ${i}`, summary: 'Summary', image: '/image.jpg', category: 'Regional', publishedAt: '2026-01-01', views: 0, author: { id: 'desk', name: 'Desk', avatar: '' } }));
const videos = stories.map((a) => ({ id: a.id, slug: `standard-${a.id}`, title: a.title, thumbnail: '', duration: 0, category: a.category, publishedAt: a.publishedAt }));

describe('CategorySection', () => {
  it.each(['en', 'hi'] as const)('reveals ordered National batches with keyboard controls and hides the exhausted button in %s', async (language) => {
    const national = NEWS_CATEGORIES.find((c) => c.slug === 'national')!;
    const rows = Array.from({ length: 10 }, (_, i) => ({ ...stories[0], id: `reveal-${i}`, slug: `reveal-${i}`, title: `Story ${i}`, category: 'National' }));
    render(<CategorySection category={national} articles={[...rows, rows[0], { ...rows[0], id: 'foreign', category: 'Business' }]} language={language} />);
    const section = screen.getByTestId('home-category-national');
    const ids = () => within(section).getAllByRole('article').map((card) => card.getAttribute('data-story-id'));
    const name = language === 'hi' ? 'और खबरें देखें' : 'Load More Stories';
    expect(ids()).toEqual(rows.slice(0, 4).map((a) => a.id));
    const button = within(section).getByRole('button', { name });
    expect(button).toHaveAttribute('type', 'button');
    const user = userEvent.setup();
    button.focus();
    await user.keyboard('{Enter}');
    expect(ids()).toEqual(rows.slice(0, 8).map((a) => a.id));
    expect(button).toHaveFocus();
    await user.keyboard(' ');
    expect(ids()).toEqual(rows.map((a) => a.id));
    expect(within(section).queryByRole('button', { name })).not.toBeInTheDocument();
    for (const card of within(section).getAllByRole('article')) {
      expect(card).toHaveClass('hover:border-brand-500', 'focus-within:border-brand-500', 'border', 'rounded-editorial-lg');
      expect(card.className).not.toMatch(/border-2|translate|shadow/);
    }
  });
  it('shares the approved card and reveal treatment with other categories', () => {
    render(<CategorySection category={category} articles={stories} language="en" />);
    expect(screen.getByRole('button', { name: 'Load More Stories' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    for (const card of screen.getAllByRole('article')) expect(card).toHaveClass('hover:border-brand-500');
  });
  it.each([0, 1, 2, 3, 4, 5])('renders up to four real National cards for %i candidates', (count) => {
    const national = NEWS_CATEGORIES.find((c) => c.slug === 'national')!;
    const rows = stories.slice(0, count).map((a) => ({ ...a, category: 'National' }));
    const { container } = render(<CategorySection category={national} articles={[...rows, ...rows, stories[0]]} language="hi" />);
    expect(container.querySelectorAll('[data-story-id]')).toHaveLength(Math.min(count, 4));
    if (count) expect(container.querySelector('[data-story-id]')?.parentElement).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-4');
    else expect(container).toBeEmptyDOMElement();
    if (count > 4) expect(screen.getByRole('button', { name: 'और खबरें देखें' })).toBeInTheDocument();
    else expect(screen.queryByRole('button', { name: 'और खबरें देखें' })).not.toBeInTheDocument();
  });
  it.each(['en', 'hi'] as const)('preserves National story metadata and real utility destinations in %s', (language) => {
    const national = NEWS_CATEGORIES.find((c) => c.slug === 'national')!;
    const article = { ...stories[0], category: 'National', slug: 'national-canonical' };
    render(<CategorySection category={national} articles={[article]} language={language} />);
    const section = screen.getByTestId('home-category-national');
    const card = within(section).getByRole('article');
    const controls = within(card);
    expect(controls.getByRole('heading', { level: 3 })).toHaveTextContent(article.title);
    expect(controls.getByRole('heading', { level: 3 })).toHaveClass('line-clamp-3', 'leading-relaxed');
    expect(controls.getByRole('img')).toHaveAttribute('src', article.image);
    expect(card.querySelector('time')).toHaveAttribute('datetime', article.publishedAt);
    expect(card.querySelector('time')).toHaveTextContent('01/01/26');
    expect(controls.getByText(language === 'hi' ? national.name : national.nameEn)).toBeInTheDocument();
    const paper = controls.getByRole('link', { name: language === 'hi' ? 'ई-पेपर देखें' : 'Browse E-Paper' });
    expect(paper).toHaveAttribute('href', '/main/epaper');
    const share = controls.getByRole('link', { name: language === 'hi' ? 'व्हाट्सऐप पर साझा करें' : 'Share on WhatsApp' });
    expect(new URL(share.getAttribute('href')!).searchParams.get('text')).toContain('https://lokswami.com/main/article/national-canonical');
    expect(share).toHaveAttribute('target', '_blank');
    expect(share).toHaveAttribute('rel', 'noopener noreferrer');
    expect(share.querySelector('[data-brand-icon="whatsapp"]')).toBeInTheDocument();
    expect(paper.parentElement).toBe(share.parentElement);
    expect(paper.closest('a')?.parentElement?.closest('a')).toBeNull();
    expect(within(section).getByRole('link', { name: language === 'hi' ? 'सभी देखें' : 'View All' })).toHaveAttribute('href', '/main/category/national');
    expect(card.querySelector('a')).toHaveAttribute('href', '/main/article/national-canonical');
    share.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(share);
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'share_click', source: 'homepage_top', metadata: expect.objectContaining({ placement: 'national', contentId: article.id }) }));
  });
  it.each([0, 1, 2, 3, 4, 5])('renders %i Regional candidates with honest cardinality', (count) => {
    const { container } = render(<CategorySection category={category} articles={stories.slice(0, count)} language="hi" />);
    expect(container.querySelectorAll('[data-story-id]').length).toBe(Math.min(count, 4));
    if (!count) expect(container).toBeEmptyDOMElement();
  });
  it('starts at four and rejects unrelated category items', () => {
    const { container } = render(<CategorySection category={category} articles={[...stories, { ...stories[0], id: 'foreign', category: 'Politics' }]} language="en" />);
    expect(container.querySelectorAll('[data-story-id]')).toHaveLength(4);
    expect(container.querySelector('[data-story-id="foreign"]')).toBeNull();
  });
  it('rejects a duplicate canonical destination even when its source IDs differ', () => {
    const { container } = render(<CategorySection category={category} articles={[stories[0], { ...stories[0], id: 'different-id' }]} language="en" />);
    expect(container.querySelectorAll('[data-story-id]')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('server renders canonical category/article anchors without viewport gating', () => {
    const html = renderToString(<CategorySection category={category} articles={stories.slice(0, 2)} language="hi" />);
    expect(html).toContain('href="/main/category/regional"');
    expect(html).toContain('href="/main/article/news-0"');
    expect(html).toContain('href="/main/article/news-1"');
  });
  it.each(HOMEPAGE_CATEGORY_MODULES)('uses canonical %s sources/routes and the shared four-card template', (slug) => {
    const selected = resolveNewsCategory(slug)!;
    const rows = stories.map((a) => ({ ...a, id: `${slug}-${a.id}`, slug: `${slug}-${a.id}`, category: selected.nameEn }));
    const { container } = render(<CategorySection category={selected} articles={[...rows, rows[0], { ...rows[0], id: 'foreign', category: 'Regional' }]} language="en" />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(4);
    expect(cards.map(c => c.getAttribute('data-story-id'))).toEqual(rows.slice(0, 4).map(a => a.id));
    expect(screen.getByRole('link', { name: 'View All' })).toHaveAttribute('href', `/main/category/${slug}`);
    expect(container.querySelector('article')?.parentElement).toHaveClass('md:grid-cols-2', 'xl:grid-cols-4');
    fireEvent.click(screen.getByRole('button', { name: 'Load More Stories' }));
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
