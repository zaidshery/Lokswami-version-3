import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';
import { acknowledgeLeadershipReportAlertNotification } from '@/lib/storage/leadershipReportAlertNotificationHistoryFile';

async function requireLeadershipAdmin() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (!canManageLeadershipReports(admin.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const, admin };
}

async function POSTHandler(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminResult = await requireLeadershipAdmin();
  if (!adminResult.ok) {
    return adminResult.response;
  }

  const params = await context.params;
  const id = String(params.id || '').trim();
  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Invalid alert notification.' },
      { status: 400 }
    );
  }

  try {
    const updated = await acknowledgeLeadershipReportAlertNotification(
      id,
      adminResult.admin.email
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Alert notification not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Leadership alert notification acknowledge route failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge alert notification.' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
