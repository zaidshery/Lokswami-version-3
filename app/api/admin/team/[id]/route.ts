import { NextRequest } from 'next/server';
import { apiError, apiSuccess, withAdminApi } from '@/lib/api/adminRoute';
import connectDB from '@/lib/db/mongoose';
import { canManageTargetAdminRole, canManageTeam } from '@/lib/auth/permissions';
import { getStaffCredentialStatus } from '@/lib/auth/staffCredentials';
import { isAdminRole, normalizeAdminRole } from '@/lib/auth/roles';
import User from '@/lib/models/User';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/getRateLimiter';
import { getClientIp } from '@/lib/security/ipUtils';
import {
  safeMutateSuperAdmin,
  LastSuperAdminRemovalError,
  SelfDemotionError,
  GovernanceLockTimeoutError,
} from '@/lib/auth/superAdminGovernance';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type TeamMemberRecord = {
  _id?: unknown;
  name?: string;
  email?: string;
  image?: string;
  role?: string;
  loginId?: string;
  passwordHash?: string;
  passwordSetAt?: Date | string | null;
  setupTokenExpiresAt?: Date | string | null;
  isActive?: boolean;
  lastLoginAt?: Date | string | null;
  createdAt?: Date | string;
};

function toTeamMember(record: TeamMemberRecord) {
  const normalizedRole = normalizeAdminRole(record.role);
  if (!normalizedRole) {
    return null;
  }

  return {
    id: typeof record._id?.toString === 'function' ? record._id.toString() : '',
    name: typeof record.name === 'string' ? record.name.trim() : '',
    email: typeof record.email === 'string' ? record.email.trim() : '',
    image: typeof record.image === 'string' ? record.image.trim() : '',
    role: normalizedRole,
    loginId: typeof record.loginId === 'string' ? record.loginId.trim() : '',
    isActive: record.isActive !== false,
    credentialStatus: getStaffCredentialStatus({
      passwordHash: typeof record.passwordHash === 'string' ? record.passwordHash : '',
      setupTokenExpiresAt: record.setupTokenExpiresAt || null,
    }),
    passwordSetAt: record.passwordSetAt ? new Date(record.passwordSetAt).toISOString() : null,
    setupExpiresAt: record.setupTokenExpiresAt
      ? new Date(record.setupTokenExpiresAt).toISOString()
      : null,
    lastLoginAt: record.lastLoginAt ? new Date(record.lastLoginAt).toISOString() : null,
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : null,
  };
}

export const PATCH = withAdminApi<RouteContext>(
  async (req: NextRequest, context: RouteContext, { admin, requestId }) => {
    const rateLimit = await checkRateLimit({
      scope: 'admin_mutation_sensitive',
      identifier: admin.id || getClientIp(req),
    });
    if (!rateLimit.allowed) {
      return apiError(
        'Too many administrative mutations. Please try again later.',
        429,
        'RATE_LIMITED',
        requestId,
        getRateLimitHeaders(rateLimit)
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.role === 'string') {
      if (!isAdminRole(body.role)) {
        return apiError('Valid admin role is required', 400, 'VALIDATION_ERROR', requestId);
      }

      updates.role = body.role;
    }

    if (typeof body.isActive === 'boolean') {
      updates.isActive = body.isActive;
    }

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body.image === 'string') {
      const image = body.image.trim();
      if (image && !image.startsWith('/') && !/^https?:\/\//i.test(image)) {
        return apiError('Profile photo must be a local path or an http(s) URL', 400, 'VALIDATION_ERROR', requestId);
      }
      updates.image = image;
    }

    if (Object.keys(updates).length === 0) {
      return apiError('No valid updates provided', 400, 'VALIDATION_ERROR', requestId);
    }

    await connectDB();
    const existingUser = await User.findById(id).select('_id role isActive').lean<{
      _id?: unknown;
      role?: unknown;
      isActive?: boolean;
    } | null>();

    if (!existingUser) {
      return apiError('Member not found', 404, 'NOT_FOUND', requestId);
    }

    const currentRole = normalizeAdminRole(existingUser.role);
    if (!currentRole) {
      return apiError('Only admin-side members can be managed here', 400, 'BAD_REQUEST', requestId);
    }

    if (!canManageTargetAdminRole(admin.role, currentRole)) {
      return apiError('Forbidden', 403, 'FORBIDDEN', requestId);
    }

    const nextRole = typeof updates.role === 'string' ? normalizeAdminRole(updates.role) : currentRole;
    if (!nextRole || !canManageTargetAdminRole(admin.role, nextRole)) {
      return apiError('You cannot assign that role', 403, 'FORBIDDEN', requestId);
    }

    try {
      const updatedUser = await safeMutateSuperAdmin({
        targetId: id,
        actorId: admin.id,
        currentRole,
        currentIsActive: existingUser.isActive !== false,
        nextRole,
        nextIsActive: typeof updates.isActive === 'boolean' ? updates.isActive : existingUser.isActive !== false,
        mutateFn: async (session) => {
          const query = User.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true }
          );
          if (session) {
            query.session(session);
          }
          return query.lean<TeamMemberRecord | null>();
        },
      });

      if (!updatedUser) {
        return apiError('Member not found', 404, 'NOT_FOUND', requestId);
      }

      const teamMember = toTeamMember(updatedUser);
      if (!teamMember) {
        return apiError('Managed user no longer has an admin role', 400, 'BAD_REQUEST', requestId);
      }

      return apiSuccess(teamMember);
    } catch (err: unknown) {
      if (err instanceof LastSuperAdminRemovalError) {
        return apiError(err.message, 400, 'LAST_ACTIVE_SUPER_ADMIN', requestId);
      }
      if (err instanceof SelfDemotionError) {
        return apiError(err.message, 400, 'SELF_DEMOTION_BLOCKED', requestId);
      }
      if (err instanceof GovernanceLockTimeoutError) {
        return apiError(err.message, 409, 'CONFLICT', requestId);
      }
      throw err;
    }
  },
  {
    authorize: (role) => canManageTeam(role),
    mutation: true,
  }
);

export const DELETE = withAdminApi<RouteContext>(
  async (req: NextRequest, context: RouteContext, { admin, requestId }) => {
    const rateLimit = await checkRateLimit({
      scope: 'admin_mutation_sensitive',
      identifier: admin.id || getClientIp(req),
    });
    if (!rateLimit.allowed) {
      return apiError(
        'Too many administrative mutations. Please try again later.',
        429,
        'RATE_LIMITED',
        requestId,
        getRateLimitHeaders(rateLimit)
      );
    }

    const { id } = await context.params;
    await connectDB();

    const existingUser = await User.findById(id).select('_id role isActive').lean<{
      _id?: unknown;
      role?: unknown;
      isActive?: boolean;
    } | null>();

    if (!existingUser) {
      return apiError('Member not found', 404, 'NOT_FOUND', requestId);
    }

    const currentRole = normalizeAdminRole(existingUser.role);
    if (!currentRole) {
      return apiError('Only admin-side members can be removed here', 400, 'BAD_REQUEST', requestId);
    }

    if (!canManageTargetAdminRole(admin.role, currentRole)) {
      return apiError('Forbidden', 403, 'FORBIDDEN', requestId);
    }

    try {
      await safeMutateSuperAdmin({
        targetId: id,
        actorId: admin.id,
        currentRole,
        currentIsActive: existingUser.isActive !== false,
        isDelete: true,
        mutateFn: async (session) => {
          const query = User.findByIdAndUpdate(
            id,
            {
              $set: {
                role: 'reader',
                isActive: true,
              },
            },
            { new: true }
          );
          if (session) {
            query.session(session);
          }
          return query.lean<TeamMemberRecord | null>();
        },
      });

      return apiSuccess(null);
    } catch (err: unknown) {
      if (err instanceof LastSuperAdminRemovalError) {
        return apiError(err.message, 400, 'LAST_ACTIVE_SUPER_ADMIN', requestId);
      }
      if (err instanceof SelfDemotionError) {
        return apiError(err.message, 400, 'SELF_DEMOTION_BLOCKED', requestId);
      }
      if (err instanceof GovernanceLockTimeoutError) {
        return apiError(err.message, 409, 'CONFLICT', requestId);
      }
      throw err;
    }
  },
  {
    authorize: (role) => canManageTeam(role),
    mutation: true,
  }
);
