'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, Play, ArrowRight } from 'lucide-react';
import ReaderImage from '@/components/ui/ReaderImage';
import { buildVideoReaderPath } from '@/lib/utils/readerContentPaths';
import type { HomePageShortItem } from '@/lib/content/homeFeed';

const FALLBACK_SHORTS: HomePageShortItem[] = [
  {
    id: 'c2562163-a59a-4c76-a625-fcbbfaf791c7',
    title: 'अब बिल में पारदर्शिता का वादा, स्मार्ट मीटर पर जोर........',
    thumbnail: 'https://i.ytimg.com/vi/6nSlAy5QwXY/oar2.jpg?sqp=-oaymwEoCJUDENAFSFqQAgHyq4qpAxcIARUAAIhC2AEB4gEKCBgQAhgGOAFAAQ==&rs=AOn4CLArUT-RB3alzeLOYbfmZpbkjT_Sjg',
    duration: 54,
    category: 'National',
    publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'v-short-02',
    title: 'इंदौर मेट्रो का नया ट्रायल रन सफल, देखिए आधुनिक कोच की झलक #Shorts',
    thumbnail: 'https://images.unsplash.com/photo-1525088553748-01d6e210e00b?w=600&h=1067&fit=crop',
    duration: 42,
    category: 'Regional',
    publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: 'v-short-03',
    title: 'महाकाल लोक उज्जैन: संध्या आरती का विहंगम दृश्य #Shorts',
    thumbnail: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=600&h=1067&fit=crop',
    duration: 48,
    category: 'State',
    publishedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
];

function ensureMinimumShorts(list: HomePageShortItem[] = [], minCount = 3): HomePageShortItem[] {
  if (list.length >= minCount) return list;
  const seen = new Set(list.map((item) => item.id));
  const merged = [...list];
  for (const fallback of FALLBACK_SHORTS) {
    if (merged.length >= minCount) break;
    if (!seen.has(fallback.id)) {
      merged.push(fallback);
      seen.add(fallback.id);
    }
  }
  return merged;
}

export interface HomeShortsSectionProps {
  shorts?: HomePageShortItem[];
  language: 'hi' | 'en';
}

export default function HomeShortsSection({
  shorts = [],
  language,
}: HomeShortsSectionProps) {
  const [activeShorts, setActiveShorts] = useState<HomePageShortItem[]>(() => {
    return ensureMinimumShorts(shorts);
  });

  // Client-side hydration/fetch if initial shorts are missing or sparse
  useEffect(() => {
    if (shorts.length >= 3) {
      setActiveShorts(shorts);
      return;
    }

    let isMounted = true;
    fetch('/api/shorts/latest?limit=6')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data || !Array.isArray(data.items) || !data.items.length) {
          return;
        }
        const mapped: HomePageShortItem[] = data.items
          .map((item: any) => ({
            id: String(item.id || item._id || '').trim(),
            slug: String(item.slug || '').trim() || undefined,
            title: String(item.title || '').trim(),
            thumbnail: String(item.thumbnail || '').trim(),
            videoUrl: String(item.videoUrl || '').trim() || undefined,
            duration: Math.max(0, Math.floor(Number(item.duration) || 0)),
            category: String(item.category || 'National').trim(),
            publishedAt: String(item.publishedAt || new Date().toISOString()),
          }))
          .filter((item: HomePageShortItem) => Boolean(item.id && item.title));

        if (mapped.length) {
          setActiveShorts(ensureMinimumShorts(mapped));
        }
      })
      .catch(() => {
        // Fallback already in state
      });

    return () => {
      isMounted = false;
    };
  }, [shorts]);

  const displayShorts = activeShorts.length ? activeShorts : FALLBACK_SHORTS;
  // We take the top 3 shorts to fulfill: 2 on mobile, 3 on tablet, 3 on desktop
  const items = displayShorts.slice(0, 3);

  return (
    <section
      className="newsroom-panel rounded-2xl border border-zinc-200/80 bg-white p-3 sm:p-3.5 dark:border-white/10 dark:bg-[#121216] shadow-sm space-y-2.5"
      data-testid="home-shorts-section"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-zinc-100 dark:border-white/5">
        <div className="flex items-center">
          <h2 className="text-sm sm:text-base font-black tracking-tight text-zinc-950 dark:text-white">
            {language === 'hi' ? 'लोकस्वामी शॉर्ट्स' : 'Lokswami Shorts'}
          </h2>
        </div>

        <Link
          href="/main/videos"
          className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 transition group"
        >
          <span>{language === 'hi' ? 'सभी देखें' : 'View All'}</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Responsive Grid:
          - Mobile (< 640px): 2 columns, exactly 2 items visible (3rd item is hidden sm:block)
          - Tablet (640px - 1024px): 3 columns, exactly 3 items visible
          - Desktop (>= 1024px): 3 columns, exactly 3 items visible
      */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {items.map((short, index) => {
          const isThirdItem = index === 2;
          const href = buildVideoReaderPath(short.id, short.slug);

          return (
            <Link
              key={short.id}
              href={href}
              data-testid="home-short-card"
              className={`group relative block w-full aspect-[3/4] overflow-hidden rounded-xl border border-zinc-200/80 bg-black shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-white/10 ${
                isThirdItem ? 'hidden sm:block' : ''
              }`}
              aria-label={short.title}
            >
              {/* Media Thumbnail */}
              <ReaderImage
                src={short.thumbnail}
                alt={short.title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Ambient Dark Gradient for Contrast */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/20" />

              {/* Top Badge: Shorts */}
              <div className="absolute top-2 left-2 pointer-events-none">
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-1.5 py-0.5 text-[8.5px] sm:text-[9px] font-black uppercase text-white shadow-sm backdrop-blur-sm">
                  <Zap className="h-2.5 w-2.5 fill-current" />
                  <span>{language === 'hi' ? 'शॉर्ट्स' : 'Shorts'}</span>
                </span>
              </div>

              {/* Hover Center Play Button */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/40 transform transition duration-200 group-hover:scale-110">
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                </div>
              </div>

              {/* Bottom Title (Clean, uncluttered, no categories, no dates/times, no views) */}
              <div className="absolute bottom-2 inset-x-2 sm:bottom-2.5 sm:inset-x-2.5 pointer-events-none">
                <h3 className="line-clamp-2 text-[11px] sm:text-xs font-bold leading-snug text-white drop-shadow-md group-hover:text-red-300 transition-colors">
                  {short.title}
                </h3>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
