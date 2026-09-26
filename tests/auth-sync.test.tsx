import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthSync from '@/components/providers/AuthSync';
import { useAppStore } from '@/lib/store/appStore';
import { useSession } from 'next-auth/react';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

describe('AuthSync Reader vs Staff Guard Regression', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    useAppStore.getState().clearUser();
    useAppStore.getState().setSavedArticles([]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('triggers GET /api/user/save and synchronizes saved articles for authenticated reader', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          savedArticleIds: ['art-1', 'art-2'],
        },
      }),
    });

    (useSession as any).mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: 'reader-123',
          name: 'Regular Reader',
          email: 'reader@example.com',
          role: 'reader',
        },
      },
    });

    render(<AuthSync />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/user/save', {
      method: 'GET',
      cache: 'no-store',
    });

    await waitFor(() => {
      expect(useAppStore.getState().currentUser?.savedArticles).toEqual(['art-1', 'art-2']);
      expect(useAppStore.getState().currentUser?.role).toBe('reader');
    });
  });

  it('does NOT call /api/user/save for authenticated super_admin', async () => {
    (useSession as any).mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: 'admin-1',
          name: 'Super Admin',
          email: 'admin@lokswami.com',
          role: 'super_admin',
        },
      },
    });

    render(<AuthSync />);

    await waitFor(() => {
      expect(useAppStore.getState().currentUser?.role).toBe('super_admin');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT call /api/user/save for authenticated admin', async () => {
    (useSession as any).mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: 'admin-2',
          name: 'Newsroom Admin',
          email: 'desk-admin@lokswami.com',
          role: 'admin',
        },
      },
    });

    render(<AuthSync />);

    await waitFor(() => {
      expect(useAppStore.getState().currentUser?.role).toBe('admin');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT call /api/user/save for authenticated copy_editor', async () => {
    (useSession as any).mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: 'editor-1',
          name: 'Copy Editor',
          email: 'editor@lokswami.com',
          role: 'copy_editor',
        },
      },
    });

    render(<AuthSync />);

    await waitFor(() => {
      expect(useAppStore.getState().currentUser?.role).toBe('copy_editor');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT call /api/user/save for authenticated reporter', async () => {
    (useSession as any).mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: 'rep-1',
          name: 'Field Reporter',
          email: 'reporter@lokswami.com',
          role: 'reporter',
        },
      },
    });

    render(<AuthSync />);

    await waitFor(() => {
      expect(useAppStore.getState().currentUser?.role).toBe('reporter');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT call /api/user/save when unauthenticated', async () => {
    (useSession as any).mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<AuthSync />);

    // Give microtasks a cycle to resolve
    await new Promise((r) => setTimeout(r, 20));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentUser).toBeNull();
  });

  it('does NOT call /api/user/save when status is loading', async () => {
    (useSession as any).mockReturnValue({
      status: 'loading',
      data: null,
    });

    render(<AuthSync />);

    await new Promise((r) => setTimeout(r, 20));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentUser).toBeNull();
  });
});
