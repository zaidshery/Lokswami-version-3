import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileSearch, Type, UserRound, Layers, ExternalLink } from 'lucide-react';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUserRoleLabel, isCopyEditorRole } from '@/lib/auth/roles';
import { getNewsroomControlCenterData } from '@/lib/admin/newsroomControlCenter';
import { formatUiDate } from '@/lib/utils/dateFormat';
import formatNumber from '@/lib/utils/formatNumber';
import DeskWorkflowActions from '@/app/(admin)/admin/DeskWorkflowActions';
import StoryAssetDownloadActions from '@/app/(admin)/admin/copy-desk/StoryAssetDownloadActions';
import { CmsWorkflowPriorityBadge, CmsWorkflowStatusBadge } from '@/components/admin/CmsWorkflowStatusBadge';
import {
  CmsCollectionHero,
  CmsCollectionPage,
  CMS_COLLECTION_META_CHIP_CLASS as META_CHIP_CLASS,
  CMS_COLLECTION_PANEL_CLASS as PANEL_CLASS,
  CMS_COLLECTION_SOFT_CARD_CLASS as SOFT_CARD_CLASS,
} from '@/components/admin/CmsCollectionLayout';

/**
 * Route Classification: SPECIALIZED (Phase 3.7D)
 * Accessible by: super_admin, admin, copy_editor. Denied to: reporter.
 * Purpose: Dedicated workspace for copy editing, headline approval, fact checking, and asset inspection.
 * Handoffs:
 * - Reporters submit items -> Appear in Copy Desk / Review Queue.
 * - Copy editors claim / edit / verify headline / facts / image.
 * - Copy editors return for changes (back to reporter) or mark ready for approval (forward to admin).
 */

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function hasReporterSummary(item: Awaited<ReturnType<typeof getNewsroomControlCenterData>>['copyDesk'][number]) {
  return Boolean(
    item.reporterSummary &&
      (
        item.reporterSummary.locationTag ||
        item.reporterSummary.sourceInfo ||
        item.reporterSummary.sourceConfidential ||
        item.reporterSummary.reporterNotes
      )
  );
}

function matchesCurrentUser(
  item: Awaited<ReturnType<typeof getNewsroomControlCenterData>>['copyDesk'][number],
  admin: Awaited<ReturnType<typeof getAdminSession>>
) {
  if (!admin) return false;
  const userId = String(admin.id || '').trim().toLowerCase();
  const userEmail = String(admin.email || '').trim().toLowerCase();
  const assignedId = String(item.assignedToId || '').trim().toLowerCase();
  const assignedEmail = String(item.assignedToEmail || '').trim().toLowerCase();

  return Boolean(
    (userId && assignedId && userId === assignedId) ||
      (userEmail && assignedEmail && userEmail === assignedEmail)
  );
}

export default async function CopyDeskPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/copy-desk');
  }

  if (!canViewPage(admin.role, 'copy_desk')) {
    redirect('/admin/work?access=denied');
  }

  const control = await getNewsroomControlCenterData();
  const showReviewQueueLink = canViewPage(admin.role, 'work_queue');
  const showContentQueueLink = canViewPage(admin.role, 'content_queue');
  const showMyWorkLink = canViewPage(admin.role, 'my_work');

  const resolvedParams = searchParams ? await searchParams : {};
  const activeTab = typeof resolvedParams.tab === 'string' ? resolvedParams.tab : 'all';
  const activeType = typeof resolvedParams.type === 'string' ? resolvedParams.type : 'all';

  const countMine = control.copyDesk.filter((i) => matchesCurrentUser(i, admin)).length;
  const countReady = control.copyDesk.filter((i) => i.status === 'copy_edit' || i.status === 'in_review').length;
  const countChanges = control.copyDesk.filter((i) => i.status === 'changes_requested').length;
  const countApproval = control.copyDesk.filter((i) => i.status === 'ready_for_approval').length;

  const filteredItems = control.copyDesk.filter((item) => {
    if (activeType === 'article' && item.contentType !== 'article') return false;
    if (activeType === 'story' && item.contentType !== 'story') return false;

    if (activeTab === 'mine') return matchesCurrentUser(item, admin);
    if (activeTab === 'ready_for_review') return item.status === 'copy_edit' || item.status === 'in_review';
    if (activeTab === 'needs_changes') return item.status === 'changes_requested';
    if (activeTab === 'ready_for_approval') return item.status === 'ready_for_approval';
    return true;
  });

  return (
    <CmsCollectionPage>
      <CmsCollectionHero
        accent="blue"
        eyebrow={formatUserRoleLabel(admin.role)}
        title="Copy Desk"
        description="Pick up submitted stories, inspect reporter assets, complete copy checks, and return publication-ready work to approval."
        meta={
          <>
            <span className={META_CHIP_CLASS}>Copy Queue {formatNumber(control.copyDesk.length)}</span>
            <span className={META_CHIP_CLASS}>Assigned {formatNumber(control.stats.assignedItems)}</span>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <section className={PANEL_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Copy Desk Queue</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Submitted content and active review work available to your desk.
              </p>
            </div>
            {/* Content Type Filter */}
            <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1 text-xs dark:border-white/10 dark:bg-white/[0.04]">
              <Link
                href={`/admin/copy-desk?tab=${activeTab}&type=all`}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                  activeType === 'all'
                    ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/20 dark:text-white'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                All
              </Link>
              <Link
                href={`/admin/copy-desk?tab=${activeTab}&type=article`}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                  activeType === 'article'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                Articles
              </Link>
              <Link
                href={`/admin/copy-desk?tab=${activeTab}&type=story`}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                  activeType === 'story'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                Stories
              </Link>
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="mt-4 flex flex-wrap gap-2 border-b border-zinc-200/80 pb-3 dark:border-white/10">
            <Link
              href={`/admin/copy-desk?tab=all&type=${activeType}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]'
              }`}
            >
              All ({control.copyDesk.length})
            </Link>
            <Link
              href={`/admin/copy-desk?tab=mine&type=${activeType}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'mine'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]'
              }`}
            >
              Assigned to Me ({countMine})
            </Link>
            <Link
              href={`/admin/copy-desk?tab=ready_for_review&type=${activeType}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'ready_for_review'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]'
              }`}
            >
              Ready for Copy Edit ({countReady})
            </Link>
            <Link
              href={`/admin/copy-desk?tab=needs_changes&type=${activeType}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'needs_changes'
                  ? 'bg-amber-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]'
              }`}
            >
              Needs Changes ({countChanges})
            </Link>
            <Link
              href={`/admin/copy-desk?tab=ready_for_approval&type=${activeType}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'ready_for_approval'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]'
              }`}
            >
              Ready for Approval ({countApproval})
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {filteredItems.length ? (
              filteredItems.map((item) => (
                <div
                  key={`${item.contentType}-${item.id}`}
                  className={`${SOFT_CARD_CLASS} transition-colors hover:border-zinc-300/80 dark:hover:border-white/20`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.contentType === 'story' ? (
                          <span className="rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300">
                            Story
                          </span>
                        ) : (
                          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                            Article
                          </span>
                        )}
                        {item.priority ? (
                          <CmsWorkflowPriorityBadge priority={item.priority} />
                        ) : null}
                        <CmsWorkflowStatusBadge status={item.status} />
                      </div>
                      <Link
                        href={item.editHref}
                        className="text-sm font-semibold text-zinc-900 transition-colors hover:text-red-600 dark:text-zinc-100 dark:hover:text-red-300"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.category} / {item.author}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3 text-zinc-400" />
                        {item.assignedToName ? `Assigned: ${item.assignedToName}` : 'Unassigned'}
                      </span>
                      <span>Updated {formatUiDate(item.updatedAt, item.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{item.queueLabel}</span>
                    {item.dueAt ? <span>Due: {formatUiDate(item.dueAt, item.dueAt)}</span> : null}
                  </div>
                  <div className="mt-4 space-y-3">
                    {hasReporterSummary(item) ? (
                      <div className="flex flex-wrap gap-2">
                        {item.reporterSummary?.locationTag ? (
                          <span className={META_CHIP_CLASS}>Location: {item.reporterSummary.locationTag}</span>
                        ) : null}
                        {item.reporterSummary?.sourceInfo ? (
                          <span className={META_CHIP_CLASS}>Source info ready</span>
                        ) : null}
                        {item.reporterSummary?.sourceConfidential ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                            Confidential source
                          </span>
                        ) : null}
                        {item.reporterSummary?.reporterNotes ? (
                          <span className={META_CHIP_CLASS}>Reporter notes attached</span>
                        ) : null}
                      </div>
                    ) : null}
                    {item.contentType === 'story' && item.assetSummary ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={META_CHIP_CLASS}>Images {item.assetSummary.images}</span>
                        <span className={META_CHIP_CLASS}>Videos {item.assetSummary.videos}</span>
                        <span className={META_CHIP_CLASS}>
                          Storage {item.assetSummary.storageProvider || 'Uploaded package'}
                        </span>
                        <StoryAssetDownloadActions
                          storyId={item.id}
                          hasThumbnail={item.assetSummary.hasThumbnail}
                          hasVideo={item.assetSummary.hasVideo}
                          className={META_CHIP_CLASS}
                        />
                      </div>
                    ) : null}
                    {item.copyEditorSummary ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className={SOFT_CARD_CLASS}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Proofread</p>
                          <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {item.copyEditorSummary.proofreadComplete ? 'Completed' : 'Pending'}
                          </p>
                        </div>
                        <div className={SOFT_CARD_CLASS}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Fact Check</p>
                          <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatStatusLabel(item.copyEditorSummary.factCheckStatus)}
                          </p>
                        </div>
                        <div className={SOFT_CARD_CLASS}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Headline</p>
                          <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatStatusLabel(item.copyEditorSummary.headlineStatus)}
                          </p>
                        </div>
                        <div className={SOFT_CARD_CLASS}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Image</p>
                          <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatStatusLabel(item.copyEditorSummary.imageOptimizationStatus)}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {item.copyEditorSummary?.copyEditorNotes ? (
                      <div className="rounded-[22px] border border-zinc-200/80 bg-white/80 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                        Copy notes: {item.copyEditorSummary.copyEditorNotes}
                      </div>
                    ) : null}
                    {item.copyEditorSummary?.returnForChangesReason ? (
                      <div className="rounded-[22px] border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                        Return reason: {item.copyEditorSummary.returnForChangesReason}
                      </div>
                    ) : null}
                  </div>
                  <DeskWorkflowActions
                    role={admin.role}
                    contentType={item.contentType}
                    contentId={item.id}
                    version={item.version}
                    status={item.status}
                    editHref={item.editHref}
                    hasAssignment={Boolean(item.assignedToId || item.assignedToEmail || item.assignedToName)}
                    isAssignedToCurrentUser={matchesCurrentUser(item, admin)}
                    assignedToName={item.assignedToName}
                  />
                </div>
              ))
            ) : (
              <div className={`${SOFT_CARD_CLASS} text-center py-8 text-zinc-500 dark:text-zinc-400`}>
                <p className="font-semibold text-zinc-700 dark:text-zinc-200">No items found</p>
                <p className="mt-1 text-xs">
                  {activeTab === 'mine'
                    ? 'No items currently assigned to you.'
                    : activeTab === 'needs_changes'
                      ? 'No items currently waiting on reporter changes.'
                      : activeTab === 'ready_for_approval'
                        ? 'No items currently marked ready for approval.'
                        : 'No editorial items are waiting in this queue.'}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className={PANEL_CLASS}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-600 dark:text-violet-300">
                <FileSearch className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Quality Checklist</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Core responsibilities for the copy desk.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className={SOFT_CARD_CLASS}>Proofread the story body and ensure names, numbers, and references are consistent.</div>
              <div className={SOFT_CARD_CLASS}>Run fact-check notes and return `changes requested` where reporting needs another pass.</div>
              <div className={SOFT_CARD_CLASS}>Rewrite the headline if clarity, urgency, or readability is weak.</div>
              <div className={SOFT_CARD_CLASS}>Confirm image quality and optimization before content returns to admin approval.</div>
            </div>
          </div>

          <div className={PANEL_CLASS}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-300">
                <Type className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Newsroom Handoffs</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">How editorial work moves through desks.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className={SOFT_CARD_CLASS}>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">Return for Changes:</span> Sends the item back to the reporter with clear revision notes.
              </div>
              <div className={SOFT_CARD_CLASS}>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">Ready for Approval:</span> Advances polished content to the Content Queue for admin scheduling and release.
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-zinc-200/80 dark:border-white/10">
              {showReviewQueueLink ? (
                <Link href="/admin/work?view=review" className={META_CHIP_CLASS}>
                  Work Workbench (Review)
                </Link>
              ) : null}
              {showContentQueueLink ? (
                <Link href="/admin/content-queue" className={META_CHIP_CLASS}>
                  Content Queue (Publishing)
                </Link>
              ) : null}
              {showMyWorkLink ? (
                <Link href="/admin/my-work" className={META_CHIP_CLASS}>
                  My Work
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </section>
    </CmsCollectionPage>
  );
}
