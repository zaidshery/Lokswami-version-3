import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, AlertTriangle, BarChart3, Newspaper, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getOperationalDiagnosticsSnapshot } from '@/lib/admin/operationalDiagnostics';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { getRequestLogSummary } from '@/lib/security/requestLogReader';
import { formatUserRoleLabel } from '@/lib/auth/roles';
import { formatUiDate } from '@/lib/utils/dateFormat';
import formatNumber from '@/lib/utils/formatNumber';

type StatCard = {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: string;
};

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

const PANEL_CLASS = 'admin-shell-surface-strong rounded-[24px] p-4 sm:rounded-[32px] sm:p-6';

const SOFT_CARD_CLASS =
  'admin-shell-surface-muted rounded-[24px] p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.14)] dark:shadow-[0_18px_48px_-40px_rgba(0,0,0,0.35)]';

const META_CHIP_CLASS =
  'admin-shell-surface rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-shell-text-muted)]';

const ACTION_LINK_CLASS =
  'admin-shell-toolbar-btn inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-shell-text)] transition-colors hover:text-[color:var(--admin-shell-accent)]';

function getStatusToneClass(status: 'healthy' | 'watch' | 'critical' | 'inactive') {
  switch (status) {
    case 'healthy':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'watch':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
    case 'inactive':
    default:
      return 'border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] text-[color:var(--admin-shell-text)]';
  }
}

function getSignalToneClass(tone: 'neutral' | 'good' | 'warning' | 'critical') {
  switch (tone) {
    case 'good':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
    case 'neutral':
    default:
      return 'border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] text-[color:var(--admin-shell-text)]';
  }
}

function StatCardView({ stat }: { stat: StatCard }) {
  return (
    <div className="admin-shell-surface-strong group relative overflow-hidden rounded-[28px] p-6 transition-all hover:-translate-y-0.5">
      <div className={cx('pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full opacity-20 blur-2xl', stat.tone)} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
            {stat.label}
          </p>
          <p className="mt-4 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)]">
            {formatNumber(stat.value)}
          </p>
        </div>
        <div className={`rounded-2xl p-3 ring-1 ring-black/5 dark:ring-white/10 ${stat.tone}`}>
          <stat.icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">{stat.detail}</p>
    </div>
  );
}

export default async function OperationsDiagnosticsPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/operations-diagnostics');
  }

  if (!canViewPage(admin.role, 'operations_diagnostics')) {
    redirect('/admin/work?access=denied');
  }

  const [diagnostics, requestLogs] = await Promise.all([
    getOperationalDiagnosticsSnapshot(),
    getRequestLogSummary({ limit: 1000, slowMs: 1000 }),
  ]);

  const statCards: StatCard[] = [
    {
      label: 'Services At Risk',
      value: diagnostics.summary.servicesAtRisk,
      detail: 'Operational lanes currently showing watch or critical status.',
      icon: Activity,
      tone: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
    },
    {
      label: 'Upload & OCR Alerts',
      value: diagnostics.summary.uploadAlerts,
      detail: 'Issues that can block media, thumbnail, or hotspot detection flows.',
      icon: AlertTriangle,
      tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    },
    {
      label: 'Reporting Risks',
      value: diagnostics.summary.reportingRisks,
      detail: 'Leadership report health alerts and escalated schedules needing oversight.',
      icon: BarChart3,
      tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    },
    {
      label: 'Blocked Editions',
      value: diagnostics.summary.blockedEditions,
      detail: 'E-paper editions still blocked by QA, OCR, hotspot, or publish-readiness issues.',
      icon: Newspaper,
      tone: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
    },
  ];
  const observabilityStats: Array<[string, number]> = [
    ['Failed auth', requestLogs.failedAuth],
    ['Rate limited', requestLogs.rateLimited],
    ['Validation', requestLogs.validationFailures],
    ['Slow', requestLogs.slowRequests],
  ];

  return (
    <div className="mx-auto max-w-[1640px] space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--admin-shell-border)] bg-[radial-gradient(circle_at_top_left,rgba(185,28,28,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.08),transparent_28%),var(--admin-bg-depth)] p-5 text-[color:var(--admin-shell-text)] shadow-[var(--admin-shell-shadow-strong)] sm:rounded-[36px] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-10 top-0 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/14" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 rounded-full bg-red-500/10 blur-3xl dark:bg-red-500/14" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
            Phase 5 Governance
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)] sm:text-5xl">
            Operational Diagnostics
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-[color:var(--admin-shell-text-muted)] sm:text-[15px]">
            Runtime oversight across uploads, OCR assist, shared TTS, reporting jobs, and
            e-paper production blockers. This is the super-admin surface for the simple
            question: what can break today?
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className={META_CHIP_CLASS}>{formatUserRoleLabel(admin.role)}</span>
            <span className={META_CHIP_CLASS}>
              {diagnostics.dataSource === 'hybrid' ? 'MongoDB + fallback' : diagnostics.dataSource}
            </span>
            <span className={META_CHIP_CLASS}>{formatNumber(diagnostics.summary.servicesAtRisk)} services at risk</span>
            <span className={cx(
              META_CHIP_CLASS,
              diagnostics.summary.servicesAtRisk > 0
                ? 'border-amber-300 text-amber-800 dark:border-amber-500/30 dark:text-amber-200'
                : 'border-emerald-300 text-emerald-800 dark:border-emerald-500/30 dark:text-emerald-200'
            )}>
              Overall: {diagnostics.summary.servicesAtRisk > 0 ? 'Degraded' : 'Healthy'}
            </span>
            <span className={META_CHIP_CLASS}>Read-only diagnostics</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <StatCardView key={stat.label} stat={stat} />
        ))}
      </section>

      <section className={PANEL_CLASS}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">
              API Observability
            </h2>
            <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
              Recent request logs, slow routes, failed auth, rate-limit hits, and validation failures.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {observabilityStats.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[color:var(--admin-shell-border)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-shell-text-muted)]">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-black text-[color:var(--admin-shell-text)]">
                  {formatNumber(Number(value))}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {requestLogs.slowestRoutes.length ? (
            requestLogs.slowestRoutes.slice(0, 6).map((route) => (
              <div key={route.path} className={SOFT_CARD_CLASS}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[color:var(--admin-shell-text)]">
                      {route.path}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                      {formatNumber(route.count)} request{route.count === 1 ? '' : 's'} / {formatNumber(route.failures)} failures
                    </p>
                  </div>
                  <span className={META_CHIP_CLASS}>{formatNumber(route.maxDuration)}ms max</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-4 text-sm text-[color:var(--admin-shell-text-muted)]">
              No request logs have been collected yet.
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,1fr]">
        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Operational Lanes</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
            The runtime surfaces most likely to affect publishing, briefing delivery, or newsroom continuity.
          </p>

          <div className="mt-6 space-y-3">
            {diagnostics.lanes.map((lane) => (
              <div key={lane.id} className={SOFT_CARD_CLASS}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">{lane.label}</p>
                    <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">{lane.summary}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusToneClass(lane.status)}`}>
                    {lane.status === 'critical'
                      ? 'Unavailable'
                      : lane.status === 'watch'
                        ? 'Degraded'
                        : lane.status === 'inactive'
                          ? 'Disabled'
                          : 'Healthy'}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">{lane.detail}</p>
                {lane.href ? (
                  <div className="mt-4">
                    <Link href={lane.href} className={ACTION_LINK_CLASS}>
                      Open related surface
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Runtime Readiness</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
            Configuration and mode checks across the highest-risk operational systems.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {diagnostics.runtimeSignals.map((signal) => (
              <div
                key={`${signal.label}-${signal.value}`}
                className={`rounded-[22px] border p-4 ${getSignalToneClass(signal.tone)}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide">{signal.label}</p>
                <p className="mt-2 text-sm font-semibold">{signal.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/settings" className={ACTION_LINK_CLASS}>
              Open Settings
            </Link>
            <Link href="/admin/analytics?tab=system_health" className={ACTION_LINK_CLASS}>
              Open System Health
            </Link>
          </div>
        </section>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,1fr]">
        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Active Operational Alerts</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
            Current issues that could block uploads, automation, or e-paper release quality.
          </p>

          <div className="mt-6 space-y-3">
            {diagnostics.alerts.length ? (
              diagnostics.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-[22px] border p-4 ${getSignalToneClass(alert.tone)}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <p className="mt-2 text-sm opacity-90">{alert.detail}</p>
                    </div>
                    {alert.href ? (
                      <Link href={alert.href} className={ACTION_LINK_CLASS}>
                        {alert.actionLabel || 'Open'}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-4 text-sm text-[color:var(--admin-shell-text-muted)]">
                No active operational alerts are being surfaced right now.
              </div>
            )}
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Escalated Report Jobs</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Briefing schedules that are failing repeatedly or running with broken delivery readiness.
          </p>

          <div className="mt-6 space-y-3">
            {diagnostics.reportEscalations.length ? (
              diagnostics.reportEscalations.map((entry) => (
                <div
                  key={entry.scheduleId}
                  className={`rounded-[22px] border p-4 ${getStatusToneClass(
                    entry.severity === 'warning' ? 'watch' : entry.severity
                  )}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{entry.label}</p>
                    <span className="rounded-full border border-current/20 bg-white/40 px-3 py-1 text-xs font-semibold dark:bg-black/10">
                      {entry.recentFailureCount} failure{entry.recentFailureCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm opacity-90">{entry.reason}</p>
                  <div className="mt-4">
                    <Link href={entry.actionHref} className={ACTION_LINK_CLASS}>
                      {entry.actionLabel}
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-4 text-sm text-[color:var(--admin-shell-text-muted)]">
                No report schedules are escalated right now.
              </div>
            )}
          </div>
        </section>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,1fr]">
        <section className={PANEL_CLASS}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Blocked Editions</h2>
              <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
                Editions still carrying publish blockers from OCR, mapping, QA, or coverage gaps.
              </p>
            </div>
            <Link href="/admin/epapers" className={ACTION_LINK_CLASS}>
              Open E-Papers
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {diagnostics.blockedEditions.length ? (
              diagnostics.blockedEditions.map((edition) => (
                <Link
                  key={edition.epaperId}
                  href={edition.editHref}
                  className={cx(
                    SOFT_CARD_CLASS,
                    'block transition-all hover:-translate-y-0.5 hover:bg-zinc-100 dark:hover:bg-white/10'
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">
                        {edition.title}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                        {edition.cityName} / {edition.productionStatus.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                      {edition.blockerCount} blocker{edition.blockerCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[color:var(--admin-shell-text-muted)]">
                    {edition.blockers.slice(0, 2).join(' ')}
                  </p>
                </Link>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-4 text-sm text-[color:var(--admin-shell-text-muted)]">
                No blocked editions are visible right now.
              </div>
            )}
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Low-Quality Pages</h2>
              <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
                The latest pages still showing OCR, hotspot, or QA issues.
              </p>
            </div>
            <Link href="/admin/review-queue" className={ACTION_LINK_CLASS}>
              Open Review Queue
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {diagnostics.lowQualityPages.length ? (
              diagnostics.lowQualityPages.map((page) => (
                <Link
                  key={`${page.epaperId}-${page.pageNumber}`}
                  href={page.editHref}
                  className={cx(
                    SOFT_CARD_CLASS,
                    'block transition-all hover:-translate-y-0.5 hover:bg-zinc-100 dark:hover:bg-white/10'
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">
                        {page.epaperTitle} / Page {page.pageNumber}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                        {page.cityName} / {page.qualityLabel} / {page.reviewStatus.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                      {page.reviewedByName || 'Unassigned'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[color:var(--admin-shell-text-muted)]">{page.issueSummary}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-4 text-sm text-[color:var(--admin-shell-text-muted)]">
                No low-quality pages are visible right now.
              </div>
            )}
          </div>
        </section>
      </section>

      <section className={PANEL_CLASS}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Recent TTS Failures</h2>
            <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
              The latest shared TTS failure events from the runtime diagnostics layer.
            </p>
          </div>
          <Link href="/admin/settings" className={ACTION_LINK_CLASS}>
            <Settings className="h-4 w-4" />
            Open Settings
          </Link>
        </div>

        <div className="mt-6 space-y-3">
          {diagnostics.recentFailures.length ? (
            diagnostics.recentFailures.map((failure) => (
              <div key={failure.id} className={SOFT_CARD_CLASS}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">
                      {failure.message}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                      {failure.sourceType} / {failure.action} / {failure.variant}
                    </p>
                  </div>
                  <span className="text-xs text-[color:var(--admin-shell-text-muted)]">
                    {formatUiDate(failure.createdAt, failure.createdAt)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-4 text-sm text-[color:var(--admin-shell-text-muted)]">
              No TTS failures were recorded in the current diagnostics window.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
