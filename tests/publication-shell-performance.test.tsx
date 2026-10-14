import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ path: '/main/e-magazine', open: false, pendingHeader: false }));
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: (select: (s: unknown) => unknown) => select({
  setIsMobile: () => {}, setIsTablet: () => {}, toggleMobileMenu: () => {}, isMobileMenuOpen: false,
  setMobileMenuOpen: () => {}, isImmersiveVideoMode: false, isEpaperReaderOpen: state.open,
}) }));
vi.mock('@/components/layout/Header', () => ({ default: () => { if (state.pendingHeader) throw new Promise(() => {}); return <header data-testid="shell-header">Header</header>; } }));
vi.mock('@/components/layout/Footer', () => ({ default: () => <footer data-testid="shell-footer">Footer</footer> }));
vi.mock('@/components/layout/Container', () => ({ default: ({ children, className }: { children: React.ReactNode; className: string }) => <div data-testid="shell-container" className={className}>{children}</div> }));
vi.mock('@/components/layout/BottomNav', () => ({ default: () => null }));
vi.mock('@/components/layout/MobileMenu', () => ({ default: () => null }));
vi.mock('@/components/auth/SigninRoleBanner', () => ({ default: () => null }));
vi.mock('@/components/ui/BreakingNews', () => ({ default: () => null }));
vi.mock('@/components/ui/DailyEpaperAlert', () => ({ default: () => null }));
vi.mock('@/components/ui/PopupOrchestrator', () => ({ default: () => null }));
import MainLayout from '@/app/(reader)/main/layout';
beforeEach(() => { state.path = '/main/e-magazine'; state.open = false; state.pendingHeader = false; });
describe('publication overlay keeps background geometry stable', () => {
  it('keeps the publication available while the background header is pending', () => {
    state.pendingHeader = true;
    render(<MainLayout><button>QA next page</button></MainLayout>);
    expect(screen.getByRole('button', { name: 'QA next page' })).toBeVisible();
    expect(screen.queryByTestId('shell-header')).toBeNull();
  });
  it('hides and makes the shell inert without removing it or changing container padding', () => {
    const { rerender } = render(<MainLayout><div>QA reader</div></MainLayout>);
    const header = screen.getByTestId('shell-header'), footer = screen.getByTestId('shell-footer');
    const padding = screen.getByTestId('shell-container').className;
    state.open = true; rerender(<MainLayout><div>QA reader</div></MainLayout>);
    expect(screen.getByTestId('shell-header')).toBe(header);
    expect(screen.getByTestId('shell-footer')).toBe(footer);
    expect(header.parentElement).toHaveAttribute('inert');
    expect(header.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('shell-container').className).toBe(padding);
    state.open = false; rerender(<MainLayout><div>QA reader</div></MainLayout>);
    expect(header.parentElement).not.toHaveAttribute('inert');
    expect(header.parentElement).not.toHaveAttribute('aria-hidden');
  });
  it('preserves fullscreen short-route shell behavior', () => {
    state.path = '/main/shorts/qa';
    render(<MainLayout><div>QA video</div></MainLayout>);
    expect(screen.queryByTestId('shell-header')).toBeNull();
    expect(screen.queryByTestId('shell-footer')).toBeNull();
  });
});
