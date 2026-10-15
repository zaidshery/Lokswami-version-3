import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendLeadershipReportWebhook } from '@/lib/notifications/leadershipReportWebhook';
import type { LeadershipReport } from '@/lib/admin/leadershipReports';

function createReport(): LeadershipReport {
  return {
    id: 'daily_briefing',
    label: 'Daily Briefing',
    description: 'Daily summary',
    cadenceLabel: 'Daily',
    range: 'today',
    compare: 'previous',
    generatedAt: '2026-04-06T06:00:00.000Z',
    windowLabel: 'Today',
    comparisonLabel: 'Previous period',
    headline: 'Daily leadership summary is ready.',
    summary: 'Lokswami leadership is tracking desk pressure and release readiness.',
    metrics: [
      {
        label: 'Ready Decisions',
        value: 4,
        detail: 'Items ready for release.',
        tone: 'good',
      },
      {
        label: 'Blocked Editions',
        value: 1,
        detail: 'Edition blockers remain active.',
        tone: 'critical',
      },
    ],
    wins: ['Queue pressure dropped today.'],
    risks: ['One edition is still blocked.'],
    actions: [
      {
        label: 'Open Analytics',
        href: '/admin/analytics',
        tone: 'primary',
      },
    ],
    viewHref: '/admin/analytics?tab=overview',
    downloadHref: '/api/admin/analytics/briefing?preset=daily_briefing',
  };
}

import dns from 'dns';

describe('sendLeadershipReportWebhook', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
      { address: '93.184.216.34', family: 4 },
    ] as any);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends the generic JSON payload', async () => {
    const report = createReport();
    const result = await sendLeadershipReportWebhook({
      urls: ['https://example.com/generic-hook'],
      provider: 'generic_json',
      report,
    });

    expect(result.sent).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(payload.kind).toBe('leadership_report');
    expect(payload.report.label).toBe('Daily Briefing');
    expect(payload.report.actions[0].href).toContain('/admin/analytics');
  });

  it('sends a Slack-style payload', async () => {
    const report = createReport();
    await sendLeadershipReportWebhook({
      urls: ['https://example.com/slack-hook'],
      provider: 'slack',
      report,
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(payload.text).toContain('Daily Briefing');
    expect(Array.isArray(payload.blocks)).toBe(true);
    expect(payload.blocks[0].type).toBe('header');
  });

  it('sends a Discord-style payload', async () => {
    const report = createReport();
    await sendLeadershipReportWebhook({
      urls: ['https://example.com/discord-hook'],
      provider: 'discord',
      report,
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(payload.content).toContain('Daily Briefing');
    expect(Array.isArray(payload.embeds)).toBe(true);
    expect(payload.embeds[0].title).toBe('Daily Briefing');
  });

  it('sends a Microsoft Teams-style payload', async () => {
    const report = createReport();
    await sendLeadershipReportWebhook({
      urls: ['https://example.com/teams-hook'],
      provider: 'teams',
      report,
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(payload['@type']).toBe('MessageCard');
    expect(payload.title).toBe('Daily Briefing');
    expect(Array.isArray(payload.sections)).toBe(true);
  });

  it('sends a Telegram-style payload', async () => {
    const report = createReport();
    await sendLeadershipReportWebhook({
      urls: ['https://example.com/telegram-hook'],
      provider: 'telegram',
      report,
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(payload.parse_mode).toBe('HTML');
    expect(payload.text).toContain('Daily Briefing');
    expect(payload.text).toContain('Open Analytics Center');
  });
});
