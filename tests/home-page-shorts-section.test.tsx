import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomeShortsSection from '@/components/video/HomeShortsSection';
import type { HomePageShortItem } from '@/lib/content/homeFeed';

vi.mock('@/components/ui/ReaderImage', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} data-testid="mock-reader-image" />
  ),
}));

describe('HomeShortsSection Responsive Behavior', () => {
  const sampleShorts: HomePageShortItem[] = [
    {
      id: 'short-1',
      title: 'इंदौर मेट्रो का नया ट्रायल रन सफल',
      thumbnail: '/metro.jpg',
      duration: 42,
      category: 'Regional',
      publishedAt: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'short-2',
      title: 'अब बिल में पारदर्शिता का वादा, स्मार्ट मीटर',
      thumbnail: '/meter.jpg',
      duration: 54,
      category: 'National',
      publishedAt: '2026-03-02T10:00:00.000Z',
    },
    {
      id: 'short-3',
      title: 'महाकाल लोक उज्जैन: संध्या आरती दृश्य',
      thumbnail: '/mahakal.jpg',
      duration: 48,
      category: 'State',
      publishedAt: '2026-03-03T10:00:00.000Z',
    },
  ];

  it('renders section container, header, and View All link', () => {
    render(<HomeShortsSection shorts={sampleShorts} language="hi" />);

    expect(screen.getByTestId('home-shorts-section')).toBeInTheDocument();
    expect(screen.getByText('लोकस्वामी शॉर्ट्स')).toBeInTheDocument();
    const viewAllLink = screen.getByRole('link', { name: /सभी देखें/i });
    expect(viewAllLink).toHaveAttribute('href', '/main/videos');
  });

  it('enforces 2 vertical videos on mobile, 3 on tablet, and 3 on desktop via responsive grid classes', () => {
    const { container } = render(<HomeShortsSection shorts={sampleShorts} language="hi" />);

    // Check responsive grid container: 2 cols on mobile, 3 on tablet (sm:), 3 on desktop (lg:)
    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toHaveClass('grid-cols-2');
    expect(gridContainer).toHaveClass('sm:grid-cols-3');
    expect(gridContainer).toHaveClass('lg:grid-cols-3');

    const cards = screen.getAllByTestId('home-short-card');
    expect(cards).toHaveLength(3);

    // Cards 0 and 1 are always visible (no standalone hidden class)
    expect(cards[0].classList.contains('hidden')).toBe(false);
    expect(cards[1].classList.contains('hidden')).toBe(false);

    // Card 2 (3rd video) is hidden on mobile and shown on tablet/desktop (hidden sm:block)
    expect(cards[2].classList.contains('hidden')).toBe(true);
    expect(cards[2].classList.contains('sm:block')).toBe(true);
  });

  it('links each short card to the video page with direct playback parameter', () => {
    render(<HomeShortsSection shorts={sampleShorts} language="hi" />);

    const cards = screen.getAllByTestId('home-short-card');
    expect(cards[0]).toHaveAttribute('href', '/main/videos?video=short-1');
    expect(cards[1]).toHaveAttribute('href', '/main/videos?video=short-2');
    expect(cards[2]).toHaveAttribute('href', '/main/videos?video=short-3');
  });

  it('renders English copy when language is set to en', () => {
    render(<HomeShortsSection shorts={sampleShorts} language="en" />);

    expect(screen.getByText('Lokswami Shorts')).toBeInTheDocument();
    expect(screen.getByText('View All')).toBeInTheDocument();
  });

  it('keeps the Shorts heading clean without the marked lightning icon', () => {
    render(<HomeShortsSection shorts={sampleShorts} language="en" />);
    const heading = screen.getByRole('heading', { name: 'Lokswami Shorts' });
    expect(heading.parentElement?.querySelector('svg')).toBeNull();
  });

  it('does not render categories, duration badges, timestamps, or trending pill', () => {
    render(<HomeShortsSection shorts={sampleShorts} language="hi" />);

    // Categories must not be displayed
    expect(screen.queryByText('#Regional')).not.toBeInTheDocument();
    expect(screen.queryByText('#National')).not.toBeInTheDocument();
    expect(screen.queryByText('#State')).not.toBeInTheDocument();

    // Trending pill must not be displayed
    expect(screen.queryByText(/ट्रेंडिंग/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trending/i)).not.toBeInTheDocument();

    // Duration and date/time must not be displayed
    expect(screen.queryByText('00:42')).not.toBeInTheDocument();
    expect(screen.queryByText('00:54')).not.toBeInTheDocument();
  });

  it('links to /main/shorts/[slug] when a short has a slug', () => {
    const shortsWithSlugs: HomePageShortItem[] = [
      {
        id: 'short-1',
        slug: 'indore-metro-trial-run',
        title: 'इंदौर मेट्रो का नया ट्रायल रन सफल',
        thumbnail: '/metro.jpg',
        duration: 42,
        category: 'Regional',
        publishedAt: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'short-2',
        title: 'बिना स्लग वाला शॉर्ट',
        thumbnail: '/meter.jpg',
        duration: 54,
        category: 'National',
        publishedAt: '2026-03-02T10:00:00.000Z',
      },
    ];

    render(<HomeShortsSection shorts={shortsWithSlugs} language="hi" />);

    const cards = screen.getAllByTestId('home-short-card');
    expect(cards[0]).toHaveAttribute('href', '/main/shorts/indore-metro-trial-run');
    expect(cards[1]).toHaveAttribute('href', '/main/videos?video=short-2');
  });
});
