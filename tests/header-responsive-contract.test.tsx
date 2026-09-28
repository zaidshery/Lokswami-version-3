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
    (useSession as any).mockReturnValue({ data: null, status: 'unauthenticated' });
    useAppStore.setState({
      language: 'hi',
      theme: 'light',
      themePreference: 'auto',
      isMobileMenuOpen: false,
    });
  });

  describe('Unified brand and category layers', () => {
    it.each([320, 390, 768, 1024, 1440])('keeps required controls in the same DOM at %i pixels', (width) => {
      window.innerWidth = width;
      render(<Header />);
      const menu = screen.getByRole('button', { name: /मेनू खोलें|Open menu/i });
      expect(menu).toHaveAttribute('aria-controls', 'mobile-drawer');
      expect(menu.className).not.toContain('hidden');
      expect(screen.getByLabelText('Lokswami Home')).toHaveAttribute('href', '/main');
      const epaper = screen.getByRole('link', { name: /ई-पेपर पढ़ें|Read E-Paper/i });
      expect(epaper).toHaveAttribute('href', '/main/epaper');
      expect(epaper.className).not.toContain('hidden');
      const language = screen.getByRole('group', { name: /भाषा चयन|Language selection/i });
      expect(language.className).not.toContain('hidden');
      expect(screen.getByRole('link', { name: /समाचार खोजें|Search news/i })).toHaveAttribute('href', '/main/search');
      const strip = screen.getByTestId('reader-category-bar').firstElementChild!;
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
