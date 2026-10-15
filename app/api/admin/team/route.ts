import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess, withAdminApi } from '@/lib/api/adminRoute';
import connectDB from '@/lib/db/mongoose';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  canManageTargetAdminRole,
  canManageTeam,
  getAssignableAdminRoles,
} from '@/lib/auth/permissions';
import {
  getStaffCredentialStatus,
  issueStaffSetupToken,
  reserveUniqueStaffLoginId,
} from '@/lib/auth/staffCredentials';
import {
  ADMIN_ROLE_QUERY_VALUES,
  isAdminRole,
  normalizeAdminRole,
} from '@/lib/auth/roles';
import User from '@/lib/models/User';
import { sendTeamInviteEmail } from '@/lib/notifications/teamInviteEmail';
import { resolveShareRequestOrigin } from '@/lib/server/requestOrigin';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/getRateLimiter';
import { getClientIp } from '@/lib/security/ipUtils';

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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageTeam(admin.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();
    const members = (await User.find({ role: { $in: ADMIN_ROLE_QUERY_VALUES } })
      .sort({ createdAt: 1 })
      .lean()) as unknown as TeamMemberRecord[];

    const assignableRoles = new Set(getAssignableAdminRoles(admin.role));

    return NextResponse.json({
      success: true,
      data: members
        .map(toTeamMember)
        .filter((member): member is NonNullable<ReturnType<typeof toTeamMember>> => {
          if (!member) {
            return false;
          }

          return assignableRoles.has(member.role);
        }),
    });
  } catch (error) {
    console.error('Team GET failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load team members' },
      { status: 500 }
    );
  }
}

export const POST = withAdminApi(
  async (req: NextRequest, _context: Record<string, never>, { admin, requestId }) => {
    const rateLimit = await checkRateLimit({
      scope: 'staff_invite',
      identifier: admin.id || getClientIp(req),
    });
    if (!rateLimit.allowed) {
      return apiError(
        'Too many staff invitations. Please try again later.',
        429,
        'RATE_LIMITED',
        requestId,
        getRateLimitHeaders(rateLimit)
      );
    }

    const body = await req.json();
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role = typeof body.role === 'string' ? body.role : '';

    if (!email || !isValidEmail(email)) {
      return apiError('Valid email is required', 400, 'VALIDATION_ERROR');
    }

    if (!isAdminRole(role)) {
      return apiError('Valid admin role is required', 400, 'VALIDATION_ERROR');
    }

    if (!canManageTargetAdminRole(admin.role, role)) {
      return apiError('You cannot assign that role', 403, 'FORBIDDEN');
    }

    await connectDB();

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      existingUser.name = name || existingUser.name || email.split('@')[0] || 'Team Member';
      existingUser.role = role;
      existingUser.isActive = true;
      existingUser.loginId =
        typeof existingUser.loginId === 'string' && existingUser.loginId.trim()
          ? existingUser.loginId.trim().toLowerCase()
          : await reserveUniqueStaffLoginId({
              email,
              name: existingUser.name,
              excludeUserId:
                typeof existingUser._id?.toString === 'function'
                  ? existingUser._id.toString()
                  : undefined,
            });
      await existingUser.save();

      const updatedUser = existingUser.toObject();
      const userId =
        typeof updatedUser._id?.toString === 'function' ? updatedUser._id.toString() : '';
      const setup = userId
        ? await issueStaffSetupToken({ userId, origin: resolveShareRequestOrigin(req) })
        : null;

      let setupEmailSent = false;
      if (setup?.setupLink) {
        const emailResult = await sendTeamInviteEmail({
          to: email,
          name: existingUser.name,
          role: role,
          setupLink: setup.setupLink,
        });
        setupEmailSent = emailResult.sent;
      }

      return apiSuccess({
          ...toTeamMember(updatedUser),
          setupLink: setup?.setupLink || '',
          setupEmailSent,
      });
    }

    const loginId = await reserveUniqueStaffLoginId({ email, name });
    const createdUser = await User.create({
      email,
      name: name || email.split('@')[0] || 'Team Member',
      image: '',
      role,
      loginId,
      isActive: true,
      savedArticles: [],
      preferredLanguage: 'hi',
      preferredCategories: [],
      notificationsEnabled: false,
    });

    const createdObject = createdUser.toObject();
    const userId =
      typeof createdObject._id?.toString === 'function' ? createdObject._id.toString() : '';
    const setup = userId
      ? await issueStaffSetupToken({ userId, origin: resolveShareRequestOrigin(req) })
      : null;

    let setupEmailSent = false;
    if (setup?.setupLink) {
      const emailResult = await sendTeamInviteEmail({
        to: email,
        name: createdUser.name,
        role: role,
        setupLink: setup.setupLink,
      });
      setupEmailSent = emailResult.sent;
    }

    return apiSuccess(
      {
          ...toTeamMember(createdObject),
          setupLink: setup?.setupLink || '',
          setupEmailSent,
      },
      { status: 201 }
    );
  },
  {
    authorize: (role) => canManageTeam(role),
    mutation: true,
  }
);
