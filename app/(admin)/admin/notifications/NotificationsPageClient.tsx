'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import type { WorkflowNotificationRecord } from '@/lib/storage/workflowNotifications';
import { useAppStore } from '@/lib/store/appStore';

export default function NotificationsPageClient() {
  const language = useAppStore((state) => state.language) === 'hi' ? 'hi' : 'en';
  const [items, setItems] = useState<WorkflowNotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/notifications?limit=100', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { items?: WorkflowNotificationRecord[] };
      };
      if (!response.ok || payload.success === false) {
        throw new Error(
          payload.error ||
            (language === 'hi'
              ? 'नोटिफिकेशन लोड करने में विफल।'
              : 'Failed to load notifications.')
        );
      }
      setItems(payload.data?.items || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : language === 'hi'
            ? 'नोटिफिकेशन लोड करने में विफल।'
            : 'Failed to load notifications.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function markAllRead() {
    await fetch('/api/admin/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));
  }

  async function markRead(item: WorkflowNotificationRecord) {
    if (item.readAt) return;

    setItems((current) => current.map((entry) =>
      entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry
    ));

    await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [item.id] }),
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-10 sm:px-6">
      <section className="admin-shell-surface-strong rounded-[24px] p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-600">{language === 'hi' ? '\u0935\u0930\u094d\u0915\u092b\u094d\u0932\u094b \u0905\u092a\u0921\u0947\u091f' : 'Workflow updates'}</p><h1 className="mt-2 text-3xl font-black text-[color:var(--admin-shell-text)]">{language === 'hi' ? '\u0928\u094d\u092f\u0942\u091c\u0930\u0942\u092e \u0907\u0928\u092c\u0949\u0915\u094d\u0938' : 'Newsroom Inbox'}</h1><p className="mt-2 text-sm text-[color:var(--admin-shell-text-muted)]">{language === 'hi' ? '\u0905\u0938\u093e\u0907\u0928\u092e\u0947\u0902\u091f, \u092b\u0940\u0921\u092c\u0948\u0915, \u0905\u092a\u094d\u0930\u0942\u0935\u0932 \u0914\u0930 \u092a\u092c\u094d\u0932\u093f\u0936\u093f\u0902\u0917 \u0905\u092a\u0921\u0947\u091f \u090f\u0915 \u091c\u0917\u0939\u0964' : 'Assignments, feedback, approvals, and publishing updates in one place.'}</p></div><button type="button" disabled={loading || items.every((i) => Boolean(i.readAt))} onClick={() => void markAllRead()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--admin-shell-border)] px-4 text-xs font-bold text-[color:var(--admin-shell-text)] disabled:opacity-40"><CheckCheck className="h-4 w-4" />{language === 'hi' ? '\u0938\u092d\u0940 \u092a\u0922\u093c\u093e' : 'Mark all read'}</button></div></section>
      <section className="admin-shell-surface overflow-hidden rounded-[22px]">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-[color:var(--admin-shell-text-muted)]"><Loader2 className="h-5 w-5 animate-spin" />{language === 'hi' ? '\u0907\u0928\u092c\u0949\u0915\u094d\u0938 \u0932\u094b\u0921 \u0939\u094b \u0930\u0939\u093e \u0939\u0948...' : 'Loading inbox...'}</div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-xs font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {language === 'hi' ? '\u092a\u0941\u0928\u0903 \u092a\u094d\u0930\u092f\u093e\u0938 \u0915\u0930\u0947\u0902' : 'Retry'}
            </button>
          </div>
        ) : items.length ? (
          <div className="divide-y divide-[color:var(--admin-shell-border)]">
            {items.map((item) => (
              <Link key={item.id} href={item.href} onClick={() => void markRead(item)} className={`flex gap-4 px-5 py-4 transition-colors hover:bg-[color:var(--admin-shell-surface-muted)] ${item.readAt ? '' : 'bg-blue-500/[0.05]'}`}>
                <div className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.readAt ? 'bg-zinc-500/10 text-zinc-500' : 'bg-blue-500/10 text-blue-600'}`}><Bell className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-black text-[color:var(--admin-shell-text)]">{item.title}</h2>
                    <time className="text-xs text-[color:var(--admin-shell-text-muted)]">{new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">{language === 'hi' && item.messageHi ? item.messageHi : item.message}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center"><Bell className="mx-auto h-10 w-10 text-emerald-500" /><h2 className="mt-4 text-lg font-black text-[color:var(--admin-shell-text)]">{language === 'hi' ? '\u0907\u0928\u092c\u0949\u0915\u094d\u0938 \u0915\u094d\u0932\u093f\u092f\u0930 \u0939\u0948' : 'Inbox clear'}</h2></div>
        )}
      </section>
    </div>
  );
}
