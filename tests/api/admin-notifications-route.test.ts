import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from '@/app/api/admin/notifications/route';

const getAdminSessionMock = vi.fn();
const listWorkflowNotificationsMock = vi.fn();
const markWorkflowNotificationsReadMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: () => getAdminSessionMock(),
}));

vi.mock('@/lib/storage/workflowNotifications', () => ({
  listWorkflowNotifications: (args: unknown) => listWorkflowNotificationsMock(args),
  markWorkflowNotificationsRead: (args: unknown) => markWorkflowNotificationsReadMock(args),
}));

const mockUser = {
  id: 'user-123',
  name: 'Editorial Admin',
  email: 'admin@lokswami.com',
  role: 'admin',
};

describe('Admin Notifications Route API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/notifications', () => {
    it('returns 401 when unauthenticated', async () => {
      getAdminSessionMock.mockResolvedValue(null);
      const req = new Request('http://localhost:3000/api/admin/notifications');
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('scopes list queries to authenticated user recipientId and email', async () => {
      getAdminSessionMock.mockResolvedValue(mockUser);
      listWorkflowNotificationsMock
        .mockResolvedValueOnce([{ id: 'notif-1', title: 'Story update' }]) // main items
        .mockResolvedValueOnce([{ id: 'notif-1' }]); // unread items for count

      const req = new Request('http://localhost:3000/api/admin/notifications?limit=25');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.unreadCount).toBe(1);

      // Verify both list queries scoped to user
      expect(listWorkflowNotificationsMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          recipientId: 'user-123',
          recipientEmail: 'admin@lokswami.com',
          unreadOnly: false,
          limit: 25,
        })
      );
      expect(listWorkflowNotificationsMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          recipientId: 'user-123',
          recipientEmail: 'admin@lokswami.com',
          unreadOnly: true,
          limit: 100,
        })
      );
    });

    it('passes unreadOnly=1 query flag when requested', async () => {
      getAdminSessionMock.mockResolvedValue(mockUser);
      listWorkflowNotificationsMock.mockResolvedValue([]);

      const req = new Request('http://localhost:3000/api/admin/notifications?unreadOnly=1');
      await GET(req);

      expect(listWorkflowNotificationsMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          recipientId: 'user-123',
          unreadOnly: true,
        })
      );
    });
  });

  describe('PATCH /api/admin/notifications', () => {
    it('returns 401 when unauthenticated', async () => {
      getAdminSessionMock.mockResolvedValue(null);
      const req = new Request('http://localhost:3000/api/admin/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ ids: ['notif-1'] }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it('marks specific notification IDs read scoped strictly to authenticated user', async () => {
      getAdminSessionMock.mockResolvedValue(mockUser);
      markWorkflowNotificationsReadMock.mockResolvedValue(2);

      const req = new Request('http://localhost:3000/api/admin/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ ids: ['notif-1', 'notif-2'] }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.updated).toBe(2);

      expect(markWorkflowNotificationsReadMock).toHaveBeenCalledWith({
        recipientId: 'user-123',
        recipientEmail: 'admin@lokswami.com',
        ids: ['notif-1', 'notif-2'],
        all: false,
      });
    });

    it('marks all read scoped strictly to authenticated user', async () => {
      getAdminSessionMock.mockResolvedValue(mockUser);
      markWorkflowNotificationsReadMock.mockResolvedValue(5);

      const req = new Request('http://localhost:3000/api/admin/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ all: true }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.updated).toBe(5);

      expect(markWorkflowNotificationsReadMock).toHaveBeenCalledWith({
        recipientId: 'user-123',
        recipientEmail: 'admin@lokswami.com',
        ids: [],
        all: true,
      });
    });

    it('rejects empty payload when neither all nor valid IDs are provided', async () => {
      getAdminSessionMock.mockResolvedValue(mockUser);
      const req = new Request('http://localhost:3000/api/admin/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ ids: [] }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Choose notifications');
      expect(markWorkflowNotificationsReadMock).not.toHaveBeenCalled();
    });
  });
});
