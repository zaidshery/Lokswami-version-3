import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminSessionMock, dispatchWorkQueueCommandMock } = vi.hoisted(() => ({
  getAdminSessionMock: vi.fn(),
  dispatchWorkQueueCommandMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({ getAdminSession: getAdminSessionMock }));
vi.mock('@/lib/server/workQueueCommands', () => ({
  dispatchWorkQueueCommand: dispatchWorkQueueCommandMock,
}));

function assignmentRequest() {
  return new Request('http://localhost/api/admin/work-queue/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: 'story',
      id: 'story-1',
      action: 'assign',
      assignedToId: 'reporter-2',
      expectedVersion: 3,
    }),
  });
}

describe('POST /api/admin/work-queue/actions assignment RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchWorkQueueCommandMock.mockResolvedValue(
      Response.json({ success: true }, { status: 200 })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    getAdminSessionMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/work-queue/actions/route');
    expect((await POST(assignmentRequest())).status).toBe(401);
    expect(dispatchWorkQueueCommandMock).not.toHaveBeenCalled();
  });

  it.each(['reporter', 'copy_editor'] as const)(
    'returns 403 for %s without dispatching the assignment',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });
      const { POST } = await import('@/app/api/admin/work-queue/actions/route');
      expect((await POST(assignmentRequest())).status).toBe(403);
      expect(dispatchWorkQueueCommandMock).not.toHaveBeenCalled();
    }
  );

  it.each(['admin', 'super_admin'] as const)(
    'allows %s to assign or reassign an item through the canonical dispatcher',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });
      const { POST } = await import('@/app/api/admin/work-queue/actions/route');
      const response = await POST(assignmentRequest());

      expect(response.status).toBe(200);
      expect(dispatchWorkQueueCommandMock).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({
          id: 'story-1',
          action: 'assign',
          assignedToId: 'reporter-2',
          expectedVersion: 3,
        })
      );
    }
  );
});
