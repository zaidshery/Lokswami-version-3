import Link from 'next/link';
import { Play } from 'lucide-react';
import ReaderImage from '@/components/ui/ReaderImage';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { buildVideoReaderPath } from '@/lib/utils/readerContentPaths';
import type { HomePageShortItem } from '@/lib/content/homeFeed';

export interface HomeShortsSectionProps {
  /** Publication-filtered, Swipe-eligible public previews from the server loader. */
  shorts?: HomePageShortItem[];
  language: 'hi' | 'en';
}

export default function HomeShortsSection({ shorts = [], language }: HomeShortsSectionProps) {
  const seen = new Set<string>();
  const items = shorts.filter((item) => {
    if (!item.id || !item.title || !item.thumbnail || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 3);
  if (!items.length) return null;
  return (
    <section data-testid="home-shorts-section" className="min-w-0 rounded-editorial-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <SectionHeader title={language === 'hi' ? 'लोकस्वामी शॉर्ट्स' : 'Lokswami Shorts'} href="/main/videos" ctaText={language === 'hi' ? 'सभी देखें' : 'View All'} />
      <div data-testid="home-shorts-rail" data-swipe-ignore="true" className="grid min-w-0 grid-flow-col auto-cols-[calc((100%_-_0.75rem)/2)] gap-3 overflow-x-auto overscroll-x-contain snap-x snap-proximity touch-pan-x pb-2 md:grid-flow-row md:grid-cols-3 md:auto-cols-auto md:overflow-visible">
        {items.map((short) => (
          <Link key={short.id} href={buildVideoReaderPath(short.id, short.slug)} data-testid="home-short-card" aria-label={short.title} className="editorial-focus-ring group min-w-0 snap-start rounded-editorial-sm">
            <div className="relative aspect-[9/16] overflow-hidden rounded-editorial-sm bg-zinc-100 dark:bg-zinc-800">
              <ReaderImage src={short.thumbnail} alt={short.title} fill sizes="(min-width: 768px) 33vw, 50vw" className="object-cover" />
              <span aria-hidden="true" className="absolute bottom-3 left-3 rounded-editorial-sm bg-black/75 p-2 text-white"><Play className="h-5 w-5" /></span>
            </div>
            <h3 className="hindi-headline mt-3 break-words text-base font-semibold leading-relaxed text-zinc-900 group-hover:text-brand-600 dark:text-zinc-100 dark:group-hover:text-brand-400">{short.title}</h3>
          </Link>
        ))}
      </div>
    </section>
  );
}
