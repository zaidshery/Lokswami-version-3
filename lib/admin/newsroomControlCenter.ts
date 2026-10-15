import 'server-only';

import { getAdminDashboardData } from '@/lib/admin/dashboard';
import { getEpaperInsights } from '@/lib/admin/epaperInsights';
import {
  getReviewQueueOverview,
  type WorkflowArticleCard,
} from '@/lib/admin/articleWorkflowOverview';
import { getTeamHealthSummary } from '@/lib/admin/teamHealth';

export type NewsroomQueueItem = WorkflowArticleCard & {
  urgency: 'high' | 'normal';
  queueLabel: string;
};

export type PushAlertCandidate = {
  id: string;
  title: string;
  category: string;
  author: string;
  href: string;
  views: number;
  publishedAt: string;
  suggestedLine: string;
  priority: 'high' | 'normal';
};

export type NewsroomControlCenterData = {
  stats: {
    queueItems: number;
    assignedItems: number;
    unassignedItems: number;
    readyForAdmin: number;
    blockedEditions: number;
    inboxNew: number;
    activeUsers: number;
  };
  contentQueue: NewsroomQueueItem[];
  assignments: NewsroomQueueItem[];
  copyDesk: NewsroomQueueItem[];
  pushAlertCandidates: PushAlertCandidate[];
};

function withQueueMeta(item: WorkflowArticleCard): NewsroomQueueItem {
  const highUrgencyStatuses = new Set([
    'submitted',
    'ready_for_approval',
    'approved',
    'ready_to_publish',
  ]);
  const queueLabel = item.assignedToName
    ? `Assigned to ${item.assignedToName}`
    : item.status === 'submitted'
      ? item.contentType === 'story'
        ? 'Open for copy desk pickup'
        : 'Awaiting admin triage'
      : item.status === 'changes_requested'
        ? 'Returned for reporting changes'
        : item.status === 'ready_for_approval'
          ? 'Waiting for admin approval'
      : item.status === 'copy_edit'
        ? 'With copy desk'
        : 'In newsroom flow';

  return {
    ...item,
    urgency: highUrgencyStatuses.has(item.status) ? 'high' : 'normal',
    queueLabel,
  };
}

function buildPushAlertCandidates(input: {
  recentArticles: Array<{
    id: string;
    title: string;
    category: string;
    author: string;
    publishedAt: string;
    views: number;
  }>;
  popularArticles: Array<{
    id: string;
    title: string;
    category: string;
    author: string;
    publishedAt: string;
    views: number;
  }>;
}) {
  const seen = new Set<string>();
  const ordered = [...input.popularArticles, ...input.recentArticles].filter((article) => {
    if (seen.has(article.id)) {
      return false;
    }

    seen.add(article.id);
    return true;
  });

  return ordered.slice(0, 6).map((article) => ({
    ...article,
    href: `/admin/articles/${encodeURIComponent(article.id)}/edit`,
    suggestedLine:
      article.views > 500
        ? `${article.category}: ${article.title}`
        : `Now in Lokswami: ${article.title}`,
    priority: article.views > 500 ? ('high' as const) : ('normal' as const),
  }));
}

export async function getNewsroomControlCenterData(): Promise<NewsroomControlCenterData> {
  const [dashboard, reviewQueue, epaperInsights, teamHealth] = await Promise.all([
    getAdminDashboardData(),
    getReviewQueueOverview({ maxItems: null }),
    getEpaperInsights({ maxBlockedEditions: 5 }),
    getTeamHealthSummary(),
  ]);

  const queueItems = reviewQueue.items.map(withQueueMeta);
  const assignments = queueItems.filter((item) => item.assignedToName);
  const unassignedItems = queueItems.filter((item) => !item.assignedToName);
  const readyForAdmin = queueItems.filter((item) =>
    ['submitted', 'ready_for_approval', 'approved', 'scheduled'].includes(item.status)
  );
  const copyDesk = queueItems.filter((item) =>
    item.contentType === 'story'
      ? ['submitted', 'assigned', 'in_review', 'copy_edit', 'changes_requested', 'ready_for_approval'].includes(item.status)
      : ['assigned', 'in_review', 'copy_edit', 'changes_requested', 'ready_for_approval'].includes(item.status)
  );

  return {
    stats: {
      queueItems: queueItems.length,
      assignedItems: assignments.length,
      unassignedItems: unassignedItems.length,
      readyForAdmin: readyForAdmin.length,
      blockedEditions: epaperInsights.blockedEditions.length,
      inboxNew: dashboard.inbox.new,
      activeUsers: teamHealth.totals.active,
    },
    contentQueue: queueItems.slice(0, 16),
    assignments: assignments.slice(0, 16),
    copyDesk: copyDesk.slice(0, 16),
    pushAlertCandidates: buildPushAlertCandidates({
      recentArticles: dashboard.recentArticles,
      popularArticles: dashboard.popularArticles,
    }),
  };
}
