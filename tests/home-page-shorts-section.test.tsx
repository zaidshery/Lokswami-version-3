import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import HomeShortsSection from '@/components/video/HomeShortsSection';
import type { HomePageShortItem } from '@/lib/content/homeFeed';

vi.mock('@/components/ui/ReaderImage', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
const shorts: HomePageShortItem[] = Array.from({ length: 4 }, (_, i) => ({
  id: `short-${i}`, slug: `real-short-${i}`, title: `हिन्दी शॉर्ट ${i}`,
  thumbnail: '/poster.jpg', duration: 42, category: 'Regional', publishedAt: '2026-01-01',
}));

describe('real-only Homepage Shorts previews', () => {
  it.each([0, 1, 2, 3, 4])('renders %i real previews capped at three without backfill', (count) => {
    const { container } = render(<HomeShortsSection shorts={shorts.slice(0, count)} language="hi" />);
    expect(screen.queryAllByTestId('home-short-card')).toHaveLength(Math.min(count, 3));
    if (!count) expect(container).toBeEmptyDOMElement();
    expect(container.querySelector('video, iframe, audio')).toBeNull();
  });
  it('leaves the third item reachable on a native mobile scroll rail', () => {
    render(<HomeShortsSection shorts={shorts} language="hi" />);
    const rail = screen.getByTestId('home-shorts-rail');
    expect(rail.className).toContain('overflow-x-auto');
    expect(rail.className).toContain('auto-cols-[calc((100%_-_0.75rem)/2)]');
    expect(rail.className).toContain('md:grid-cols-3');
    expect(rail).toHaveAttribute('data-swipe-ignore', 'true');
    for (const card of screen.getAllByTestId('home-short-card')) expect(card.className).not.toContain('hidden');
  });
  it('server renders canonical Short paths and retains the legacy ID helper fallback', () => {
    const html = renderToString(<HomeShortsSection shorts={shorts} language="en" />);
    expect(html).toContain('href="/main/shorts/real-short-0"');
    render(<HomeShortsSection shorts={[{ ...shorts[0], slug: undefined }]} language="en" />);
    expect(screen.getByTestId('home-short-card')).toHaveAttribute('href', '/main/videos?video=short-0');
    expect(screen.getByRole('link', { name: 'View All' })).toHaveAttribute('href', '/main/videos');
  });
  it('does not invent posters or fill incomplete/duplicate records with demo stories', () => {
    render(<HomeShortsSection shorts={[shorts[0], shorts[0], { ...shorts[1], thumbnail: '' }, { ...shorts[2], title: '' }]} language="hi" />);
    expect(screen.getAllByTestId('home-short-card')).toHaveLength(1);
    expect(screen.queryByText(/महाकाल लोक|स्मार्ट मीटर|ट्रायल रन/)).not.toBeInTheDocument();
  });
});
