import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';
import {
  listLeadershipReportSchedules,
  parseLeadershipReportScheduleId,
  updateLeadershipReportSchedule,
} from '@/lib/storage/leadershipReportSchedulesFile';

type ScheduleUpdateBody = Partial<{
  id: string;
  enabled: boolean;
  deliveryTime: string;
  deliveryMode: 'dashboard_link' | 'markdown_export' | 'email_summary' | 'webhook_summary';
  recipientEmails: string[];
  webhookUrls: string[];
  webhookProvider: 'generic_json' | 'slack' | 'discord' | 'teams' | 'telegram';
  notes: string;
}>;

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

export async function GET() {
  const adminResult = await requireLeadershipAdmin();
  if (!adminResult.ok) {
    return adminResult.response;
  }

  const schedules = await listLeadershipReportSchedules();
  return NextResponse.json({ success: true, data: schedules });
}

async function PATCHHandler(req: NextRequest) {
  const adminResult = await requireLeadershipAdmin();
  if (!adminResult.ok) {
    return adminResult.response;
  }

  try {
    const body = (await req.json().catch(() => ({}))) as ScheduleUpdateBody;
    const id = parseLeadershipReportScheduleId(body.id);

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'A valid schedule id is required.' },
        { status: 400 }
      );
    }

    const schedule = await updateLeadershipReportSchedule(id, {
      enabled: body.enabled,
      deliveryTime: body.deliveryTime,
      deliveryMode: body.deliveryMode,
      recipientEmails: body.recipientEmails,
      webhookUrls: body.webhookUrls,
      webhookProvider: body.webhookProvider,
      notes: body.notes,
    });

    return NextResponse.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Leadership report schedule PATCH failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update leadership report schedule.' },
      { status: 500 }
    );
  }
}

export const PATCH = withAdminMutation(PATCHHandler);
