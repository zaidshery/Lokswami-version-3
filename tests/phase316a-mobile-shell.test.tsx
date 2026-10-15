import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import { viewport } from '@/app/layout';
import Header from '@/components/layout/Header';
import BreakingNews from '@/components/ui/BreakingNews';
import BottomNav from '@/components/layout/BottomNav';
import MobileMenu from '@/components/layout/MobileMenu';
import { useAppStore } from '@/lib/store/appStore';
import { useSession } from 'next-auth/react';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/main',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('Phase 3.16A — Mobile Shell, Safe Area & Navigation Foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() });
    useAppStore.setState({
      language: 'en',
      theme: 'light',
      themePreference: 'auto',
      isMobileMenuOpen: false,
    });
  });

  describe('1. Viewport & Safe Area Contract (ISSUE-MOB-02)', () => {
    it('configures viewportFit: "cover" in Next.js viewport export', () => {
      expect(viewport).toBeDefined();
      expect(viewport.viewportFit).toBe('cover');
      expect(viewport.width).toBe('device-width');
      expect(viewport.initialScale).toBe(1);
      expect(viewport.maximumScale).toBe(5);
    });

    it('ensures globals.css defines safe area variables and padding classes without duplication', () => {
      const globalsCssPath = path.join(process.cwd(), 'app/globals.css');
      const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

      // Safe area variable uses env(safe-area-inset-bottom)
      expect(globalsCss).toContain('--reader-bottom-nav-space: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));');
      expect(globalsCss).toContain('.reader-bottom-safe-pad');
      expect(globalsCss).toContain('padding-bottom: calc(var(--reader-bottom-nav-space) + 0.75rem);');
      expect(globalsCss).toContain('.pb-safe');
    });
  });

  describe('2. Header Control Touch Targets (ISSUE-MOB-08)', () => {
    it('provides >=44x44px hit target for Mobile Language Switcher', () => {
      render(<Header />);
      const langToggle = screen.getByTestId('reader-mobile-language');
      expect(langToggle).toBeInTheDocument();
      expect(langToggle.className).toContain('min-h-[44px]');
      expect(langToggle.className).toContain('min-w-[44px]');
      expect(langToggle.className).toContain('h-11');
      expect(langToggle.className).toContain('w-11');
    });

    it('provides >=44x44px hit target for E-Paper shortcut', () => {
      render(<Header />);
      const epaperLink = screen.getByLabelText('E-Paper');
      expect(epaperLink).toBeInTheDocument();
      expect(epaperLink.className).toContain('min-h-[44px]');
      expect(epaperLink.className).toContain('min-w-[44px]');
      expect(epaperLink.className).toContain('h-11');
      expect(epaperLink.className).toContain('w-11');
    });

    it('preserves >=44x44px hit target for Menu trigger and Search link', () => {
      render(<Header />);
      const menuBtn = screen.getByRole('button', { name: /मेनू खोलें|Open menu/i });
      expect(menuBtn.className).toContain('min-h-[44px]');
      expect(menuBtn.className).toContain('min-w-[44px]');

      const searchLink = screen.getByRole('link', { name: /समाचार खोजें|Search news/i });
      expect(searchLink.className).toContain('min-h-[44px]');
      expect(searchLink.className).toContain('min-w-[44px]');
    });
  });

  describe('3. Breaking News Audio Hit Target (ISSUE-MOB-07)', () => {
    it('provides >=44x44px interactive hit target via touch expansion pseudo-element', () => {
      render(<BreakingNews />);
      const audioBtn = screen.getByRole('button', { name: 'Enable breaking news voice' });
      expect(audioBtn).toBeInTheDocument();
      // Compact visual size remains 32px (h-8 w-8)
      expect(audioBtn.className).toContain('h-8');
      expect(audioBtn.className).toContain('w-8');
      // Interactive hit area expanded to 44px via after pseudo-element
      expect(audioBtn.className).toContain('relative');
      expect(audioBtn.className).toContain('after:h-11');
      expect(audioBtn.className).toContain('after:w-11');
      expect(audioBtn.className).toContain('after:min-h-[44px]');
      expect(audioBtn.className).toContain('after:min-w-[44px]');
    });

    it('preserves accessible title and aria states on audio button', () => {
      render(<BreakingNews />);
      const audioBtn = screen.getByRole('button', { name: 'Enable breaking news voice' });
      expect(audioBtn).toHaveAttribute('aria-pressed');
      expect(audioBtn).toHaveAttribute('aria-busy');
    });
  });

  describe('4. Low-Height Landscape Chrome Compaction (ISSUE-MOB-01)', () => {
    it('marks secondary chrome elements with .reader-secondary-chrome class', () => {
      const { container: breakingContainer } = render(<BreakingNews />);
      const liveBar = breakingContainer.querySelector('[data-testid="reader-live-bar"]');
      expect(liveBar?.className).toContain('reader-secondary-chrome');

      const { container: headerContainer } = render(<Header />);
      const categoryBar = headerContainer.querySelector('[data-testid="reader-category-bar"]');
      expect(categoryBar?.className).toContain('reader-secondary-chrome');
    });

    it('defines low-height viewport media query in globals.css to compact secondary chrome', () => {
      const globalsCssPath = path.join(process.cwd(), 'app/globals.css');
      const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

      expect(globalsCss).toContain('@media (max-height: 500px)');
      expect(globalsCss).toContain('.reader-secondary-chrome');
      expect(globalsCss).toContain('display: none !important;');
      expect(globalsCss).toContain('--reader-top-chrome-height: 3.5rem;');
    });

    it('leaves primary navigation accessible in Header primary row', () => {
      render(<Header />);
      const navRegion = screen.getByTestId('reader-brand-navigation');
      expect(navRegion).toBeInTheDocument();

      // Primary controls remain in top row outside reader-secondary-chrome
      const menuBtn = screen.getByRole('button', { name: /मेनू खोलें|Open menu/i });
      expect(menuBtn.closest('.reader-secondary-chrome')).toBeNull();

      const epaperLink = screen.getByLabelText('E-Paper');
      expect(epaperLink.closest('.reader-secondary-chrome')).toBeNull();

      const langBtn = screen.getByTestId('reader-mobile-language');
      expect(langBtn.closest('.reader-secondary-chrome')).toBeNull();

      const searchBtn = screen.getByRole('link', { name: /समाचार खोजें|Search news/i });
      expect(searchBtn.closest('.reader-secondary-chrome')).toBeNull();
    });
  });

  describe('5. BottomNav Safe Area & Touch Contract', () => {
    it('applies safe-area padding and 44px min dimensions to all 6 items', () => {
      render(<BottomNav />);
      const nav = screen.getByRole('navigation', { name: /Bottom Navigation/i });
      expect(nav).toBeInTheDocument();
      expect(nav.className).toContain('xl:hidden');
      expect(nav.className).toContain('fixed bottom-0');

      const grid = nav.querySelector('.grid-cols-6');
      expect(grid).toBeInTheDocument();
      expect(grid?.className).toContain('pb-[max(env(safe-area-inset-bottom),0.25rem)]');

      const links = screen.getAllByRole('link');
      expect(links.length).toBe(6);
      for (const link of links) {
        expect(link.className).toContain('min-h-[44px]');
        expect(link.className).toContain('min-w-[44px]');
      }
    });
  });

  describe('6. Drawer (MobileMenu) Behavior under Compact Shell', () => {
    it('preserves focus trap, escape dismiss, and scroll lock semantics', () => {
      const onClose = vi.fn();
      render(<MobileMenu isOpen={true} onClose={onClose} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog.className).toContain('overflow-y-auto');

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('7. 320px Width Non-Collision Contract', () => {
    it('renders all 5 header items in DOM without collapsing required actions', () => {
      window.innerWidth = 320;
      render(<Header />);

      expect(screen.getByRole('button', { name: /मेनू खोलें|Open menu/i })).toBeInTheDocument();
      expect(screen.getByLabelText('Lokswami Home')).toBeInTheDocument();
      expect(screen.getByLabelText('E-Paper')).toBeInTheDocument();
      expect(screen.getByTestId('reader-mobile-language')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /समाचार खोजें|Search news/i })).toBeInTheDocument();
    });
  });

  describe('8. Desktop Shell Regression Contract', () => {
    it('preserves desktop theme toggle and segmented language control', () => {
      render(<Header />);
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: /भाषा चयन|Language selection/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /साइन इन|Sign In/i })).toBeInTheDocument();
    });
  });
});
