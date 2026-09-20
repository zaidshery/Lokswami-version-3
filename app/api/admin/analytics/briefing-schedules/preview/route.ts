import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { buildLeadershipReportMarkdown, getLeadershipReportPreset } from '@/lib/admin/leadershipReports';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageLeadershipReports } from '@/lib/auth/permissions';
import {
  parseLeadershipReportScheduleId,
  type LeadershipReportDeliveryMode,
  type LeadershipReportWebhookProvider,
} from '@/lib/storage/leadershipReportSchedulesFile';
import { buildLeadershipReportEmailPreview } from '@/lib/notifications/leadershipReportEmail';
import { buildLeadershipReportWebhookPreview } from '@/lib/notifications/leadershipReportWebhook';

type PreviewRequestBody = {
  id?: string;
  deliveryMode?: LeadershipReportDeliveryMode;
  recipientEmails?: string[];
  webhookUrls?: string[];
  webhookProvider?: LeadershipReportWebhookProvider;
};

function isDeliveryMode(value: unknown): value is LeadershipReportDeliveryMode {
  return (
    value === 'dashboard_link' ||
    value === 'markdown_export' ||
    value === 'email_summary' ||
    value === 'webhook_summary'
  );
}

function isWebhookProvider(value: unknown): value is LeadershipReportWebhookProvider {
  return (
    value === 'generic_json' ||
    value === 'slack' ||
    value === 'discord' ||
    value === 'teams' ||
    value === 'telegram'
  );
}

function cleanList(values: unknown, mode: 'email' | 'url') {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value) return false;
      return mode === 'email'
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        : /^https?:\/\/[^\s]+$/i.test(value);
    })
    .slice(0, mode === 'email' ? 20 : 10);
}

async function POSTHandler(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageLeadershipReports(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as PreviewRequestBody;
    const id = parseLeadershipReportScheduleId(body.id);

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'A valid schedule id is required.' },
        { status: 400 }
      );
    }

    const deliveryMode = isDeliveryMode(body.deliveryMode)
      ? body.deliveryMode
      : 'dashboard_link';
    const webhookProvider = isWebhookProvider(body.webhookProvider)
      ? body.webhookProvider
      : 'generic_json';
    const recipientEmails = cleanList(body.recipientEmails, 'email');
    const webhookUrls = cleanList(body.webhookUrls, 'url');

    const report = await getLeadershipReportPreset(id);

    if (deliveryMode === 'markdown_export') {
      return NextResponse.json({
        success: true,
        data: {
          title: report.label,
          modeLabel: 'Markdown Export',
          summary: 'This preview shows the markdown file content that would be exported.',
          bodyText: buildLeadershipReportMarkdown(report),
          viewHref: report.viewHref,
          downloadHref: report.downloadHref,
        },
      });
    }

    if (deliveryMode === 'email_summary') {
      const preview = buildLeadershipReportEmailPreview(report);
      return NextResponse.json({
        success: true,
        data: {
          title: preview.subject,
          modeLabel: 'Email Summary',
          summary: recipientEmails.length
            ? `Configured for ${recipientEmails.length} recipient(s).`
            : 'No recipient emails are configured yet.',
          bodyText: preview.text,
          recipients: recipientEmails,
          viewHref: report.viewHref,
          downloadHref: report.downloadHref,
        },
      });
    }

    if (deliveryMode === 'webhook_summary') {
      return NextResponse.json({
        success: true,
        data: {
          title: report.label,
          modeLabel: 'Webhook Summary',
          provider: webhookProvider,
          summary: webhookUrls.length
            ? `Configured for ${webhookUrls.length} webhook target(s).`
            : 'No webhook URLs are configured yet.',
          bodyJson: buildLeadershipReportWebhookPreview(report, webhookProvider),
          targets: webhookUrls,
          viewHref: report.viewHref,
          downloadHref: report.downloadHref,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        title: report.label,
        modeLabel: 'Dashboard Link',
        summary: 'This mode shares the live Analytics Center view instead of sending a formatted payload.',
        bodyText: `Open View: ${report.viewHref}\nDownload Briefing: ${report.downloadHref}`,
        viewHref: report.viewHref,
        downloadHref: report.downloadHref,
      },
    });
  } catch (error) {
    console.error('Leadership report preview failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to build leadership report preview.' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
