import {
  buildLeadershipReportEscalations,
  buildLeadershipReportHealthAlerts,
  getLeadershipReportRuntimeSnapshot,
} from '@/lib/admin/leadershipReportHealth';
import { listLeadershipReportAlertNotificationHistory } from '@/lib/storage/leadershipReportAlertNotificationHistoryFile';
import { getLeadershipReportCriticalAlertState } from '@/lib/storage/leadershipReportCriticalAlertStateFile';
import { listLeadershipReportRunHistory } from '@/lib/storage/leadershipReportRunHistoryFile';
import { listLeadershipReportSchedules } from '@/lib/storage/leadershipReportSchedulesFile';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function getSiteOrigin() {
  const configured = String(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  ).trim();
  return trimTrailingSlash(configured || 'http://localhost:3000');
}

export class AnalyticsReportService {
  async getLeadershipReportSettings() {
    const [schedules, history, notifications, criticalAlertState] = await Promise.all([
      listLeadershipReportSchedules(),
      listLeadershipReportRunHistory(60),
      listLeadershipReportAlertNotificationHistory(8),
      getLeadershipReportCriticalAlertState(),
    ]);

    const runtime = await getLeadershipReportRuntimeSnapshot(schedules);
    const healthAlerts = buildLeadershipReportHealthAlerts({
      schedules,
      history,
      runtime,
    });
    const escalations = buildLeadershipReportEscalations({
      schedules,
      history,
      runtime,
    });

    const siteOrigin = getSiteOrigin();
    const cronPath = '/api/admin/analytics/briefing-schedules/run-due';

    return {
      runtime: {
        siteOrigin,
        cronPath,
        cronUrl: `${siteOrigin}${cronPath}`,
        cronSecretConfigured: runtime.cronSecretConfigured,
        emailDeliveryConfigured: runtime.emailDeliveryConfigured,
        resendConfigured: runtime.resendConfigured,
        fromEmailConfigured: runtime.fromEmailConfigured,
        dueNowCount: runtime.dueNowCount,
        dueNowIds: runtime.dueNowIds,
      },
      criticalAlertState,
      schedules,
      history,
      notifications,
      healthAlerts,
      escalations,
    };
  }
}

export const analyticsReportService = new AnalyticsReportService();
