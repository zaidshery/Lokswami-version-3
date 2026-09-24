import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsPageClient from '@/app/(admin)/admin/notifications/NotificationsPageClient';
import { useAppStore } from '@/lib/store/appStore';

describe('NotificationsPageClient Error State and Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'en' });
  });

  it('renders explicit error state with role="alert" and Retry button on fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error loading notifications.'));

    render(<NotificationsPageClient />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/network error loading notifications/i);

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it('retries successfully and shows empty state when no notifications exist', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ success: false, error: 'Temporary server error' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [] },
        }),
      });
    });

    render(<NotificationsPageClient />);

    // First attempt fails and shows error
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    // Second attempt succeeds and renders empty state
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Inbox clear')).toBeInTheDocument();
    });
  });

  it('displays notification items when fetch succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [
            {
              id: 'notif-10',
              title: 'Cabinet announcement',
              message: 'Story ready for review.',
              messageHi: 'स्टोरी समीक्षा के लिए तैयार है।',
              href: '/admin/stories/notif-10/edit',
              createdAt: '2026-09-21T10:00:00.000Z',
              readAt: null,
            },
          ],
        },
      }),
    });

    render(<NotificationsPageClient />);

    const itemTitle = await screen.findByText('Cabinet announcement');
    expect(itemTitle).toBeInTheDocument();
    expect(screen.getByText('Story ready for review.')).toBeInTheDocument();
  });

  it('marks an unread notification read when its deep link is opened', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [{
            id: 'notif-10',
            title: 'Cabinet announcement',
            message: 'Story ready for review.',
            messageHi: '',
            href: '/admin/stories/notif-10/edit',
            createdAt: '2026-09-21T10:00:00.000Z',
            readAt: null,
          }],
        },
      }),
    });

    render(<NotificationsPageClient />);
    fireEvent.click(await screen.findByText('Cabinet announcement'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/notifications',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ ids: ['notif-10'] }),
        })
      );
    });
  });
});
