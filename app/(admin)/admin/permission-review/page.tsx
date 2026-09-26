import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, LockKeyhole, ShieldCheck, UserCog } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getPermissionReviewData } from '@/lib/admin/permissionReview';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { ADMIN_ROLES, formatUserRoleLabel, type AdminRole } from '@/lib/auth/roles';
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

const PERMISSION_ROLES: AdminRole[] = [...ADMIN_ROLES];

function getToneClass(tone: 'neutral' | 'watch' | 'critical') {
  switch (tone) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
    case 'watch':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
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

export default async function PermissionReviewPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/permission-review');
  }

  if (!canViewPage(admin.role, 'permission_review')) {
    redirect('/admin/work?access=denied');
  }

  const review = await getPermissionReviewData();

  const statCards: StatCard[] = [
    {
      label: 'Super Admin Only',
      value: review.superAdminOnlyPages.length,
      detail: 'Leadership-only pages currently locked down to super admin.',
      icon: LockKeyhole,
      tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    },
    {
      label: 'Broad Access',
      value: review.broadAccessPages.length,
      detail: 'Pages visible across many admin roles and worth governance review.',
      icon: ShieldCheck,
      tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    },
    {
      label: 'Restricted Routes',
      value: review.matrix.filter((entry) => entry.classification === 'restricted').length,
      detail: 'Operational routes available only to the newsroom roles that actively need them.',
      icon: AlertTriangle,
      tone: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
    },
    {
      label: 'Roles In Review',
      value: review.roleSummaries.length,
      detail: 'Current admin-role coverage represented in the live permission map.',
      icon: UserCog,
      tone: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
    },
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
            Permission Review
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-[color:var(--admin-shell-text-muted)] sm:text-[15px]">
            A live route-access review built from the real permission map. This page should make
            broad access, newsroom restrictions, and leadership-only surfaces obvious at a glance.
          </p>
          <p className="admin-shell-surface mt-4 max-w-3xl rounded-2xl px-4 py-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            <strong className="text-[color:var(--admin-shell-text)]">Informational only.</strong>{' '}
            This matrix reflects the executable permission policy. Change access in reviewed code and policy—not on this page.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className={META_CHIP_CLASS}>{formatUserRoleLabel(admin.role)}</span>
            <span className={META_CHIP_CLASS}>{formatNumber(review.matrix.length)} routes in review</span>
            <span className={META_CHIP_CLASS}>{formatNumber(review.superAdminOnlyPages.length)} super-admin only</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <StatCardView key={stat.label} stat={stat} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,1.1fr]">
        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Role Coverage</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
            Page-count coverage for each admin role in the current permission map.
          </p>

          <div className="mt-6 space-y-3">
            {review.roleSummaries.map((summary) => (
              <div key={summary.role} className={SOFT_CARD_CLASS}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">
                      {formatUserRoleLabel(summary.role)}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                      {summary.labels.slice(0, 4).join(' / ')}
                      {summary.labels.length > 4 ? ` +${summary.labels.length - 4} more` : ''}
                    </p>
                  </div>
                  <span className="admin-shell-surface rounded-full px-3 py-1 text-xs font-semibold text-[color:var(--admin-shell-text)]">
                    {formatNumber(summary.pageCount)} page(s)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Risk Highlights</h2>
          <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
            Fast governance signals from the current route-access matrix.
          </p>

          <div className="mt-6 space-y-3">
            {review.riskHighlights.map((risk) => (
              <div
                key={risk.id}
                className={`rounded-2xl border p-4 ${getToneClass(risk.tone)}`}
              >
                <p className="text-sm font-semibold">{risk.title}</p>
                <p className="mt-2 text-sm opacity-90">{risk.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/audit-log" className={ACTION_LINK_CLASS}>
              Open Audit Log
            </Link>
            <Link href="/admin/settings" className={ACTION_LINK_CLASS}>
              Open Settings
            </Link>
          </div>
        </section>
      </section>

      <section className={PANEL_CLASS}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Route Access Matrix</h2>
            <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
              Every admin route surface currently declared in the permission layer.
            </p>
          </div>
          <span className={META_CHIP_CLASS}>{formatNumber(review.matrix.length)} total surfaces</span>
        </div>

        <div
          role="region"
          aria-label="Permission matrix"
          tabIndex={0}
          className="mt-6 overflow-x-auto rounded-2xl border border-[color:var(--admin-shell-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <table className="min-w-[860px] w-full border-collapse text-left text-sm">
            <caption className="sr-only">Allow and deny decisions for every admin route and newsroom role.</caption>
            <thead className="admin-shell-surface-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold text-[color:var(--admin-shell-text)]">Route surface</th>
                {PERMISSION_ROLES.map((role) => (
                  <th key={role} scope="col" className="px-3 py-3 text-center font-bold text-[color:var(--admin-shell-text)]">
                    {formatUserRoleLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--admin-shell-border)]">
              {review.matrix.map((entry) => (
                <tr key={entry.key}>
                  <th scope="row" className="min-w-72 px-4 py-4 align-top font-normal">
                    <span className="block font-bold text-[color:var(--admin-shell-text)]">{entry.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[color:var(--admin-shell-text-muted)]">{entry.note}</span>
                    <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getToneClass(entry.riskTone)}`}>
                      {entry.classification === 'super_admin_only'
                        ? 'Super Admin Only'
                        : entry.classification === 'broad'
                          ? 'Broad Access'
                          : 'Restricted'}
                    </span>
                  </th>
                  {PERMISSION_ROLES.map((role) => {
                    const allowed = entry.roles.includes(role);
                    return (
                      <td key={`${entry.key}-${role}`} className="px-3 py-4 text-center align-top">
                        <span className={cx(
                          'inline-flex min-w-16 justify-center rounded-full border px-2.5 py-1 text-xs font-bold',
                          allowed
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                            : 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                        )}>
                          {allowed ? 'Allow' : 'Deny'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
