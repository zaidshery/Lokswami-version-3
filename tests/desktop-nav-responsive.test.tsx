import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DesktopNav from '@/components/layout/DesktopNav';
import { HOMEPAGE_NAVIGATION, READER_NAVIGATION } from '@/lib/constants/readerNavigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/main',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('DesktopNav responsive visibility', () => {
  it('E-Paper and E-Magazine links are exposed across viewports', () => {
    render(<DesktopNav />);

    const epaperLink = screen.getByRole('link', {
      name: new RegExp(`${READER_NAVIGATION.epaper.name}|${READER_NAVIGATION.epaper.nameEn}`, 'i'),
    });
    expect(epaperLink).toBeInTheDocument();
    expect(epaperLink).toHaveAttribute('href', '/main/epaper');
    expect(epaperLink.className).not.toContain('hidden');

    const emagazineLink = screen.getByRole('link', {
      name: new RegExp(`${READER_NAVIGATION.emagazine.name}|${READER_NAVIGATION.emagazine.nameEn}`, 'i'),
    });
    expect(emagazineLink).toBeInTheDocument();
    expect(emagazineLink).toHaveAttribute('href', '/main/e-magazine');
    expect(emagazineLink.className).not.toContain('hidden');
  });

  it('Home and Elections links remain visible across all viewports (inline-flex without hidden)', () => {
    render(<DesktopNav />);

    const homeLink = screen.getByRole('link', {
      name: new RegExp(`${READER_NAVIGATION.home.name}|${READER_NAVIGATION.home.nameEn}`, 'i'),
    });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/main');
    expect(homeLink.className).toContain('inline-flex');
    expect(homeLink.className).not.toContain('hidden lg:inline-flex');

    const electionsLink = screen.getByRole('link', {
      name: new RegExp(`${READER_NAVIGATION.elections.name}|${READER_NAVIGATION.elections.nameEn}`, 'i'),
    });
    expect(electionsLink).toBeInTheDocument();
    expect(electionsLink).toHaveAttribute('href', '/main/elections');
    expect(electionsLink.className).toContain('inline-flex');
    expect(electionsLink.className).not.toContain('hidden lg:inline-flex');
  });

  it('renders the supported owner taxonomy in canonical order without fake routes', () => {
    render(<DesktopNav />);

    const videoLink = screen.getByRole('link', {
      name: /वीडियो|Video/i,
    });
    expect(videoLink).toBeInTheDocument();
    expect(videoLink).toHaveAttribute('href', '/main/videos');
    expect(videoLink.className).not.toContain('hidden');
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      HOMEPAGE_NAVIGATION.filter((item) => !item.children).map((item) => item.href)
    );
    expect(Array.from(screen.getByRole('navigation').children).map((item) => item.textContent)).toEqual(HOMEPAGE_NAVIGATION.map((item) => item.name));
    expect(screen.getByRole('button', { name: 'राज्य' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'अन्य' })).toHaveAttribute('aria-expanded', 'false');
  });
});
