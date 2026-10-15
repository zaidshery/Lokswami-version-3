import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const connectDBMock = vi.fn();
const countDocumentsMock = vi.fn();
const findMock = vi.fn();
const findByIdAndUpdateMock = vi.fn();
const logAdminMutationRequestMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    countDocuments: countDocumentsMock,
    find: findMock,
    findByIdAndUpdate: findByIdAndUpdateMock,
  },
}));

vi.mock('@/lib/security/auditLogger', () => ({
  logAdminMutationRequest: logAdminMutationRequestMock,
}));

function request(method: 'GET' | 'PATCH', body?: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/users', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('/api/admin/users owner-control RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDBMock.mockResolvedValue(undefined);
    countDocumentsMock.mockResolvedValue(0);
    findMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    logAdminMutationRequestMock.mockResolvedValue(undefined);
  });

  it('returns 401 without an authenticated admin session', async () => {
    getAdminSessionMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/admin/users/route');

    const response = await GET(request('GET'));

    expect(response.status).toBe(401);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it.each(['admin', 'copy_editor', 'reporter'] as const)(
    'returns 403 to %s before subscriber data access',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });
      const { GET, PATCH } = await import('@/app/api/admin/users/route');

      const getResponse = await GET(request('GET'));
      const patchResponse = await PATCH(request('PATCH', { userId: 'reader-1', isActive: false }));

      expect(getResponse.status).toBe(403);
      expect(patchResponse.status).toBe(403);
      expect(connectDBMock).not.toHaveBeenCalled();
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    }
  );

  it('allows super admin to list subscriber governance records', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });
    const { GET } = await import('@/app/api/admin/users/route');

    const response = await GET(request('GET'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.users).toEqual([]);
    expect(connectDBMock).toHaveBeenCalledTimes(1);
  });

  it('allows super admin through PATCH authorization before validation', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });
    const { PATCH } = await import('@/app/api/admin/users/route');

    const response = await PATCH(request('PATCH', {}));

    expect(response.status).toBe(400);
  });
});
