import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/admin',
  push: vi.fn(),
  refresh: vi.fn(),
  setTheme: vi.fn(),
  toggleLanguage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    createElement('img', { alt, src }),
}));

vi.mock('@/components/layout/Logo', () => ({
  default: () => createElement('span', null, 'Lokswami'),
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({
    theme: 'dark',
    setTheme: mocks.setTheme,
    language: 'en',
    toggleLanguage: mocks.toggleLanguage,
  }),
}));

import AdminShell from '@/app/(admin)/admin/AdminShell';

function renderShell(role: 'super_admin' | 'admin' | 'copy_editor' | 'reporter') {
  return render(
    <AdminShell
      initialUser={{
        name: 'Newsroom User',
        email: 'newsroom@example.com',
        role,
      }}
    >
      <h1>Content workspace</h1>
    </AdminShell>
  );
}

afterEach(() => {
  cleanup();
  mocks.pathname = '/admin';
  vi.clearAllMocks();
});

describe('AdminShell role-aware navigation', () => {
  it('finds permitted tools in either language and recovers from an empty search', () => {
    renderShell('admin');
    const search = screen.getByRole('searchbox', { name: 'Find newsroom tools' });
    const tools = within(screen.getByRole('navigation', { name: 'Newsroom tools' }));
    fireEvent.change(search, { target: { value: 'ई-मैग' } });
    expect(tools.getByRole('link', { name: 'E-Magazines' })).toBeInTheDocument();
    expect(tools.queryByRole('link', { name: 'Articles' })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'missing tool' } });
    expect(tools.getByRole('status')).toHaveTextContent('No matching tools.');
    fireEvent.click(tools.getByRole('button', { name: 'Clear search' }));
    expect(tools.getByRole('link', { name: 'Articles' })).toBeInTheDocument();
  });

  it('never reveals tools outside a reporter role through search', () => {
    renderShell('reporter');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find newsroom tools' }), {
      target: { value: 'Team' },
    });
    const tools = within(screen.getByRole('navigation', { name: 'Newsroom tools' }));
    expect(tools.queryByRole('link')).not.toBeInTheDocument();
    expect(tools.getByRole('status')).toHaveTextContent('No matching tools.');
  });
  it('exposes authorized tools to admins and keeps them hidden from reporters', () => {
    renderShell('admin');

    expect(screen.getAllByRole('link', { name: /Categories/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Contact Messages/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /AI Ops/i }).length).toBeGreaterThan(0);

    cleanup();
    renderShell('reporter');

    expect(screen.queryByRole('link', { name: /Contact Messages/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Articles$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Article Create/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /My Stories/i }).length).toBeGreaterThan(0);
  }, 15_000);

  it('marks only the most specific nested route as current', () => {
    mocks.pathname = '/admin/analytics/business-value';
    renderShell('super_admin');

    const currentLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[aria-current="page"]')
    );
    expect(currentLinks.length).toBeGreaterThan(0);
    expect(new Set(currentLinks.map((link) => link.getAttribute('href')))).toEqual(
      new Set(['/admin/analytics/business-value'])
    );
  });

  it('keeps the closed mobile drawer inert and leaves the page heading to page content', async () => {
    renderShell('super_admin');

    const drawer = document.querySelector<HTMLElement>('#admin-mobile-navigation');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(drawer).toHaveAttribute('inert'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Quick newsroom navigation' })).toBeInTheDocument();
  });
});
