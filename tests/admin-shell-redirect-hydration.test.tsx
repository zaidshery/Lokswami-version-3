import { createElement, lazy, type ReactNode } from 'react';
import { act, fireEvent, within } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminShell from '@/app/(admin)/admin/AdminShell';

const state = vi.hoisted(() => ({
  params: new URLSearchParams(), language: 'en' as 'en' | 'hi', replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/work', useSearchParams: () => state.params,
  useRouter: () => ({ replace: state.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => createElement('img', { alt, src }),
}));
vi.mock('@/components/layout/Logo', () => ({ default: () => createElement('span', null, 'Lokswami') }));
vi.mock('@/components/admin/WorkflowNotificationBell', () => ({ default: () => null }));
vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({ theme: 'dark', language: state.language, setTheme: vi.fn(), toggleLanguage: vi.fn() }),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  container?.remove(); root = undefined; container = undefined;
  vi.clearAllMocks();
});

describe('AdminShell feedback after a restricted-page redirect', () => {
  it('keeps the shell and loading announcement visible while page content suspends', () => {
    const PendingPage = lazy(() => new Promise<{ default: () => ReactNode }>(() => {}));
    const html = renderToString(
      <AdminShell initialUser={{ name: 'QA Reporter', email: 'qa@example.com', role: 'reporter' }}>
        <PendingPage />
      </AdminShell>
    );
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const ui = within(container);
    expect(ui.getByRole('status')).toHaveTextContent('Loading newsroom dashboard');
    expect(ui.getByRole('navigation', { name: 'Newsroom tools' })).toBeInTheDocument();
    expect(ui.getByRole('main')).toHaveTextContent('QA Reporter');
  });
  it.each([
    ['en', false, true], ['hi', false, true],
    ['en', true, false], ['hi', true, false],
  ] as const)('hydrates %s when access feedback changes from %s to %s', async (language, serverDenied, browserDenied) => {
    state.language = language;
    state.params = new URLSearchParams(serverDenied ? 'view=mine&access=denied' : 'view=mine');
    const shell = <AdminShell initialUser={{ name: 'QA Reporter', email: 'qa@example.com', role: 'reporter' }}>
      <h1>Permitted workspace</h1>
    </AdminShell>;
    container = document.createElement('div');
    container.innerHTML = renderToString(shell);
    document.body.append(container);
    state.params = new URLSearchParams(browserDenied ? 'view=mine&access=denied' : 'view=mine');
    const recoverableError = vi.fn();
    await act(async () => { root = hydrateRoot(container!, shell, { onRecoverableError: recoverableError }); });
    expect(recoverableError).not.toHaveBeenCalled();
    const ui = within(container);
    expect(ui.getByRole('heading', { name: 'Permitted workspace' })).toBeInTheDocument();
    if (browserDenied) {
      expect(ui.getByRole('alert')).toHaveTextContent(language === 'hi' ? 'एक्सेस अस्वीकृत' : 'Access denied');
      fireEvent.click(ui.getByRole('button', { name: language === 'hi' ? 'संदेश बंद करें' : 'Dismiss access denied message' }));
      expect(state.replace).toHaveBeenCalledWith('/admin/work?view=mine', { scroll: false });
    } else {
      expect(ui.queryByRole('alert')).not.toBeInTheDocument();
    }
  });
});
