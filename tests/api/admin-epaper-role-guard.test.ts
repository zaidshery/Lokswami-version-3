import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getAdminSessionMock = vi.fn();
const connectDBMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

function createPatchRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/epapers/665000000000000000000001', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin publication role guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks copy editors from changing publication desk ownership before database access', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-1',
      email: 'copy@example.com',
      name: 'Copy Editor',
      username: 'copy@example.com',
      role: 'copy_editor',
    });

    const { PATCH } = await import('@/app/api/admin/epapers/[id]/route');
    const response = await PATCH(createPatchRequest({ assignedToId: 'reporter-1' }), {
      params: Promise.resolve({ id: '665000000000000000000001' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('blocks admins from changing publication desk ownership before database access', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Admin Desk',
      username: 'desk@example.com',
      role: 'admin',
    });
    const { PATCH } = await import('@/app/api/admin/epapers/[id]/route');
    const response = await PATCH(createPatchRequest({ assignedToId: 'copy-1' }), {
      params: Promise.resolve({ id: '665000000000000000000001' }),
    });

    expect(response.status).toBe(403);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('allows super admins through the publication assignment guard', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      username: 'owner@example.com',
      role: 'super_admin',
    });
    connectDBMock.mockRejectedValue(new Error('stop after authorization'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { PATCH } = await import('@/app/api/admin/epapers/[id]/route');
    const response = await PATCH(createPatchRequest({ assignedToId: 'copy-1' }), {
      params: Promise.resolve({ id: '665000000000000000000001' }),
    });

    expect(response.status).toBe(500);
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
