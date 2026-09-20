import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const connectDBMock = vi.fn();
const reserveUniqueStaffLoginIdMock = vi.fn();
const issueStaffSetupTokenMock = vi.fn();
const getStaffCredentialStatusMock = vi.fn();

const findOneMock = vi.fn();
const createMock = vi.fn();
const findByIdMock = vi.fn();
const findByIdAndUpdateMock = vi.fn();
const countDocumentsMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/auth/staffCredentials', () => ({
  reserveUniqueStaffLoginId: reserveUniqueStaffLoginIdMock,
  issueStaffSetupToken: issueStaffSetupTokenMock,
  getStaffCredentialStatus: getStaffCredentialStatusMock,
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: findOneMock,
    create: createMock,
    findById: findByIdMock,
    findByIdAndUpdate: findByIdAndUpdateMock,
    countDocuments: countDocumentsMock,
  },
}));

describe('/api/admin/team role guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStaffCredentialStatusMock.mockReturnValue('credentials_not_set');
    reserveUniqueStaffLoginIdMock.mockResolvedValue('desk.user');
    issueStaffSetupTokenMock.mockResolvedValue({ setupLink: 'http://localhost/setup-admin-account?token=test' });
  });

  it('prevents admin from creating a super admin account', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });

    const { POST } = await import('@/app/api/admin/team/route');
    const response = await POST(
      new Request('http://localhost/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Boss',
          email: 'boss@example.com',
          role: 'super_admin',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN',
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('prevents admin from changing a super admin through the update route', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    findByIdMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'super-1',
          role: 'super_admin',
        }),
      }),
    });

    const { PATCH } = await import('@/app/api/admin/team/[id]/route');
    const response = await PATCH(
      new Request('http://localhost/api/admin/team/super-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: 'super-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN',
    });
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
  });

  it('allows super admin to create a copy editor account', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });
    findOneMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      toObject: () => ({
        _id: 'user-1',
        name: 'Copy Desk',
        email: 'copy@example.com',
        image: '',
        role: 'copy_editor',
        loginId: 'copy.desk',
        isActive: true,
        passwordHash: '',
        setupTokenExpiresAt: null,
        passwordSetAt: null,
        lastLoginAt: null,
        createdAt: new Date('2026-04-09T00:00:00.000Z'),
      }),
    });

    const { POST } = await import('@/app/api/admin/team/route');
    const response = await POST(
      new Request('http://localhost/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Copy Desk',
          email: 'copy@example.com',
          role: 'copy_editor',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(payload.data.role).toBe('copy_editor');
    expect(payload.data.setupLink).toContain('/setup-admin-account?token=');
    expect(createMock).toHaveBeenCalled();
  });
});
