import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken } from 'next-auth/jwt';
import { auth } from '@/lib/auth';
import User from '@/lib/models/User';
import {
  getAdminSession,
  getSuperAdminSession,
  getAdminSessionFromReq,
  getSuperAdminSessionFromReq,
} from '@/lib/auth/admin';
import {
  runWithAdminMutationContext,
  getAdminMutationContext,
} from '@/lib/security/adminMutationContext';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
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

describe('Phase 3.10C — Admin Session Freshness & Rehydration Invariants', () => {
  const validStaffId = '507f1f77bcf86cd799439011';
  const bootstrapId = 'env-admin:qa.superadmin';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Bootstrap Administrator Session', () => {
    it('authorizes bootstrap admin without MongoDB lookups for Server Components (getAdminSession)', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: bootstrapId,
          userId: bootstrapId,
          email: 'qa.superadmin@lokswami.local',
          name: 'QA Super Admin',
          role: 'super_admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      const session = await getAdminSession();
      const superSession = await getSuperAdminSession();

      expect(session).toEqual({
        id: bootstrapId,
        email: 'qa.superadmin@lokswami.local',
        name: 'QA Super Admin',
        username: 'qa.superadmin@lokswami.local',
        role: 'super_admin',
      });
      expect(superSession).toEqual(session);
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('authorizes bootstrap admin without MongoDB lookups for API requests (getAdminSessionFromReq)', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: bootstrapId,
        email: 'qa.superadmin@lokswami.local',
        name: 'QA Super Admin',
        role: 'super_admin',
        isActive: true,
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);
      const superSession = await getSuperAdminSessionFromReq(req);

      expect(session?.role).toBe('super_admin');
      expect(superSession?.role).toBe('super_admin');
      expect(User.findById).not.toHaveBeenCalled();
    });
  });

  describe('Active Super Admin DB User', () => {
    it('rehydrates active super admin from DB with full privileges', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'founder@lokswami.local',
          name: 'Founder',
          role: 'super_admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      mockDbUser({
        _id: validStaffId,
        role: 'super_admin',
        isActive: true,
        name: 'Founder Name',
        email: 'founder@lokswami.local',
        loginId: 'founder',
      });

      const session = await getAdminSession();
      const superSession = await getSuperAdminSession();

      expect(session?.role).toBe('super_admin');
      expect(session?.name).toBe('Founder Name');
      expect(session?.username).toBe('founder');
      expect(superSession?.role).toBe('super_admin');
    });
  });

  describe('Demotion Freshness (super_admin → admin)', () => {
    it('Server Component: immediately strips super_admin access on role demotion in DB', async () => {
      // Stale JWT/session claims super_admin
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'demoted@lokswami.local',
          name: 'Demoted Staff',
          role: 'super_admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      // DB canonical role is now admin
      mockDbUser({
        _id: validStaffId,
        role: 'admin',
        isActive: true,
        name: 'Demoted Staff',
        email: 'demoted@lokswami.local',
        loginId: 'demoted.staff',
      });

      const adminSession = await getAdminSession();
      expect(adminSession).not.toBeNull();
      expect(adminSession?.role).toBe('admin');

      // getSuperAdminSession MUST fail closed immediately
      const superAdminSession = await getSuperAdminSession();
      expect(superAdminSession).toBeNull();
    });

    it('API request: immediately strips super_admin access on role demotion in DB', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'demoted@lokswami.local',
        name: 'Demoted Staff',
        role: 'super_admin',
        isActive: true,
      });

      mockDbUser({
        _id: validStaffId,
        role: 'admin',
        isActive: true,
        name: 'Demoted Staff',
        email: 'demoted@lokswami.local',
        loginId: 'demoted.staff',
      });

      const req = createMockRequest();
      const adminSession = await getAdminSessionFromReq(req);
      expect(adminSession?.role).toBe('admin');

      const superAdminSession = await getSuperAdminSessionFromReq(req);
      expect(superAdminSession).toBeNull();
    });

    it('updates mutation context actor with fresh canonical role after demotion', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'demoted@lokswami.local',
          name: 'Demoted Staff',
          role: 'super_admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      mockDbUser({
        _id: validStaffId,
        role: 'admin',
        isActive: true,
        name: 'Demoted Staff',
        email: 'demoted@lokswami.local',
        loginId: 'demoted.staff',
      });

      await runWithAdminMutationContext({ actor: null, csrfBlocked: false }, async () => {
        const session = await getAdminSession();
        expect(session?.role).toBe('admin');

        const context = getAdminMutationContext();
        expect(context?.actor).not.toBeNull();
        expect(context?.actor?.role).toBe('admin');
        expect(context?.actor?.role).not.toBe('super_admin');
      });
    });
  });

  describe('Reader Demotion (admin → reader)', () => {
    it('Server Component: rejects demoted reader from admin session completely', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'reader@lokswami.local',
          name: 'Former Staff',
          role: 'admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      mockDbUser({
        _id: validStaffId,
        role: 'reader',
        isActive: true,
        name: 'Former Staff',
        email: 'reader@lokswami.local',
      });

      const session = await getAdminSession();
      expect(session).toBeNull();

      const superSession = await getSuperAdminSession();
      expect(superSession).toBeNull();
    });

    it('API request: rejects demoted reader from admin API session', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'reader@lokswami.local',
        role: 'admin',
        isActive: true,
      });

      mockDbUser({
        _id: validStaffId,
        role: 'reader',
        isActive: true,
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);
      expect(session).toBeNull();
    });
  });

  describe('Deactivated Account (isActive: false)', () => {
    it('Server Component: denies access immediately if DB user isActive is false', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'deactivated@lokswami.local',
          name: 'Deactivated User',
          role: 'super_admin' as const,
          isActive: true, // token says active
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      mockDbUser({
        _id: validStaffId,
        role: 'super_admin',
        isActive: false, // DB says disabled
        name: 'Deactivated User',
        email: 'deactivated@lokswami.local',
      });

      const session = await getAdminSession();
      expect(session).toBeNull();

      const superSession = await getSuperAdminSession();
      expect(superSession).toBeNull();
    });

    it('API request: denies access immediately if DB user isActive is false', async () => {
      vi.mocked(getToken).mockResolvedValue({
        userId: validStaffId,
        email: 'deactivated@lokswami.local',
        role: 'super_admin',
        isActive: true,
      });

      mockDbUser({
        _id: validStaffId,
        role: 'super_admin',
        isActive: false,
      });

      const req = createMockRequest();
      const session = await getAdminSessionFromReq(req);
      expect(session).toBeNull();

      const superSession = await getSuperAdminSessionFromReq(req);
      expect(superSession).toBeNull();
    });
  });

  describe('Deleted or Missing DB User', () => {
    it('Server Component: returns null if DB user no longer exists', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'deleted@lokswami.local',
          name: 'Deleted User',
          role: 'admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      mockDbUser(null);

      const session = await getAdminSession();
      expect(session).toBeNull();
    });

    it('API request: returns null if DB user no longer exists', async () => {
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
  });

  describe('Malformed Claims & Database Failures', () => {
    it('returns null for non-ObjectId and non-bootstrap userId', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: 'invalid-id-format',
          userId: 'invalid-id-format',
          email: 'bad@lokswami.local',
          role: 'admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      const session = await getAdminSession();
      expect(session).toBeNull();
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('returns null when DB user has an unrecognized / invalid role', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'corrupt@lokswami.local',
          role: 'admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      mockDbUser({
        _id: validStaffId,
        role: 'unknown_role_xyz',
        isActive: true,
      });

      const session = await getAdminSession();
      expect(session).toBeNull();
    });

    it('fails closed and returns null when database throws an error', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          id: validStaffId,
          userId: validStaffId,
          email: 'staff@lokswami.local',
          role: 'super_admin' as const,
          isActive: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as any);

      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockRejectedValue(new Error('MongoNetworkError: connection timed out')),
        }),
      } as unknown as ReturnType<typeof User.findById>);

      const session = await getAdminSession();
      expect(session).toBeNull();

      const superSession = await getSuperAdminSession();
      expect(superSession).toBeNull();
    });
  });
});
