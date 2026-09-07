'use client';

import Link from 'next/link';
import { Languages, ArrowLeft, Check } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';

/** Renders the reader preferences screen with language switching. */
export default function PreferencesPage() {
  const { language, setLanguage } = useAppStore();

  return (
    <div className="mx-auto w-full max-w-3xl py-4 sm:py-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <div className="flex items-center gap-2">
          <Link
            href="/main/account"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
            aria-label="Back to Account"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            {language === 'hi' ? 'सेटिंग्स और प्राथमिकताएं' : 'Settings & Preferences'}
          </p>
        </div>

        <h1 className="mt-3 text-2xl font-black text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          {language === 'hi' ? 'प्राथमिकताएं' : 'Preferences'}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {language === 'hi'
            ? 'अपनी पसंद के अनुसार ऐप की भाषा और सामग्री का अनुभव कस्टमाइज़ करें।'
            : 'Customize your app display language and reading experience.'}
        </p>

        {/* Language Preference Section */}
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                <Languages className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  भाषा चुनें / Select Language
                </p>
                <p className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {language === 'hi' ? 'ऐप की भाषा बदलें' : 'App Display Language'}
                </p>
              </div>
            </div>

            {/* Segmented Control */}
            <div className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-200/70 p-1.5 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`reader-touch-button reader-focus-ring relative flex min-h-10 min-w-[96px] items-center justify-center gap-1.5 rounded-xl px-5 py-2 text-sm font-bold transition-all ${
                  language === 'hi'
                    ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-900 dark:text-orange-400'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
                aria-pressed={language === 'hi'}
              >
                {language === 'hi' && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                <span>हिन्दी</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`reader-touch-button reader-focus-ring relative flex min-h-10 min-w-[96px] items-center justify-center gap-1.5 rounded-xl px-5 py-2 text-sm font-bold transition-all ${
                  language === 'en'
                    ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-900 dark:text-orange-400'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
                aria-pressed={language === 'en'}
              >
                {language === 'en' && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                <span>English</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/main/account"
            className="inline-flex rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {language === 'hi' ? 'अकाउंट पर वापस' : 'Back to Account'}
          </Link>
          <Link
            href="/main"
            className="inline-flex rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
          >
            {language === 'hi' ? 'होम पेज' : 'Home'}
          </Link>
        </div>
      </div>
    </div>
  );
}
