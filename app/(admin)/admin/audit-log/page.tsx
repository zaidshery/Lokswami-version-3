import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  type AdminAuditContentFilter,
  type AdminAuditEntry,
  type AdminAuditScope,
  getAdminAuditCenterData,
} from '@/lib/admin/adminAuditCenter';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUserRoleLabel } from '@/lib/auth/roles';
import { formatUiDate } from '@/lib/utils/dateFormat';
import formatNumber from '@/lib/utils/formatNumber';

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type AuditStatCard = {
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
  'admin-shell-toolbar-btn inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-shell-text)] transition-colors hover:text-[color:var(--admin-shell-accent)]';

const SCOPE_OPTIONS: Array<{ id: AdminAuditScope; label: string; description: string }> = [
  { id: 'all', label: 'All Activity', description: 'Workflow, security, reporting, and alert operations together.' },
  { id: 'workflow', label: 'Workflow', description: 'Content workflow actions across the newsroom desk.' },
  { id: 'security', label: 'Security', description: 'Admin mutations, permission changes, and authentication events.' },
  { id: 'reporting', label: 'Reporting', description: 'Leadership briefing runs and delivery operations.' },
  { id: 'alerts', label: 'Alerts', description: 'Critical alert notifications and their resolution state.' },
];

const CONTENT_OPTIONS: Array<{ id: AdminAuditContentFilter; label: string }> = [
  { id: 'all', label: 'All Content' },
  { id: 'article', label: 'Articles' },
  { id: 'story', label: 'Stories' },
  { id: 'video', label: 'Videos' },
  { id: 'epaper', label: 'E-Papers' },
];

function readSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }
  return typeof value === 'string' ? value : null;
}

function parseScope(value: string | null): AdminAuditScope {
  return SCOPE_OPTIONS.some((option) => option.id === value)
    ? (value as AdminAuditScope)
    : 'all';
}

function parseContentFilter(value: string | null): AdminAuditContentFilter {
  return CONTENT_OPTIONS.some((option) => option.id === value)
    ? (value as AdminAuditContentFilter)
    : 'all';
}

function buildAuditHref(
  params: Record<string, string | string[] | undefined>,
  patch: Partial<{ scope: AdminAuditScope; content: AdminAuditContentFilter }>
) {
  const next = new URLSearchParams();
  next.set('scope', patch.scope ?? parseScope(readSearchParam(params.scope)));
  next.set('content', patch.content ?? parseContentFilter(readSearchParam(params.content)));
  return `/admin/audit-log?${next.toString()}`;
}

function getToneClass(tone: AdminAuditEntry['tone']) {
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

function FilterLink({
  href,
  label,
  description,
  active,
}: {
  href: string;
  label: string;
  description?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[24px] border p-4 shadow-sm transition-all hover:-translate-y-0.5 ${
        active
          ? 'border-[color:var(--admin-shell-active)] bg-[color:var(--admin-shell-active)] text-[color:var(--admin-shell-active-text)] shadow-[var(--admin-shell-shadow-strong)]'
          : 'border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] text-[color:var(--admin-shell-text)] hover:bg-[color:var(--admin-shell-surface-muted)]'
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      {description ? (
        <p className={`mt-2 text-xs leading-5 ${active ? 'text-white/80 dark:text-black/60' : 'text-[color:var(--admin-shell-text-muted)]'}`}>
          {description}
        </p>
      ) : null}
    </Link>
  );
}

function StatCard({ stat }: { stat: AuditStatCard }) {
  return (
    <div className="admin-shell-surface-strong group relative overflow-hidden rounded-[28px] p-6 transition-all hover:-translate-y-0.5">
      <div className={cx('pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full opacity-20 blur-2xl', stat.tone)} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">{stat.label}</p>
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

function AuditEntryCard({ entry }: { entry: AdminAuditEntry }) {
  return (
    <Link
      href={entry.href}
      className="admin-shell-surface block rounded-[28px] p-5 transition-all hover:-translate-y-0.5 hover:bg-[color:var(--admin-shell-surface-muted)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold text-[color:var(--admin-shell-text)]">{entry.title}</p>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getToneClass(entry.tone)}`}>
              {entry.statusLabel}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">{entry.detail}</p>
        </div>
        <div className="text-right text-xs text-[color:var(--admin-shell-text-muted)]">
          <p>{formatUiDate(entry.createdAt, entry.createdAt)}</p>
          <p className="mt-1">{entry.contextLabel}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="admin-shell-surface-muted rounded-full px-3 py-1 font-semibold text-[color:var(--admin-shell-text)]">
          {entry.actorLabel}
        </span>
        <span className="admin-shell-surface-muted rounded-full px-3 py-1 font-semibold text-[color:var(--admin-shell-text)]">
          {entry.actorMeta}
        </span>
      </div>
    </Link>
  );
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/audit-log');
  }

  if (!canViewPage(admin.role, 'audit_log')) {
    redirect('/admin/work?access=denied');
  }

  const params = await searchParams;
  const scope = parseScope(readSearchParam(params.scope));
  const contentFilter = parseContentFilter(readSearchParam(params.content));
  const audit = await getAdminAuditCenterData({ scope, contentFilter, limit: 80 });

  const statCards: AuditStatCard[] = [
    {
      label: 'Security Events',
      value: audit.summary.securityEvents,
      detail: 'Admin mutations and authentication events captured by Phase 3 audit logging.',
      icon: Activity,
      tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    },
    {
      label: 'Admin Mutations',
      value: audit.summary.adminMutations,
      detail: 'POST, PUT, PATCH, DELETE, and publish-style admin API actions logged.',
      icon: CheckCircle2,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    },
    {
      label: 'Auth Events',
      value: audit.summary.authEvents,
      detail: 'Credential and OAuth sign-in attempts recorded for security review.',
      icon: AlertTriangle,
      tone: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
    },
    {
      label: 'Open Alert Notifications',
      value: audit.summary.openAlertNotifications,
      detail: 'Critical reporting alerts that are still open or unresolved.',
      icon: ShieldCheck,
      tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    },
  ];

  return (
    <div className="mx-auto max-w-[1640px] space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--admin-shell-border)] bg-[radial-gradient(circle_at_top_left,rgba(185,28,28,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.08),transparent_28%),var(--admin-bg-depth)] p-5 text-[color:var(--admin-shell-text)] shadow-[var(--admin-shell-shadow-strong)] sm:rounded-[36px] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-10 top-0 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/14" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 rounded-full bg-red-500/10 blur-3xl dark:bg-red-500/14" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
            Phase 3 Security Audit
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)] sm:text-5xl">
            Admin Activity Audit
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-[color:var(--admin-shell-text-muted)] sm:text-[15px]">
            Central oversight for admin mutations, sign-ins, workflow actions, reporting operations,
            and critical alert notifications. This surface is designed for fast leadership review,
            not raw log noise.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className={META_CHIP_CLASS}>{formatUserRoleLabel(admin.role)}</span>
            <span className={META_CHIP_CLASS}>
              {SCOPE_OPTIONS.find((option) => option.id === scope)?.label || 'All Activity'}
            </span>
            <span className={META_CHIP_CLASS}>
              {CONTENT_OPTIONS.find((option) => option.id === contentFilter)?.label || 'All Content'}
            </span>
            <span className={META_CHIP_CLASS}>{formatNumber(audit.entries.length)} entries</span>
          </div>
          <div className="admin-shell-surface mt-6 max-w-3xl rounded-2xl px-4 py-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            <strong className="text-[color:var(--admin-shell-text)]">Read-only, append-only history.</strong>{' '}
            Audit entries can be searched and reviewed here, but they cannot be edited or deleted.
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/permission-review" className={ACTION_LINK_CLASS}>
              Open Permission Review
            </Link>
            <Link href="/admin/operations-diagnostics" className={ACTION_LINK_CLASS}>
              Open Diagnostics
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,1fr]">
        <section className={PANEL_CLASS}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Audit Scope</h2>
              <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
                Switch between workflow, reporting, and alert histories.
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {SCOPE_OPTIONS.map((option) => (
              <FilterLink
                key={option.id}
                href={buildAuditHref(params, { scope: option.id })}
                label={option.label}
                description={option.description}
                active={option.id === scope}
              />
            ))}
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Content Filter</h2>
              <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
                Narrow workflow activity to a specific content lane when needed.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {CONTENT_OPTIONS.map((option) => (
              <FilterLink
                key={option.id}
                href={buildAuditHref(params, { content: option.id })}
                label={option.label}
                active={option.id === contentFilter}
              />
            ))}
          </div>
          <div className={cx('mt-4 text-sm text-[color:var(--admin-shell-text-muted)]', SOFT_CARD_CLASS)}>
            {audit.workflowAuditAvailable
              ? 'Security and workflow audit history are using the shared MongoDB audit store.'
              : 'Security and workflow audit history need MongoDB to be available. Reporting and alert histories still load from their persisted stores.'}
          </div>
        </section>
      </section>

      <section className={PANEL_CLASS}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Audit Timeline</h2>
            <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
              Combined administrative history across the selected governance scope.
            </p>
          </div>
          <span className={META_CHIP_CLASS}>{formatNumber(audit.entries.length)} entries loaded</span>
        </div>

        <div className="mt-6 space-y-4">
          {audit.entries.length ? (
            audit.entries.map((entry) => <AuditEntryCard key={entry.id} entry={entry} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-5 text-sm text-[color:var(--admin-shell-text-muted)]">
              No audit entries matched the current filters yet.
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Governance Signals</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
            A simple read on what matters most from the Phase 3 audit trail.
          </p>

          <div className="mt-6 space-y-3">
            <div className={SOFT_CARD_CLASS}>
              <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">Admin Mutation Trail</p>
              <p className="mt-2 text-sm text-[color:var(--admin-shell-text-muted)]">
                {formatNumber(audit.summary.adminMutations)} admin write action(s) are visible in the security audit log.
              </p>
            </div>
            <div className={SOFT_CARD_CLASS}>
              <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">Authentication Trail</p>
              <p className="mt-2 text-sm text-[color:var(--admin-shell-text-muted)]">
                {formatNumber(audit.summary.authEvents)} sign-in or session event(s) are available for security review.
              </p>
            </div>
            <div className={SOFT_CARD_CLASS}>
              <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">Publishing Trail</p>
              <p className="mt-2 text-sm text-[color:var(--admin-shell-text-muted)]">
                {formatNumber(audit.summary.publishingEvents)} publish action(s) are visible in the latest shared workflow history.
              </p>
            </div>
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Next Governance Surfaces</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
            Phase 3 gives security reviewers a reliable admin action trail. The next hardening passes can build on it.
          </p>

          <div className="mt-6 space-y-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            <div className={SOFT_CARD_CLASS}>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Permission Review</p>
              <p className="mt-2">Compare current route access with actual usage and expose any over-permissioned roles.</p>
            </div>
            <div className={SOFT_CARD_CLASS}>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Operational Diagnostics</p>
              <p className="mt-2">Add stronger runtime checks and failure summaries across uploads, OCR, TTS, and workflows.</p>
            </div>
            <div className={SOFT_CARD_CLASS}>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Test Coverage Expansion</p>
              <p className="mt-2">Broaden regression tests around permissions, governance routes, and deployment-sensitive operations.</p>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
