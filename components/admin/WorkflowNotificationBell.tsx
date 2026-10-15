'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Clock3, X } from 'lucide-react';
import type { WorkflowNotificationRecord } from '@/lib/storage/workflowNotifications';
import { useAppStore } from '@/lib/store/appStore';

type NotificationPayload = { items: WorkflowNotificationRecord[]; unreadCount: number };

function formatRelative(value: string, language: 'en' | 'hi') {
  const time = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return language === 'hi' ? '\u0905\u092d\u0940' : 'Just now';
  if (minutes < 60) return language === 'hi' ? `${minutes} \u092e\u093f\u0928\u091f \u092a\u0939\u0932\u0947` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === 'hi' ? `${hours} \u0918\u0902\u091f\u0947 \u092a\u0939\u0932\u0947` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return language === 'hi' ? `${days} \u0926\u093f\u0928 \u092a\u0939\u0932\u0947` : `${days}d ago`;
}

export default function WorkflowNotificationBell() {
  const language = useAppStore((state) => state.language) === 'hi' ? 'hi' : 'en';
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<NotificationPayload>({ items: [], unreadCount: 0 });
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/notifications?limit=8', { cache: 'no-store' });
      const result = (await response.json()) as { success?: boolean; data?: NotificationPayload };
      if (response.ok && result.success && result.data) setPayload(result.data);
    } catch {
      // The workflow remains usable if notification refresh is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        closePanel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, closePanel]);

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setPayload((current) => ({
        unreadCount: 0,
        items: current.items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function markRead(item: WorkflowNotificationRecord) {
    if (item.readAt) return;

    setPayload((current) => ({
      unreadCount: Math.max(0, current.unreadCount - 1),
      items: current.items.map((entry) =>
        entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry
      ),
    }));

    await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [item.id] }),
    });
  }

  const triggerAriaLabel = payload.unreadCount > 0
    ? (language === 'hi'
        ? `वर्कफ़्लो नोटिफिकेशन, ${payload.unreadCount} अनपढ़े`
        : `Workflow notifications, ${payload.unreadCount} unread`)
    : (language === 'hi'
        ? 'वर्कफ़्लो नोटिफिकेशन'
        : 'Workflow notifications');

  return (
    <div className="relative" ref={panelRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="admin-shell-toolbar-btn relative inline-flex h-10 w-10 items-center justify-center rounded-xl"
        aria-label={triggerAriaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'workflow-notifications-panel' : undefined}
      >
        <Bell className="h-4 w-4" />
        {payload.unreadCount ? <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white" aria-hidden="true">{Math.min(payload.unreadCount, 99)}</span> : null}
      </button>
      {open ? (
        <div
          id="workflow-notifications-panel"
          className="fixed inset-x-3 top-[76px] z-[120] max-h-[calc(100vh-96px)] overflow-hidden rounded-2xl border border-[color:var(--admin-shell-border)] bg-white shadow-2xl dark:bg-zinc-950 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[390px]"
          role="dialog"
          aria-modal="true"
          aria-label={language === 'hi' ? 'नोटिफिकेशन' : 'Notifications'}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--admin-shell-border)] bg-zinc-50/90 px-4 py-3 dark:bg-zinc-900/90">
            <div>
              <p className="text-sm font-black text-[color:var(--admin-shell-text)]">{language === 'hi' ? 'न्यूज़रूम इनबॉक्स' : 'Newsroom Inbox'}</p>
              <p className="text-xs text-[color:var(--admin-shell-text-muted)]">{payload.unreadCount} {language === 'hi' ? 'अनपढ़े' : 'unread'}</p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label={language === 'hi' ? 'नोटिफिकेशन बंद करें' : 'Close notifications'}
              className="rounded-lg p-2 text-[color:var(--admin-shell-text-muted)] hover:bg-[color:var(--admin-shell-surface-muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[520px] divide-y divide-[color:var(--admin-shell-border)] overflow-y-auto">
            {payload.items.length ? payload.items.map((item) => (
              <Link key={item.id} href={item.href} onClick={() => { setOpen(false); void markRead(item); }} className={`block px-4 py-3 transition-colors hover:bg-[color:var(--admin-shell-surface-muted)] ${item.readAt ? '' : 'bg-blue-500/[0.06]'}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-zinc-400/40' : 'bg-blue-500'}`} />
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-bold text-[color:var(--admin-shell-text)]">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--admin-shell-text-muted)]">{language === 'hi' && item.messageHi ? item.messageHi : item.message}</p>
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]"><Clock3 className="h-3 w-3" />{formatRelative(item.createdAt, language)}</p>
                  </div>
                </div>
              </Link>
            )) : <div className="px-5 py-10 text-center text-sm text-[color:var(--admin-shell-text-muted)]">{language === 'hi' ? 'अभी कोई नोटिफिकेशन नहीं है।' : 'No workflow notifications yet.'}</div>}
          </div>
          <div className="flex items-center justify-between border-t border-[color:var(--admin-shell-border)] bg-zinc-50/90 px-4 py-3 dark:bg-zinc-900/90">
            <Link href="/admin/notifications" onClick={() => setOpen(false)} className="text-xs font-bold text-rose-600 hover:underline">{language === 'hi' ? 'सभी देखें' : 'View all'}</Link>
            <button type="button" disabled={!payload.unreadCount || loading} onClick={() => void markAllRead()} className="inline-flex items-center gap-1.5 text-xs font-bold text-[color:var(--admin-shell-text)] disabled:opacity-40"><CheckCheck className="h-4 w-4" />{language === 'hi' ? 'सभी पढ़ा' : 'Mark all read'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
