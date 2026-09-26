'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildLeadershipReportDeliveryPerformanceAlerts } from '@/lib/admin/leadershipReportDeliveryPerformanceAlerts';
import { getLeadershipReportDeliveryMetrics } from '@/lib/admin/leadershipReportDeliveryMetrics';
import { getLeadershipReportDeliveryDiagnostics } from '@/lib/admin/leadershipReportDeliveryDiagnostics';
import { getLeadershipReportDeliveryTrends } from '@/lib/admin/leadershipReportDeliveryTrends';

type LeadershipSchedule = {
  id: 'daily_briefing' | 'weekly_briefing' | 'monthly_briefing' | 'growth_briefing';
  label: string;
  description: string;
  cadenceLabel: string;
  enabled: boolean;
  deliveryTime: string;
  timezone: string;
  deliveryMode: 'dashboard_link' | 'markdown_export' | 'email_summary' | 'webhook_summary';
  recipientEmails: string[];
  webhookUrls: string[];
  webhookProvider: 'generic_json' | 'slack' | 'discord' | 'teams' | 'telegram';
  notes: string;
  lastRunAt: string | null;
  lastRunStatus: 'idle' | 'success' | 'failed';
  lastRunSummary: string;
  version?: number;
  updatedAt: string;
  nextPlannedAt: string | null;
  viewHref: string;
  downloadHref: string;
};

type LeadershipHistory = {
  id: string;
  scheduleId: LeadershipSchedule['id'];
  label: string;
  cadenceLabel: string;
  deliveryMode: LeadershipSchedule['deliveryMode'];
  webhookProvider?: LeadershipSchedule['webhookProvider'] | null;
  recipientEmails: string[];
  trigger: 'manual' | 'cron';
  actorEmail: string | null;
  status: LeadershipSchedule['lastRunStatus'];
  summary: string;
  createdAt: string;
};

type LeadershipAlertNotificationHistory = {
  id: string;
  status: 'sent' | 'failed';
  alertCount: number;
  alertIds: string[];
  reason: string;
  emailRecipients: string[];
  webhookTargets: number;
  acknowledgedAt: string | null;
  acknowledgedByEmail: string | null;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  createdAt: string;
};

type LeadershipReportsSettingsPayload = {
  runtime: {
    siteOrigin: string;
    cronPath: string;
    cronUrl: string;
    cronSecretConfigured: boolean;
    emailDeliveryConfigured: boolean;
    resendConfigured: boolean;
    fromEmailConfigured: boolean;
    dueNowCount: number;
    dueNowIds: Array<LeadershipSchedule['id']>;
  };
  criticalAlertState: {
    mutedUntil: string | null;
    mutedByEmail: string | null;
    mutedReason: string | null;
  };
  schedules: LeadershipSchedule[];
  history: LeadershipHistory[];
  notifications: LeadershipAlertNotificationHistory[];
  healthAlerts: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
    actionHref?: string;
    actionLabel?: string;
  }>;
  escalations: Array<{
    scheduleId: LeadershipSchedule['id'];
    label: string;
    severity: 'critical' | 'warning';
    reason: string;
    recentFailureCount: number;
    actionHref: string;
    actionLabel: string;
  }>;
};

type LeadershipReportsSettingsResponse = {
  success?: boolean;
  data?: LeadershipReportsSettingsPayload;
  error?: string;
};

type RunDueResult = {
  ok: boolean;
  scheduleId: LeadershipSchedule['id'] | null;
  summary: string;
  historyId: string | null;
  error: string | null;
};

type RunDueResponse = {
  success?: boolean;
  data?: {
    dueCount: number;
    runCount: number;
    criticalAlertNotification?: {
      sent: boolean;
      skipped: boolean;
      alertCount: number;
      reason: string;
      emailRecipients: string[];
      webhookTargets: number;
    };
    results: RunDueResult[];
  };
  error?: string;
};

function formatTimestamp(value: string | null) {
  if (!value) return 'Never';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Never';

  return parsed.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusToneClass(enabled: boolean) {
  return enabled
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
}

function getRunToneClass(status: LeadershipHistory['status']) {
  switch (status) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
  }
}

function getNotificationToneClass(status: LeadershipAlertNotificationHistory['status']) {
  return status === 'sent'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
}

function getReadinessToneClass(ready: boolean) {
  return ready
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

const PANEL_CLASS =
  'rounded-[32px] border border-zinc-200/80 bg-white/92 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)] dark:border-white/10 dark:bg-zinc-950/60';

const SOFT_CARD_CLASS =
  'rounded-[26px] border border-zinc-200/80 bg-zinc-50/80 p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/[0.03]';

const METRIC_CARD_CLASS =
  'rounded-[24px] border border-zinc-200/80 bg-white/88 p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950/45';

const INLINE_NOTICE_CLASS =
  'rounded-[22px] border border-zinc-200/80 bg-zinc-50/75 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300';

const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-2xl border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200';

const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/85 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-red-300/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-red-500/30 dark:hover:text-red-300';

const DANGER_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-2xl border border-red-200/80 bg-red-50/85 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20';

const ACTION_LINK_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/88 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-red-400/30 hover:text-red-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-red-500/30 dark:hover:text-red-300';

function getSeverityToneClass(severity: 'critical' | 'warning' | 'info') {
  switch (severity) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
    case 'info':
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
  }
}

function getEscalationToneClass(
  escalation: LeadershipReportsSettingsPayload['escalations'][number]
) {
  return escalation.severity === 'critical'
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
}

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getDeltaToneClass(value: number, preference: 'higher_better' | 'lower_better') {
  if (value === 0) {
    return 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
  }

  const isGood =
    (preference === 'higher_better' && value > 0) ||
    (preference === 'lower_better' && value < 0);

  return isGood
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
}

export default function LeadershipReportsSettingsPanel() {
  const [payload, setPayload] = useState<LeadershipReportsSettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningDue, setRunningDue] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [runDueMessage, setRunDueMessage] = useState('');
  const [runDueResults, setRunDueResults] = useState<RunDueResult[]>([]);
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [busyResolveNotificationId, setBusyResolveNotificationId] = useState<string | null>(null);
  const [muteBusy, setMuteBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/settings/leadership-reports', {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as LeadershipReportsSettingsResponse;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to load leadership report settings.');
      }
      setPayload(data.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to load leadership report settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const cronCommand = useMemo(() => {
    if (!payload) return '';
    return `wget -qO- "${payload.runtime.cronUrl}?secret=YOUR_SECRET"`;
  }, [payload]);
  const settingsSummary = useMemo(() => {
    if (!payload) {
      return {
        enabledCount: 0,
        emailCount: 0,
        webhookCount: 0,
        failedRuns: 0,
      };
    }

    return {
      enabledCount: payload.schedules.filter((schedule) => schedule.enabled).length,
      emailCount: payload.schedules.filter(
        (schedule) => schedule.enabled && schedule.deliveryMode === 'email_summary'
      ).length,
      webhookCount: payload.schedules.filter(
        (schedule) => schedule.enabled && schedule.deliveryMode === 'webhook_summary'
      ).length,
      failedRuns: payload.history.filter((entry) => entry.status === 'failed').length,
    };
  }, [payload]);
  const deliveryMetrics = useMemo(() => {
    if (!payload) {
      return null;
    }

    return getLeadershipReportDeliveryMetrics({
      schedules: payload.schedules,
      history: payload.history,
    });
  }, [payload]);
  const deliveryTrends = useMemo(() => {
    if (!payload) {
      return null;
    }

    return getLeadershipReportDeliveryTrends(payload.history);
  }, [payload]);
  const deliveryPerformanceAlerts = useMemo(() => {
    if (!deliveryTrends) {
      return null;
    }

    return buildLeadershipReportDeliveryPerformanceAlerts(deliveryTrends);
  }, [deliveryTrends]);
  const visibleHistory = useMemo(() => payload?.history.slice(0, 8) ?? [], [payload]);
  const isCriticalAlertMuted = useMemo(() => {
    if (!payload?.criticalAlertState.mutedUntil) {
      return false;
    }

    const mutedUntil = new Date(payload.criticalAlertState.mutedUntil);
    return !Number.isNaN(mutedUntil.getTime()) && mutedUntil.getTime() > Date.now();
  }, [payload?.criticalAlertState.mutedUntil]);

  async function handleCopyCommand() {
    if (!cronCommand) return;

    try {
      await navigator.clipboard.writeText(cronCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error('Failed to copy cron command.', copyError);
      setCopied(false);
    }
  }

  async function handleRunDueNow() {
    setRunningDue(true);
    setError('');
    setRunDueMessage('');
    setRunDueResults([]);

    try {
      const response = await fetch('/api/admin/analytics/briefing-schedules/run-due', {
        method: 'POST',
      });
      const data = (await response.json().catch(() => ({}))) as RunDueResponse;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to run due schedules.');
      }

      setRunDueMessage(
        [
          data.data.runCount
            ? `Executed ${data.data.runCount} due schedule(s).`
            : 'No schedules were due right now.',
          data.data.criticalAlertNotification?.reason || '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      setRunDueResults(data.data.results);
      await loadSettings();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to run due schedules.'));
    } finally {
      setRunningDue(false);
    }
  }

  async function handleAcknowledgeNotification(id: string) {
    setBusyNotificationId(id);

    try {
      const response = await fetch(`/api/admin/analytics/alert-notifications/${id}/acknowledge`, {
        method: 'POST',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipAlertNotificationHistory;
      };

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to acknowledge notification.');
      }

      setPayload((current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((entry) =>
                entry.id === id ? data.data || entry : entry
              ),
            }
          : current
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to acknowledge notification.'));
    } finally {
      setBusyNotificationId(null);
    }
  }

  async function handleResolveNotification(id: string) {
    setBusyResolveNotificationId(id);

    try {
      const response = await fetch(`/api/admin/analytics/alert-notifications/${id}/resolve`, {
        method: 'POST',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipAlertNotificationHistory;
      };

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to resolve notification.');
      }

      setPayload((current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((entry) =>
                entry.id === id ? data.data || entry : entry
              ),
            }
          : current
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to resolve notification.'));
    } finally {
      setBusyResolveNotificationId(null);
    }
  }

  async function handleMuteAlerts(action: 'mute' | 'unmute', hours?: 1 | 8 | 24) {
    setMuteBusy(true);
    setError('');

    try {
      const response = await fetch('/api/admin/analytics/alert-notifications/mute', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'mute' ? { action, hours } : { action }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipReportsSettingsPayload['criticalAlertState'];
      };

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update critical alert mute.');
      }

      setPayload((current) =>
        current
          ? {
              ...current,
              criticalAlertState: data.data || current.criticalAlertState,
            }
          : current
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to update critical alert mute.'));
    } finally {
      setMuteBusy(false);
    }
  }

  if (loading && !payload) {
    return (
      <div className={PANEL_CLASS}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Loading leadership report settings...
        </p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className={PANEL_CLASS}>
        <p className="text-sm text-red-600 dark:text-red-400">
          {error || 'Unable to load leadership report settings.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={PANEL_CLASS}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
          Leadership Reports
        </p>
        <h1 className="mt-2 text-3xl font-black text-zinc-900 dark:text-zinc-100">
          Leadership Report Settings
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Verify production readiness, confirm cron setup, and monitor delivery health for daily,
          weekly, and monthly leadership briefings.
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={cx('rounded-[24px] border p-4 shadow-sm', getReadinessToneClass(payload.runtime.cronSecretConfigured))}>
            <p className="text-xs font-semibold uppercase tracking-wide">Cron Secret</p>
            <p className="mt-2 text-lg font-bold">
              {payload.runtime.cronSecretConfigured ? 'Configured' : 'Missing'}
            </p>
            <p className="mt-1 text-sm opacity-90">
              Required for secure Hostinger cron execution.
            </p>
          </div>

          <div className={cx('rounded-[24px] border p-4 shadow-sm', getReadinessToneClass(payload.runtime.resendConfigured))}>
            <p className="text-xs font-semibold uppercase tracking-wide">Resend API</p>
            <p className="mt-2 text-lg font-bold">
              {payload.runtime.resendConfigured ? 'Configured' : 'Missing'}
            </p>
            <p className="mt-1 text-sm opacity-90">
              Needed for `Email Summary` delivery mode.
            </p>
          </div>

          <div className={cx('rounded-[24px] border p-4 shadow-sm', getReadinessToneClass(payload.runtime.fromEmailConfigured))}>
            <p className="text-xs font-semibold uppercase tracking-wide">From Email</p>
            <p className="mt-2 text-lg font-bold">
              {payload.runtime.fromEmailConfigured ? 'Configured' : 'Missing'}
            </p>
            <p className="mt-1 text-sm opacity-90">
              Uses `LEADERSHIP_REPORT_FROM_EMAIL` or `RESEND_FROM_EMAIL`.
            </p>
          </div>

          <div className={cx('rounded-[24px] border p-4 shadow-sm', getReadinessToneClass(Boolean(payload.runtime.siteOrigin)))}>
            <p className="text-xs font-semibold uppercase tracking-wide">Site Origin</p>
            <p className="mt-2 text-lg font-bold">
              {payload.runtime.siteOrigin.replace(/^https?:\/\//, '')}
            </p>
            <p className="mt-1 text-sm opacity-90">
              Used in report links and cron examples.
            </p>
          </div>
        </div>

        <div className={cx('mt-4', INLINE_NOTICE_CLASS)}>
          Due right now: <strong className="text-zinc-900 dark:text-zinc-100">{payload.runtime.dueNowCount}</strong>
          {payload.runtime.dueNowIds.length ? ` (${payload.runtime.dueNowIds.join(', ')})` : ''}
        </div>

        <div className={cx('mt-4', SOFT_CARD_CLASS)}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Critical Alert Mute
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Pause automatic critical delivery-alert notifications for a short window without changing schedule state.
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                isCriticalAlertMuted
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
              }`}
            >
              {isCriticalAlertMuted ? 'Muted' : 'Live'}
            </span>
          </div>

          <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            {isCriticalAlertMuted ? (
              <p>
                Muted until {formatTimestamp(payload.criticalAlertState.mutedUntil)}
                {payload.criticalAlertState.mutedByEmail
                  ? ` by ${payload.criticalAlertState.mutedByEmail}`
                  : ''}.
                {payload.criticalAlertState.mutedReason
                  ? ` ${payload.criticalAlertState.mutedReason}`
                  : ''}
              </p>
            ) : (
              <p>Critical alert notifications are currently active.</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[1, 8, 24].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => handleMuteAlerts('mute', hours as 1 | 8 | 24)}
                disabled={muteBusy}
                className={cx(SECONDARY_BUTTON_CLASS, 'px-3 py-1.5 text-xs')}
              >
                {muteBusy ? 'Working...' : `Mute ${hours}h`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleMuteAlerts('unmute')}
              disabled={muteBusy || !isCriticalAlertMuted}
              className={cx(DANGER_BUTTON_CLASS, 'px-3 py-1.5 text-xs')}
            >
              {muteBusy ? 'Working...' : 'Unmute'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Enabled Schedules
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {settingsSummary.enabledCount}
            </p>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Email Summary
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {settingsSummary.emailCount}
            </p>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Webhook Summary
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {settingsSummary.webhookCount}
            </p>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Due Now
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {payload.runtime.dueNowCount}
            </p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
              Recent Failures
            </p>
            <p className="mt-2 text-2xl font-black text-red-700 dark:text-red-300">
              {settingsSummary.failedRuns}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Delivery Health Alerts
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Shared delivery warnings from runtime readiness, failed schedules, and recent report history.
              </p>
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {payload.healthAlerts.length} active alert{payload.healthAlerts.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {payload.healthAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-2xl border p-4 ${getSeverityToneClass(alert.severity)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <span className="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm opacity-90">{alert.detail}</p>
                {alert.actionHref && alert.actionLabel ? (
                  <a
                    href={alert.actionHref}
                    className="mt-3 inline-flex text-sm font-semibold underline-offset-4 hover:underline"
                  >
                    {alert.actionLabel}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Escalated Schedules
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Schedules that have crossed from normal warning into direct leadership attention.
              </p>
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {payload.escalations.length} escalated schedule{payload.escalations.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {payload.escalations.length ? (
              payload.escalations.map((escalation) => (
                <div
                  key={escalation.scheduleId}
                  className={`rounded-2xl border p-4 ${getEscalationToneClass(escalation)}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{escalation.label}</p>
                    <span className="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                      {escalation.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm opacity-90">{escalation.reason}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium opacity-90">
                    <span>Recent failed runs: {escalation.recentFailureCount}</span>
                    <a
                      href={escalation.actionHref}
                      className="underline-offset-4 hover:underline"
                    >
                      {escalation.actionLabel}
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 xl:col-span-2">
                No schedules are escalated right now.
              </div>
            )}
          </div>
        </div>
      </section>

      {deliveryMetrics ? (
        <section className={PANEL_CLASS}>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Delivery Metrics
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Provider-level run health and trigger mix for recent leadership-report delivery.
              </p>
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Success rate: {deliveryMetrics.successRate}%
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Recent Runs
              </p>
              <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {deliveryMetrics.recentRuns}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Success
              </p>
              <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">
                {deliveryMetrics.successRuns}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Cron Runs
              </p>
              <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {deliveryMetrics.cronRuns}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Manual Runs
              </p>
              <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {deliveryMetrics.manualRuns}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {deliveryMetrics.providerBreakdown.map((provider) => (
              <div
                key={provider.key}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {provider.label}
                  </p>
                  <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                    {provider.enabledSchedules} enabled
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl bg-white px-3 py-2 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                    Runs: {provider.recentRuns}
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Success: {provider.successRuns}
                  </div>
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700 dark:bg-red-500/10 dark:text-red-300">
                    Failed: {provider.failedRuns}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {deliveryTrends ? (
        <section className={PANEL_CLASS}>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Delivery Trends
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Compare the latest 7-day delivery window against the previous 7 days.
              </p>
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {deliveryTrends.currentWindowLabel} vs {deliveryTrends.previousWindowLabel}
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Runs
              </p>
              <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {deliveryTrends.currentRuns}
              </p>
              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(
                  deliveryTrends.deltaRuns,
                  'higher_better'
                )}`}
              >
                {formatDelta(deliveryTrends.deltaRuns)} vs previous
              </span>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Success Rate
              </p>
              <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {deliveryTrends.currentSuccessRate}%
              </p>
              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(
                  deliveryTrends.deltaSuccessRate,
                  'higher_better'
                )}`}
              >
                {formatDelta(deliveryTrends.deltaSuccessRate)} pts
              </span>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Failures
              </p>
              <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {deliveryTrends.currentFailures}
              </p>
              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(
                  deliveryTrends.deltaFailures,
                  'lower_better'
                )}`}
              >
                {formatDelta(deliveryTrends.deltaFailures)} vs previous
              </span>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Cron Runs
              </p>
              <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {deliveryTrends.currentCronRuns}
              </p>
              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(
                  deliveryTrends.deltaCronRuns,
                  'higher_better'
                )}`}
              >
                {formatDelta(deliveryTrends.deltaCronRuns)} vs previous
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr,1fr]">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Daily Run Trend
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                {deliveryTrends.dailyBuckets.map((bucket) => (
                  <div
                    key={bucket.dateKey}
                    className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {bucket.label}
                    </p>
                    <p className="mt-2 text-xl font-black text-zinc-900 dark:text-zinc-100">
                      {bucket.totalRuns}
                    </p>
                    <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                      Success: {bucket.successRuns}
                    </p>
                    <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                      Failed: {bucket.failedRuns}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Provider Trend
              </h3>
              <div className="mt-4 space-y-3">
                {deliveryTrends.providerTrends.length ? (
                  deliveryTrends.providerTrends.map((provider) => (
                    <div
                      key={provider.key}
                      className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {provider.label}
                        </p>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDeltaToneClass(
                            provider.deltaRuns,
                            'higher_better'
                          )}`}
                        >
                          {formatDelta(provider.deltaRuns)} runs
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-600 dark:text-zinc-300">
                        <p>Current: {provider.currentRuns}</p>
                        <p>Previous: {provider.previousRuns}</p>
                        <p>Current failed: {provider.currentFailures}</p>
                        <p>Previous failed: {provider.previousFailures}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    Not enough run history yet to show provider trends.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {deliveryPerformanceAlerts ? (
        <section className={PANEL_CLASS}>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Performance Alerts
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Trend-aware delivery warnings that highlight worsening report performance over time.
              </p>
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {deliveryPerformanceAlerts.length} alert{deliveryPerformanceAlerts.length === 1 ? '' : 's'} from the latest 7-day comparison.
            </span>
          </div>

          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {deliveryPerformanceAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-2xl border p-4 ${getSeverityToneClass(alert.severity)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <span className="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm opacity-90">{alert.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={PANEL_CLASS}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Critical Alert Notifications
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Recent automatic critical-alert notices sent from the leadership reporting automation loop.
            </p>
          </div>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {payload.notifications.length} notification{payload.notifications.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-6 space-y-3">
          {payload.notifications.length ? (
            payload.notifications.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Critical alert dispatch
                      </p>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getNotificationToneClass(
                          entry.status
                        )}`}
                      >
                        {entry.status}
                      </span>
                      <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                        {entry.alertCount} alert{entry.alertCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {entry.reason}
                    </p>
                    {entry.alertIds.length ? (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Alert IDs: {entry.alertIds.join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 xl:text-right">
                    <p>{formatTimestamp(entry.createdAt)}</p>
                    <p className="mt-1">Email recipients: {entry.emailRecipients.length}</p>
                    <p className="mt-1">Webhook targets: {entry.webhookTargets}</p>
                  </div>
                </div>
                {entry.emailRecipients.length ? (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Delivered email: {entry.emailRecipients.join(', ')}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {entry.resolvedAt ? (
                    <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                      Resolved {formatTimestamp(entry.resolvedAt)}
                      {entry.resolvedByEmail ? ` by ${entry.resolvedByEmail}` : ''}
                    </span>
                  ) : entry.acknowledgedAt ? (
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                      Acknowledged {formatTimestamp(entry.acknowledgedAt)}
                      {entry.acknowledgedByEmail ? ` by ${entry.acknowledgedByEmail}` : ''}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAcknowledgeNotification(entry.id)}
                      disabled={busyNotificationId === entry.id}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {busyNotificationId === entry.id ? 'Acknowledging...' : 'Mark Acknowledged'}
                    </button>
                  )}
                  {!entry.resolvedAt ? (
                    <button
                      type="button"
                      onClick={() => handleResolveNotification(entry.id)}
                      disabled={busyResolveNotificationId === entry.id}
                      className="inline-flex items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                    >
                      {busyResolveNotificationId === entry.id ? 'Resolving...' : 'Mark Resolved'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
              No automatic critical-alert notifications have been recorded yet.
            </div>
          )}
        </div>
      </section>

      <section className={PANEL_CLASS}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Cron Setup
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Use this Hostinger-safe command to run due leadership briefings automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCopyCommand}
              className={SECONDARY_BUTTON_CLASS}
            >
              {copied ? 'Command Copied' : 'Copy Cron Command'}
            </button>
            <a
              href="/admin/analytics"
              className={PRIMARY_BUTTON_CLASS}
            >
              Open Analytics Center
            </a>
            <button
              type="button"
              onClick={handleRunDueNow}
              disabled={runningDue}
              className={DANGER_BUTTON_CLASS}
            >
              {runningDue ? 'Running Due Schedules...' : 'Run Due Schedules Now'}
            </button>
          </div>
        </div>

        <div className={cx('mt-5', SOFT_CARD_CLASS)}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Cron Command
          </p>
          <code className="mt-3 block overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            {cronCommand}
          </code>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Replace <strong>YOUR_SECRET</strong> with the value of
            <code className="mx-1 rounded bg-white px-1 py-0.5 dark:bg-zinc-950">
              LEADERSHIP_REPORT_CRON_SECRET
            </code>
            and run it every 15 minutes.
          </p>
        </div>

        {runDueMessage ? (
          <div className={cx('mt-4', INLINE_NOTICE_CLASS, 'text-zinc-700 dark:text-zinc-200')}>
            {runDueMessage}
          </div>
        ) : null}

        {runDueResults.length ? (
          <div className="mt-4 space-y-3">
            {runDueResults.map((result: RunDueResult, index: number) => (
              <div
                key={`${result.scheduleId || 'unknown'}-${result.historyId || index}`}
                className={cx('rounded-[24px] px-4 py-3 text-sm', SOFT_CARD_CLASS, 'p-0')}
              >
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {result.scheduleId || 'unknown schedule'}
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                      result.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
                    }`}
                  >
                    {result.ok ? 'Success' : 'Failed'}
                  </span>
                </div>
                <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                  {result.summary || result.error || 'No result summary returned.'}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={PANEL_CLASS}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Schedule Overview
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Current briefing modes, recipients, and recent run status.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Manage detailed delivery settings from the Analytics Center.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {payload.schedules.map((schedule) => (
            <div
              key={schedule.id}
              className={cx(SOFT_CARD_CLASS, 'p-5')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                    {schedule.cadenceLabel}
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {schedule.label}
                  </h3>
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusToneClass(schedule.enabled)}`}>
                  {schedule.enabled ? 'Enabled' : 'Paused'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                <p>Mode: {schedule.deliveryMode.replace(/_/g, ' ')}</p>
                <p>Time: {schedule.deliveryTime} ({schedule.timezone})</p>
                <p>
                  {schedule.deliveryMode === 'webhook_summary' ? 'Webhook Targets' : 'Recipients'}:{' '}
                  {schedule.deliveryMode === 'webhook_summary'
                    ? schedule.webhookUrls.length
                    : schedule.recipientEmails.length}
                </p>
                {schedule.deliveryMode === 'webhook_summary' ? (
                  <p>Webhook Provider: {schedule.webhookProvider.replace(/_/g, ' ')}</p>
                ) : null}
                <p>Next Run: {formatTimestamp(schedule.nextPlannedAt)}</p>
                <p>Last Run: {formatTimestamp(schedule.lastRunAt)}</p>
              </div>

              <div className="mt-4 space-y-2">
                {getLeadershipReportDeliveryDiagnostics(schedule, {
                  emailDeliveryConfigured: payload.runtime.emailDeliveryConfigured,
                }).map((diagnostic) => (
                  <div
                    key={diagnostic.id}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      diagnostic.severity === 'critical'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
                        : diagnostic.severity === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                          : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'
                    }`}
                  >
                    <p className="font-semibold">{diagnostic.title}</p>
                    <p className="mt-1 opacity-90">{diagnostic.detail}</p>
                  </div>
                ))}
              </div>

              {schedule.lastRunSummary ? (
                <p className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  {schedule.lastRunSummary}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className={PANEL_CLASS}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Recent Report History
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Recent manual and cron-triggered briefing runs.
            </p>
          </div>
          <a
            href="/admin/analytics"
            className={ACTION_LINK_CLASS}
          >
            Open full delivery center
          </a>
        </div>

        <div className="mt-6 space-y-3">
          {visibleHistory.length ? (
            visibleHistory.map((entry) => (
              <div
                key={entry.id}
                className={SOFT_CARD_CLASS}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {entry.label}
                      </p>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getRunToneClass(entry.status)}`}>
                        {entry.status}
                      </span>
                      <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                        {entry.trigger}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {entry.summary}
                    </p>
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 xl:text-right">
                    <p>{formatTimestamp(entry.createdAt)}</p>
                    <p className="mt-1">
                      {entry.actorEmail
                        ? `Actor: ${entry.actorEmail}`
                        : entry.trigger === 'cron'
                          ? 'Actor: cron runner'
                          : 'Actor: system'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
              No leadership report history has been recorded yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
