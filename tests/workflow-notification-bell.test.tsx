import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkflowNotificationBell from '@/components/admin/WorkflowNotificationBell';

const mockNotifications = [
  {
    id: 'notif-1',
    recipientId: 'admin-1',
    recipientEmail: 'admin@lokswami.com',
    eventType: 'assigned',
    contentType: 'story',
    contentId: 'story-1',
    title: 'Metro budget story',
    message: 'This item was assigned to you.',
    messageHi: 'यह आइटम आपको असाइन किया गया है।',
    href: '/admin/stories/story-1/edit',
    dedupeKey: 'key-1',
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-2',
    recipientId: 'admin-1',
    recipientEmail: 'admin@lokswami.com',
    eventType: 'approved',
    contentType: 'article',
    contentId: 'art-2',
    title: 'Election analysis',
    message: 'This item was approved.',
    messageHi: 'यह आइटम स्वीकृत हुआ।',
    href: '/admin/articles/art-2/edit',
    dedupeKey: 'key-2',
    readAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

import { useAppStore } from '@/lib/store/appStore';

describe('WorkflowNotificationBell Accessibility & Popover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'en' });
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: { updated: 1 } }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: mockNotifications,
            unreadCount: 1,
          },
        }),
      });
    });
  });

  it('renders trigger with dynamic aria-label containing unread count and badge', async () => {
    render(<WorkflowNotificationBell />);

    const trigger = await screen.findByRole('button', {
      name: /workflow notifications, 1 unread/i,
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Badge indicates 1 unread
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens accessible dialog popover on click and toggles aria-expanded', async () => {
    render(<WorkflowNotificationBell />);

    const trigger = await screen.findByRole('button', {
      name: /workflow notifications, 1 unread/i,
    });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: /notifications/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Close button has aria-label
    const closeBtn = screen.getByRole('button', { name: /close notifications/i });
    expect(closeBtn).toBeInTheDocument();

    // Contains notification title
    expect(screen.getByText('Metro budget story')).toBeInTheDocument();
  });

  it('closes popover on close button click and restores focus to trigger', async () => {
    render(<WorkflowNotificationBell />);

    const trigger = await screen.findByRole('button', {
      name: /workflow notifications, 1 unread/i,
    });
    fireEvent.click(trigger);

    const closeBtn = screen.getByRole('button', { name: /close notifications/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape key press and restores focus to trigger', async () => {
    render(<WorkflowNotificationBell />);

    const trigger = await screen.findByRole('button', {
      name: /workflow notifications, 1 unread/i,
    });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on click outside the popover', async () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <WorkflowNotificationBell />
      </div>
    );

    const trigger = await screen.findByRole('button', {
      name: /workflow notifications, 1 unread/i,
    });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-area'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows marking all notifications as read', async () => {
    render(<WorkflowNotificationBell />);

    const trigger = await screen.findByRole('button', {
      name: /workflow notifications, 1 unread/i,
    });
    fireEvent.click(trigger);

    const markAllBtn = screen.getByRole('button', { name: /mark all read/i });
    expect(markAllBtn).toBeEnabled();

    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/notifications',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ all: true }),
        })
      );
    });

    // Unread count should become 0 and mark-all button disabled
    await waitFor(() => {
      expect(markAllBtn).toBeDisabled();
    });
  });

  it('marks an unread notification read when its deep link is opened', async () => {
    render(<WorkflowNotificationBell />);

    const trigger = await screen.findByRole('button', {
      name: /workflow notifications, 1 unread/i,
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('link', { name: /metro budget story/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/notifications',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ ids: ['notif-1'] }),
        })
      );
    });
  });
});
