import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { runFailedLeadershipReportSchedules } from '@/lib/admin/leadershipReportRunner';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';
import { logAuditAction } from '@/lib/security/auditLogger';
import { getClientIp } from '@/lib/security/ipUtils';

async function POSTHandler(request: NextRequest) {
  const admin = await getAdminSessionFromReq(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageLeadershipReports(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const startTime = Date.now();
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    const payload = await runFailedLeadershipReportSchedules({
      actorEmail: admin.email,
    });

    void logAuditAction({
      action: 'retry',
      resourceType: 'settings',
      resourceName: 'Retry Failed Leadership Reports',
      userId: admin.id,
      userEmail: admin.email,
      userRole: admin.role,
      method: 'POST',
      endpoint: '/api/admin/analytics/briefing-schedules/retry-failed',
      statusCode: 200,
      duration: Date.now() - startTime,
      ipAddress: clientIp,
      userAgent,
      requestData: {
        failedCount: payload.failedCount,
        retryCount: payload.retryCount,
      },
      responseStatus: 'success',
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

    void logAuditAction({
      action: 'retry',
      resourceType: 'settings',
      resourceName: 'Retry Failed Leadership Reports',
      userId: admin.id,
      userEmail: admin.email,
      userRole: admin.role,
      method: 'POST',
      endpoint: '/api/admin/analytics/briefing-schedules/retry-failed',
      statusCode: 500,
      duration: Date.now() - startTime,
      ipAddress: clientIp,
      userAgent,
      errorMessage: error instanceof Error ? error.message : 'Unknown retry failure',
      responseStatus: 'error',
    });

    return NextResponse.json(
      { success: false, error: 'Failed to retry failed leadership reports.' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
