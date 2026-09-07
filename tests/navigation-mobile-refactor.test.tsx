import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import MobileMenu from '@/components/layout/MobileMenu';
import ReaderAccountPage from '@/app/(reader)/main/account/page';
import { useAppStore } from '@/lib/store/appStore';
import { useSession } from 'next-auth/react';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/main',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('Mobile Layout Refactor', () => {
  it('Header renders hamburger button on mobile and toggles mobile drawer', () => {
    (useSession as any).mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<Header />);

    // Hamburger button should exist with aria-label for mobile menu
    const hamburgerBtn = screen.getByRole('button', { name: /मेनू खोलें|Open menu/i });
    expect(hamburgerBtn).toBeInTheDocument();
    expect(hamburgerBtn).toHaveAttribute('aria-controls', 'mobile-drawer');

    expect(useAppStore.getState().isMobileMenuOpen).toBe(false);
    fireEvent.click(hamburgerBtn);
    expect(useAppStore.getState().isMobileMenuOpen).toBe(true);
  });

  it('Header renders e-Paper action button and removes language switcher from top header', () => {
    (useSession as any).mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<Header />);

    // E-Paper link exists in header
    const epaperLink = screen.getByRole('link', { name: /ई-पेपर पढ़ें|Read E-Paper/i });
    expect(epaperLink).toBeInTheDocument();
    expect(epaperLink).toHaveAttribute('href', '/main/epaper');

    // Language switcher toggle is removed from header
    expect(screen.queryByLabelText(/Switch to English|Switch to Hindi/i)).not.toBeInTheDocument();
  });

  it('BottomNav renders 6 items including Home, E-Paper, E-Mag, Video, Quick, and Login', () => {
    (useSession as any).mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<BottomNav />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);

    // E-Paper is in bottom nav right after Home (index 1)
    expect(links[0]).toHaveAttribute('href', '/main');
    expect(links[1]).toHaveAttribute('href', '/main/epaper');
    expect(screen.getByText('Video')).toBeInTheDocument();

    // 6th item is Login when unauthenticated
    const loginLink = screen.getByRole('link', { name: /साइन इन या लॉगिन करें|Sign in or login|लॉगिन/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/signin?redirect=/main/account');
  });

  it('BottomNav renders Profile link when authenticated', () => {
    (useSession as any).mockReturnValue({
      data: { user: { name: 'Test Reader', email: 'reader@example.com' } },
      status: 'authenticated',
    });
    render(<BottomNav />);

    // 5th item should be Profile (प्रोफाइल)
    const profileLink = screen.getByRole('link', { name: /यूज़र प्रोफाइल और अकाउंट|User profile and account|प्रोफाइल/i });
    expect(profileLink).toBeInTheDocument();
    expect(profileLink).toHaveAttribute('href', '/main/account');
  });

  it('MobileMenu drawer contains language switcher and updates app store', () => {
    render(<MobileMenu isOpen={true} onClose={vi.fn()} />);

    const englishBtn = screen.getByRole('button', { name: /English/i });
    expect(englishBtn).toBeInTheDocument();

    fireEvent.click(englishBtn);
    expect(useAppStore.getState().language).toBe('en');

    const hindiBtn = screen.getByRole('button', { name: /हिन्दी/i });
    fireEvent.click(hindiBtn);
    expect(useAppStore.getState().language).toBe('hi');
  });

  it('Account Page renders language switcher preference with segmented control', () => {
    (useSession as any).mockReturnValue({
      data: { user: { name: 'Test Reader', email: 'reader@example.com' } },
      status: 'authenticated',
    });
    render(<ReaderAccountPage />);

    expect(screen.getByText(/भाषा चुनें \/ Select Language/i)).toBeInTheDocument();

    const englishBtn = screen.getByRole('button', { name: /English/i });
    fireEvent.click(englishBtn);
    expect(useAppStore.getState().language).toBe('en');

    const hindiBtn = screen.getByRole('button', { name: /हिन्दी/i });
    fireEvent.click(hindiBtn);
    expect(useAppStore.getState().language).toBe('hi');
  });
});
