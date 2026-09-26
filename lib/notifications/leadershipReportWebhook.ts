import type { LeadershipReport } from '@/lib/admin/leadershipReports';
import type { LeadershipReportDeliveryPerformanceAlert } from '@/lib/admin/leadershipReportDeliveryPerformanceAlerts';
import type { LeadershipReportDeliveryTrends } from '@/lib/admin/leadershipReportDeliveryTrends';
import type { LeadershipReportWebhookProvider } from '@/lib/storage/leadershipReportSchedulesFile';
import { safeWebhookFetch } from '@/lib/security/safeUrlFetch';

const FALLBACK_SITE_URL = 'http://localhost:3000';

type LeadershipReportWebhookInput = {
  urls: string[];
  provider: LeadershipReportWebhookProvider;
  report: LeadershipReport;
};

type LeadershipReportCriticalAlertWebhookInput = {
  urls: string[];
  provider: LeadershipReportWebhookProvider;
  alerts: LeadershipReportDeliveryPerformanceAlert[];
  trends: LeadershipReportDeliveryTrends;
};

export type LeadershipReportWebhookResult = {
  sent: boolean;
  error?: string;
  deliveredTo?: string[];
};

export type LeadershipReportWebhookPreview = Record<string, unknown>;

function clean(value: unknown, maxLength = 300) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeUrls(values: string[]) {
  return values
    .map((value) => clean(value, 600))
    .filter(
      (value, index, source) =>
        /^https?:\/\/[^\s]+$/i.test(value) && source.indexOf(value) === index
    )
    .slice(0, 10);
}

function getOrigin() {
  return clean(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || FALLBACK_SITE_URL,
    300
  ).replace(/\/+$/, '');
}

function buildReportView(report: LeadershipReport) {
  const origin = getOrigin();
  return {
    origin,
    source: 'lokswami',
    kind: 'leadership_report',
    generatedAt: report.generatedAt,
    report: {
      id: report.id,
      label: report.label,
      cadenceLabel: report.cadenceLabel,
      headline: report.headline,
      summary: report.summary,
      windowLabel: report.windowLabel,
      comparisonLabel: report.comparisonLabel,
      metrics: report.metrics,
      wins: report.wins,
      risks: report.risks,
      growthHighlights: report.growthHighlights || [],
      growthOpportunities: report.growthOpportunities || [],
      actions: report.actions.map((action) => ({
        ...action,
        href: `${origin}${action.href}`,
      })),
      viewHref: `${origin}${report.viewHref}`,
      downloadHref: `${origin}${report.downloadHref}`,
    },
    text: `${report.label}: ${report.headline}`,
  };
}

function buildGenericWebhookPayload(report: LeadershipReport) {
  return buildReportView(report);
}

function buildSlackWebhookPayload(report: LeadershipReport) {
  const payload = buildReportView(report);
  const metricFields = payload.report.metrics.slice(0, 4).map((metric) => ({
    type: 'mrkdwn',
    text: `*${metric.label}*\n${metric.value}`,
  }));
  const actionLinks = payload.report.actions
    .map((action) => `<${action.href}|${action.label}>`)
    .join(' | ');

  return {
    text: payload.text,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: payload.report.label,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.report.headline}*\n${payload.report.summary}`,
        },
      },
      ...(metricFields.length
        ? [
            {
              type: 'section',
              fields: metricFields,
            },
          ]
        : []),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reporting Window:* ${payload.report.windowLabel}${
            payload.report.comparisonLabel
              ? `\n*Comparison:* ${payload.report.comparisonLabel}`
              : ''
          }`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: actionLinks
            ? `*Actions:* ${actionLinks}`
            : `*Open View:* <${payload.report.viewHref}|Analytics Center>`,
        },
      },
    ],
  };
}

function buildDiscordWebhookPayload(report: LeadershipReport) {
  const payload = buildReportView(report);
  return {
    content: payload.text,
    embeds: [
      {
        title: payload.report.label,
        description: `${payload.report.headline}\n\n${payload.report.summary}`,
        url: payload.report.viewHref,
        color: 14567226,
        timestamp: payload.generatedAt,
        fields: payload.report.metrics.slice(0, 6).map((metric) => ({
          name: metric.label,
          value: `${metric.value}`,
          inline: true,
        })),
        footer: {
          text: payload.report.windowLabel,
        },
      },
    ],
  };
}

function buildTeamsWebhookPayload(report: LeadershipReport) {
  const payload = buildReportView(report);

  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: payload.text,
    themeColor: 'DE2910',
    title: payload.report.label,
    text: `**${payload.report.headline}**\n\n${payload.report.summary}`,
    sections: [
      {
        activityTitle: payload.report.windowLabel,
        activitySubtitle: payload.report.comparisonLabel || 'No comparison',
        facts: payload.report.metrics.slice(0, 6).map((metric) => ({
          name: metric.label,
          value: String(metric.value),
        })),
        markdown: true,
      },
    ],
    potentialAction: [
      {
        '@type': 'OpenUri',
        name: 'Open Analytics Center',
        targets: [
          {
            os: 'default',
            uri: payload.report.viewHref,
          },
        ],
      },
    ],
  };
}

function buildTelegramWebhookPayload(report: LeadershipReport) {
  const payload = buildReportView(report);
  const metricLines = payload.report.metrics
    .slice(0, 5)
    .map((metric) => `• <b>${metric.label}</b>: ${metric.value}`)
    .join('\n');

  return {
    text: `<b>${payload.report.label}</b>\n${payload.report.headline}\n\n${payload.report.summary}\n\n${metricLines}\n\n<a href="${payload.report.viewHref}">Open Analytics Center</a>`,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };
}

function buildAlertView(
  alerts: LeadershipReportDeliveryPerformanceAlert[],
  trends: LeadershipReportDeliveryTrends
) {
  const origin = getOrigin();
  return {
    origin,
    source: 'lokswami',
    kind: 'leadership_delivery_alert',
    generatedAt: new Date().toISOString(),
    text: `Lokswami critical delivery alert: ${alerts[0]?.title || 'Attention needed'}`,
    windowLabel: `${trends.currentWindowLabel} vs ${trends.previousWindowLabel}`,
    successRate: trends.currentSuccessRate,
    failures: trends.currentFailures,
    alerts,
    analyticsHref: `${origin}/admin/analytics`,
    settingsHref: `${origin}/admin/settings`,
  };
}

function buildCriticalAlertWebhookPreview(
  alerts: LeadershipReportDeliveryPerformanceAlert[],
  trends: LeadershipReportDeliveryTrends,
  provider: LeadershipReportWebhookProvider
): LeadershipReportWebhookPreview {
  const payload = buildAlertView(alerts, trends);

  if (provider === 'slack') {
    return {
      text: payload.text,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Lokswami Critical Delivery Alert' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Window:* ${payload.windowLabel}\n*Success Rate:* ${payload.successRate}%\n*Failures:* ${payload.failures}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: alerts.map((alert) => `• *${alert.title}* - ${alert.detail}`).join('\n'),
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${payload.analyticsHref}|Open Analytics Center>`,
          },
        },
      ],
    };
  }

  if (provider === 'discord') {
    return {
      content: payload.text,
      embeds: [
        {
          title: 'Lokswami Critical Delivery Alert',
          description: alerts.map((alert) => `**${alert.title}**\n${alert.detail}`).join('\n\n'),
          url: payload.analyticsHref,
          color: 14567226,
          timestamp: payload.generatedAt,
          fields: [
            { name: 'Window', value: payload.windowLabel, inline: false },
            { name: 'Success Rate', value: `${payload.successRate}%`, inline: true },
            { name: 'Failures', value: `${payload.failures}`, inline: true },
          ],
        },
      ],
    };
  }

  if (provider === 'teams') {
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: payload.text,
      themeColor: 'DE2910',
      title: 'Lokswami Critical Delivery Alert',
      text: alerts.map((alert) => `**${alert.title}**\n\n${alert.detail}`).join('\n\n'),
      sections: [
        {
          activityTitle: payload.windowLabel,
          facts: [
            { name: 'Success Rate', value: `${payload.successRate}%` },
            { name: 'Failures', value: String(payload.failures) },
          ],
          markdown: true,
        },
      ],
      potentialAction: [
        {
          '@type': 'OpenUri',
          name: 'Open Analytics Center',
          targets: [{ os: 'default', uri: payload.analyticsHref }],
        },
      ],
    };
  }

  if (provider === 'telegram') {
    return {
      text: `<b>Lokswami Critical Delivery Alert</b>\n${alerts
        .map((alert) => `<b>${alert.title}</b>\n${alert.detail}`)
        .join('\n\n')}\n\n<b>Success Rate:</b> ${payload.successRate}%\n<b>Failures:</b> ${payload.failures}\n\n<a href="${payload.analyticsHref}">Open Analytics Center</a>`,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };
  }

  return payload;
}

export function buildLeadershipReportWebhookPreview(
  report: LeadershipReport,
  provider: LeadershipReportWebhookProvider
): LeadershipReportWebhookPreview {
  if (provider === 'slack') {
    return buildSlackWebhookPayload(report);
  }

  if (provider === 'discord') {
    return buildDiscordWebhookPayload(report);
  }

  if (provider === 'teams') {
    return buildTeamsWebhookPayload(report);
  }

  if (provider === 'telegram') {
    return buildTelegramWebhookPayload(report);
  }

  return buildGenericWebhookPayload(report);
}

export async function sendLeadershipReportWebhook(
  input: LeadershipReportWebhookInput
): Promise<LeadershipReportWebhookResult> {
  const urls = normalizeUrls(input.urls);
  if (!urls.length) {
    return { sent: false, error: 'Missing webhook URLs' };
  }

  const payload = buildLeadershipReportWebhookPreview(input.report, input.provider);
  const deliveredTo: string[] = [];

  for (const url of urls) {
    try {
      const response = await safeWebhookFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.text().catch(() => '');
        return {
          sent: false,
          error:
            response.error ||
            errorPayload.slice(0, 240) ||
            `Webhook returned status ${response.status}`,
        };
      }

      deliveredTo.push(url);
    } catch (error) {
      return {
        sent: false,
        error: error instanceof Error ? error.message : 'Webhook delivery failed',
      };
    }
  }

  return { sent: true, deliveredTo };
}

export async function sendLeadershipReportCriticalAlertWebhook(
  input: LeadershipReportCriticalAlertWebhookInput
): Promise<LeadershipReportWebhookResult> {
  const urls = normalizeUrls(input.urls);
  if (!urls.length) {
    return { sent: false, error: 'Missing webhook URLs' };
  }

  const payload = buildCriticalAlertWebhookPreview(input.alerts, input.trends, input.provider);
  const deliveredTo: string[] = [];

  for (const url of urls) {
    try {
      const response = await safeWebhookFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.text().catch(() => '');
        return {
          sent: false,
          error:
            response.error ||
            errorPayload.slice(0, 240) ||
            `Webhook returned status ${response.status}`,
        };
      }

      deliveredTo.push(url);
    } catch (error) {
      return {
        sent: false,
        error: error instanceof Error ? error.message : 'Webhook delivery failed',
      };
    }
  }

  return { sent: true, deliveredTo };
}
