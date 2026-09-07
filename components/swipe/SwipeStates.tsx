'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

export function SwipeEmptyState() {
  return (
    <section className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 bg-black px-6 text-center text-white">
      <p className="text-lg font-bold">अभी कोई Swipe खबर उपलब्ध नहीं है।</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-12 items-center gap-2 rounded-full bg-red-600 px-5 font-bold"
        >
          <RefreshCw className="h-4 w-4" /> फिर कोशिश करें
        </button>
        <Link
          href="/main/latest"
          className="flex min-h-12 items-center rounded-full border border-white/30 px-5 font-bold"
        >
          ताज़ा खबरें
        </Link>
      </div>
    </section>
  );
}

export function SwipeLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="reader-focus-ring absolute right-4 top-20 z-30 min-h-11 rounded-full bg-red-600 px-4 py-2 text-sm font-bold"
    >
      {message}
    </button>
  );
}
