import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canManageTargetAdminRole, canManageTeam } from '@/lib/auth/permissions';
import { issueStaffSetupToken, reserveUniqueStaffLoginId } from '@/lib/auth/staffCredentials';
import { normalizeAdminRole } from '@/lib/auth/roles';
import User from '@/lib/models/User';
import { sendTeamInviteEmail } from '@/lib/notifications/teamInviteEmail';
import { resolveShareRequestOrigin } from '@/lib/server/requestOrigin';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageTeam(admin.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    await connectDB();

    const member = await User.findById(id).select('_id email role loginId').lean<{
      _id?: unknown;
      email?: string;
      role?: unknown;
      loginId?: string;
    } | null>();

    if (!member) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    const targetRole = normalizeAdminRole(member.role);

    if (!targetRole) {
      return NextResponse.json(
        { success: false, error: 'Setup links are only available for admin-side team members' },
        { status: 400 }
      );
    }

    if (!canManageTargetAdminRole(admin.role, targetRole)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const userId = typeof member._id?.toString === 'function' ? member._id.toString() : '';
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Invalid team member' }, { status: 400 });
    }

    let loginId = typeof member.loginId === 'string' ? member.loginId.trim().toLowerCase() : '';
    if (!loginId) {
      loginId = await reserveUniqueStaffLoginId({
        email: typeof member.email === 'string' ? member.email.trim() : '',
        excludeUserId: userId,
      });

      await User.findByIdAndUpdate(userId, {
        $set: { loginId },
      });
    }

    const setup = await issueStaffSetupToken({
      userId,
      origin: resolveShareRequestOrigin(req),
    });

    let setupEmailSent = false;
    if (setup.setupLink) {
      const emailResult = await sendTeamInviteEmail({
        to: typeof member.email === 'string' ? member.email : '',
        name: '',
        role: targetRole,
        setupLink: setup.setupLink,
      });
      setupEmailSent = emailResult.sent;
    }

    return NextResponse.json({
      success: true,
      data: {
        loginId,
        setupLink: setup.setupLink,
        setupExpiresAt: setup.setupExpiresAt,
        setupEmailSent,
      },
    });
  } catch (error) {
    console.error('Team setup-link POST failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate setup link' },
      { status: 500 }
    );
  }
}
