'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, UserRoundCheck } from 'lucide-react';
import type { AdminRole } from '@/lib/auth/roles';
import type { WorkQueueItem } from '@/lib/admin/workQueue';

export type AssignmentCandidate = {
  id: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  activeWorkload: number;
  overdueWorkload: number;
};

export type AssignmentChange = {
  contentType: WorkQueueItem['contentType'];
  id: string;
  assignedToId: string;
  assignedToName: string;
  version?: number;
};

function roleLabel(role: AdminRole) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'copy_editor') return 'Copy Editor';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function workloadLabel(member: AssignmentCandidate) {
  return `${member.activeWorkload} active · ${member.overdueWorkload} overdue`;
}

export default function AssignmentTriageControl({
  item,
  onAssigned,
}: {
  item: WorkQueueItem;
  onAssigned: (change: AssignmentChange) => void;
}) {
  const [members, setMembers] = useState<AssignmentCandidate[]>([]);
  const [assignedToId, setAssignedToId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const selectedMember = useMemo(
    () => members.find((member) => member.id === assignedToId) || null,
    [assignedToId, members]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setMembers([]);
    setAssignedToId('');
    setFeedback(null);

    void fetch(
      `/api/admin/work-queue/assignee-suggestions?contentTypes=${encodeURIComponent(item.contentType)}`,
      { cache: 'no-store', signal: controller.signal }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: AssignmentCandidate[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || 'Unable to load eligible staff.');
        setMembers((payload.data || []).filter((member) => member.isActive));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load eligible staff.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [item.contentType, item.id]);

  async function assign() {
    if (!selectedMember || selectedMember.id === item.assignedToId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/work-queue/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: item.contentType,
          id: item.id,
          action: 'assign',
          expectedVersion: item.version,
          assignedToId: selectedMember.id,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { version?: unknown };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Assignment update failed.');
      const previousAssignedToId = item.assignedToId;
      const assignmentChanged = previousAssignedToId !== selectedMember.id;
      setMembers((current) =>
        current.map((member) => {
          let activeDelta = 0;
          let overdueDelta = 0;
          if (assignmentChanged && member.id === previousAssignedToId) {
            activeDelta -= 1;
            if (item.isOverdue) overdueDelta -= 1;
          }
          if (assignmentChanged && member.id === selectedMember.id) {
            activeDelta += 1;
            if (item.isOverdue) overdueDelta += 1;
          }
          return activeDelta || overdueDelta
            ? {
                ...member,
                activeWorkload: Math.max(0, member.activeWorkload + activeDelta),
                overdueWorkload: Math.max(0, member.overdueWorkload + overdueDelta),
              }
            : member;
        })
      );
      const responseVersion = payload.data?.version;
      onAssigned({
        contentType: item.contentType,
        id: item.id,
        assignedToId: selectedMember.id,
        assignedToName: selectedMember.name,
        version:
          typeof responseVersion === 'number'
            ? responseVersion
            : typeof item.version === 'number'
              ? item.version + 1
              : undefined,
      });
      setFeedback({
        tone: 'success',
        message: `${item.title} is now assigned to ${selectedMember.name}.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Assignment update failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-shell-surface-muted mt-6 rounded-2xl p-4" aria-labelledby="assignment-triage-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="assignment-triage-title" className="text-sm font-black text-[color:var(--admin-shell-text)]">
            Assignment triage
          </h3>
          <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
            Current owner: <span className="font-bold text-[color:var(--admin-shell-text)]">{item.assignedToName || 'Unassigned'}</span>
          </p>
        </div>
        {item.isOverdue ? (
          <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-600">
            Item overdue
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-[color:var(--admin-shell-text-muted)]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading eligible staff and current workload…
        </p>
      ) : loadError ? (
        <p className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200" role="alert">
          {loadError}
        </p>
      ) : members.length ? (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]" htmlFor={`assignee-${item.contentType}-${item.id}`}>
            Eligible staff
          </label>
          <select
            id={`assignee-${item.contentType}-${item.id}`}
            value={assignedToId}
            onChange={(event) => {
              setAssignedToId(event.target.value);
              setFeedback(null);
            }}
            className="h-11 w-full rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell)] px-3 text-sm text-[color:var(--admin-shell-text)] outline-none focus-visible:border-rose-500 focus-visible:ring-2 focus-visible:ring-rose-500/30"
          >
            <option value="">Choose an active team member</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} · {roleLabel(member.role)} · {workloadLabel(member)}
              </option>
            ))}
          </select>

          {selectedMember ? (
            <div className="rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell)] p-3 text-sm">
              <p className="font-bold text-[color:var(--admin-shell-text)]">{selectedMember.name}</p>
              <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                {roleLabel(selectedMember.role)} · {selectedMember.activeWorkload} active assigned item{selectedMember.activeWorkload === 1 ? '' : 's'} · {selectedMember.overdueWorkload} overdue
              </p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!selectedMember || selectedMember.id === item.assignedToId || busy}
            onClick={() => void assign()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}
            {busy ? 'Updating owner…' : item.isUnassigned ? 'Assign owner' : 'Reassign owner'}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell)] p-3 text-sm text-[color:var(--admin-shell-text-muted)]">
          No active eligible staff are available.
        </p>
      )}

      {feedback ? (
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
            feedback.tone === 'success'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-200'
          }`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          <span>{feedback.message}</span>
        </div>
      ) : null}
    </section>
  );
}
