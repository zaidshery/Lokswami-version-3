'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  CornerUpLeft,
  Loader2,
  Send,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import type { AdminRole } from '@/lib/auth/roles';
import type { WorkflowPriority, WorkflowStatus } from '@/lib/workflow/types';
import { useAppStore } from '@/lib/store/appStore';

type SupportedDeskContentType = 'article' | 'story' | 'video' | 'epaper';

type AssignableTeamMember = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
};

type DeskWorkflowActionsProps = {
  role: AdminRole;
  contentType: SupportedDeskContentType;
  contentId: string;
  version?: number;
  status: WorkflowStatus | string;
  editHref: string;
  hasAssignment?: boolean;
  isAssignedToCurrentUser?: boolean;
  assignedToName?: string;
  canFastPublish?: boolean;
};

type WorkflowAction =
  | 'assign'
  | 'start_review'
  | 'move_to_copy_edit'
  | 'request_changes'
  | 'mark_ready_for_approval'
  | 'approve'
  | 'reject'
  | 'schedule'
  | 'publish'
  | 'fast_publish';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getWorkflowEndpoint(contentType: SupportedDeskContentType, contentId: string) {
  switch (contentType) {
    case 'article':
      return `/api/admin/articles/${encodeURIComponent(contentId)}`;
    case 'story':
      return `/api/admin/stories/${encodeURIComponent(contentId)}`;
    case 'video':
      return `/api/admin/videos/${encodeURIComponent(contentId)}`;
    default:
      return null;
  }
}

function formatRoleLabel(role: AdminRole) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

const ACTION_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors';

const SECONDARY_ACTION_CLASS =
  'border-zinc-200/80 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-100 dark:hover:border-white/20 dark:hover:bg-white/[0.08]';

const PRIMARY_ACTION_CLASS =
  'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200';

export default function DeskWorkflowActions({
  role,
  contentType,
  contentId,
  version,
  status,
  editHref,
  hasAssignment,
  isAssignedToCurrentUser,
  assignedToName,
  canFastPublish = false,
}: DeskWorkflowActionsProps) {
  const router = useRouter();
  const language = useAppStore((state) => state.language) === 'hi' ? 'hi' : 'en';
  const [assignPanelOpen, setAssignPanelOpen] = useState(false);
  const [reasonPanelOpen, setReasonPanelOpen] = useState(false);
  const [urgentPanelOpen, setUrgentPanelOpen] = useState(false);
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false);
  const [teamOptions, setTeamOptions] = useState<AssignableTeamMember[]>([]);
  const [teamOptionsLoaded, setTeamOptionsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignTarget, setAssignTarget] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<WorkflowPriority>('normal');
  const [scheduledFor, setScheduledFor] = useState('');
  const [reason, setReason] = useState('');
  const [articleVersion, setArticleVersion] = useState(
    typeof version === 'number' && version > 0 ? version : 1
  );
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null
  );

  const endpoint = getWorkflowEndpoint(contentType, contentId);
  const isWorkflowContent = Boolean(endpoint);
  const isAdminDesk = role === 'admin' || role === 'super_admin';
  const isCopyEditorDesk = role === 'copy_editor';

  const canAssign =
    isAdminDesk &&
    ['submitted', 'assigned', 'in_review', 'copy_edit', 'ready_for_approval'].includes(status);
  const copyEditorOwnsItem = Boolean(isAssignedToCurrentUser);
  const itemHasAssignment = Boolean(hasAssignment || assignedToName);
  const canStartReview =
    isCopyEditorDesk &&
    ((status === 'submitted' && !itemHasAssignment) ||
      (status === 'assigned' && copyEditorOwnsItem));
  const canMoveToCopyEdit = isCopyEditorDesk && copyEditorOwnsItem && status === 'in_review';
  const canRequestChanges =
    (isAdminDesk || isCopyEditorDesk) &&
    (isAdminDesk || copyEditorOwnsItem) &&
    ['assigned', 'in_review', 'copy_edit', 'ready_for_approval'].includes(status);
  const canReadyForApproval =
    isCopyEditorDesk && copyEditorOwnsItem && ['in_review', 'copy_edit'].includes(status);
  const canApprove = isAdminDesk && status === 'ready_for_approval';
  const canReject =
    isAdminDesk &&
    ['submitted', 'assigned', 'in_review', 'copy_edit', 'ready_for_approval'].includes(status);
  const canSchedule = isAdminDesk && status === 'approved';
  const canPublish = isAdminDesk && (status === 'approved' || status === 'scheduled');

  async function loadAssignableMembers() {
    if (!isAdminDesk || teamOptionsLoaded) {
      return;
    }

    try {
      const response = await fetch('/api/admin/team/options', { cache: 'no-store' });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: AssignableTeamMember[];
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load assignable team members.');
      }

      setTeamOptions(payload.data || []);
      setTeamOptionsLoaded(true);
      if (!assignTarget && payload.data?.[0]?.id) {
        setAssignTarget(payload.data[0].id);
      }
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Failed to load assignable team members.',
      });
    }
  }

  async function runAction(action: WorkflowAction, extra: Record<string, unknown> = {}) {
    if (!endpoint) {
      setFeedback({
        kind: 'error',
        text: 'This workflow item still needs to be managed from its detail page.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ...(contentType === 'article' ? { expectedVersion: articleVersion } : {}),
          ...extra,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        data?: { version?: number };
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Failed to ${action.replace(/_/g, ' ')}.`);
      }

      if (
        contentType === 'article' &&
        typeof payload.data?.version === 'number' &&
        payload.data.version > 0
      ) {
        setArticleVersion(payload.data.version);
      }

      if (action === 'assign') {
        setAssignPanelOpen(false);
      }
      if (action === 'request_changes' || action === 'reject') {
        setReason('');
        setReasonPanelOpen(false);
      }
      if (action === 'schedule') {
        setScheduledFor('');
        setSchedulePanelOpen(false);
      }

      setFeedback({
        kind: 'success',
        text: payload.message || 'Workflow updated successfully.',
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Failed to update workflow.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openAssignPanel() {
    setAssignPanelOpen((current) => !current);
    setFeedback(null);
    if (!assignPanelOpen) {
      await loadAssignableMembers();
    }
  }

  function handleAssign() {
    if (!assignTarget) {
      setFeedback({ kind: 'error', text: 'Select a newsroom user before assigning.' });
      return;
    }

    void runAction('assign', {
      assignedToId: assignTarget,
      dueAt: dueAt || undefined,
      priority,
    });
  }

  function handleReasonAction(action: 'request_changes' | 'reject') {
    if (!reason.trim()) {
      setFeedback({
        kind: 'error',
        text:
          action === 'reject'
            ? 'Add a rejection reason before rejecting this item.'
            : 'Add a clear change reason before routing this item back.',
      });
      return;
    }

    void runAction(action, { rejectionReason: reason.trim() });
  }

  function handleSchedule() {
    if (!scheduledFor) {
      setFeedback({
        kind: 'error',
        text: 'Choose a schedule date and time before scheduling this item.',
      });
      return;
    }

    void runAction('schedule', { scheduledFor });
  }

  function handleFastPublish() {
    if (reason.trim().length < 10) {
      setFeedback({ kind: 'error', text: language === 'hi' ? '\u0924\u0924\u094d\u0915\u093e\u0932 \u092a\u094d\u0930\u0915\u093e\u0936\u0928 \u0915\u093e \u0915\u093e\u0930\u0923 \u0915\u092e \u0938\u0947 \u0915\u092e 10 \u0905\u0915\u094d\u0937\u0930\u094b\u0902 \u092e\u0947\u0902 \u0932\u093f\u0916\u0947\u0902\u0964' : 'Add an urgent-publish reason of at least 10 characters.' });
      return;
    }
    void runAction('fast_publish', { comment: reason.trim() });
  }

  return (
    <div className="mt-3 space-y-3 border-t border-zinc-200/80 pt-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={editHref} className={cx(ACTION_BUTTON_CLASS, SECONDARY_ACTION_CLASS)}>
          <ArrowUpRight className="h-4 w-4" />
          Open
        </Link>

        {!isWorkflowContent ? (
          <span className="rounded-full border border-zinc-200/80 bg-white/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
            Detail-only workflow
          </span>
        ) : null}

        {canAssign ? (
          <button
            type="button"
            onClick={() => void openAssignPanel()}
            disabled={isSubmitting}
            className={cx(ACTION_BUTTON_CLASS, SECONDARY_ACTION_CLASS)}
            aria-expanded={assignPanelOpen}
          >
            <UserRoundCheck className="h-4 w-4" />
            {assignedToName ? 'Reassign' : 'Assign'}
          </button>
        ) : null}

        {(canRequestChanges || canReject) && isWorkflowContent ? (
          <button
            type="button"
            onClick={() => setReasonPanelOpen((current) => !current)}
            className={cx(ACTION_BUTTON_CLASS, SECONDARY_ACTION_CLASS)}
            aria-expanded={reasonPanelOpen}
          >
            <CornerUpLeft className="h-4 w-4" />
            Desk Action
          </button>
        ) : null}

        {canStartReview ? (
          <button
            type="button"
            onClick={() => void runAction('start_review')}
            disabled={isSubmitting}
            className={cx(ACTION_BUTTON_CLASS, PRIMARY_ACTION_CLASS)}
          >
            <ClipboardList className="h-4 w-4" />
            {status === 'submitted' ? 'Claim Story' : 'Start Review'}
          </button>
        ) : null}

        {canMoveToCopyEdit ? (
          <button
            type="button"
            onClick={() => void runAction('move_to_copy_edit')}
            disabled={isSubmitting}
            className={cx(ACTION_BUTTON_CLASS, SECONDARY_ACTION_CLASS)}
          >
            <CheckCheck className="h-4 w-4" />
            Move To Copy Edit
          </button>
        ) : null}

        {canReadyForApproval ? (
          <button
            type="button"
            onClick={() => void runAction('mark_ready_for_approval')}
            disabled={isSubmitting}
            className={cx(ACTION_BUTTON_CLASS, PRIMARY_ACTION_CLASS)}
          >
            <Send className="h-4 w-4" />
            Ready For Approval
          </button>
        ) : null}

        {canApprove ? (
          <button
            type="button"
            onClick={() => void runAction('approve')}
            disabled={isSubmitting}
            className={cx(ACTION_BUTTON_CLASS, PRIMARY_ACTION_CLASS)}
          >
            <CheckCheck className="h-4 w-4" />
            Approve
          </button>
        ) : null}

        {canSchedule ? (
          <button
            type="button"
            onClick={() => setSchedulePanelOpen((current) => !current)}
            disabled={isSubmitting}
            className={cx(ACTION_BUTTON_CLASS, SECONDARY_ACTION_CLASS)}
            aria-expanded={schedulePanelOpen}
          >
            <CalendarClock className="h-4 w-4" />
            Schedule
          </button>
        ) : null}

        {canPublish ? (
          <button
            type="button"
            onClick={() => void runAction('publish')}
            disabled={isSubmitting}
            className={cx(ACTION_BUTTON_CLASS, PRIMARY_ACTION_CLASS)}
          >
            <Send className="h-4 w-4" />
            Publish Now
          </button>
        ) : null}

        {canFastPublish ? (
          <button
            type="button"
            onClick={() => setUrgentPanelOpen((current) => !current)}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
            aria-expanded={urgentPanelOpen}
          >
            <Send className="h-4 w-4" />
            {language === 'hi' ? '\u0924\u0924\u094d\u0915\u093e\u0932 \u092a\u094d\u0930\u0915\u093e\u0936\u0928' : 'Urgent Publish'}
          </button>
        ) : null}
      </div>

      {assignPanelOpen && canAssign ? (
        <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/78 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr),minmax(0,0.8fr),minmax(0,0.9fr),auto]">
            <label className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Assign To
              <select
                value={assignTarget}
                onChange={(event) => setAssignTarget(event.target.value)}
                className="h-11 w-full rounded-2xl border border-zinc-200/80 bg-white px-4 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100"
              >
                <option value="">Select newsroom user</option>
                {teamOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({formatRoleLabel(member.role)})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Due At
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="h-11 w-full rounded-2xl border border-zinc-200/80 bg-white px-4 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100"
              />
            </label>
            <label className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Priority
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as WorkflowPriority)}
                className="h-11 w-full rounded-2xl border border-zinc-200/80 bg-white px-4 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleAssign}
              disabled={isSubmitting}
              className={cx(ACTION_BUTTON_CLASS, PRIMARY_ACTION_CLASS, 'h-11 px-4 self-end')}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}
              Save Assignment
            </button>
          </div>
        </div>
      ) : null}

      {reasonPanelOpen && (canRequestChanges || canReject) && isWorkflowContent ? (
        <div className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/78 p-3 shadow-sm sm:rounded-[22px] sm:p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <label className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Desk Reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Write the reason for changes or rejection."
              className="min-h-[80px] w-full rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100 sm:min-h-[96px]"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {canRequestChanges ? (
              <button
                type="button"
                onClick={() => handleReasonAction('request_changes')}
                disabled={isSubmitting}
                className={cx(ACTION_BUTTON_CLASS, SECONDARY_ACTION_CLASS)}
              >
                <CornerUpLeft className="h-4 w-4" />
                Request Changes
              </button>
            ) : null}
            {canReject ? (
              <button
                type="button"
                onClick={() => handleReasonAction('reject')}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-700 transition-colors hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {urgentPanelOpen && canFastPublish ? (
        <div className="rounded-[22px] border border-rose-500/25 bg-rose-500/[0.06] p-4">
          <label className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700 dark:text-rose-200">
            {language === 'hi' ? '\u0911\u0921\u093f\u091f \u0915\u093f\u090f \u0917\u090f \u0905\u092a\u0935\u093e\u0926 \u0915\u093e \u0915\u093e\u0930\u0923' : 'Audited exception reason'}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={language === 'hi' ? '\u0938\u092e\u091d\u093e\u090f\u0902 \u0915\u093f \u092f\u0939 \u0924\u0924\u094d\u0915\u093e\u0932 \u0906\u0907\u091f\u092e \u0938\u093e\u092e\u093e\u0928\u094d\u092f \u0915\u0949\u092a\u0940-\u0930\u093f\u0935\u094d\u092f\u0942 \u092e\u093e\u0930\u094d\u0917 \u0915\u094b \u0915\u094d\u092f\u094b\u0902 \u092c\u093e\u0907\u092a\u093e\u0938 \u0915\u0930\u0947\u0964' : 'Explain why this urgent item must bypass the normal copy-review path.'} className="min-h-[96px] w-full rounded-2xl border border-rose-500/25 bg-white px-4 py-3 text-sm normal-case tracking-normal text-zinc-900 outline-none dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <p className="mt-2 text-xs leading-5 text-rose-700 dark:text-rose-200">{language === 'hi' ? '\u0930\u0947\u0921\u0940\u0928\u0947\u0938 \u092c\u094d\u0932\u0949\u0915\u0930 \u0932\u093e\u0917\u0942 \u0930\u0939\u0947\u0902\u0917\u0947\u0964 \u0915\u093e\u0930\u0923 \u0914\u0930 \u090f\u0915\u094d\u091f\u0930 \u090f\u0915\u094d\u091f\u093f\u0935\u093f\u091f\u0940 \u0939\u093f\u0938\u094d\u091f\u094d\u0930\u0940 \u092e\u0947\u0902 \u0938\u0947\u0935 \u0939\u094b\u0902\u0917\u0947\u0964' : 'Readiness blockers still apply. The reason and actor are stored in the activity history.'}</p>
          <button type="button" onClick={handleFastPublish} disabled={isSubmitting} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-60">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{language === 'hi' ? '\u0924\u0924\u094d\u0915\u093e\u0932 \u092a\u094d\u0930\u0915\u093e\u0936\u0928 \u0915\u0940 \u092a\u0941\u0937\u094d\u091f\u093f \u0915\u0930\u0947\u0902' : 'Confirm urgent publish'}</button>
        </div>
      ) : null}

      {schedulePanelOpen && canSchedule ? (
        <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/78 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
            <label className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Schedule For
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                className="h-11 w-full rounded-2xl border border-zinc-200/80 bg-white px-4 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-300 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100"
              />
            </label>
            <button
              type="button"
              onClick={handleSchedule}
              disabled={isSubmitting}
              className={cx(ACTION_BUTTON_CLASS, PRIMARY_ACTION_CLASS, 'h-11 px-4 self-end')}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Schedule
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'}
          className={cx(
            'rounded-2xl border px-4 py-3 text-sm',
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
          )}
        >
          {feedback.text}
        </div>
      ) : null}

      {isSubmitting ? (
        <div
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating {formatStatusLabel(status)}
        </div>
      ) : null}
    </div>
  );
}
