import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken } from 'next-auth/jwt';
import User from '@/lib/models/User';
import { getAdminSessionFromReq, getSuperAdminSessionFromReq } from '@/lib/auth/admin';
import { reserveUniqueStaffLoginId } from '@/lib/auth/staffCredentials';

vi.mock('next-auth', () => ({
  default: vi.fn().mockReturnValue({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  CredentialsSignin: class extends Error {},
}));

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

vi.mock('@/lib/auth/jwtSecret', () => ({
  getJwtSecretOrNull: vi.fn().mockReturnValue('test-jwt-secret-key-32-chars-long'),
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

import { authOptions } from '@/lib/auth';

vi.mock('@/lib/models/User', () => ({
  default: {
    findById: vi.fn(),
    findOne: vi.fn(),
    exists: vi.fn(),
  },
}));

function createMockRequest() {
  const headers = new Headers();
  const cookies = new Map<string, string>();
  cookies.set('lokswami_session', 'mock-token-cookie');

  return {
    headers,
    cookies: {
      getAll: () => Array.from(cookies.entries()).map(([name, value]) => ({ name, value })),
    },
  } as unknown as NextRequest;
}

function mockDbUser(user: Record<string, unknown> | null) {
  vi.mocked(User.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(user),
    }),
  } as unknown as ReturnType<typeof User.findById>);
}

describe('Phase 3.5A — Auth & Session Integrity Hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.ADMIN_LOGIN_ID = 'qa.superadmin';
    process.env.ADMIN_USERNAME = 'legacy.admin';
  });

  describe('Bootstrap Super Admin Precedence', () => {
    it('returns super_admin role for env-admin identity without querying database', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: 'env-admin:qa.superadmin',
        email: 'qa.superadmin@lokswami.local',
        name: 'QA Super Admin',
        role: 'super_admin',
        isActive: true,
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);

      expect(session).toEqual({
        id: 'env-admin:qa.superadmin',
        email: 'qa.superadmin@lokswami.local',
        name: 'QA Super Admin',
        username: 'qa.superadmin@lokswami.local',
        role: 'super_admin',
      });

      expect(User.findById).not.toHaveBeenCalled();
    });

    it('super admin req helper approves env-admin session directly', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: 'env-admin:qa.superadmin',
        email: 'qa.superadmin@lokswami.local',
        name: 'QA Super Admin',
        role: 'super_admin',
        isActive: true,
      });

      const req = createMockRequest();
      const session = await getSuperAdminSessionFromReq(req);

      expect(session).not.toBeNull();
      expect(session?.role).toBe('super_admin');
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('session callback preserves super_admin role and ignores matching MongoDB user', async () => {
      const { session: sessionCallback } = authOptions.callbacks || {};
      expect(sessionCallback).toBeDefined();

      // Even if MongoDB findOne returns a user with the same email demoted to reader
      vi.mocked(User.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439099',
          email: 'qa.superadmin@lokswami.local',
          role: 'reader',
          isActive: true,
        }),
      } as unknown as ReturnType<typeof User.findOne>);

      const token = {
        userId: 'env-admin:qa.superadmin',
        email: 'qa.superadmin@lokswami.local',
        name: 'QA Super Admin',
        role: 'super_admin',
        isActive: true,
      };

      const session = {
        user: {
          id: '',
          userId: '',
          email: 'qa.superadmin@lokswami.local',
          name: 'QA Super Admin',
          role: 'super_admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };

      // @ts-expect-error test arguments for session callback
      const result = await sessionCallback!({ session, token });

      expect(result?.user?.role).toBe('super_admin');
      expect(result?.user?.isActive).toBe(true);
      expect(result?.user?.userId).toBe('env-admin:qa.superadmin');
      expect(User.findOne).not.toHaveBeenCalled();
    });

    it('session callback hydrates DB-backed staff normally', async () => {
      const { session: sessionCallback } = authOptions.callbacks || {};
      expect(sessionCallback).toBeDefined();

      vi.mocked(User.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          email: 'staff@lokswami.local',
          role: 'admin',
          name: 'Staff Admin',
          isActive: true,
        }),
      } as unknown as ReturnType<typeof User.findOne>);

      const token = {
        userId: '507f1f77bcf86cd799439011',
        email: 'staff@lokswami.local',
        name: 'Staff Admin',
        role: 'reporter', // stale token
        isActive: true,
      };

      const session = {
        user: {
          id: '',
          userId: '',
          email: 'staff@lokswami.local',
          name: 'Staff Admin',
          role: 'reporter' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };

      // @ts-expect-error test arguments for session callback
      const result = await sessionCallback!({ session, token });

      expect(result?.user?.role).toBe('admin');
      expect(User.findOne).toHaveBeenCalledWith({ email: 'staff@lokswami.local' });
    });
  });

  describe('DB-Backed Staff Session Freshness', () => {
    const validStaffId = '507f1f77bcf86cd799439011';

    it('rehydrates active DB admin with fresh database role', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'editor@lokswami.local',
        role: 'reporter', // stale token says reporter
        isActive: true,
      });

      mockDbUser({
        _id: validStaffId,
        role: 'admin', // fresh DB role promoted to admin
        isActive: true,
        name: 'Promoted Editor',
        email: 'editor@lokswami.local',
        loginId: 'promoted.editor',
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);

      expect(session).toEqual({
        id: validStaffId,
        email: 'editor@lokswami.local',
        name: 'Promoted Editor',
        username: 'promoted.editor',
        role: 'admin',
      });
      expect(User.findById).toHaveBeenCalledWith(validStaffId);
    });

    it('immediately reflects role demotion and strips super_admin privileges', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'staff@lokswami.local',
        role: 'super_admin', // stale token still claims super_admin
        isActive: true,
      });

      mockDbUser({
        _id: validStaffId,
        role: 'copy_editor', // DB demoted to copy_editor
        isActive: true,
        name: 'Demoted Staff',
        email: 'staff@lokswami.local',
        loginId: 'demoted.staff',
      });

      const req = createMockRequest();
      const adminSession = await getAdminSessionFromReq(req);
      expect(adminSession?.role).toBe('copy_editor');

      // Super admin check must immediately fail
      const superAdminSession = await getSuperAdminSessionFromReq(req);
      expect(superAdminSession).toBeNull();
    });

    it('denies access if DB user isActive is false', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'deactivated@lokswami.local',
        role: 'admin',
        isActive: true, // token claims active
      });

      mockDbUser({
        _id: validStaffId,
        role: 'admin',
        isActive: false, // DB says deactivated
        name: 'Deactivated User',
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);
      expect(session).toBeNull();
    });

    it('denies access if DB user no longer exists', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'deleted@lokswami.local',
        role: 'admin',
        isActive: true,
      });

      mockDbUser(null);

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);
      expect(session).toBeNull();
    });

    it('denies access if DB user role is demoted to non-admin role (reader)', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'demoted.reader@lokswami.local',
        role: 'admin',
        isActive: true,
      });

      mockDbUser({
        _id: validStaffId,
        role: 'reader', // reader is not an admin role
        isActive: true,
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);
      expect(session).toBeNull();
    });

    it('fails closed when token userId is malformed', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: 'malformed-non-object-id',
        email: 'bad@lokswami.local',
        role: 'admin',
        isActive: true,
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);
      expect(session).toBeNull();
      expect(User.findById).not.toHaveBeenCalled();
    });
  });

  describe('Staff Login ID Collision Protection', () => {
    it('avoids colliding with configured ADMIN_LOGIN_ID and appends suffix', async () => {
      vi.mocked(User.exists).mockResolvedValue(null);

      const loginId = await reserveUniqueStaffLoginId({
        preferredLoginId: 'qa.superadmin',
      });

      // Must NOT be 'qa.superadmin'; must be suffixed to 'qa.superadmin-2'
      expect(loginId).toBe('qa.superadmin-2');
    });

    it('avoids case-insensitive collision with configured ADMIN_LOGIN_ID', async () => {
      vi.mocked(User.exists).mockResolvedValue(null);

      const loginId = await reserveUniqueStaffLoginId({
        preferredLoginId: 'QA.SuperAdmin',
      });

      expect(loginId).toBe('qa.superadmin-2');
    });

    it('avoids colliding with configured legacy ADMIN_USERNAME', async () => {
      vi.mocked(User.exists).mockResolvedValue(null);

      const loginId = await reserveUniqueStaffLoginId({
        preferredLoginId: 'legacy.admin',
      });

      expect(loginId).toBe('legacy.admin-2');
    });

    it('issues non-colliding staff login ID without unnecessary suffixing', async () => {
      vi.mocked(User.exists).mockResolvedValue(null);

      const loginId = await reserveUniqueStaffLoginId({
        preferredLoginId: 'qa.reporter',
      });

      expect(loginId).toBe('qa.reporter');
    });

    it('preserves existing MongoDB duplicate suffixing behavior', async () => {
      vi.mocked(User.exists)
        .mockResolvedValueOnce({ _id: 'existing-1' } as never)
        .mockResolvedValueOnce(null);

      const loginId = await reserveUniqueStaffLoginId({
        preferredLoginId: 'qa.reporter',
      });

      expect(loginId).toBe('qa.reporter-2');
    });
  });
});
