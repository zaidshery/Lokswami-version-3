import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileSearch, Type } from 'lucide-react';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { formatUserRoleLabel, isCopyEditorRole } from '@/lib/auth/roles';
import { getNewsroomControlCenterData } from '@/lib/admin/newsroomControlCenter';
import { formatUiDate } from '@/lib/utils/dateFormat';
import formatNumber from '@/lib/utils/formatNumber';
import DeskWorkflowActions from '@/app/(admin)/admin/DeskWorkflowActions';
import StoryAssetDownloadActions from '@/app/(admin)/admin/copy-desk/StoryAssetDownloadActions';
import {
  CmsCollectionHero,
  CmsCollectionPage,
  CMS_COLLECTION_META_CHIP_CLASS as META_CHIP_CLASS,
  CMS_COLLECTION_PANEL_CLASS as PANEL_CLASS,
  CMS_COLLECTION_SOFT_CARD_CLASS as SOFT_CARD_CLASS,
} from '@/components/admin/CmsCollectionLayout';

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

export default async function CopyDeskPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/copy-desk');
  }

  if (!canViewPage(admin.role, 'copy_desk')) {
    redirect('/admin/work?access=denied');
  }

  const control = await getNewsroomControlCenterData();
  const showReviewQueueLink = canViewPage(admin.role, 'review_queue') && !isCopyEditorRole(admin.role);

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
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Copy Desk Queue</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Submitted stories and active review work available to your desk.
          </p>
          <div className="mt-6 space-y-3">
            {control.copyDesk.length ? (
              control.copyDesk.map((item) => (
                <div
                  key={`${item.contentType}-${item.id}`}
                  className={`${SOFT_CARD_CLASS} transition-colors hover:border-zinc-300/80 dark:hover:border-white/20`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={item.editHref}
                        className="text-sm font-semibold text-zinc-900 transition-colors hover:text-red-600 dark:text-zinc-100 dark:hover:text-red-300"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {item.category} / {item.author} / {item.assignedToName || 'Desk'}
                      </p>
                    </div>
                    <span className={META_CHIP_CLASS}>{formatStatusLabel(item.status)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{item.queueLabel}</span>
                    <span>Updated {formatUiDate(item.updatedAt, item.updatedAt)}</span>
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
              <div className={SOFT_CARD_CLASS}>No submitted stories are waiting right now.</div>
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
              <div className={SOFT_CARD_CLASS}>Run fact-check notes and return `changes requested` where the reporting needs another pass.</div>
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
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Return Path</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">How work should leave the copy desk.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className={SOFT_CARD_CLASS}>Return incomplete or weak work to the reporter with clear change notes.</div>
              <div className={SOFT_CARD_CLASS}>Move clean stories back to the admin approval flow for scheduling or publication.</div>
            </div>
            {showReviewQueueLink ? (
              <div className="mt-6">
                <Link href="/admin/review-queue" className={META_CHIP_CLASS}>Back To Review Queue</Link>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </CmsCollectionPage>
  );
}
