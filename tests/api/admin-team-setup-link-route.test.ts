import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const connectDBMock = vi.fn();
const reserveUniqueStaffLoginIdMock = vi.fn();
const issueStaffSetupTokenMock = vi.fn();
const findByIdMock = vi.fn();
const findByIdAndUpdateMock = vi.fn();
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/auth/staffCredentials', () => ({
  issueStaffSetupToken: issueStaffSetupTokenMock,
  reserveUniqueStaffLoginId: reserveUniqueStaffLoginIdMock,
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findById: findByIdMock,
    findByIdAndUpdate: findByIdAndUpdateMock,
  },
}));

describe('/api/admin/team/[id]/setup-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    issueStaffSetupTokenMock.mockResolvedValue({
      setupLink: 'http://localhost/setup-admin-account?token=fresh',
      setupExpiresAt: '2026-04-11T00:00:00.000Z',
    });
  });

  afterEach(() => {
    if (typeof originalSiteUrl === 'undefined') {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      return;
    }

    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it('prevents admin from generating a setup link for a super admin account', async () => {
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
          email: 'boss@example.com',
          role: 'super_admin',
          loginId: 'boss',
        }),
      }),
    });

    const { POST } = await import('@/app/api/admin/team/[id]/setup-link/route');
    const response = await POST(
      new Request('http://localhost/api/admin/team/super-1/setup-link', {
        method: 'POST',
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: 'super-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      success: false,
      error: 'Forbidden',
    });
    expect(issueStaffSetupTokenMock).not.toHaveBeenCalled();
  });

  it('backfills login ID and returns a setup link for a copy editor account', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });
    reserveUniqueStaffLoginIdMock.mockResolvedValue('copy.desk');
    findByIdMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'copy-1',
          email: 'copy@example.com',
          role: 'copy_editor',
          loginId: '',
        }),
      }),
    });

    const { POST } = await import('@/app/api/admin/team/[id]/setup-link/route');
    const response = await POST(
      new Request('http://localhost/api/admin/team/copy-1/setup-link', {
        method: 'POST',
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: 'copy-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: {
        loginId: 'copy.desk',
        setupLink: 'http://localhost/setup-admin-account?token=fresh',
        setupExpiresAt: '2026-04-11T00:00:00.000Z',
        setupEmailSent: false,
      },
    });
    expect(reserveUniqueStaffLoginIdMock).toHaveBeenCalledWith({
      email: 'copy@example.com',
      excludeUserId: 'copy-1',
    });
    expect(findByIdAndUpdateMock).toHaveBeenCalledWith('copy-1', {
      $set: { loginId: 'copy.desk' },
    });
    expect(issueStaffSetupTokenMock).toHaveBeenCalledWith({
      userId: 'copy-1',
      origin: 'http://localhost:3000',
    });
  });

  it('uses the configured public origin when the proxy forwards an internal host', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lokswami.com';
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });
    findByIdMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'copy-1',
          email: 'copy@example.com',
          role: 'copy_editor',
          loginId: 'copy.desk',
        }),
      }),
    });

    const { POST } = await import('@/app/api/admin/team/[id]/setup-link/route');
    const response = await POST(
      new Request('http://0.0.0.0:3000/api/admin/team/copy-1/setup-link', {
        method: 'POST',
        headers: {
          'x-forwarded-host': '0.0.0.0:3000',
          'x-forwarded-proto': 'https',
        },
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: 'copy-1' }) }
    );

    expect(response.status).toBe(200);
    expect(issueStaffSetupTokenMock).toHaveBeenCalledWith({
      userId: 'copy-1',
      origin: 'https://lokswami.com',
    });
  });
});
