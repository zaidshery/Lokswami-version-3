import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, Megaphone, Settings2, Users2 } from 'lucide-react';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUserRoleLabel } from '@/lib/auth/roles';
import { getNewsroomControlCenterData } from '@/lib/admin/newsroomControlCenter';
import formatNumber from '@/lib/utils/formatNumber';

const PANEL_CLASS =
  'rounded-[32px] border border-zinc-200/80 bg-white/92 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)] dark:border-white/10 dark:bg-zinc-950/60';

const SOFT_CARD_CLASS =
  'rounded-[24px] border border-zinc-200/80 bg-zinc-50/78 p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.03]';

const META_CHIP_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300';

export default async function NewsroomSettingsPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/settings/newsroom');
  }

  if (!canViewPage(admin.role, 'newsroom_settings')) {
    redirect('/admin/work?access=denied');
  }

  const control = await getNewsroomControlCenterData();

  return (
    <div className="mx-auto max-w-[1640px] space-y-8">
      <section className="relative overflow-hidden rounded-[36px] border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(245,247,251,0.95)_48%,rgba(243,249,246,0.97)_100%)] p-8 shadow-[0_30px_90px_-52px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(18,18,22,0.98),rgba(15,19,33,0.98)_48%,rgba(16,28,22,0.96)_100%)] lg:p-10">
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
            {formatUserRoleLabel(admin.role)}
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
            Newsroom Settings
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 sm:text-[15px]">
            Operational controls for team routing, queue ownership, and newsroom-working rules.
            This page stays separate from system settings so the admin desk can control the newsroom
            without touching platform-level secrets or infrastructure.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className={META_CHIP_CLASS}>Active Users {formatNumber(control.stats.activeUsers)}</span>
            <span className={META_CHIP_CLASS}>Queue {formatNumber(control.stats.queueItems)}</span>
            <span className={META_CHIP_CLASS}>Blocked Editions {formatNumber(control.stats.blockedEditions)}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,1fr]">
        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-600 dark:text-blue-300">
              <Users2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">User Management Boundary</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">What the admin desk owns day to day.</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className={SOFT_CARD_CLASS}>Admins can create and manage `admin`, `reporter`, and `copy_editor` accounts.</div>
            <div className={SOFT_CARD_CLASS}>Only super admin can create, edit, or remove `super_admin` users.</div>
            <div className={SOFT_CARD_CLASS}>Team setup/reset links remain part of the newsroom user-management flow.</div>
          </div>
          <div className="mt-6">
            <Link href="/admin/team" className={META_CHIP_CLASS}>Open Team</Link>
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-600 dark:text-violet-300">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Desk Workflow Rules</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Default ownership model for the newsroom desk.</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className={SOFT_CARD_CLASS}>Reporter drafts and submissions feed into the content queue first.</div>
            <div className={SOFT_CARD_CLASS}>Admin owns assignment, approval, scheduling, publishing, and final release decisions.</div>
            <div className={SOFT_CARD_CLASS}>Copy editor owns editing, fact checking, headline work, and image optimization before approval.</div>
          </div>
        </section>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,1fr]">
        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-600 dark:text-red-300">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Alert Policy</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Push-alert control stays with the admin desk.</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className={SOFT_CARD_CLASS}>Use push alerts for high-signal published stories and breaking newsroom moments.</div>
            <div className={SOFT_CARD_CLASS}>Draft clean headline-first alert copy and route it through the final external notification channel.</div>
            <div className={SOFT_CARD_CLASS}>Keep non-critical stories on-site unless they materially help audience or desk objectives.</div>
          </div>
          <div className="mt-6">
            <Link href="/admin/push-alerts" className={META_CHIP_CLASS}>Open Push Alerts</Link>
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-300">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Operational Signals</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Live newsroom signals that should influence desk settings.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className={SOFT_CARD_CLASS}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Ready For Admin</p>
              <p className="mt-2 text-3xl font-black text-zinc-950 dark:text-zinc-50">{formatNumber(control.stats.readyForAdmin)}</p>
            </div>
            <div className={SOFT_CARD_CLASS}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Inbox New</p>
              <p className="mt-2 text-3xl font-black text-zinc-950 dark:text-zinc-50">{formatNumber(control.stats.inboxNew)}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/assignments" className={META_CHIP_CLASS}>Assignments</Link>
            <Link href="/admin/content-queue" className={META_CHIP_CLASS}>Content Queue</Link>
          </div>
        </section>
      </section>
    </div>
  );
}
