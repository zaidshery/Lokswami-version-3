'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Clock3, Flame, Radio } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import type { Article } from '@/lib/mock/data';
import { fetchMergedLiveArticles } from '@/lib/content/liveArticles';
import HeroCard from '@/components/ui/HeroCard';
import NewsCard from '@/components/ui/NewsCard';

type SortMode = 'latest' | 'trending';

const COPY = {
  en: {
    tag: 'Digital Desk',
    title: 'Digital Newsroom',
    subtitle:
      'A dedicated command center for live headlines, editorial picks, and fast category tracking.',
    totalLabel: 'Stories',
    liveLabel: 'Live Alerts',
    trendLabel: 'Trending',
    latest: 'Latest',
    trending: 'Trending',
    all: 'All',
    leadTitle: 'Lead Story',
    liveDeskTitle: 'Live Desk',
    streamTitle: 'Newsroom Stream',
    streamSubtitle: 'Fast updates from the digital desk.',
    popularNow: 'Popular In Desk',
    quickLinksTitle: 'Quick Access',
    epaperLink: 'Open E-Paper',
    videoLink: 'Watch Videos',
    contactLink: 'Contact Desk',
    empty: 'No stories available for this filter.',
  },
  hi: {
    tag: 'डिजिटल डेस्क',
    title: 'डिजिटल न्यूज़रूम',
    subtitle:
      'लाइव हेडलाइंस, एडिटोरियल पिक्स और तेज कैटेगरी ट्रैकिंग के लिए समर्पित डिजिटल डेस्क।',
    totalLabel: 'स्टोरीज़',
    liveLabel: 'लाइव अलर्ट',
    trendLabel: 'ट्रेंडिंग',
    latest: 'ताज़ा',
    trending: 'ट्रेंडिंग',
    all: 'सभी',
    leadTitle: 'लीड स्टोरी',
    liveDeskTitle: 'लाइव डेस्क',
    streamTitle: 'न्यूज़रूम स्ट्रीम',
    streamSubtitle: 'डिजिटल डेस्क से तेज अपडेट्स।',
    popularNow: 'डेस्क पर लोकप्रिय',
    storiesTitle: 'विज़ुअल बुलेटिन',
    storiesSubtitle: 'न्यूज़रूम की विज़ुअल स्टोरीज़ तुरंत देखें।',
    quickLinksTitle: 'क्विक एक्सेस',
    epaperLink: 'E-Paper खोलें',
    videoLink: 'वीडियो देखें',
    contactLink: 'डेस्क से संपर्क',
    empty: 'इस फ़िल्टर में अभी कोई स्टोरी उपलब्ध नहीं है।',
  },
} as const;

function normalizeCategory(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

export default function DigitalNewsroomPage() {
  const { language } = useAppStore();
  const t = COPY[language];
  const [articlesData, setArticlesData] = useState<Article[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const merged = await fetchMergedLiveArticles(120);
      if (active) {
        setArticlesData(merged);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const categoryOptions = useMemo(() => {
    const unique = new Map<string, string>();
    articlesData.forEach((item) => {
      const key = normalizeCategory(item.category);
      if (!unique.has(key)) unique.set(key, item.category);
    });

    return [
      { id: 'all', label: t.all },
      ...Array.from(unique.entries()).map(([id, label]) => ({ id, label })),
    ];
  }, [articlesData, t.all]);

  useEffect(() => {
    const exists = categoryOptions.some((cat) => cat.id === activeCategory);
    if (!exists) setActiveCategory('all');
  }, [activeCategory, categoryOptions]);

  const filteredArticles = useMemo(() => {
    if (activeCategory === 'all') return articlesData;
    return articlesData.filter(
      (article) => normalizeCategory(article.category) === activeCategory
    );
  }, [activeCategory, articlesData]);

  const sortedArticles = useMemo(() => {
    const next = [...filteredArticles];
    next.sort((a, b) => {
      if (sortMode === 'trending') return (b.views || 0) - (a.views || 0);
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    return next;
  }, [filteredArticles, sortMode]);

  const leadArticle = sortedArticles[0];
  const liveDeskArticles = useMemo(() => {
    const livePool = sortedArticles.filter((item) => item.isBreaking);
    return (livePool.length ? livePool : sortedArticles).slice(0, 4);
  }, [sortedArticles]);
  const streamArticles = sortedArticles.slice(1, 9);
  const popularArticles = useMemo(() => {
    const trendingPool = sortedArticles.filter((item) => item.isTrending);
    return (trendingPool.length ? trendingPool : sortedArticles).slice(0, 4);
  }, [sortedArticles]);
  return (
    <div className="space-y-6 pb-3">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-red-50 via-white to-orange-50 p-4 shadow-[var(--shadow-card)] dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900 sm:p-6"
      >
        <div className="pointer-events-none absolute -right-20 -top-16 h-52 w-52 rounded-full bg-red-300/30 blur-3xl dark:bg-red-700/20" />
        <div className="pointer-events-none absolute -bottom-20 left-8 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-600/10" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/90 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-zinc-900/70 dark:text-red-300">
            <Radio className="h-3.5 w-3.5" />
            {t.tag}
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
            {t.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-300 sm:text-base">
            {t.subtitle}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSortMode('latest')}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                sortMode === 'latest'
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Clock3 className="h-4 w-4" />
              {t.latest}
            </button>
            <button
              onClick={() => setSortMode('trending')}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                sortMode === 'trending'
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Flame className="h-4 w-4" />
              {t.trending}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700/70 dark:bg-zinc-900/70">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t.totalLabel}
              </p>
              <p className="mt-1 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {sortedArticles.length}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700/70 dark:bg-zinc-900/70">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t.liveLabel}
              </p>
              <p className="mt-1 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {liveDeskArticles.length}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700/70 dark:bg-zinc-900/70">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t.trendLabel}
              </p>
              <p className="mt-1 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {popularArticles.length}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
        {categoryOptions.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveCategory(item.id)}
            className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeCategory === item.id
                ? 'bg-red-600 text-white'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </section>

      {leadArticle ? (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                {t.leadTitle}
              </h2>
            </div>
            <HeroCard article={leadArticle} variant="editorial" />
          </div>

          <aside className="space-y-3 xl:col-span-4">
            <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.liveDeskTitle}
            </h2>
            {liveDeskArticles.map((article, index) => (
              <NewsCard key={article.id} article={article} variant="horizontal" index={index} />
            ))}
          </aside>
        </section>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {t.empty}
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                {t.streamTitle}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{t.streamSubtitle}</p>
            </div>
          </div>

          {streamArticles.length ? (
            streamArticles.map((article, index) => (
              <NewsCard key={article.id} article={article} variant="horizontal" index={index} />
            ))
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {t.empty}
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:col-span-4">
          <div className="cnp-surface p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-black text-zinc-900 dark:text-zinc-100">
              {t.popularNow}
            </h3>
            <div className="space-y-3">
              {popularArticles.map((article, index) => (
                <NewsCard key={article.id} article={article} variant="compact" index={index} />
              ))}
            </div>
          </div>

          <div className="cnp-surface p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-black text-zinc-900 dark:text-zinc-100">
              {t.quickLinksTitle}
            </h3>
            <div className="space-y-2">
              <Link
                href="/main/epaper"
                className="cnp-motion flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-red-700 dark:hover:text-red-400"
              >
                {t.epaperLink}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/main/videos"
                className="cnp-motion flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-red-700 dark:hover:text-red-400"
              >
                {t.videoLink}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/main/contact"
                className="cnp-motion flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-red-700 dark:hover:text-red-400"
              >
                {t.contactLink}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
