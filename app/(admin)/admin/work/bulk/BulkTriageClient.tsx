'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, UserRoundCheck } from 'lucide-react';
import type { WorkQueueItem } from '@/lib/admin/workQueue';
import type { AssignmentCandidate } from '@/components/admin/AssignmentTriageControl';

type BulkResult = { succeeded: number; failed: number; errors: string[] };
type ItemResult = { contentType: string; id: string; success: boolean; error?: string };

function roleLabel(role: AssignmentCandidate['role']) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'copy_editor') return 'Copy Editor';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function BulkTriageClient({ items }: { items: WorkQueueItem[] }) {
  const router = useRouter();
  const [pendingItems, setPendingItems] = useState(items);
  const [members, setMembers] = useState<AssignmentCandidate[]>([]);
  const [assignedToId, setAssignedToId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueAt, setDueAt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const selectedMember = useMemo(
    () => members.find((member) => member.id === assignedToId) || null,
    [assignedToId, members]
  );

  useEffect(() => {
    const controller = new AbortController();
    const contentTypes = Array.from(new Set(items.map((item) => item.contentType))).join(',');
    setLoadingMembers(true);
    setMembersError('');
    void fetch(
      `/api/admin/work-queue/assignee-suggestions?contentTypes=${encodeURIComponent(contentTypes)}`,
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
        setMembersError(error instanceof Error ? error.message : 'Unable to load eligible staff.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMembers(false);
      });
    return () => controller.abort();
  }, [items]);

  async function submit() {
    if (!selectedMember || !confirmed || !pendingItems.length) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/work-queue/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: pendingItems.map((item) => ({
            contentType: item.contentType,
            id: item.id,
            expectedVersion: item.version,
          })),
          assignedToId: selectedMember.id,
          priority,
          dueAt: dueAt || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { succeeded?: number; failed?: number; results?: ItemResult[] };
        error?: string;
      };
      const itemResults = payload.data?.results || [];
      const succeeded = Number(payload.data?.succeeded || 0);
      const failed = Number(payload.data?.failed ?? (response.ok ? 0 : pendingItems.length));
      const errors = itemResults.map((entry) => entry.error || '').filter(Boolean);
      if (payload.error) errors.unshift(payload.error);
      setResult({ succeeded, failed, errors });
      setConfirmed(false);

      if (itemResults.length) {
        const failedKeys = new Set(
          itemResults
            .filter((entry) => !entry.success)
            .map((entry) => `${entry.contentType}:${entry.id}`)
        );
        setPendingItems((current) =>
          current.filter((item) => failedKeys.has(`${item.contentType}:${item.id}`))
        );
      } else if (response.ok) {
        setPendingItems([]);
      }
      if (succeeded > 0) router.refresh();
    } catch (error) {
      setResult({
        succeeded: 0,
        failed: pendingItems.length,
        errors: [error instanceof Error ? error.message : 'Bulk triage failed.'],
      });
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-10 sm:px-6">
      <Link
        href="/admin/work"
        className="inline-flex items-center gap-2 rounded-lg text-sm font-bold text-[color:var(--admin-shell-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Work Queue
      </Link>

      <section className="admin-shell-surface-strong rounded-[24px] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Safe bulk action</p>
        <h1 className="mt-2 text-3xl font-black text-[color:var(--admin-shell-text)]">Bulk Triage</h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
          Assign ownership, priority, and a useful due time. Publishing decisions remain item-by-item.
        </p>
      </section>

      <section className="admin-shell-surface rounded-[22px] p-5">
        <h2 className="text-lg font-black text-[color:var(--admin-shell-text)]">
          {pendingItems.length} selected item{pendingItems.length === 1 ? '' : 's'}
        </h2>
        {pendingItems.length ? (
          <div className="mt-4 space-y-2">
            {pendingItems.map((item) => (
              <div
                key={`${item.contentType}:${item.id}`}
                className="admin-shell-surface-muted flex flex-col gap-2 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[color:var(--admin-shell-text)]">{item.title}</p>
                  <p className="text-xs uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">
                    {item.publicationType === 'emagazine' ? 'E-Magazine' : item.contentType}
                  </p>
                </div>
                <span className="text-xs text-[color:var(--admin-shell-text-muted)]">
                  Current owner: {item.assignedToName || 'Unassigned'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            Selection cleared. Every successfully updated item has been removed from this batch.
          </div>
        )}
      </section>

      <section className="admin-shell-surface rounded-[22px] p-5">
        {loadingMembers ? (
          <p className="flex items-center gap-2 text-sm text-[color:var(--admin-shell-text-muted)]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading eligible staff and current workload…
          </p>
        ) : membersError ? (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200" role="alert">
            {membersError}
          </p>
        ) : members.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-2 text-xs font-bold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">
                Assign to
                <select
                  value={assignedToId}
                  onChange={(event) => {
                    setAssignedToId(event.target.value);
                    setConfirmed(false);
                    setResult(null);
                  }}
                  className="h-11 w-full rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 text-sm normal-case text-[color:var(--admin-shell-text)] outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  <option value="">Choose an active team member</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {roleLabel(member.role)} · {member.activeWorkload} active · {member.overdueWorkload} overdue
                    </option>
                  ))}
                </select>
                <span className="block text-[11px] font-medium normal-case tracking-normal">
                  Workload counts are context only; staff are listed alphabetically, not ranked.
                </span>
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">
                Priority
                <select
                  value={priority}
                  onChange={(event) => {
                    setPriority(event.target.value);
                    setConfirmed(false);
                  }}
                  className="h-11 w-full rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 text-sm normal-case text-[color:var(--admin-shell-text)] outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">
                Due at
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => {
                    setDueAt(event.target.value);
                    setConfirmed(false);
                  }}
                  className="h-11 w-full rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 text-sm normal-case text-[color:var(--admin-shell-text)] outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                />
              </label>
            </div>

            {selectedMember ? (
              <div className="mt-5 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm text-[color:var(--admin-shell-text)]">
                <p className="font-bold">Target owner: {selectedMember.name}</p>
                <p className="mt-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                  {roleLabel(selectedMember.role)} · {selectedMember.activeWorkload} active assigned item{selectedMember.activeWorkload === 1 ? '' : 's'} · {selectedMember.overdueWorkload} overdue
                </p>
              </div>
            ) : null}

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-[color:var(--admin-shell-border)] p-4 text-sm text-[color:var(--admin-shell-text)]">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!selectedMember || !pendingItems.length || busy}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <span>
                I confirm assigning exactly <strong>{pendingItems.length}</strong> selected item{pendingItems.length === 1 ? '' : 's'} to{' '}
                <strong>{selectedMember?.name || 'the chosen team member'}</strong>.
              </span>
            </label>

            <button
              type="button"
              disabled={!selectedMember || !confirmed || busy || !pendingItems.length}
              onClick={() => void submit()}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white outline-none hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}
              {busy ? 'Applying triage…' : `Apply triage to ${pendingItems.length} item${pendingItems.length === 1 ? '' : 's'}`}
            </button>
          </>
        ) : (
          <p className="rounded-xl border border-[color:var(--admin-shell-border)] p-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            No active eligible staff are available for this batch.
          </p>
        )}

        {result ? (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              result.failed
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
            }`}
            role={result.failed ? 'alert' : 'status'}
            aria-live="polite"
          >
            <p className="flex items-center gap-2 font-bold">
              {result.failed ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {result.succeeded} updated · {result.failed} failed
            </p>
            {result.errors.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {result.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
