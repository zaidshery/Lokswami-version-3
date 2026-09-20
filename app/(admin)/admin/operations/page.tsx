import Link from 'next/link';
import { redirect } from 'next/navigation';
import OperationsCenterTabs from '@/components/admin/OperationsCenterTabs';
import {
  DecisionCenterSection,
  GrowthHighlightsSection,
  OperationalWatchlistSection,
  QualityWatchlistSection,
} from '@/components/admin/NewsroomOperationsSections';
import { getSuperAdminDashboardData } from '@/lib/admin/superAdminDashboard';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUserRoleLabel } from '@/lib/auth/roles';
import formatNumber from '@/lib/utils/formatNumber';
import {
  CmsCollectionHero,
  CmsCollectionPage,
  CMS_COLLECTION_META_CHIP_CLASS as META_CHIP_CLASS,
} from '@/components/admin/CmsCollectionLayout';

const SECTION_LINK_CLASS =
  'admin-shell-toolbar-btn inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-xs sm:tracking-[0.14em]';

export default async function OperationsCenterPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/operations');
  }

  if (!canViewPage(admin.role, 'operations_center')) {
    redirect('/admin/work?access=denied');
  }

  const data = await getSuperAdminDashboardData();
  const metrics = data.metrics;

  const watchlistMetrics = {
    blockedEditions: metrics.blockedEditions || 0,
    qualityAlerts: metrics.qualityAlerts || 0,
    inboxEscalations: metrics.inboxEscalations || data.dashboard.inbox.new,
    queueBacklog:
      metrics.queueBacklog ||
      data.dashboard.workflow.needsReview + metrics.activeEditionCount,
    reportingAlerts: metrics.reportingAlerts || 0,
  };

  return (
    <CmsCollectionPage>
      <CmsCollectionHero
        accent="red"
        eyebrow={formatUserRoleLabel(admin.role)}
        title="Operations Center"
        description="Make release decisions, resolve risks, inspect quality signals, and monitor newsroom growth from one focused workspace."
        aside={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className={SECTION_LINK_CLASS}>
              Back To Dashboard
            </Link>
            <Link href="/admin/analytics" className={SECTION_LINK_CLASS}>
              Open Analytics
            </Link>
          </div>
        }
        meta={
          <>
            <span className={META_CHIP_CLASS}>Ready {formatNumber(metrics.readyDecisions)}</span>
            <span className={META_CHIP_CLASS}>Blocked {formatNumber(metrics.blockedEditions)}</span>
            <span className={META_CHIP_CLASS}>Quality alerts {formatNumber(metrics.qualityAlerts)}</span>
            <span className={META_CHIP_CLASS}>Reporting alerts {formatNumber(metrics.reportingAlerts)}</span>
          </>
        }
      />

      <OperationsCenterTabs
        tabs={[
          {
            id: 'decisions',
            label: 'Decisions',
            description: 'Publishing and blocker calls',
            content: (
              <DecisionCenterSection
                readyDecisionItems={data.readyDecisionItems}
                blockedEditionItems={data.blockedEditionItems}
                alerts={data.leadershipAlerts}
              />
            ),
          },
          {
            id: 'risks',
            label: 'Risks',
            description: 'Alerts and action groups',
            content: (
              <OperationalWatchlistSection
                metrics={watchlistMetrics}
                alerts={data.leadershipAlerts}
                actionGroups={data.actionGroups}
              />
            ),
          },
          {
            id: 'quality',
            label: 'Quality',
            description: 'Edition QA cleanup',
            content: <QualityWatchlistSection items={data.qualityWatchlist} />,
          },
          {
            id: 'growth',
            label: 'Growth',
            description: 'Audience movement',
            content: <GrowthHighlightsSection items={data.growthHighlights} />,
          },
        ]}
      />
    </CmsCollectionPage>
  );
}
