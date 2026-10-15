import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { runLeadershipReportSchedule } from '@/lib/admin/leadershipReportRunner';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';
import { parseLeadershipReportScheduleId } from '@/lib/storage/leadershipReportSchedulesFile';

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
  const id = parseLeadershipReportScheduleId(params.id);
  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Invalid leadership report schedule.' },
      { status: 400 }
    );
  }

  try {
    const result = await runLeadershipReportSchedule(id, {
      trigger: 'manual',
      actorEmail: adminResult.admin.email,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to generate leadership report.',
          data: result.schedule
            ? {
                schedule: result.schedule,
                report: result.report,
                historyEntry: result.historyEntry,
              }
            : undefined,
        },
        { status: result.error === 'Leadership report schedule not found.' ? 404 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        schedule: result.schedule,
        report: result.report,
        historyEntry: result.historyEntry,
      },
    });
  } catch (error) {
    console.error('Leadership report run route failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate leadership report.',
      },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
