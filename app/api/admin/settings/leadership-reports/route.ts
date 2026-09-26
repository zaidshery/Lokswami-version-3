import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageSettings } from '@/lib/auth/permissions';
import {
  analyticsReportService,
  parseLeadershipReportScheduleId,
  SettingsConflictError,
  type LeadershipReportDeliveryMode,
  type LeadershipReportWebhookProvider,
} from '@/lib/server/analytics/analyticsReportService';
import { withAdminMutation } from '@/lib/api/adminRoute';

type LeadershipReportSettingUpdateBody = Partial<{
  id: string;
  enabled: boolean;
  deliveryTime: string;
  deliveryMode: LeadershipReportDeliveryMode;
  recipientEmails: string[];
  webhookUrls: string[];
  webhookProvider: LeadershipReportWebhookProvider;
  notes: string;
  expectedVersion?: number;
  expectedUpdatedAt?: string;
}>;

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageSettings(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = await analyticsReportService.getLeadershipReportSettings();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Failed to load leadership report settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load leadership report settings.' },
      { status: 500 }
    );
  }
}

async function PATCHHandler(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageSettings(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as LeadershipReportSettingUpdateBody;
    const id = parseLeadershipReportScheduleId(body.id);

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'A valid schedule id is required.' },
        { status: 400 }
      );
    }

    const expectedVersion =
      typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined;
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === 'string'
        ? body.expectedUpdatedAt.trim()
        : undefined;

    if (expectedVersion === undefined && !expectedUpdatedAt) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Missing required concurrency token (expectedVersion or expectedUpdatedAt).',
        },
        { status: 400 }
      );
    }

    const schedule = await analyticsReportService.updateLeadershipReportSchedule(
      id,
      {
        enabled: body.enabled,
        deliveryTime: body.deliveryTime,
        deliveryMode: body.deliveryMode,
        recipientEmails: body.recipientEmails,
        webhookUrls: body.webhookUrls,
        webhookProvider: body.webhookProvider,
        notes: body.notes,
      },
      { expectedVersion, expectedUpdatedAt }
    );

    return NextResponse.json({ success: true, data: schedule });
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Invalid webhook URL')) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 400 }
      );
    }

    console.error('Leadership report settings update failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update leadership report settings.' },
      { status: 500 }
    );
  }
}

export const PATCH = withAdminMutation(PATCHHandler);
