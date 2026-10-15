import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canRunGlobalAiOps } from '@/lib/auth/permissions';
import { processQueuedTtsAssets } from '@/lib/server/ttsAssets';

function hasCronSecret(request: NextRequest) {
  const expected = process.env.ADMIN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  return request.headers.get('x-cron-secret')?.trim() === expected;
}

async function authorizeWorker(request: NextRequest) {
  if (hasCronSecret(request)) return null;

  const admin = await getAdminSessionFromReq(request);
  if (!admin) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    );
  }

  if (!canRunGlobalAiOps(admin.role)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Forbidden',
        code: 'FORBIDDEN',
      },
      { status: 403 }
    );
  }

  return null;
}

async function POSTHandler(request: NextRequest) {
  const denied = await authorizeWorker(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const rawLimit = typeof body.limit === 'number' ? body.limit : Number(body.limit || 5);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 5;
  const summary = await processQueuedTtsAssets({ limit });

  return NextResponse.json({
    success: true,
    data: summary,
  });
}

export const POST = withAdminMutation(POSTHandler, { machineRequest: hasCronSecret });
