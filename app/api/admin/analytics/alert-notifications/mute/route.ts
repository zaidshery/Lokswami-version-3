import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';
import {
  getLeadershipReportCriticalAlertState,
  saveLeadershipReportCriticalAlertState,
} from '@/lib/storage/leadershipReportCriticalAlertStateFile';

type MuteBody = Partial<{
  action: 'mute' | 'unmute';
  hours: number;
}>;

const ALLOWED_MUTE_HOURS = new Set([1, 8, 24]);

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

async function PATCHHandler(req: NextRequest) {
  const adminResult = await requireLeadershipAdmin();
  if (!adminResult.ok) {
    return adminResult.response;
  }

  try {
    const body = (await req.json().catch(() => ({}))) as MuteBody;
    const action = body.action === 'unmute' ? 'unmute' : 'mute';
    const currentState = await getLeadershipReportCriticalAlertState();

    if (action === 'unmute') {
      const nextState = await saveLeadershipReportCriticalAlertState({
        activeAlertIds: currentState.activeAlertIds,
        lastAlertSignature: '',
        lastNotifiedAt: currentState.lastNotifiedAt,
        mutedUntil: null,
        mutedByEmail: null,
        mutedReason: null,
      });

      return NextResponse.json({ success: true, data: nextState });
    }

    const hours = Number(body.hours);
    if (!ALLOWED_MUTE_HOURS.has(hours)) {
      return NextResponse.json(
        { success: false, error: 'A valid mute duration is required.' },
        { status: 400 }
      );
    }

    const mutedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const nextState = await saveLeadershipReportCriticalAlertState({
      activeAlertIds: currentState.activeAlertIds,
      lastAlertSignature: '',
      lastNotifiedAt: currentState.lastNotifiedAt,
      mutedUntil,
      mutedByEmail: adminResult.admin.email,
      mutedReason: `Muted for ${hours} hour${hours === 1 ? '' : 's'}.`,
    });

    return NextResponse.json({ success: true, data: nextState });
  } catch (error) {
    console.error('Leadership alert mute PATCH failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update leadership alert mute state.' },
      { status: 500 }
    );
  }
}

export const PATCH = withAdminMutation(PATCHHandler);
