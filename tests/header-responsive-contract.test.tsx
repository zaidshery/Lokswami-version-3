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

  describe('1. Mobile Viewport (390px–767px) Header Contract', () => {
    it('renders hamburger menu on the left with >=44px touch target', () => {
      render(<Header />);
      const hamburger = screen.getByRole('button', { name: /मेनू खोलें|Open menu/i });
      expect(hamburger).toBeInTheDocument();
      expect(hamburger).toHaveAttribute('aria-controls', 'mobile-drawer');
      expect(hamburger.className).toContain('min-h-[44px]');
      expect(hamburger.className).toContain('min-w-[44px]');
      expect(hamburger.className).toContain('lg:hidden');
    });

    it('renders centered LokSwami wordmark for mobile screens with true geometric centering', () => {
      render(<Header />);
      const homeLink = screen.getByLabelText('Lokswami Home');
      expect(homeLink).toBeInTheDocument();
      expect(homeLink.parentElement?.className).toContain('md:hidden');
      expect(homeLink.parentElement?.className).toContain('absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2');
    });

    it('renders compact segmented [ HI | EN ] control with min-[390px]:inline-flex', () => {
      render(<Header />);
      const langGroup = screen.getByRole('group', { name: /भाषा चयन|Language selection/i });
      expect(langGroup).toBeInTheDocument();
      expect(langGroup.className).toContain('hidden min-[390px]:inline-flex');

      const hiButton = screen.getByRole('button', { name: /हिन्दी भाषा चुनें/i });
      const enButton = screen.getByRole('button', { name: /Select English language/i });
      expect(hiButton).toBeInTheDocument();
      expect(enButton).toBeInTheDocument();

      // Touch target standards: effective vertical height >=44px
      expect(hiButton.className).toContain('min-h-[44px]');
      expect(enButton.className).toContain('min-h-[44px]');
      expect(hiButton.className).toContain('min-w-[34px]');
      expect(enButton.className).toContain('min-w-[34px]');
      expect(hiButton.className).toContain('sm:min-w-[44px]');
      expect(enButton.className).toContain('sm:min-w-[44px]');

      // Hindi is selected by default in state
      expect(hiButton).toHaveAttribute('aria-pressed', 'true');
      expect(enButton).toHaveAttribute('aria-pressed', 'false');

      // Segmented pill styling
      expect(langGroup.className).toContain('h-11');
      expect(langGroup.className).toContain('rounded-xl');

      // Clicking EN toggles language to English
      fireEvent.click(enButton);
      expect(useAppStore.getState().language).toBe('en');
    });

    it('renders Search link with 44x44px standalone button pointing to /main/search', () => {
      render(<Header />);
      const searchLink = screen.getByRole('link', { name: /समाचार खोजें|Search news/i });
      expect(searchLink).toBeInTheDocument();
      expect(searchLink).toHaveAttribute('href', '/main/search');
      expect(searchLink.className).toContain('h-11');
      expect(searchLink.className).toContain('w-11');
      expect(searchLink.className).toContain('min-h-[44px]');
      expect(searchLink.className).toContain('min-w-[44px]');
      expect(searchLink.className).toContain('rounded-xl');
    });

    it('ensures right-action wrapper is a clean flex container without decorative nested box card', () => {
      render(<Header />);
      const searchLink = screen.getByRole('link', { name: /समाचार खोजें|Search news/i });
      const rightContainer = searchLink.parentElement;
      expect(rightContainer).toBeInTheDocument();
      expect(rightContainer?.className).toContain('flex');
      expect(rightContainer?.className).not.toContain('border-zinc');
      expect(rightContainer?.className).not.toContain('bg-gradient');
    });

    it('ensures E-Paper, Theme toggle, and Sign In are absent from top header on mobile', () => {
      render(<Header />);
      // E-Paper has hidden md:inline-flex (hidden on mobile <768px)
      const epaperLink = screen.getByRole('link', { name: /ई-पेपर पढ़ें|Read E-Paper/i });
      expect(epaperLink.className).toContain('hidden md:inline-flex');

      // Theme toggle has hidden lg:inline-flex (hidden on mobile & tablet <1024px)
      const themeToggle = screen.getByRole('button', { name: /Toggle theme/i });
      expect(themeToggle.className).toContain('hidden lg:inline-flex');

      // Sign In has hidden lg:block (hidden on mobile & tablet <1024px)
      const signInLink = screen.getByRole('link', { name: /साइन इन|Sign In/i });
      expect(signInLink.parentElement?.parentElement?.className).toContain('hidden lg:block');
    });
  });

  describe('2. Narrow Phone Viewport (360px–389px) Safety Contract', () => {
    it('hides top header HI/EN toggle on viewports narrower than 390px via responsive class', () => {
      render(<Header />);
      const langGroup = screen.getByRole('group', { name: /भाषा चयन|Language selection/i });
      // Uses hidden min-[390px]:inline-flex to safely prevent overlap on narrow phones
      expect(langGroup.className).toContain('hidden min-[390px]:inline-flex');
    });

    it('keeps Search directly accessible with >=44px touch target on all viewports', () => {
      render(<Header />);
      const searchLink = screen.getByRole('link', { name: /समाचार खोजें|Search news/i });
      expect(searchLink.className).toContain('min-h-[44px]');
      expect(searchLink.className).toContain('min-w-[44px]');
    });
  });

  describe('3. Tablet Viewport (768px–1023px) Header Contract', () => {
    it('exposes E-Paper CTA starting at tablet breakpoint (md: 768px)', () => {
      render(<Header />);
      const epaperLink = screen.getByRole('link', { name: /ई-पेपर पढ़ें|Read E-Paper/i });
      expect(epaperLink.className).toContain('hidden md:inline-flex');
      expect(epaperLink).toHaveAttribute('href', '/main/epaper');
    });

    it('exposes compact HI/EN toggle on tablet', () => {
      render(<Header />);
      const langGroup = screen.getByRole('group', { name: /भाषा चयन|Language selection/i });
      expect(langGroup.className).toContain('min-[390px]:inline-flex');
    });

    it('keeps Theme toggle in MobileMenu/drawer rather than top header on tablet (<1024px)', () => {
      render(<Header />);
      const themeToggle = screen.getByRole('button', { name: /Toggle theme/i });
      expect(themeToggle.className).toContain('hidden lg:inline-flex');
    });
  });

  describe('4. Desktop Viewport (1024px+) Header Contract', () => {
    it('exposes full set of desktop controls (E-Paper, Search, User/Sign In, HI/EN, Theme)', () => {
      render(<Header />);
      // Desktop Logo
      const desktopLogoWrapper = screen.getByRole('banner').querySelector('.hidden.min-w-0.lg\\:block');
      expect(desktopLogoWrapper).toBeInTheDocument();

      // E-Paper
      expect(screen.getByRole('link', { name: /ई-पेपर पढ़ें|Read E-Paper/i })).toBeInTheDocument();

      // Search
      expect(screen.getByRole('link', { name: /समाचार खोजें|Search news/i })).toBeInTheDocument();

      // Sign In
      expect(screen.getByRole('link', { name: /साइन इन|Sign In/i })).toBeInTheDocument();

      // HI / EN
      expect(screen.getByRole('group', { name: /भाषा चयन|Language selection/i })).toBeInTheDocument();

      // Theme toggle
      expect(screen.getByRole('button', { name: /Toggle theme/i })).toBeInTheDocument();
    });

    it('orders desktop right controls logically: E-Paper, Search, Sign In, HI/EN, Theme', () => {
      render(<Header />);
      const epaperLink = screen.getByRole('link', { name: /ई-पेपर पढ़ें|Read E-Paper/i });
      const searchLink = screen.getByRole('link', { name: /समाचार खोजें|Search news/i });
      const langGroup = screen.getByRole('group', { name: /भाषा चयन|Language selection/i });
      const themeToggle = screen.getByRole('button', { name: /Toggle theme/i });

      expect(epaperLink.className).toContain('order-0');
      expect(searchLink.className).toContain('lg:order-1');
      expect(langGroup.className).toContain('lg:order-3');
      expect(themeToggle.className).toContain('lg:order-4');
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
