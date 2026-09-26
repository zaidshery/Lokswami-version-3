import { withAdminMutation } from '@/lib/api/adminRoute';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runDueLeadershipReportSchedules } from '@/lib/admin/leadershipReportRunner';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';

function safeCompareSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function hasValidCronSecret(req: NextRequest): boolean {
  const configured = String(process.env.LEADERSHIP_REPORT_CRON_SECRET || '').trim();
  if (!configured) return false;

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (safeCompareSecret(bearer, configured)) {
      return true;
    }
  }

  const directHeader = String(req.headers.get('x-lokswami-cron-secret') || '').trim();
  if (directHeader && safeCompareSecret(directHeader, configured)) {
    return true;
  }

  const url = new URL(req.url);
  const querySecret = String(url.searchParams.get('secret') || '').trim();
  if (querySecret) {
    if (process.env.NODE_ENV === 'production') {
      // In production, reject query-string secret transport
      return false;
    }
    // In dev/test/staging: emit safe deprecation warning without logging secret
    console.warn(
      '[DEPRECATION] Passing cron secret via ?secret= query parameter is deprecated and disallowed in production. Use Authorization: Bearer or X-Lokswami-Cron-Secret header.'
    );
    if (safeCompareSecret(querySecret, configured)) {
      return true;
    }
  }

  return false;
}

async function authorize(req: NextRequest) {
  if (hasValidCronSecret(req)) {
    return null;
  }

  const admin = await getAdminSessionFromReq(req);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageLeadershipReports(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

async function handleRunDue(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  try {
    const payload = await runDueLeadershipReportSchedules();

    return NextResponse.json({
      success: true,
      data: {
        dueCount: payload.dueCount,
        runCount: payload.runCount,
        criticalAlertNotification: payload.criticalAlertNotification,
        results: payload.results.map((result) => ({
          ok: result.ok,
          scheduleId: result.schedule?.id || null,
          summary: result.summary,
          historyId: result.historyEntry?.id || null,
          error: result.error || null,
        })),
      },
    });
  } catch (error) {
    console.error('Leadership report cron run failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run due leadership reports.' },
      { status: 500 }
    );
  }
}

async function POSTHandler(req: NextRequest) {
  return handleRunDue(req);
}

export const POST = withAdminMutation(POSTHandler, { machineRequest: hasValidCronSecret });
