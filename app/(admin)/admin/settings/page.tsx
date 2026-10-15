import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, AlertTriangle, Settings2, ShieldCheck } from 'lucide-react';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import DeploymentSafeguardsPanel from './DeploymentSafeguardsPanel';
import LeadershipReportsSettingsPanel from './LeadershipReportsSettingsPanel';
import TtsSettingsPanel from './TtsSettingsPanel';

export default async function SettingsPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/settings');
  }

  if (!canViewPage(admin.role, 'settings')) {
    redirect('/admin/work?access=denied');
  }

  return (
    <div className="mx-auto max-w-[1640px] space-y-8">
      <section className="relative overflow-hidden rounded-[36px] border border-[color:var(--admin-shell-border)] bg-[radial-gradient(circle_at_top_left,rgba(185,28,28,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.08),transparent_28%),var(--admin-bg-depth)] p-8 text-[color:var(--admin-shell-text)] shadow-[var(--admin-shell-shadow-strong)] lg:p-10">
        <div className="pointer-events-none absolute -right-10 top-0 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/14" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 rounded-full bg-red-500/10 blur-3xl dark:bg-red-500/14" />
        <div className="relative grid gap-8 xl:grid-cols-[1.25fr,0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
              Settings
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)] sm:text-5xl">
              Platform Settings
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--admin-shell-text-muted)] sm:text-[15px]">
              Manage deployment safeguards, leadership reports, and shared runtime settings.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="admin-shell-surface rounded-[28px] p-5 backdrop-blur">
              <p className="text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
                Use the links below when you need diagnostics, audit history, or system-health
                context while changing settings.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Link
                href="/admin/operations-diagnostics"
                className="admin-shell-surface rounded-[24px] p-4 text-sm font-semibold text-[color:var(--admin-shell-text)] shadow-sm transition-all hover:-translate-y-0.5"
              >
                <div className="mb-3 inline-flex rounded-2xl bg-amber-500/10 p-3 text-amber-600 dark:text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                Diagnostics
              </Link>
              <Link
                href="/admin/audit-log"
                className="admin-shell-surface rounded-[24px] p-4 text-sm font-semibold text-[color:var(--admin-shell-text)] shadow-sm transition-all hover:-translate-y-0.5"
              >
                <div className="mb-3 inline-flex rounded-2xl bg-blue-500/10 p-3 text-blue-600 dark:text-blue-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                Audit
              </Link>
              <Link
                href="/admin/analytics?tab=system_health"
                className="admin-shell-surface rounded-[24px] p-4 text-sm font-semibold text-[color:var(--admin-shell-text)] shadow-sm transition-all hover:-translate-y-0.5"
              >
                <div className="mb-3 inline-flex rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-300">
                  <Activity className="h-5 w-5" />
                </div>
                System Health
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-8">
          <DeploymentSafeguardsPanel />
          <LeadershipReportsSettingsPanel />
        </div>
        <div className="space-y-8">
          <section className="admin-shell-surface-strong rounded-[32px] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-600 dark:text-violet-300">
                <Settings2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[color:var(--admin-shell-text)]">Shared Runtime Controls</h2>
                <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
                  Settings that support text-to-speech and shared newsroom automation.
                </p>
              </div>
            </div>
          </section>
          <TtsSettingsPanel />
        </div>
      </div>
    </div>
  );
}
