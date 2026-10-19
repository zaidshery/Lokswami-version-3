'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { ADVERTISING_OWNER, ADVERTISING_STATUSES, type AdvertisingStatus } from '@/lib/advertising/inquiryWorkflow';
import { formatUiDateTime } from '@/lib/utils/dateFormat';

type Inquiry = {
  _id: string; name: string; company: string; email: string; phone: string;
  campaignType: string; budget: string; targetLocations: string; timeline: string; message: string;
  consent: boolean; consentAt: string; status: AdvertisingStatus; assignee: string;
  followUpAt: string; followUpNote: string; createdAt: string; updatedAt: string;
};
const field = 'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';

function InquiryRow({ row, store, onSaved }: { row: Inquiry; store: string; onSaved: (row: Inquiry) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setMessage('');
    try {
      const followUpAt = String(values.get('followUpAt') || '');
      const response = await fetch('/api/admin/advertising-enquiries', {
        method: 'PATCH', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row._id, store, expectedUpdatedAt: row.updatedAt, status: values.get('status'), followUpNote: values.get('followUpNote'), followUpAt: followUpAt ? new Date(followUpAt).toISOString() : '' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save enquiry');
      onSaved(data.data); setMessage('Follow-up saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save enquiry'); }
    finally { setBusy(false); }
  }
  function localDate(value: string) {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
    <summary className="cursor-pointer font-semibold">{row.company} · {row.campaignType} · {row.status.replaceAll('_', ' ')}</summary>
    <div className="mt-3 space-y-2 text-sm">
      <p>{row.name} · {row.email}{row.phone ? ` · ${row.phone}` : ''}</p>
      <p>Received: {formatUiDateTime(row.createdAt, row.createdAt)} · Owner: {row.assignee}</p>
      <p>Target: {row.targetLocations || 'To clarify'} · Budget: {row.budget || 'To clarify'} · Timing: {row.timeline || 'To clarify'}</p>
      <p className="whitespace-pre-wrap break-words">{row.message}</p>
      <p>{row.consent ? `Contact consent recorded ${formatUiDateTime(row.consentAt, row.consentAt)}` : 'Legacy enquiry: contact consent was not recorded. Verify permission before follow-up.'}</p>
      <form onSubmit={save} key={row.updatedAt} className="grid gap-3 pt-3 sm:grid-cols-2">
        <label className="grid gap-1">Status<select name="status" defaultValue={row.status} className={field}>{ADVERTISING_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="grid gap-1">Next follow-up (your local time)<input name="followUpAt" type="datetime-local" defaultValue={localDate(row.followUpAt)} className={field} /></label>
        <label className="grid gap-1 sm:col-span-2">Next action / qualification note<textarea name="followUpNote" maxLength={1000} defaultValue={row.followUpNote} rows={2} className={field} /></label>
        <button disabled={busy} className="justify-self-start rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save follow-up'}</button>
        {message && <p role="status">{message}</p>}
      </form>
    </div>
  </details>;
}

export default function AdvertisingInquiryInbox() {
  const [source, setSource] = useState('mongo');
  const [store, setStore] = useState('mongo');
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/admin/advertising-enquiries?store=${source}&page=${page}`, { headers: getAuthHeader(), cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Could not load enquiries');
        if (controller.signal.aborted) return;
        setRows(result.data); setStore(result.store); setPages(result.totalPages);
      } catch (failure) { if (!controller.signal.aborted) { setRows([]); setError(failure instanceof Error ? failure.message : 'Could not load enquiries'); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [page, source, reload]);

  return <section aria-label="Advertising enquiries" className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
    <h2 className="text-xl font-semibold">Advertising enquiries</h2>
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Owner: {ADVERTISING_OWNER}. Submitted from the public Advertise page. Qualify the business, objective, city, timing and available inventory before making a proposal. Check the recovery file after database incidents; it is a separate source.</p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">Source<select className={field} value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }}><option value="mongo">Database / default store</option><option value="file">Recovery file</option></select></label>
      <button type="button" className={field} onClick={() => setReload((value) => value + 1)}>Refresh enquiries</button>
      {!loading && !error && <span className="text-sm">Viewing {store === 'mongo' ? 'database' : 'recovery file'}</span>}
    </div>
    {loading ? <p role="status">Loading enquiries…</p> : error ? <p role="alert">{error}</p> : rows.length === 0 ? <p>No advertising enquiries in this source.</p> : rows.map((row) => <InquiryRow key={`${store}:${row._id}:${row.updatedAt}`} row={row} store={store} onSaved={(saved) => setRows((current) => current.map((entry) => entry._id === saved._id ? saved : entry))} />)}
    <div className="flex items-center gap-3 text-sm"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className={field}>Previous enquiries</button><span>Page {page} / {pages}</span><button type="button" disabled={loading || page >= pages} onClick={() => setPage((value) => value + 1)} className={field}>Next enquiries</button></div>
  </section>;
}
