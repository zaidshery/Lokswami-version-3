import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '@/components/layout/Header';
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

describe('Responsive Header & Language Refinement Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() });
    useAppStore.setState({
      language: 'hi',
      theme: 'light',
      themePreference: 'auto',
      isMobileMenuOpen: false,
    });
  });

  describe('Unified brand and category layers', () => {
    it('balances the mobile brand without reducing the menu touch target', () => {
      render(<Header />);
      const menu = screen.getByRole('button', { name: /Open menu|मेनू खोलें/i });
      expect(menu.className).toContain('min-w-[44px]');
      expect(menu.className).toContain('min-h-[44px]');
      expect(menu.querySelector('svg')?.classList.contains('h-[25.5px]')).toBe(true);
      expect(menu.querySelector('svg')?.classList.contains('md:h-5')).toBe(true);
      const home = screen.getByLabelText('Lokswami Home');
      expect(home.querySelector('[data-logo-element="icon"] img')?.classList.contains('max-md:top-[1.5px]')).toBe(true);
      const root = home.querySelector('[data-logo-root]')!;
      expect(root.className).toContain('[--reader-logo-icon:20px]');
      expect(root.className).toContain('[--reader-logo-wordmark:94px]');
      expect(root.className).toContain('[--reader-logo-gap:4px]');
      for (const element of ['icon', 'wordmark']) {
        expect(home.querySelector(`[data-logo-element="${element}"]`)?.parentElement?.className).toContain('max-md:items-center');
      }
    });
    it('strengthens the desktop hamburger and caps the smaller desktop logo', () => {
      render(<Header />);
      const menu = screen.getByRole('button', { name: /मेनू खोलें|Open menu/i });
      expect(menu.className).toContain('lg:min-w-[48px]');
      expect(menu.className).toContain('lg:min-h-[48px]');
      expect(menu.querySelector('svg')).toHaveAttribute('stroke-width', '2.3');
      expect(menu.querySelector('svg')?.classList.contains('lg:h-6')).toBe(true);
      const logo = screen.getByLabelText('Lokswami Home').querySelector('[data-logo-root]')!;
      expect(logo.className).toContain('lg:[--reader-logo-icon:40px]');
      expect(logo.className).toContain('lg:[--reader-logo-wordmark:186px]');
    });
    it.each([320, 390, 768, 1024, 1440])('keeps required controls in the same DOM at %i pixels', (width) => {
      window.innerWidth = width;
      render(<Header />);
      const menu = screen.getByRole('button', { name: /मेनू खोलें|Open menu/i });
      expect(menu).toHaveAttribute('aria-controls', 'mobile-drawer');
      expect(menu.className).not.toContain('hidden');
      expect(screen.getByLabelText('Lokswami Home')).toHaveAttribute('href', '/main');
      const epaper = screen.getByLabelText('E-Paper');
      expect(epaper).toHaveAttribute('href', '/main/epaper');
      expect(epaper.className).not.toContain('hidden');
      const language = screen.getByTestId('reader-mobile-language');
      expect(language).toHaveTextContent('HI');
      expect(language.className).toContain('md:hidden');
      expect(screen.getByRole('link', { name: /समाचार खोजें|Search news/i })).toHaveAttribute('href', '/main/search');
      const strip = screen.getByTestId('reader-category-bar').querySelector('.reader-scroll-x')!;
      expect(strip.className).toContain('overflow-x-auto');
      expect(strip).toHaveAttribute('data-swipe-ignore', 'true');
      expect(screen.getByRole('navigation').className).not.toContain('flex-wrap');
    });

    it('changes language and opens the drawer from directly available controls', () => {
      render(<Header />);
      const en = screen.getByRole('button', { name: /Select English language/i });
      fireEvent.click(en);
      expect(useAppStore.getState().language).toBe('en');
      expect(en).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(useAppStore.getState().isMobileMenuOpen).toBe(true);
    });

    it('uses one mobile language action that toggles both directions', () => {
      render(<Header />);
      const toggle = screen.getByTestId('reader-mobile-language');
      expect(toggle).toHaveAccessibleName('Language: HI. Switch to English');
      fireEvent.click(toggle);
      expect(toggle).toHaveTextContent('EN');
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(useAppStore.getState().language).toBe('en');
      fireEvent.click(toggle);
      expect(useAppStore.getState().language).toBe('hi');
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(toggle.querySelector('svg')).toBeInTheDocument();
      expect(toggle.className).toContain('h-11');
      expect(toggle.className).toContain('w-[42px]');
    });

    it('uses the canonical proportional wordmark and compact mobile E-Paper action', () => {
      render(<Header />);
      const home = screen.getByLabelText('Lokswami Home');
      const logo = home.querySelector('[data-logo-element="wordmark"] img')!;
      const emblem = home.querySelector('[data-logo-element="icon"] img')!;
      expect(emblem.getAttribute('src')).toContain('logo-header-cutout.png');
      expect(home.querySelector('[data-logo-root]')).toBeInTheDocument();
      expect(logo.getAttribute('src')).toContain('logo-wordmark-final.png');
      expect(logo).toHaveAttribute('width', '847');
      expect(logo).toHaveAttribute('height', '181');
      expect(logo.className).toContain('h-auto');
      expect(logo.closest('[data-logo-element="wordmark"]')).toHaveStyle({ width: 'var(--reader-logo-wordmark)' });
      const epaper = screen.getByLabelText('E-Paper');
      expect(epaper.querySelector('svg')).toBeInTheDocument();
      expect(epaper.querySelector('span')).toHaveTextContent('ePaper');
      expect(epaper.querySelector('span')?.className).toContain('md:hidden');
      expect(epaper.className).toContain('flex-col');
      expect(epaper.className).toContain('h-11');
      expect(epaper.className).toContain('md:bg-brand-500');
    });

    it('preserves desktop account and theme actions', () => {
      render(<Header />);
      expect(screen.getByRole('link', { name: /साइन इन|Sign In/i })).toHaveAttribute('href', '/signin');
      fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
      expect(useAppStore.getState().theme).toBe('dark');
    });
  });

  describe('5. Mobile Drawer (MobileMenu) Organization and Preferences', () => {
    it('organizes drawer in exact requested conceptual order', () => {
      render(<MobileMenu isOpen={true} onClose={vi.fn()} />);

      // 1. Language switcher with full [ हिन्दी ] [ English ]
      const hindiBtn = screen.getByRole('button', { name: 'हिन्दी' });
      const englishBtn = screen.getByRole('button', { name: 'English' });
      expect(hindiBtn).toBeInTheDocument();
      expect(englishBtn).toBeInTheDocument();
      expect(hindiBtn.className).toContain('min-h-[44px]');
      expect(englishBtn.className).toContain('min-h-[44px]');

      // 2. Categories heading
      expect(screen.getByText(/श्रेणियाँ|Categories/i)).toBeInTheDocument();

      // 3. Products heading and E-Paper entry
      expect(screen.getByText(/उत्पाद|Products/i)).toBeInTheDocument();
      const epaperProduct = screen.getByRole('link', { name: /ई-पेपर/i });
      expect(epaperProduct).toHaveAttribute('href', '/main/epaper');

      // 4. Account heading and Sign In / Profile link
      expect(screen.getByText(/खाता|Account/i)).toBeInTheDocument();
      const accountLink = screen.getByRole('link', { name: /साइन इन करें|Sign In/i });
      expect(accountLink).toHaveAttribute('href', '/signin?redirect=/main/account');

      // 5. Preferences / Appearance heading with [ Auto ] [ Light ] [ Dark ]
      expect(screen.getByText(/दिखावट|Appearance/i)).toBeInTheDocument();
      const autoBtn = screen.getByRole('button', { name: /सिस्टम थीम \(ऑटो\)|System Theme \(Auto\)/i });
      const lightBtn = screen.getByRole('button', { name: /लाइट थीम|Light Theme/i });
      const darkBtn = screen.getByRole('button', { name: /डार्क थीम|Dark Theme/i });

      expect(autoBtn).toBeInTheDocument();
      expect(lightBtn).toBeInTheDocument();
      expect(darkBtn).toBeInTheDocument();

      expect(autoBtn.className).toContain('min-h-[44px]');
      expect(lightBtn.className).toContain('min-h-[44px]');
      expect(darkBtn.className).toContain('min-h-[44px]');
    });

    it('supports switching theme preference to Auto, Light, and Dark', () => {
      render(<MobileMenu isOpen={true} onClose={vi.fn()} />);

      const autoBtn = screen.getByRole('button', { name: /सिस्टम थीम \(ऑटो\)|System Theme \(Auto\)/i });
      const lightBtn = screen.getByRole('button', { name: /लाइट थीम|Light Theme/i });
      const darkBtn = screen.getByRole('button', { name: /डार्क थीम|Dark Theme/i });

      // Default is auto
      expect(useAppStore.getState().themePreference).toBe('auto');
      expect(autoBtn).toHaveAttribute('aria-pressed', 'true');

      // Select Light
      fireEvent.click(lightBtn);
      expect(useAppStore.getState().themePreference).toBe('light');
      expect(useAppStore.getState().theme).toBe('light');

      // Select Dark
      fireEvent.click(darkBtn);
      expect(useAppStore.getState().themePreference).toBe('dark');
      expect(useAppStore.getState().theme).toBe('dark');

      // Re-select Auto
      fireEvent.click(autoBtn);
      expect(useAppStore.getState().themePreference).toBe('auto');
    });

    it('preserves accessibility contract (role="dialog", aria-modal="true", and Escape to close)', () => {
      const onClose = vi.fn();
      render(<MobileMenu isOpen={true} onClose={onClose} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('6. Theme Store and System Preference Synchronization', () => {
    it('setThemePreference updates both themePreference and theme correctly', () => {
      const { setThemePreference } = useAppStore.getState();

      setThemePreference('dark');
      expect(useAppStore.getState().themePreference).toBe('dark');
      expect(useAppStore.getState().theme).toBe('dark');

      setThemePreference('light');
      expect(useAppStore.getState().themePreference).toBe('light');
      expect(useAppStore.getState().theme).toBe('light');

      setThemePreference('auto');
      expect(useAppStore.getState().themePreference).toBe('auto');
    });

    it('preserves themePreference="auto" when setTheme is invoked by system media-query changes', () => {
      const { setThemePreference, setTheme } = useAppStore.getState();

      setThemePreference('auto');
      expect(useAppStore.getState().themePreference).toBe('auto');

      // Simulating system prefers-color-scheme event firing setTheme('dark')
      setTheme('dark');
      expect(useAppStore.getState().theme).toBe('dark');
      expect(useAppStore.getState().themePreference).toBe('auto');

      // Simulating system prefers-color-scheme event firing setTheme('light')
      setTheme('light');
      expect(useAppStore.getState().theme).toBe('light');
      expect(useAppStore.getState().themePreference).toBe('auto');
    });
  });
});
