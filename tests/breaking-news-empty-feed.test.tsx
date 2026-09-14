import { createElement, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BreakingNews from '@/components/ui/BreakingNews';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({ language: 'en' }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BreakingNews empty feed', () => {
  it('hides the ticker when the API successfully returns no breaking articles', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/breaking')) {
        return {
          ok: true,
          json: async () => ({ success: true, items: [], total: 0 }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { configured: false, provider: null, voices: [] },
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BreakingNews />);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /breaking news/i })).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/breaking?limit=10');
  });
});
