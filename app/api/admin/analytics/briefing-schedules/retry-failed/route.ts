import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextResponse } from 'next/server';
import { runFailedLeadershipReportSchedules } from '@/lib/admin/leadershipReportRunner';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';

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

async function POSTHandler() {
  const adminResult = await requireLeadershipAdmin();
  if (!adminResult.ok) {
    return adminResult.response;
  }

  try {
    const payload = await runFailedLeadershipReportSchedules({
      actorEmail: adminResult.admin.email,
    });

    return NextResponse.json({
      success: true,
      data: {
        failedCount: payload.failedCount,
        retryCount: payload.retryCount,
        results: payload.results.map((result) => ({
          ok: result.ok,
          schedule: result.schedule,
          summary: result.summary,
          historyEntry: result.historyEntry || null,
          error: result.error || null,
        })),
      },
    });
  } catch (error) {
    console.error('Leadership report failed-run retry route failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retry failed leadership reports.' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
