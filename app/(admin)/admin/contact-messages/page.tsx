'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  UserRound,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { formatUiDateTime } from '@/lib/utils/dateFormat';
import AdvertisingInquiryInbox from '@/components/admin/AdvertisingInquiryInbox';

type ContactStatus = 'new' | 'in_progress' | 'resolved';

type ContactNote = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

type ContactMessage = {
  _id: string;
  ticketId: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  source: string;
  status: ContactStatus;
  assignee: string;
  notes: ContactNote[];
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  success?: boolean;
  data?: ContactMessage[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  counts?: {
    all: number;
    new: number;
    in_progress: number;
    resolved: number;
  };
  error?: string;
};

const STATUS_OPTIONS: Array<{ value: ContactStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
];

const STATUS_CLASS: Record<ContactStatus, string> = {
  new: 'border-red-300 bg-red-50 text-red-700 dark:border-red-700/40 dark:bg-red-500/10 dark:text-red-300',
  in_progress:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-500/10 dark:text-amber-300',
  resolved:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-500/10 dark:text-emerald-300',
};

function formatDate(value: string) {
  return formatUiDateTime(value, value);
}

function statusLabel(value: ContactStatus) {
  if (value === 'in_progress') return 'In Progress';
  if (value === 'resolved') return 'Resolved';
  return 'New';
}

export default function AdminContactInboxPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [counts, setCounts] = useState({ all: 0, new: 0, in_progress: 0, resolved: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [statusDraft, setStatusDraft] = useState<ContactStatus>('new');
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  const selected = useMemo(
    () => messages.find((row) => row._id === selectedId) || null,
    [messages, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    setStatusDraft(selected.status);
    setAssigneeDraft(selected.assignee || '');
    setNoteDraft('');
  }, [selected]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(searchTerm.trim());
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(
          `/api/admin/contact-messages?page=${page}&limit=20&status=${statusFilter}&q=${encodeURIComponent(
            query
          )}`,
          {
            headers: {
              ...getAuthHeader(),
            },
            cache: 'no-store',
          }
        );

        const data = (await response
          .json()
          .catch(() => ({}))) as ApiResponse;

        if (!active) return;

        if (!response.ok || !data.success) {
          setError(data.error || 'Failed to load contact inbox');
          setMessages([]);
          return;
        }

        const rows = Array.isArray(data.data) ? data.data : [];
        setMessages(rows);
        setCounts(data.counts || { all: 0, new: 0, in_progress: 0, resolved: 0 });
        setTotalPages(Math.max(1, data.pagination?.totalPages || 1));

        if (!rows.length) {
          setSelectedId('');
        } else if (!rows.some((row) => row._id === selectedId)) {
          setSelectedId(rows[0]._id);
        }
      } catch {
        if (!active) return;
        setError('Failed to load contact inbox');
        setMessages([]);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [page, query, selectedId, statusFilter]);

  const saveWorkflowUpdate = async () => {
    if (!selected) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/contact-messages/${selected._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          status: statusDraft,
          assignee: assigneeDraft,
          note: noteDraft,
        }),
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as { success?: boolean; data?: ContactMessage; error?: string };

      if (!response.ok || !data.success || !data.data) {
        setError(data.error || 'Failed to update message workflow');
        return;
      }

      const updated = data.data;
      setMessages((prev) =>
        prev.map((item) => (item._id === updated._id ? updated : item))
      );
      setSuccess('Workflow updated successfully');
      setNoteDraft('');
    } catch {
      setError('Failed to update message workflow');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <AdvertisingInquiryInbox />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Contact Inbox</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Manage incoming contact tickets with assignee, notes, and resolution status.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          <MessageSquare className="h-3.5 w-3.5" />
          {counts.all} total messages
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">New</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{counts.new}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">In Progress</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{counts.in_progress}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Resolved</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{counts.resolved}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Open Tickets</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {counts.new + counts.in_progress}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search ticket/name/email"
                className="w-full rounded-xl border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 outline-none transition focus:border-primary-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as ContactStatus | 'all');
                setPage(1);
              }}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-primary-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 space-y-2 max-h-[66vh] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                No contact messages found for current filter.
              </div>
            ) : (
              messages.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => setSelectedId(item._id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selectedId === item._id
                      ? 'border-primary-400 bg-primary-50 dark:border-primary-700 dark:bg-primary-500/10'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {item.ticketId}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.name}
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">{item.email}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[item.status]}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {item.subject || 'No subject'}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {formatDate(item.createdAt)}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Page {page} of {totalPages}
            </p>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-3">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-700/70 dark:bg-red-900/25 dark:text-red-300">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-900/25 dark:text-emerald-300">
              {success}
            </div>
          ) : null}

          {!selected ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              Select a message to view and update workflow.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {selected.ticketId}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {selected.subject || 'No subject'}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Received {formatDate(selected.createdAt)}
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[selected.status]}`}>
                  {statusLabel(selected.status)}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <a
                  href={`mailto:${selected.email}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:border-primary-400 hover:text-primary-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-primary-300"
                >
                  <Mail className="h-4 w-4" />
                  {selected.email}
                </a>
                <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  <UserRound className="h-4 w-4" />
                  {selected.name}
                </div>
                <a
                  href={selected.phone ? `tel:${selected.phone}` : undefined}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                >
                  <Phone className="h-4 w-4" />
                  {selected.phone || 'No phone'}
                </a>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {selected.message}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Status
                  </label>
                  <select
                    value={statusDraft}
                    onChange={(event) => setStatusDraft(event.target.value as ContactStatus)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-primary-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Assignee
                  </label>
                  <input
                    value={assigneeDraft}
                    onChange={(event) => setAssigneeDraft(event.target.value)}
                    placeholder="e.g. Desk Team 1"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-primary-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Add Internal Note
                </label>
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Write update for team handoff or resolution context"
                  className="min-h-[92px] w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-primary-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveWorkflowUpdate()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save Workflow
              </button>

              <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <Clock3 className="h-4 w-4" />
                  Internal Notes
                </div>
                {selected.notes.length === 0 ? (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    No notes yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selected.notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <p className="text-sm text-zinc-800 dark:text-zinc-200">{note.body}</p>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {note.author} - {formatDate(note.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
