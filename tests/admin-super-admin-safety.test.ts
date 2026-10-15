import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  isSuperAdminRemoval,
  assertRemainingActiveSuperAdmins,
  safeMutateSuperAdmin,
  LastSuperAdminRemovalError,
  SelfDemotionError,
  GovernanceLockTimeoutError,
} from '@/lib/auth/superAdminGovernance';
import {
  checkRateLimit,
  resetAllLimiters,
  destroyAllLimiters,
} from '@/lib/security/getRateLimiter';

const {
  getAdminSessionMock,
  getAdminSessionFromReqMock,
  connectDBMock,
  findByIdMock,
  findByIdAndUpdateMock,
  countDocumentsMock,
  findOneMock,
  findOneAndUpdateMock,
  createMock,
  findMock,
} = vi.hoisted(() => ({
  getAdminSessionMock: vi.fn(),
  getAdminSessionFromReqMock: vi.fn(),
  connectDBMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByIdAndUpdateMock: vi.fn(),
  countDocumentsMock: vi.fn(),
  findOneMock: vi.fn(),
  findOneAndUpdateMock: vi.fn(),
  createMock: vi.fn(),
  findMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findById: findByIdMock,
    findByIdAndUpdate: findByIdAndUpdateMock,
    countDocuments: countDocumentsMock,
    findOne: findOneMock,
    findOneAndUpdate: findOneAndUpdateMock,
    create: createMock,
    find: findMock,
  },
}));

vi.mock('@/lib/models/GovernanceLock', () => ({
  default: {
    findOneAndUpdate: vi.fn().mockImplementation((_query, update) =>
      Promise.resolve({ ownerId: update?.$set?.ownerId || 'mock-owner' })
    ),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
  },
}));

vi.mock('@/lib/security/auditLogger', () => ({
  logAdminMutationRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notifications/teamInviteEmail', () => ({
  sendTeamInviteEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

describe('3.10A Super Admin Governance & Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllLimiters();
    connectDBMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    destroyAllLimiters();
  });

  describe('Domain Helper: isSuperAdminRemoval', () => {
    it('returns false when target is not a super_admin', () => {
      expect(
        isSuperAdminRemoval({
          currentRole: 'admin',
          currentIsActive: true,
          nextRole: 'reader',
        })
      ).toBe(false);

      expect(
        isSuperAdminRemoval({
          currentRole: 'reporter',
          currentIsActive: true,
          nextIsActive: false,
        })
      ).toBe(false);

      expect(
        isSuperAdminRemoval({
          currentRole: 'copy_editor',
          currentIsActive: true,
          isDelete: true,
        })
      ).toBe(false);
    });

    it('returns false for safe super_admin updates (name, image, keeping role)', () => {
      expect(
        isSuperAdminRemoval({
          currentRole: 'super_admin',
          currentIsActive: true,
          nextRole: 'super_admin',
          nextIsActive: true,
        })
      ).toBe(false);
    });

    it('returns true when super_admin role is demoted', () => {
      expect(
        isSuperAdminRemoval({
          currentRole: 'super_admin',
          currentIsActive: true,
          nextRole: 'admin',
        })
      ).toBe(true);

      expect(
        isSuperAdminRemoval({
          currentRole: 'super_admin',
          currentIsActive: true,
          nextRole: 'reader',
        })
      ).toBe(true);
    });

    it('returns true when super_admin is deactivated', () => {
      expect(
        isSuperAdminRemoval({
          currentRole: 'super_admin',
          currentIsActive: true,
          nextIsActive: false,
        })
      ).toBe(true);
    });

    it('returns true when super_admin is soft-deleted', () => {
      expect(
        isSuperAdminRemoval({
          currentRole: 'super_admin',
          currentIsActive: true,
          isDelete: true,
        })
      ).toBe(true);
    });
  });

  describe('Domain Invariant: assertRemainingActiveSuperAdmins', () => {
    it('throws LastSuperAdminRemovalError when count of other active super admins is 0', async () => {
      countDocumentsMock.mockResolvedValue(0);

      await expect(
        assertRemainingActiveSuperAdmins('target-1', { actorId: 'other-actor' })
      ).rejects.toThrow(LastSuperAdminRemovalError);

      expect(countDocumentsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'super_admin',
          isActive: true,
          _id: { $nin: expect.arrayContaining(['target-1']) },
        })
      );
    });

    it('throws SelfDemotionError when actor targets themselves and no other active super admin exists', async () => {
      countDocumentsMock.mockResolvedValue(0);

      await expect(
        assertRemainingActiveSuperAdmins('self-id', { actorId: 'self-id' })
      ).rejects.toThrow(SelfDemotionError);
    });

    it('succeeds and returns count when another active super admin exists', async () => {
      countDocumentsMock.mockResolvedValue(1);

      const count = await assertRemainingActiveSuperAdmins('target-1', {
        actorId: 'actor-1',
      });
      expect(count).toBe(1);
    });
  });

  describe('Domain Safe Mutation: safeMutateSuperAdmin', () => {
    it('bypasses locking and checking for non-removal mutations', async () => {
      const mutateFn = vi.fn().mockResolvedValue('ok');

      const result = await safeMutateSuperAdmin({
        targetId: 'admin-1',
        currentRole: 'admin',
        nextRole: 'reporter',
        mutateFn,
      });

      expect(result).toBe('ok');
      expect(mutateFn).toHaveBeenCalledWith(null);
      expect(countDocumentsMock).not.toHaveBeenCalled();
    });

    it('serializes concurrent removals and rejects when invariant fails', async () => {
      let activeCount = 1;
      countDocumentsMock.mockImplementation(() => Promise.resolve(activeCount - 1));

      await expect(
        safeMutateSuperAdmin({
          targetId: 'super-1',
          actorId: 'super-1',
          currentRole: 'super_admin',
          currentIsActive: true,
          nextRole: 'admin',
          mutateFn: async () => {
            activeCount -= 1;
            return 'demoted';
          },
        })
      ).rejects.toThrow(SelfDemotionError);
    });
  });

  describe('Route Parity: PATCH /api/admin/team/[id]', () => {
    it('blocks self-demotion when actor is the sole active super admin', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-1',
        email: 'super1@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-1',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      countDocumentsMock.mockResolvedValue(0);

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
      expect(response.status).toBe(400);
      expect(payload.code).toBe('SELF_DEMOTION_BLOCKED');
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    });

    it('blocks deactivating the sole active super admin', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-owner',
        email: 'owner@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-target',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      countDocumentsMock.mockResolvedValue(0);

      const { PATCH } = await import('@/app/api/admin/team/[id]/route');
      const response = await PATCH(
        new Request('http://localhost/api/admin/team/super-target', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false }),
        }) as unknown as NextRequest,
        { params: Promise.resolve({ id: 'super-target' }) }
      );

      const payload = await response.json();
      expect(response.status).toBe(400);
      expect(payload.code).toBe('LAST_ACTIVE_SUPER_ADMIN');
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    });

    it('does NOT permit demotion when other super_admin accounts exist but are INACTIVE', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-1',
        email: 'super1@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-1',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      // MongoDB query checks { role: 'super_admin', isActive: true, _id: { $ne: targetId } }
      // Since the other super admin is inactive, count returns 0!
      countDocumentsMock.mockResolvedValue(0);

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
      expect(response.status).toBe(400);
      expect(payload.code).toBe('SELF_DEMOTION_BLOCKED');
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    });

    it('allows demotion when another ACTIVE super admin exists', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-1',
        email: 'super1@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-1',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      countDocumentsMock.mockResolvedValue(1); // 1 other ACTIVE super admin
      findByIdAndUpdateMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'super-1',
          name: 'Super One',
          email: 'super1@example.com',
          role: 'admin',
          isActive: true,
          loginId: 'super.1',
          passwordHash: 'hash',
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
      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.role).toBe('admin');
      expect(findByIdAndUpdateMock).toHaveBeenCalled();
    });
  });

  describe('Route Parity: DELETE /api/admin/team/[id]', () => {
    it('blocks soft-deleting the sole active super admin', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-1',
        email: 'super1@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-1',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      countDocumentsMock.mockResolvedValue(0);

      const { DELETE } = await import('@/app/api/admin/team/[id]/route');
      const response = await DELETE(
        new Request('http://localhost/api/admin/team/super-1', {
          method: 'DELETE',
        }) as unknown as NextRequest,
        { params: Promise.resolve({ id: 'super-1' }) }
      );

      const payload = await response.json();
      expect(response.status).toBe(400);
      expect(payload.code).toBe('SELF_DEMOTION_BLOCKED');
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    });

    it('allows soft-deleting super admin when another ACTIVE super admin exists', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-actor',
        email: 'actor@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-target',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      countDocumentsMock.mockResolvedValue(1);
      findByIdAndUpdateMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'super-target',
          role: 'reader',
          isActive: true,
        }),
      });

      const { DELETE } = await import('@/app/api/admin/team/[id]/route');
      const response = await DELETE(
        new Request('http://localhost/api/admin/team/super-target', {
          method: 'DELETE',
        }) as unknown as NextRequest,
        { params: Promise.resolve({ id: 'super-target' }) }
      );

      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
        'super-target',
        { $set: { role: 'reader', isActive: true } },
        { new: true }
      );
    });
  });

  describe('Route Parity: PATCH /api/admin/users', () => {
    it('blocks demoting the sole active super admin via Users API', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-1',
        email: 'super1@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-1',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      countDocumentsMock.mockResolvedValue(0);

      const { PATCH } = await import('@/app/api/admin/users/route');
      const response = await PATCH(
        new Request('http://localhost/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'super-1', role: 'reader' }),
        }) as unknown as NextRequest
      );

      const payload = await response.json();
      expect(response.status).toBe(400);
      expect(payload.code).toBe('SELF_DEMOTION_BLOCKED');
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    });

    it('blocks deactivating the sole active super admin via Users API', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-actor',
        email: 'actor@example.com',
        role: 'super_admin',
      });
      findByIdMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'super-target',
            role: 'super_admin',
            isActive: true,
          }),
        }),
      });
      countDocumentsMock.mockResolvedValue(0);

      const { PATCH } = await import('@/app/api/admin/users/route');
      const response = await PATCH(
        new Request('http://localhost/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'super-target', isActive: false }),
        }) as unknown as NextRequest
      );

      const payload = await response.json();
      expect(response.status).toBe(400);
      expect(payload.code).toBe('LAST_ACTIVE_SUPER_ADMIN');
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    });

    it('rejects unknown role string via Users API', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-1',
        email: 'super1@example.com',
        role: 'super_admin',
      });

      const { PATCH } = await import('@/app/api/admin/users/route');
      const response = await PATCH(
        new Request('http://localhost/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'user-1', role: 'super_hacker' }),
        }) as unknown as NextRequest
      );

      const payload = await response.json();
      expect(response.status).toBe(400);
      expect(payload.error).toMatch(/Invalid user role/i);
    });
  });

  describe('Rate Limiting on Sensitive Administrative Endpoints', () => {
    it('bounds staff invites (POST /api/admin/team)', async () => {
      const scope = 'staff_invite';
      const identifier = 'actor-rate-test-1';

      // 10 allowed in 10 minutes
      for (let i = 0; i < 10; i++) {
        const res = await checkRateLimit({ scope, identifier });
        expect(res.allowed).toBe(true);
      }

      // 11th must be blocked
      const blocked = await checkRateLimit({ scope, identifier });
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('bounds sensitive admin mutations (PATCH & DELETE /api/admin/team/[id], PATCH /api/admin/users)', async () => {
      const scope = 'admin_mutation_sensitive';
      const identifier = 'actor-rate-test-2';

      // 30 allowed in 5 minutes
      for (let i = 0; i < 30; i++) {
        const res = await checkRateLimit({ scope, identifier });
        expect(res.allowed).toBe(true);
      }

      // 31st must be blocked
      const blocked = await checkRateLimit({ scope, identifier });
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('bounds setup link regeneration (POST /api/admin/team/[id]/setup-link)', async () => {
      const scope = 'setup_link_regeneration';
      const identifier = 'actor:target-1';

      // 5 allowed in 15 minutes
      for (let i = 0; i < 5; i++) {
        const res = await checkRateLimit({ scope, identifier });
        expect(res.allowed).toBe(true);
      }

      // 6th must be blocked
      const blocked = await checkRateLimit({ scope, identifier });
      expect(blocked.allowed).toBe(false);
    });

    it('bounds staff setup redemption (POST /api/auth/staff-setup)', async () => {
      const scope = 'staff_setup_redemption';
      const identifier = 'client-ip-123';

      // 5 allowed in 15 minutes
      for (let i = 0; i < 5; i++) {
        const res = await checkRateLimit({ scope, identifier });
        expect(res.allowed).toBe(true);
      }

      // 6th must be blocked
      const blocked = await checkRateLimit({ scope, identifier });
      expect(blocked.allowed).toBe(false);
    });
  });

  describe('Concurrency & TOCTOU Safety', () => {
    it('prevents two simultaneous demotions from leaving zero active super admins', async () => {
      // Starting state: 2 active super admins (super-A and super-B)
      const usersInDb = new Map<string, { role: string; isActive: boolean }>([
        ['super-A', { role: 'super_admin', isActive: true }],
        ['super-B', { role: 'super_admin', isActive: true }],
      ]);

      // Dynamic countDocuments counting active super admins excluding target
      countDocumentsMock.mockImplementation((query: { _id?: { $nin?: string[] } }) => {
        const excludeList = query?._id?.$nin || [];
        let count = 0;
        for (const [id, user] of usersInDb.entries()) {
          if (!excludeList.includes(id) && user.role === 'super_admin' && user.isActive) {
            count++;
          }
        }
        return Promise.resolve(count);
      });

      // Two concurrent demotion operations initiated at the exact same time
      const op1 = safeMutateSuperAdmin({
        targetId: 'super-A',
        actorId: 'super-B',
        currentRole: 'super_admin',
        currentIsActive: true,
        nextRole: 'admin',
        mutateFn: async () => {
          usersInDb.get('super-A')!.role = 'admin';
          return 'demoted-A';
        },
      });

      const op2 = safeMutateSuperAdmin({
        targetId: 'super-B',
        actorId: 'super-A',
        currentRole: 'super_admin',
        currentIsActive: true,
        nextRole: 'admin',
        mutateFn: async () => {
          usersInDb.get('super-B')!.role = 'admin';
          return 'demoted-B';
        },
      });

      const results = await Promise.allSettled([op1, op2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed, and exactly one must fail with LastSuperAdminRemovalError
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError).toBeInstanceOf(LastSuperAdminRemovalError);
      expect(rejectedError.code).toBe('LAST_ACTIVE_SUPER_ADMIN');

      // Crucial: At least 1 active super admin MUST remain in the database!
      const remainingActiveSuperAdmins = Array.from(usersInDb.values()).filter(
        (u) => u.role === 'super_admin' && u.isActive
      );
      expect(remainingActiveSuperAdmins).toHaveLength(1);
    });
  });

  describe('Staff Setup Credential Security & One-Time Redemption', () => {
    it('enforces one-time redemption and rejects replay attacks', async () => {
      const { setStaffPasswordWithToken } = await import('@/lib/auth/staffCredentials');

      let tokenActive = true;
      findOneAndUpdateMock.mockImplementation((query: { setupTokenHash?: string }) => {
        if (!tokenActive) {
          // Token has already been consumed / cleared
          return {
            lean: vi.fn().mockResolvedValue(null),
          };
        }
        tokenActive = false; // Atomically claimed
        return {
          lean: vi.fn().mockResolvedValue({
            _id: 'user-staff-1',
            loginId: 'staff.member',
            email: 'staff@example.com',
            role: 'copy_editor',
          }),
        };
      });

      // First redemption: succeeds
      const firstAttempt = await setStaffPasswordWithToken({
        token: 'single-use-token-xyz',
        password: 'ValidPassword123!',
      });
      expect(firstAttempt.success).toBe(true);
      expect(firstAttempt.role).toBe('copy_editor');

      // Second redemption with the exact same token: must fail
      findOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      const secondAttempt = await setStaffPasswordWithToken({
        token: 'single-use-token-xyz',
        password: 'ValidPassword123!',
      });
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error).toBe('Invalid setup link');
    });
  });
});
