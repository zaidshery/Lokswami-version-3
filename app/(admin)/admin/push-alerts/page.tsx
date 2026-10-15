import { redirect } from 'next/navigation';
import { BellRing } from 'lucide-react';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUserRoleLabel } from '@/lib/auth/roles';
import { getNewsroomControlCenterData } from '@/lib/admin/newsroomControlCenter';
import formatNumber from '@/lib/utils/formatNumber';
import PushAlertDeskClient from './PushAlertDeskClient';
import {
  CmsCollectionHero,
  CmsCollectionPage,
  CMS_COLLECTION_META_CHIP_CLASS as META_CHIP_CLASS,
  CMS_COLLECTION_PANEL_CLASS as PANEL_CLASS,
} from '@/components/admin/CmsCollectionLayout';

export default async function PushAlertsPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/push-alerts');
  }

  if (!canViewPage(admin.role, 'push_alerts')) {
    redirect('/admin/work?access=denied');
  }

  const control = await getNewsroomControlCenterData();

  return (
    <CmsCollectionPage>
      <CmsCollectionHero
        accent="rose"
        eyebrow={formatUserRoleLabel(admin.role)}
        title="Push Alerts"
        description="Turn the strongest published and fast-moving stories into concise, high-confidence alerts ready for final delivery."
        meta={
          <>
            <span className={META_CHIP_CLASS}>Candidates {formatNumber(control.pushAlertCandidates.length)}</span>
            <span className={META_CHIP_CLASS}>Inbox Pressure {formatNumber(control.stats.inboxNew)}</span>
            <span className={META_CHIP_CLASS}>Queue Ready {formatNumber(control.stats.readyForAdmin)}</span>
          </>
        }
      />

      <section className={PANEL_CLASS}>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-red-500/10 p-3 text-red-600 dark:text-red-300">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Alert Desk</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Draft alert language here, then deliver it through your external push-notification channel.
            </p>
          </div>
        </div>
      </section>

      <PushAlertDeskClient candidates={control.pushAlertCandidates} />
    </CmsCollectionPage>
  );
}
