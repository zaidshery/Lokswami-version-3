import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const redirectMock = vi.fn((target: string) => {
  throw new Error(`redirect:${target}`);
});

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

const child = <span>Video editor</span>;

describe('Video create page boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['copy_editor', 'reporter'] as const)(
    'redirects %s away from direct create-video access',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });
      const { default: NewVideoLayout } = await import(
        '@/app/(admin)/admin/videos/new/layout'
      );

      await expect(NewVideoLayout({ children: child })).rejects.toThrow('redirect:/admin');
    }
  );

  it.each(['admin', 'super_admin'] as const)(
    'allows %s to render the create-video surface',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });
      const { default: NewVideoLayout } = await import(
        '@/app/(admin)/admin/videos/new/layout'
      );

      await expect(NewVideoLayout({ children: child as ReactNode })).resolves.toBe(child);
      expect(redirectMock).not.toHaveBeenCalled();
    }
  );

  it('redirects guests to the staff sign-in route', async () => {
    getAdminSessionMock.mockResolvedValue(null);
    const { default: NewVideoLayout } = await import(
      '@/app/(admin)/admin/videos/new/layout'
    );

    await expect(NewVideoLayout({ children: child })).rejects.toThrow(
      'redirect:/signin?redirect=/admin/videos/new'
    );
  });
});
