import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const getLeadershipReportSettingsMock = vi.fn();
const writeElectionResultsMock = vi.fn();
const runLeadershipReportScheduleMock = vi.fn();
const runDueLeadershipReportSchedulesMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/server/analytics/analyticsReportService', () => ({
  analyticsReportService: {
    getLeadershipReportSettings: getLeadershipReportSettingsMock,
  },
}));

vi.mock('@/lib/server/audience/electionAudienceService', () => ({
  electionAudienceService: {
    writeResults: writeElectionResultsMock,
  },
}));

vi.mock('@/lib/admin/leadershipReportRunner', () => ({
  runLeadershipReportSchedule: runLeadershipReportScheduleMock,
  runDueLeadershipReportSchedules: runDueLeadershipReportSchedulesMock,
}));

vi.mock('@/lib/storage/leadershipReportSchedulesFile', () => ({
  parseLeadershipReportScheduleId: vi.fn().mockReturnValue('schedule-1'),
}));

function request(url: string, body?: Record<string, unknown>) {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('platform control-plane API RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLeadershipReportSettingsMock.mockResolvedValue({ enabled: false });
    writeElectionResultsMock.mockResolvedValue({ lastUpdated: '2026-09-19T00:00:00.000Z' });
    runLeadershipReportScheduleMock.mockResolvedValue({
      ok: true,
      schedule: { id: 'schedule-1' },
      report: { id: 'report-1' },
      historyEntry: { id: 'history-1' },
    });
    runDueLeadershipReportSchedulesMock.mockResolvedValue({
      dueCount: 0,
      runCount: 0,
      criticalAlertNotification: null,
      results: [],
    });
    delete process.env.LEADERSHIP_REPORT_CRON_SECRET;
  });

  it.each(['admin', 'copy_editor', 'reporter'] as const)(
    'returns 403 to %s for newsroom settings, election infrastructure, and operations controls',
    async (role) => {
      getAdminSessionMock.mockResolvedValue({
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      });

      const settingsRoute = await import('@/app/api/admin/settings/leadership-reports/route');
      const electionRoute = await import('@/app/api/admin/elections/results/route');
      const operationsRoute = await import(
        '@/app/api/admin/analytics/briefing-schedules/[id]/run/route'
      );

      const settingsResponse = await settingsRoute.GET();
      const electionResponse = await electionRoute.POST(
        request('http://localhost/api/admin/elections/results', { states: [] })
      );
      const operationsResponse = await operationsRoute.POST(
        request('http://localhost/api/admin/analytics/briefing-schedules/schedule-1/run', {}),
        { params: Promise.resolve({ id: 'schedule-1' }) }
      );

      expect(settingsResponse.status).toBe(403);
      expect(electionResponse.status).toBe(403);
      expect(operationsResponse.status).toBe(403);
      expect(getLeadershipReportSettingsMock).not.toHaveBeenCalled();
      expect(writeElectionResultsMock).not.toHaveBeenCalled();
      expect(runLeadershipReportScheduleMock).not.toHaveBeenCalled();
    }
  );

  it('allows super admin through each platform control-plane API', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });

    const settingsRoute = await import('@/app/api/admin/settings/leadership-reports/route');
    const electionRoute = await import('@/app/api/admin/elections/results/route');
    const operationsRoute = await import(
      '@/app/api/admin/analytics/briefing-schedules/[id]/run/route'
    );

    const settingsResponse = await settingsRoute.GET();
    const electionResponse = await electionRoute.POST(
      request('http://localhost/api/admin/elections/results', { states: [] })
    );
    const operationsResponse = await operationsRoute.POST(
      request('http://localhost/api/admin/analytics/briefing-schedules/schedule-1/run', {}),
      { params: Promise.resolve({ id: 'schedule-1' }) }
    );

    expect(settingsResponse.status).toBe(200);
    expect(electionResponse.status).toBe(200);
    expect(operationsResponse.status).toBe(200);
  });

  it('returns 401 to guests and 403 to non-owner staff on operations run-due', async () => {
    const { POST } = await import(
      '@/app/api/admin/analytics/briefing-schedules/run-due/route'
    );
    const runDueRequest = () =>
      request('http://localhost/api/admin/analytics/briefing-schedules/run-due', {});

    getAdminSessionMock.mockResolvedValue(null);
    const guestResponse = await POST(runDueRequest());

    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    const adminResponse = await POST(runDueRequest());

    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });
    const superAdminResponse = await POST(runDueRequest());

    expect(guestResponse.status).toBe(401);
    expect(adminResponse.status).toBe(403);
    expect(superAdminResponse.status).toBe(200);
    expect(runDueLeadershipReportSchedulesMock).toHaveBeenCalledTimes(1);
  });
});
