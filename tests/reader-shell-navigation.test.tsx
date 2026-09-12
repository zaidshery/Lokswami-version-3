import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import { isReaderNavigationActive } from '@/lib/constants/readerNavigation';
import DesktopNav from '@/components/layout/DesktopNav';
import BottomNav from '@/components/layout/BottomNav';
import MobileMenu from '@/components/layout/MobileMenu';
import Header from '@/components/layout/Header';
import BreakingNews from '@/components/ui/BreakingNews';

// Mock next/navigation
const mockPathname = vi.fn(() => '/main');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

// Mock zustand store
const mockSetLanguage = vi.fn();
const mockToggleMobileMenu = vi.fn();
const mockSetMobileMenuOpen = vi.fn();

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({
    language: 'hi',
    setLanguage: mockSetLanguage,
    isMobileMenuOpen: false,
    toggleMobileMenu: mockToggleMobileMenu,
    setMobileMenuOpen: mockSetMobileMenuOpen,
    isImmersiveVideoMode: false,
    isEpaperReaderOpen: false,
    isMobile: false,
    isTablet: false,
    setIsMobile: vi.fn(),
    setIsTablet: vi.fn(),
  }),
}));

describe('Phase 3.3: Reader Shell & Navigation Contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/main');
  });

  describe('1. Active Route Matching (isReaderNavigationActive)', () => {
    it('matches root paths / and /main interchangeably', () => {
      expect(isReaderNavigationActive('/', '/main')).toBe(true);
      expect(isReaderNavigationActive('/main', '/')).toBe(true);
      expect(isReaderNavigationActive('/main', '/main')).toBe(true);
      expect(isReaderNavigationActive('/', '/')).toBe(true);
    });

    it('sanitizes query parameters and trailing slashes', () => {
      expect(isReaderNavigationActive('/main/epaper?view=grid', '/main/epaper')).toBe(true);
      expect(isReaderNavigationActive('/main/epaper/', '/main/epaper')).toBe(true);
      expect(isReaderNavigationActive('/main/epaper', '/main/epaper/')).toBe(true);
    });

    it('matches child category routes under parent prefix', () => {
      expect(isReaderNavigationActive('/main/category/politics/assembly', '/main/category/politics')).toBe(true);
      expect(isReaderNavigationActive('/main/category/sports/cricket', '/main/category/sports')).toBe(true);
    });

    it('prevents substring false positive matches', () => {
      // /main/news should NOT activate /main/newsletter
      expect(isReaderNavigationActive('/main/news', '/main/newsletter')).toBe(false);
      expect(isReaderNavigationActive('/main/newsletter', '/main/news')).toBe(false);
      // /main/account should NOT activate /main/accounting
      expect(isReaderNavigationActive('/main/accounting', '/main/account')).toBe(false);
    });
  });

  describe('2. DesktopNav Information Architecture & More Menu', () => {
    it('renders primary editorial navigation items', () => {
      render(<DesktopNav />);
      expect(screen.getByRole('link', { name: /होम/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /ताज़ा खबरें/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /चुनाव/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /राजनीति/i })).toBeInTheDocument();
    });

    it('renders desktop product links with hidden lg:inline-flex', () => {
      render(<DesktopNav />);
      const epaperLink = screen.getByRole('link', { name: /ई-पेपर/i });
      expect(epaperLink.className).toContain('hidden lg:inline-flex');
    });

    it('renders accessible More menu with proper ARIA contract and keyboard support', () => {
      render(<DesktopNav />);
      const moreButton = screen.getByRole('button', { name: /अन्य/i });
      expect(moreButton).toHaveAttribute('aria-haspopup', 'true');
      expect(moreButton).toHaveAttribute('aria-expanded', 'false');

      // Open dropdown
      fireEvent.click(moreButton);
      expect(moreButton).toHaveAttribute('aria-expanded', 'true');

      // Secondary links appear as links
      const techLink = screen.getByRole('link', { name: /टेक|tech/i });
      expect(techLink).toBeInTheDocument();
      expect(techLink).toHaveAttribute('href', '/main/category/technology');

      // Escape closes the menu
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(moreButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('highlights active item with aria-current="page"', () => {
      mockPathname.mockReturnValue('/main/elections');
      render(<DesktopNav />);
      const electionsLink = screen.getByRole('link', { name: /चुनाव/i });
      expect(electionsLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('3. BottomNav Accessible Typography and Touch Targets', () => {
    it('renders navigation links with min >=44x44px touch targets', () => {
      render(<BottomNav />);
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(5);

      links.forEach((link) => {
        expect(link.className).toContain('min-h-[44px]');
        expect(link.className).toContain('min-w-[44px]');
      });
    });

    it('uses accessible typography (>=11px) and avoids legacy 8.5px micro-text', () => {
      render(<BottomNav />);
      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        expect(link.className).not.toContain('text-[8.5px]');
        // Verify label element has >=11px
        const label = link.querySelector('span');
        expect(label?.className).toContain('text-[11px]');
      });
    });

    it('renders non-color active dot indicator when item is active', () => {
      mockPathname.mockReturnValue('/main');
      const { container } = render(<BottomNav />);
      const activeDot = container.querySelector('span[aria-hidden="true"].rounded-full');
      expect(activeDot).toBeInTheDocument();
    });
  });

  describe('4. MobileMenu Focus Management and Touch Targets', () => {
    it('renders dialog with aria-modal="true" and >=44x44 close target', () => {
      const onClose = vi.fn();
      render(<MobileMenu isOpen={true} onClose={onClose} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');

      const closeButton = screen.getByRole('button', { name: /मेनू बंद करें/i });
      expect(closeButton.className).toContain('min-h-[44px]');
      expect(closeButton.className).toContain('min-w-[44px]');
    });

    it('provides >=44x44 touch targets for language switch buttons', () => {
      render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
      const hindiBtn = screen.getByRole('button', { name: 'हिन्दी' });
      const englishBtn = screen.getByRole('button', { name: 'English' });

      expect(hindiBtn.className).toContain('min-h-[44px]');
      expect(englishBtn.className).toContain('min-h-[44px]');
    });
  });

  describe('5. Header Controls and Search Entry', () => {
    it('renders semantic search entry button with >=44x44 touch target', () => {
      render(<Header />);
      const searchButton = screen.getByRole('link', { name: /समाचार खोजें|खोजें/i });
      expect(searchButton).toBeInTheDocument();
      expect(searchButton).toHaveAttribute('href', '/main/search');
      expect(searchButton.className).toContain('min-h-[44px]');
      expect(searchButton.className).toContain('min-w-[44px]');
    });

    it('renders mobile menu trigger with aria-controls and aria-expanded', () => {
      render(<Header />);
      const menuTrigger = screen.getByRole('button', { name: /मेनू खोलें|open menu/i });
      expect(menuTrigger).toBeInTheDocument();
      expect(menuTrigger).toHaveAttribute('aria-controls', 'mobile-drawer');
      expect(menuTrigger.className).toContain('min-h-[44px]');
      expect(menuTrigger.className).toContain('min-w-[44px]');
    });
  });

  describe('6. BreakingNews Layout Contract', () => {
    it('uses relative positioning in normal sticky flow instead of fixed', () => {
      const { container } = render(<BreakingNews />);
      const alertContainer = container.querySelector('[role="region"]');
      if (alertContainer) {
        expect(alertContainer.className).not.toContain('fixed left-0');
        expect(alertContainer.className).toContain('relative');
      }
    });

    it('provides >=44x44 voice toggle target', () => {
      render(<BreakingNews />);
      const voiceButtons = screen.queryAllByRole('button', { name: /वॉइस/i });
      if (voiceButtons.length > 0) {
        expect(voiceButtons[0].className).toContain('min-h-[44px]');
        expect(voiceButtons[0].className).toContain('min-w-[44px]');
      }
    });
  });

  describe('7. Reader Layout Source Code Contract (No Magic Offsets & No Gesture Wrapper)', () => {
    const layoutPath = path.join(process.cwd(), 'app/(reader)/main/layout.tsx');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');

    it('contains accessible Skip Link targeting #main-content', () => {
      expect(layoutSource).toContain('href="#main-content"');
      expect(layoutSource).toContain('id="main-content"');
    });

    it('wraps BreakingNews and Header inside unified sticky container', () => {
      expect(layoutSource).toMatch(/sticky top-0 z-40/);
    });

    it('completely eliminates fragile pt-[8rem], sm:pt-[8.5rem], and md:pt-[9rem]', () => {
      expect(layoutSource).not.toContain('pt-[8rem]');
      expect(layoutSource).not.toContain('sm:pt-[8.5rem]');
      expect(layoutSource).not.toContain('md:pt-[9rem]');
    });

    it('does not wrap main with MobileSwipeTabs (UX-002 resolution)', () => {
      expect(layoutSource).not.toContain('<MobileSwipeTabs');
      expect(layoutSource).not.toContain('</MobileSwipeTabs>');
    });
  });
});
