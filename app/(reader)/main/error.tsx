'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store/appStore';

export default function ReaderError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const language = useAppStore((state) => state.language);
  const copy = language === 'hi' ? {
    title: 'समाचार लोड नहीं हो सके',
    description: 'एक अस्थायी समस्या आई है। पुनः प्रयास करें या मुख्य पृष्ठ पर जाएँ।',
    retry: 'पुनः प्रयास करें',
    home: 'मुख्य पृष्ठ पर जाएँ',
  } : {
    title: 'Unable to load news',
    description: 'A temporary problem occurred. Try again or return to the home page.',
    retry: 'Try again',
    home: 'Go to home page',
  };

  return (
    <div role="alert" className="mx-auto flex min-h-[40vh] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{copy.description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
          {copy.retry}
        </button>
        <Link href="/main" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-5 py-2 text-sm font-bold text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-zinc-700 dark:text-white">
          {copy.home}
        </Link>
      </div>
    </div>
  );
}
