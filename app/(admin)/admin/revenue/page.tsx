import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, TrendingUp, Wallet } from 'lucide-react';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUserRoleLabel } from '@/lib/auth/roles';
import { getAdminDashboardData } from '@/lib/admin/dashboard';
import formatNumber from '@/lib/utils/formatNumber';

const PANEL_CLASS =
  'rounded-[32px] border border-zinc-200/80 bg-white/92 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)] dark:border-white/10 dark:bg-zinc-950/60';

const SOFT_CARD_CLASS =
  'rounded-[24px] border border-zinc-200/80 bg-zinc-50/78 p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-white/[0.03]';

const META_CHIP_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300';

export default async function RevenuePage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/revenue');
  }

  if (!canViewPage(admin.role, 'revenue')) {
    redirect('/admin/work?access=denied');
  }

  const dashboard = await getAdminDashboardData();

  return (
    <div className="mx-auto max-w-[1640px] space-y-8">
      <section className="relative overflow-hidden rounded-[36px] border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(245,247,251,0.95)_48%,rgba(250,246,237,0.97)_100%)] p-8 shadow-[0_30px_90px_-52px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(18,18,22,0.98),rgba(15,19,33,0.98)_48%,rgba(33,24,16,0.96)_100%)] lg:p-10">
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
            {formatUserRoleLabel(admin.role)}
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
            Revenue & Ads Control
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 sm:text-[15px]">
            A leadership surface for monetization readiness. This page keeps revenue and ad control
            separate from newsroom operations while the ad-connectors layer comes online.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className={META_CHIP_CLASS}>Articles {formatNumber(dashboard.stats.totalArticles)}</span>
            <span className={META_CHIP_CLASS}>Videos {formatNumber(dashboard.stats.totalVideos)}</span>
            <span className={META_CHIP_CLASS}>New Messages {formatNumber(dashboard.stats.newMessages)}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-300">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Audience Signal</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Current platform output that can support monetization decisions.</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className={SOFT_CARD_CLASS}>Recent content volume is available through analytics and the growth dashboard.</div>
            <div className={SOFT_CARD_CLASS}>Inbox and audience contact activity can help identify commercial interest areas.</div>
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-600 dark:text-amber-300">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Monetization Readiness</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Platform-state notes for future ads and revenue integrations.</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className={SOFT_CARD_CLASS}>No live ad connector is configured yet, so this page is currently a leadership-control surface.</div>
            <div className={SOFT_CARD_CLASS}>Use this route as the future home for ad slots, campaign controls, or partner dashboards.</div>
          </div>
        </section>

        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-600 dark:text-blue-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Connected Views</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Jump to the live signals that support revenue decisions.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/analytics?tab=growth&compare=previous" className={META_CHIP_CLASS}>Growth Analytics</Link>
            <Link href="/admin/analytics?tab=audience&compare=previous" className={META_CHIP_CLASS}>Audience Analytics</Link>
            <Link href="/admin" className={META_CHIP_CLASS}>Leadership Dashboard</Link>
          </div>
        </section>
      </section>
    </div>
  );
}
