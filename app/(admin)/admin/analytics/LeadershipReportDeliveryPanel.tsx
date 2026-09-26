'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { buildLeadershipReportDeliveryPerformanceAlerts } from '@/lib/admin/leadershipReportDeliveryPerformanceAlerts';
import { getLeadershipReportDeliveryMetrics } from '@/lib/admin/leadershipReportDeliveryMetrics';
import { getLeadershipReportDeliveryDiagnostics } from '@/lib/admin/leadershipReportDeliveryDiagnostics';
import { getLeadershipReportDeliveryTrends } from '@/lib/admin/leadershipReportDeliveryTrends';

type LeadershipReportSchedule = {
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

type LeadershipReportRunHistoryEntry = {
  id: string;
  scheduleId: LeadershipReportSchedule['id'];
  label: string;
  cadenceLabel: string;
  deliveryMode: LeadershipReportSchedule['deliveryMode'];
  webhookProvider?: LeadershipReportSchedule['webhookProvider'] | null;
  recipientEmails: string[];
  trigger: 'manual' | 'cron';
  actorEmail: string | null;
  status: LeadershipReportSchedule['lastRunStatus'];
  summary: string;
  createdAt: string;
};

type LeadershipReportAlertNotificationHistoryEntry = {
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

type LeadershipReportCriticalAlertState = {
  mutedUntil: string | null;
  mutedByEmail: string | null;
  mutedReason: string | null;
};

type LeadershipReportHealthAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
};

type LeadershipReportEscalation = {
  scheduleId: LeadershipReportSchedule['id'];
  label: string;
  severity: 'critical' | 'warning';
  reason: string;
  recentFailureCount: number;
  actionHref: string;
  actionLabel: string;
};

type LeadershipReportPreview = {
  title: string;
  modeLabel: string;
  summary: string;
  provider?: LeadershipReportSchedule['webhookProvider'];
  bodyText?: string;
  bodyJson?: unknown;
  recipients?: string[];
  targets?: string[];
  viewHref?: string;
  downloadHref?: string;
};

const DELIVERY_HISTORY_LIMIT = 60;
const DELIVERY_HISTORY_VISIBLE_COUNT = 12;

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

function getRunToneClass(status: LeadershipReportSchedule['lastRunStatus']) {
  switch (status) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
    case 'idle':
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
  }
}

function getNotificationToneClass(status: LeadershipReportAlertNotificationHistoryEntry['status']) {
  return status === 'sent'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
}

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

function getEscalationToneClass(escalation: LeadershipReportEscalation) {
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

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

const PANEL_CLASS =
  'rounded-[32px] border border-zinc-200/80 bg-white/92 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)] dark:border-white/10 dark:bg-zinc-950/60';

const SOFT_CARD_CLASS =
  'rounded-[26px] border border-zinc-200/80 bg-zinc-50/80 p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/[0.03]';

const METRIC_CARD_CLASS =
  'rounded-[24px] border border-zinc-200/80 bg-white/88 p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950/45';

const INLINE_NOTICE_CLASS =
  'rounded-[22px] border border-zinc-200/80 bg-zinc-50/75 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300';

const INPUT_CLASS =
  'w-full rounded-2xl border border-zinc-300/90 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-200/60 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100 dark:focus:border-red-500/40 dark:focus:ring-red-500/20';

const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-2xl border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200';

const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/85 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-red-300/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-red-500/30 dark:hover:text-red-300';

const DANGER_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-2xl border border-red-200/80 bg-red-50/85 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20';

const ACTION_LINK_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/88 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-red-400/30 hover:text-red-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-red-500/30 dark:hover:text-red-300';

export default function LeadershipReportDeliveryPanel({
  initialSchedules,
  initialHistory,
  initialAlertNotifications,
  initialCriticalAlertState,
  initialHealthAlerts,
  initialEscalations,
  emailDeliveryConfigured,
}: {
  initialSchedules: LeadershipReportSchedule[];
  initialHistory: LeadershipReportRunHistoryEntry[];
  initialAlertNotifications: LeadershipReportAlertNotificationHistoryEntry[];
  initialCriticalAlertState: LeadershipReportCriticalAlertState | null;
  initialHealthAlerts: LeadershipReportHealthAlert[];
  initialEscalations: LeadershipReportEscalation[];
  emailDeliveryConfigured: boolean;
}) {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [history, setHistory] = useState(initialHistory);
  const [alertNotifications, setAlertNotifications] = useState(initialAlertNotifications);
  const [criticalAlertState, setCriticalAlertState] = useState<LeadershipReportCriticalAlertState>(
    initialCriticalAlertState || {
      mutedUntil: null,
      mutedByEmail: null,
      mutedReason: null,
    }
  );
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [busyResolveNotificationId, setBusyResolveNotificationId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [muteBusy, setMuteBusy] = useState(false);
  const [previewBusyId, setPreviewBusyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [muteMessage, setMuteMessage] = useState('');
  const [previews, setPreviews] = useState<Record<string, LeadershipReportPreview | null>>({});
  const [healthAlerts] = useState(initialHealthAlerts);
  const [escalations] = useState(initialEscalations);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkResults, setBulkResults] = useState<
    Array<{
      ok: boolean;
      schedule: LeadershipReportSchedule | null;
      summary: string;
      historyEntry: LeadershipReportRunHistoryEntry | null;
      error: string | null;
    }>
  >([]);
  const deliverySummary = useMemo(() => {
    const enabledCount = schedules.filter((schedule) => schedule.enabled).length;
    const emailCount = schedules.filter(
      (schedule) => schedule.enabled && schedule.deliveryMode === 'email_summary'
    ).length;
    const webhookCount = schedules.filter(
      (schedule) => schedule.enabled && schedule.deliveryMode === 'webhook_summary'
    ).length;
    const duePlannedCount = schedules.filter(
      (schedule) => schedule.enabled && schedule.nextPlannedAt
    ).length;
    const failedSchedules = schedules.filter((schedule) => schedule.lastRunStatus === 'failed').length;
    const recentFailedRuns = history.filter((entry) => entry.status === 'failed').length;

    return {
      enabledCount,
      emailCount,
      webhookCount,
      duePlannedCount,
      failedSchedules,
      recentFailedRuns,
    };
  }, [history, schedules]);
  const deliveryMetrics = useMemo(
    () => getLeadershipReportDeliveryMetrics({ schedules, history }),
    [history, schedules]
  );
  const deliveryTrends = useMemo(() => getLeadershipReportDeliveryTrends(history), [history]);
  const deliveryPerformanceAlerts = useMemo(
    () => buildLeadershipReportDeliveryPerformanceAlerts(deliveryTrends),
    [deliveryTrends]
  );
  const visibleHistory = useMemo(
    () => history.slice(0, DELIVERY_HISTORY_VISIBLE_COUNT),
    [history]
  );
  const isCriticalAlertMuted = useMemo(() => {
    if (!criticalAlertState.mutedUntil) {
      return false;
    }

    const mutedUntil = new Date(criticalAlertState.mutedUntil);
    return !Number.isNaN(mutedUntil.getTime()) && mutedUntil.getTime() > Date.now();
  }, [criticalAlertState.mutedUntil]);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  function updateLocalSchedule(id: string, patch: Partial<LeadershipReportSchedule>) {
    setSchedules((current) =>
      current.map((schedule) => (schedule.id === id ? { ...schedule, ...patch } : schedule))
    );
  }

  function mergeSchedules(nextSchedules: LeadershipReportSchedule[]) {
    if (!nextSchedules.length) return;

    setSchedules((current) =>
      current.map(
        (schedule) => nextSchedules.find((candidate) => candidate.id === schedule.id) || schedule
      )
    );
  }

  function prependHistory(nextEntries: LeadershipReportRunHistoryEntry[]) {
    if (!nextEntries.length) return;

    setHistory((current) => {
      const seen = new Set<string>();
      return [...nextEntries, ...current]
        .filter((entry) => {
          if (seen.has(entry.id)) return false;
          seen.add(entry.id);
          return true;
        })
        .slice(0, DELIVERY_HISTORY_LIMIT);
    });
  }

  async function handleSave(id: LeadershipReportSchedule['id']) {
    const target = schedules.find((schedule) => schedule.id === id);
    if (!target) return;

    setBusyId(id);
    setMessages((current) => ({ ...current, [id]: '' }));

    try {
      const response = await fetch('/api/admin/analytics/briefing-schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          enabled: target.enabled,
          deliveryTime: target.deliveryTime,
          deliveryMode: target.deliveryMode,
          recipientEmails: target.recipientEmails,
          webhookUrls: target.webhookUrls,
          webhookProvider: target.webhookProvider,
          notes: target.notes,
          expectedVersion: target.version,
          expectedUpdatedAt: target.updatedAt,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipReportSchedule;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to save delivery schedule.');
      }

      updateLocalSchedule(id, payload.data);
      setMessages((current) => ({ ...current, [id]: 'Schedule saved.' }));
    } catch (error) {
      console.error('Leadership report schedule save failed.', error);
      setMessages((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'Failed to save schedule.',
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRunNow(id: LeadershipReportSchedule['id']) {
    setBusyId(id);
    setMessages((current) => ({ ...current, [id]: '' }));
    setBulkMessage('');
    setBulkResults([]);

    try {
      const response = await fetch(`/api/admin/analytics/briefing-schedules/${id}/run`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          schedule?: LeadershipReportSchedule;
          report?: { headline?: string };
          historyEntry?: LeadershipReportRunHistoryEntry;
        };
      };

      if (!response.ok || !payload.success || !payload.data?.schedule) {
        throw new Error(payload.error || 'Failed to run briefing.');
      }

      const resultData = payload.data;
      const nextSchedule = resultData.schedule;
      if (!nextSchedule) {
        throw new Error('Run response was missing schedule data.');
      }

      updateLocalSchedule(id, nextSchedule);
      const nextHistoryEntry = resultData.historyEntry;
      if (nextHistoryEntry) {
        prependHistory([nextHistoryEntry]);
      }
      setMessages((current) => ({
        ...current,
        [id]: nextSchedule.lastRunSummary || resultData.report?.headline || 'Briefing generated successfully.',
      }));
    } catch (error) {
      console.error('Leadership report run failed.', error);
      setMessages((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'Failed to run briefing.',
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePreview(id: LeadershipReportSchedule['id']) {
    const target = schedules.find((schedule) => schedule.id === id);
    if (!target) return;

    setPreviewBusyId(id);
    setMessages((current) => ({ ...current, [id]: '' }));

    try {
      const response = await fetch('/api/admin/analytics/briefing-schedules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          deliveryMode: target.deliveryMode,
          recipientEmails: target.recipientEmails,
          webhookUrls: target.webhookUrls,
          webhookProvider: target.webhookProvider,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipReportPreview;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to build preview.');
      }

      setPreviews((current) => ({
        ...current,
        [id]: payload.data || null,
      }));
    } catch (error) {
      console.error('Leadership report preview failed.', error);
      setMessages((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'Failed to build preview.',
      }));
    } finally {
      setPreviewBusyId(null);
    }
  }

  async function handleRetryFailed() {
    setBulkBusy(true);
    setBulkMessage('');
    setBulkResults([]);

    try {
      const response = await fetch('/api/admin/analytics/briefing-schedules/retry-failed', {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          failedCount: number;
          retryCount: number;
          results: Array<{
            ok: boolean;
            schedule: LeadershipReportSchedule | null;
            summary: string;
            historyEntry: LeadershipReportRunHistoryEntry | null;
            error: string | null;
          }>;
        };
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to retry failed schedules.');
      }

      const nextSchedules = payload.data.results
        .map((result) => result.schedule)
        .filter((schedule): schedule is LeadershipReportSchedule => Boolean(schedule));
      const nextEntries = payload.data.results
        .map((result) => result.historyEntry)
        .filter((entry): entry is LeadershipReportRunHistoryEntry => Boolean(entry));

      mergeSchedules(nextSchedules);
      prependHistory(nextEntries);
      setBulkResults(payload.data.results);
      setBulkMessage(
        payload.data.retryCount
          ? `Retried ${payload.data.retryCount} failed schedule(s).`
          : 'No failed schedules needed a retry.'
      );
    } catch (error) {
      console.error('Leadership report failed retry action failed.', error);
      setBulkMessage(
        error instanceof Error ? error.message : 'Failed to retry failed schedules.'
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleAcknowledgeNotification(id: string) {
    setBusyNotificationId(id);

    try {
      const response = await fetch(`/api/admin/analytics/alert-notifications/${id}/acknowledge`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipReportAlertNotificationHistoryEntry;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to acknowledge notification.');
      }

      setAlertNotifications((current) =>
        current.map((entry) => (entry.id === id ? payload.data || entry : entry))
      );
    } catch (error) {
      console.error('Leadership alert notification acknowledge failed.', error);
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
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipReportAlertNotificationHistoryEntry;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to resolve notification.');
      }

      setAlertNotifications((current) =>
        current.map((entry) => (entry.id === id ? payload.data || entry : entry))
      );
    } catch (error) {
      console.error('Leadership alert notification resolve failed.', error);
    } finally {
      setBusyResolveNotificationId(null);
    }
  }

  async function handleMuteAlerts(action: 'mute' | 'unmute', hours?: 1 | 8 | 24) {
    setMuteBusy(true);
    setMuteMessage('');

    try {
      const response = await fetch('/api/admin/analytics/alert-notifications/mute', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'mute'
            ? { action, hours }
            : { action }
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: LeadershipReportCriticalAlertState;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to update critical alert mute.');
      }

      setCriticalAlertState(payload.data);
      setMuteMessage(
        action === 'mute'
          ? `Critical delivery alerts muted for ${hours} hour${hours === 1 ? '' : 's'}.`
          : 'Critical delivery alerts are active again.'
      );
    } catch (error) {
      console.error('Leadership alert mute update failed.', error);
      setMuteMessage(
        error instanceof Error
          ? error.message
          : 'Failed to update critical alert mute.'
      );
    } finally {
      setMuteBusy(false);
    }
  }

  if (!hasHydrated) {
    return (
      <section className={PANEL_CLASS}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delivery Center
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Preparing delivery controls, previews, and recent report status.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading the latest schedule data...
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={cx(SOFT_CARD_CLASS, 'p-5')}
            >
              <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="mt-4 h-8 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="mt-3 h-20 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={PANEL_CLASS}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Delivery Center
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Control daily, weekly, and monthly leadership briefing schedules, run a report
            manually, and track the most recent generation status from one place.
          </p>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Schedule state is stored now. Background delivery can be layered on top later.
        </p>
      </div>

      <div className={INLINE_NOTICE_CLASS}>
        Use a cron POST to <code className="rounded bg-white px-1 py-0.5 dark:bg-zinc-900">/api/admin/analytics/briefing-schedules/run-due</code>
        {' '}with <code className="rounded bg-white px-1 py-0.5 dark:bg-zinc-900">Authorization: Bearer $LEADERSHIP_REPORT_CRON_SECRET</code>
        {' '}to execute due schedules automatically.
      </div>

      <div className={cx('mt-4', SOFT_CARD_CLASS)}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Critical Alert Mute
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Silence automatic critical delivery-alert notifications temporarily without turning off schedules.
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
              Muted until {formatTimestamp(criticalAlertState.mutedUntil)}
              {criticalAlertState.mutedByEmail ? ` by ${criticalAlertState.mutedByEmail}` : ''}.
              {criticalAlertState.mutedReason ? ` ${criticalAlertState.mutedReason}` : ''}
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

        {muteMessage ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{muteMessage}</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRetryFailed}
          disabled={bulkBusy || deliverySummary.failedSchedules === 0}
          className={DANGER_BUTTON_CLASS}
        >
          {bulkBusy ? 'Retrying Failed Runs...' : 'Retry Failed Runs'}
        </button>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Use this when a delivery failed and you want to rerun only the broken schedules.
        </p>
      </div>

      {bulkMessage ? (
        <div className={cx('mt-4', INLINE_NOTICE_CLASS, 'text-zinc-700 dark:text-zinc-200')}>
          {bulkMessage}
        </div>
      ) : null}

      {bulkResults.length ? (
        <div className="mt-4 space-y-3">
          {bulkResults.map((result, index) => (
            <div
              key={`${result.schedule?.id || 'unknown'}-${result.historyEntry?.id || index}`}
              className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {result.schedule?.label || 'Unknown Schedule'}
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    result.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
                  }`}
                >
                  {result.ok ? 'Retry Succeeded' : 'Retry Failed'}
                </span>
              </div>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                {result.summary || result.error || 'No retry summary returned.'}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <section className={cx('mt-6', SOFT_CARD_CLASS, 'p-5')}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Escalated Schedules
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Broken schedules that now need direct leadership attention before automation can be trusted.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {escalations.length} escalated schedule{escalations.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {escalations.length ? (
            escalations.map((escalation) => (
              <div
                key={escalation.scheduleId}
                className={`rounded-2xl border p-4 ${getEscalationToneClass(escalation)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{escalation.label}</p>
                    <p className="mt-2 text-sm opacity-90">{escalation.reason}</p>
                  </div>
                  <span className="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                    {escalation.severity}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium opacity-90">
                  <span>Recent failed runs: {escalation.recentFailureCount}</span>
                  <Link href={escalation.actionHref} className="underline-offset-4 hover:underline">
                    {escalation.actionLabel}
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              No schedules are escalated right now.
            </div>
          )}
        </div>
      </section>

      <section className={cx('mt-6', SOFT_CARD_CLASS, 'p-5')}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Critical Alert Notifications
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Audit trail for automatic critical-alert notices sent from the cron delivery loop.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Showing the latest {alertNotifications.length} notification{alertNotifications.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {alertNotifications.length ? (
            alertNotifications.map((entry) => (
              <div
                key={entry.id}
                className={METRIC_CARD_CLASS}
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
                      <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                        {entry.alertCount} alert{entry.alertCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{entry.reason}</p>
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
                      className={cx(SECONDARY_BUTTON_CLASS, 'px-3 py-1.5 text-xs')}
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
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              No automatic critical-alert notifications have been recorded yet.
            </div>
          )}
        </div>
      </section>

      <section className={cx('mt-6', SOFT_CARD_CLASS, 'p-5')}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delivery Health Alerts
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Shared warnings from runtime readiness, failed schedules, and recent report history.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {healthAlerts.length} active alert{healthAlerts.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {healthAlerts.map((alert) => (
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
                <div className="mt-3">
                  <Link
                    href={alert.actionHref}
                    className="text-sm font-semibold underline-offset-4 hover:underline"
                  >
                    {alert.actionLabel}
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className={METRIC_CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Enabled
          </p>
          <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {deliverySummary.enabledCount}
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Briefing schedules currently active.
          </p>
        </div>
        <div className={METRIC_CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Email Ready
          </p>
          <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {deliverySummary.emailCount}
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Active schedules using email delivery.
          </p>
        </div>
        <div className={METRIC_CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Webhook Ready
          </p>
          <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {deliverySummary.webhookCount}
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Active schedules using webhook delivery.
          </p>
        </div>
        <div className={METRIC_CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Planned Runs
          </p>
          <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {deliverySummary.duePlannedCount}
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Active schedules with a next planned run.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Failed Schedules
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-300">
            {deliverySummary.failedSchedules}
          </p>
          <p className="mt-2 text-sm text-amber-700/90 dark:text-amber-300/90">
            Schedules whose last run failed.
          </p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
            Recent Failures
          </p>
          <p className="mt-2 text-2xl font-black text-red-700 dark:text-red-300">
            {deliverySummary.recentFailedRuns}
          </p>
          <p className="mt-2 text-sm text-red-700/90 dark:text-red-300/90">
            Failed runs visible in the recent history panel.
          </p>
        </div>
      </div>

      <section className={cx('mt-6', SOFT_CARD_CLASS, 'p-5')}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delivery Metrics
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Recent run health, trigger mix, and provider-level delivery breakdown.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Based on the latest {deliveryMetrics.recentRuns} recorded run{deliveryMetrics.recentRuns === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Success Rate
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryMetrics.successRate}%
            </p>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Cron Runs
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryMetrics.cronRuns}
            </p>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Manual Runs
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryMetrics.manualRuns}
            </p>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Active Channels
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryMetrics.providerBreakdown.filter((item) => item.enabledSchedules > 0).length}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {deliveryMetrics.providerBreakdown.map((provider) => (
            <div
              key={provider.key}
              className={METRIC_CARD_CLASS}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {provider.label}
                </p>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                  {provider.enabledSchedules} enabled
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl bg-zinc-50 px-3 py-2 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
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

      <section className={cx('mt-6', SOFT_CARD_CLASS, 'p-5')}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Performance Alerts
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Trend-aware alerts that flag worsening report delivery before it turns into a larger operations issue.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {deliveryPerformanceAlerts.length} alert{deliveryPerformanceAlerts.length === 1 ? '' : 's'} based on the latest 7-day comparison.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
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

      <section className={cx('mt-6', SOFT_CARD_CLASS, 'p-5')}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delivery Trends
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Compare the latest 7-day delivery window against the previous 7 days.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {deliveryTrends.currentWindowLabel} vs {deliveryTrends.previousWindowLabel}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Runs
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryTrends.currentRuns}
            </p>
            <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(deliveryTrends.deltaRuns, 'higher_better')}`}>
              {formatDelta(deliveryTrends.deltaRuns)} vs previous
            </span>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Success Rate
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryTrends.currentSuccessRate}%
            </p>
            <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(deliveryTrends.deltaSuccessRate, 'higher_better')}`}>
              {formatDelta(deliveryTrends.deltaSuccessRate)} pts
            </span>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Failures
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryTrends.currentFailures}
            </p>
            <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(deliveryTrends.deltaFailures, 'lower_better')}`}>
              {formatDelta(deliveryTrends.deltaFailures)} vs previous
            </span>
          </div>
          <div className={METRIC_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Cron Runs
            </p>
            <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {deliveryTrends.currentCronRuns}
            </p>
            <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDeltaToneClass(deliveryTrends.deltaCronRuns, 'higher_better')}`}>
              {formatDelta(deliveryTrends.deltaCronRuns)} vs previous
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
          <div className={METRIC_CARD_CLASS}>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Daily Run Trend
            </h4>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
              {deliveryTrends.dailyBuckets.map((bucket) => (
                <div
                  key={bucket.dateKey}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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

          <div className={METRIC_CARD_CLASS}>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Provider Trend
            </h4>
            <div className="mt-4 space-y-3">
              {deliveryTrends.providerTrends.length ? (
                deliveryTrends.providerTrends.map((provider) => (
                  <div
                    key={provider.key}
                    className={cx(SOFT_CARD_CLASS, 'p-3')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {provider.label}
                      </p>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDeltaToneClass(provider.deltaRuns, 'higher_better')}`}>
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
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  Not enough run history yet to show provider trends.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {schedules.map((schedule) => {
          const isBusy = busyId === schedule.id;
          const isPreviewBusy = previewBusyId === schedule.id;
          const preview = previews[schedule.id];
          const deliveryDiagnostics = getLeadershipReportDeliveryDiagnostics(schedule, {
            emailDeliveryConfigured,
          });

          return (
            <section
              key={schedule.id}
              className={cx(SOFT_CARD_CLASS, 'p-5')}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
                    {schedule.cadenceLabel}
                  </p>
                  <h3 className="mt-2 text-lg font-black text-zinc-900 dark:text-zinc-100">
                    {schedule.label}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {schedule.description}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    schedule.enabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                  }`}
                >
                  {schedule.enabled ? 'Enabled' : 'Paused'}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Delivery Time
                  </span>
                  <input
                    type="time"
                    value={schedule.deliveryTime}
                    onChange={(event) =>
                      updateLocalSchedule(schedule.id, { deliveryTime: event.target.value })
                    }
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Delivery Mode
                  </span>
                  <select
                    value={schedule.deliveryMode}
                    onChange={(event) =>
                      updateLocalSchedule(schedule.id, {
                        deliveryMode: event.target.value as LeadershipReportSchedule['deliveryMode'],
                      })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="dashboard_link">Dashboard Link</option>
                    <option value="markdown_export">Markdown Export</option>
                    <option value="email_summary">Email Summary</option>
                    <option value="webhook_summary">Webhook Summary</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Recipient Emails
                  </span>
                  <textarea
                    rows={3}
                    value={schedule.recipientEmails.join('\n')}
                    onChange={(event) =>
                      updateLocalSchedule(schedule.id, {
                        recipientEmails: event.target.value
                          .split(/\r?\n|,/)
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder={'leader@lokswami.com\nops@lokswami.com'}
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Webhook URLs
                  </span>
                  <textarea
                    rows={3}
                    value={schedule.webhookUrls.join('\n')}
                    onChange={(event) =>
                      updateLocalSchedule(schedule.id, {
                        webhookUrls: event.target.value
                          .split(/\r?\n|,/)
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder={'https://example.com/lokswami-hook\nhttps://example.com/backup-hook'}
                    className={INPUT_CLASS}
                  />
                </label>

                {schedule.deliveryMode === 'webhook_summary' ? (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Webhook Provider
                    </span>
                    <select
                      value={schedule.webhookProvider}
                      onChange={(event) =>
                        updateLocalSchedule(schedule.id, {
                          webhookProvider: event.target.value as LeadershipReportSchedule['webhookProvider'],
                        })
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="generic_json">Generic JSON</option>
                      <option value="slack">Slack</option>
                      <option value="discord">Discord</option>
                      <option value="teams">Microsoft Teams</option>
                      <option value="telegram">Telegram</option>
                    </select>
                  </label>
                ) : null}

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Delivery Notes
                  </span>
                  <textarea
                    rows={3}
                    value={schedule.notes}
                    onChange={(event) =>
                      updateLocalSchedule(schedule.id, { notes: event.target.value })
                    }
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Timezone</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {schedule.timezone}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {schedule.deliveryMode === 'webhook_summary' ? 'Webhook Targets' : 'Recipients'}
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {schedule.deliveryMode === 'webhook_summary'
                      ? schedule.webhookUrls.length
                      : schedule.recipientEmails.length}
                  </span>
                </div>
                {schedule.deliveryMode === 'webhook_summary' ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>Webhook Provider</span>
                    <span className="font-medium capitalize text-zinc-900 dark:text-zinc-100">
                      {schedule.webhookProvider.replace(/_/g, ' ')}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span>Next Planned Run</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {formatTimestamp(schedule.nextPlannedAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Last Run</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {formatTimestamp(schedule.lastRunAt)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getRunToneClass(schedule.lastRunStatus)}`}
                >
                  Last Status: {schedule.lastRunStatus}
                </span>
                <button
                  type="button"
                  onClick={() => updateLocalSchedule(schedule.id, { enabled: !schedule.enabled })}
                  className={cx(SECONDARY_BUTTON_CLASS, 'px-3 py-1 text-xs')}
                >
                  {schedule.enabled ? 'Pause Schedule' : 'Enable Schedule'}
                </button>
              </div>

              {schedule.lastRunSummary ? (
                <p className={cx('mt-4', INLINE_NOTICE_CLASS)}>
                  {schedule.lastRunSummary}
                </p>
              ) : null}

              {schedule.deliveryMode === 'email_summary' && !schedule.recipientEmails.length ? (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Add at least one recipient email before using email delivery.
                </p>
              ) : null}

              {schedule.deliveryMode === 'webhook_summary' && !schedule.webhookUrls.length ? (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Add at least one webhook URL before using webhook delivery.
                </p>
              ) : null}

              {messages[schedule.id] ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{messages[schedule.id]}</p>
              ) : null}

              <div className="mt-4 space-y-2">
                {deliveryDiagnostics.map((diagnostic) => (
                  <div
                    key={diagnostic.id}
                    className={`rounded-2xl border px-3 py-2 text-sm ${
                      diagnostic.severity === 'critical'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
                        : diagnostic.severity === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                    }`}
                  >
                    <p className="font-semibold">{diagnostic.title}</p>
                    <p className="mt-1 opacity-90">{diagnostic.detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleSave(schedule.id)}
                  disabled={isBusy}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  Save Schedule
                </button>
                <button
                  type="button"
                  onClick={() => handlePreview(schedule.id)}
                  disabled={isPreviewBusy}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  {isPreviewBusy ? 'Building Preview...' : 'Preview Delivery'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRunNow(schedule.id)}
                  disabled={isBusy}
                  className={DANGER_BUTTON_CLASS}
                >
                  {schedule.lastRunStatus === 'failed' ? 'Retry Failed Run' : 'Run Now'}
                </button>
                <a
                  href={schedule.viewHref}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Open View
                </a>
                <a
                  href={schedule.downloadHref}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Download
                </a>
              </div>

              {preview ? (
                <div className={cx('mt-5', METRIC_CARD_CLASS)}>
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
                        Preview
                      </p>
                      <h4 className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {preview.title}
                      </h4>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {preview.summary}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      {preview.provider
                        ? `${preview.modeLabel} / ${preview.provider.replace(/_/g, ' ')}`
                        : preview.modeLabel}
                    </span>
                  </div>

                  {preview.recipients?.length ? (
                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                      Recipients: {preview.recipients.join(', ')}
                    </p>
                  ) : null}

                  {preview.targets?.length ? (
                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                      Targets: {preview.targets.join(', ')}
                    </p>
                  ) : null}

                  {preview.bodyText ? (
                    <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      {preview.bodyText}
                    </pre>
                  ) : null}

                  {preview.bodyJson ? (
                    <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      {JSON.stringify(preview.bodyJson, null, 2)}
                    </pre>
                  ) : null}

                  {(preview.viewHref || preview.downloadHref) ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {preview.viewHref ? (
                        <a
                          href={preview.viewHref}
                          className={ACTION_LINK_CLASS}
                        >
                          Open View
                        </a>
                      ) : null}
                      {preview.downloadHref ? (
                        <a
                          href={preview.downloadHref}
                          className={ACTION_LINK_CLASS}
                        >
                          Download Briefing
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className={cx('mt-6', SOFT_CARD_CLASS, 'p-5')}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Recent Run History
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Every manual and cron-triggered briefing run is logged here for leadership visibility.
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Showing the latest {visibleHistory.length} run{visibleHistory.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {visibleHistory.length ? (
            visibleHistory.map((entry) => (
              <div
                key={entry.id}
                className={METRIC_CARD_CLASS}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {entry.label}
                      </p>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getRunToneClass(entry.status)}`}
                      >
                        {entry.status}
                      </span>
                      <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                        {entry.trigger}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{entry.summary}</p>
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
                    <p className="mt-1">Mode: {entry.deliveryMode.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                {entry.recipientEmails.length ? (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Recipients: {entry.recipientEmails.join(', ')}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              No leadership report runs have been recorded yet.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
