import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const dispatchWorkQueueCommandMock = vi.fn();
vi.mock('@/lib/auth/admin', () => ({ getAdminSession: getAdminSessionMock }));
vi.mock('@/lib/server/workQueueCommands', () => ({ dispatchWorkQueueCommand: dispatchWorkQueueCommandMock }));

describe('PATCH /api/admin/work-queue/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminSessionMock.mockResolvedValue({ id: 'admin-1', email: 'desk@example.com', name: 'Desk', role: 'admin' });
  });

  it('returns per-item mixed success and conflict results', async () => {
    dispatchWorkQueueCommandMock
      .mockResolvedValueOnce(Response.json({ success: true }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ success: false, error: 'This item changed. Refresh and retry.' }, { status: 409 }));
    const { PATCH } = await import('@/app/api/admin/work-queue/bulk/route');
    const response = await PATCH(new Request('http://localhost/api/admin/work-queue/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignedToId: 'copy-1',
        priority: 'high',
        items: [
          { contentType: 'article', id: 'a1', expectedVersion: 2 },
          { contentType: 'story', id: 's1', expectedVersion: 5 },
        ],
      }),
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ success: false, partial: true, data: { succeeded: 1, failed: 1 } });
    expect(payload.data.results).toEqual([
      expect.objectContaining({ id: 'a1', success: true, status: 200 }),
      expect.objectContaining({ id: 's1', success: false, status: 409, error: expect.stringContaining('Refresh') }),
    ]);
  });

  it.each(['reporter', 'copy_editor'] as const)(
    'rejects assignment-management bulk mutations from %s',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });
      const { PATCH } = await import('@/app/api/admin/work-queue/bulk/route');
      const response = await PATCH(new Request('http://localhost/api/admin/work-queue/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedToId: 'reporter-2',
          items: [{ contentType: 'story', id: 's1' }],
        }),
      }));

      expect(response.status).toBe(403);
      expect(dispatchWorkQueueCommandMock).not.toHaveBeenCalled();
    }
  );

  it.each(['admin', 'super_admin'] as const)(
    'allows %s to assign selected items',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });
      dispatchWorkQueueCommandMock.mockResolvedValue(
        Response.json({ success: true }, { status: 200 })
      );
      const { PATCH } = await import('@/app/api/admin/work-queue/bulk/route');
      const response = await PATCH(new Request('http://localhost/api/admin/work-queue/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedToId: 'reporter-2',
          items: [{ contentType: 'story', id: 'selected-story' }],
        }),
      }));

      expect(response.status).toBe(200);
      expect(dispatchWorkQueueCommandMock).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({
          contentType: 'story',
          id: 'selected-story',
          action: 'assign',
          assignedToId: 'reporter-2',
        })
      );
    }
  );

  it('deduplicates the explicit selection and never dispatches an unselected item', async () => {
    dispatchWorkQueueCommandMock.mockResolvedValue(
      Response.json({ success: true }, { status: 200 })
    );
    const { PATCH } = await import('@/app/api/admin/work-queue/bulk/route');
    await PATCH(new Request('http://localhost/api/admin/work-queue/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignedToId: 'copy-1',
        items: [
          { contentType: 'article', id: 'selected-1' },
          { contentType: 'article', id: 'selected-1' },
          { contentType: 'story', id: 'selected-2' },
        ],
      }),
    }));

    expect(dispatchWorkQueueCommandMock).toHaveBeenCalledTimes(2);
    expect(dispatchWorkQueueCommandMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'unselected' })
    );
  });

  it('reports an invalid or inactive assignee rejection without hiding the failure', async () => {
    dispatchWorkQueueCommandMock.mockResolvedValue(
      Response.json({ success: false, error: 'Valid assignedToId is required' }, { status: 400 })
    );
    const { PATCH } = await import('@/app/api/admin/work-queue/bulk/route');
    const response = await PATCH(new Request('http://localhost/api/admin/work-queue/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignedToId: 'inactive-1',
        items: [{ contentType: 'article', id: 'a1' }],
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.data.results[0]).toMatchObject({
      success: false,
      status: 400,
      error: 'Valid assignedToId is required',
    });
  });
});
