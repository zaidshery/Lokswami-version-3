'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';

export default function ReviewQueueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const language = useAppStore((state) => state.language) === 'hi' ? 'hi' : 'en';

  useEffect(() => {
    console.error('Review Queue error:', error);
  }, [error]);

  const copy = {
    en: {
      eyebrow: 'Review Desk Error',
      title: 'Unable to load review queue',
      description:
        'A temporary issue prevented review queue items from loading. You can try refreshing or go to the general work queue.',
      retry: 'Try again',
      openQueue: 'Open Work Queue',
    },
    hi: {
      eyebrow: 'रिव्यू डेस्क त्रुटि',
      title: 'रिव्यू कतार लोड करने में समस्या हुई',
      description:
        'रिव्यू कतार के आइटम लोड करते समय एक अस्थायी समस्या आई। आप पुनः प्रयास कर सकते हैं या मुख्य वर्क क्यू पर जा सकते हैं।',
      retry: 'पुनः प्रयास करें',
      openQueue: 'वर्क क्यू खोलें',
    },
  }[language];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-4 py-12 text-center sm:px-6"
    >
      <div className="admin-shell-surface flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-400">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>

      <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">
        {copy.eyebrow}
      </p>
      <h1 className="mt-2 text-2xl font-black text-[color:var(--admin-shell-text)] sm:text-3xl">
        {copy.title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
        {copy.description}
      </p>

      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-[color:var(--admin-shell-text-muted)]">
          Ref: {error.digest}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>{copy.retry}</span>
        </button>

        <Link
          href="/admin/work"
          className="admin-shell-surface inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--admin-shell-border)] px-5 text-sm font-black text-[color:var(--admin-shell-text)] transition hover:bg-[color:var(--admin-shell-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <span>{copy.openQueue}</span>
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
