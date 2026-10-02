import Link from 'next/link';
import { Play } from 'lucide-react';
import ReaderImage from '@/components/ui/ReaderImage';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import type { HomePageShortItem } from '@/lib/content/homeFeed';
import { buildVideoReaderPath } from '@/lib/utils/readerContentPaths';
import { formatUiDate } from '@/lib/utils/dateFormat';

export default function HomeVideosSection({ videos, error = false, language }: {
  videos: HomePageShortItem[]; error?: boolean; language: 'hi' | 'en';
}) {
  const seen = new Set<string>();
  const items = videos.filter((item) => {
    if (!item.id || !item.title || seen.has(item.id)) return false;
    seen.add(item.id); return true;
  }).slice(0, 3);
  if (!items.length && !error) return null;
  return <section data-testid="home-videos-section" className="min-w-0 rounded-editorial-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
    <SectionHeader title={language === 'hi' ? 'वीडियो' : 'Videos'} href="/main/videos" ctaText={language === 'hi' ? 'सभी वीडियो देखें' : 'View All Videos'} />
    {error ? <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">{language === 'hi' ? 'अभी वीडियो लोड नहीं हो सके।' : 'Videos could not be loaded right now.'}</p> : null}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((video) => <article key={video.id} className="min-w-0">
        <Link href={buildVideoReaderPath(video.id)} className="editorial-focus-ring group block rounded-editorial-sm" data-testid="home-video-card">
          <div className="relative aspect-video overflow-hidden rounded-editorial-sm bg-zinc-100 dark:bg-zinc-800">
            <ReaderImage src={video.thumbnail} alt={video.title} fill className="object-cover" sizes="(min-width: 1024px) 33vw, 100vw" />
            <span aria-hidden="true" className="absolute bottom-3 left-3 rounded-editorial-sm bg-black/75 p-2 text-white"><Play className="h-5 w-5" /></span>
            {video.duration > 0 ? <span className="absolute bottom-3 right-3 rounded-editorial-xs bg-black/75 px-2 py-1 text-xs text-white">{Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}</span> : null}
          </div>
          <h3 className="hindi-headline mt-3 break-words text-lg font-semibold leading-relaxed text-zinc-900 group-hover:text-brand-600 dark:text-zinc-100 dark:group-hover:text-brand-400">{video.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            {video.category ? <Badge>{video.category}</Badge> : null}
            {video.publishedAt ? <time dateTime={video.publishedAt}>{formatUiDate(video.publishedAt)}</time> : null}
          </div>
        </Link>
      </article>)}
    </div>
  </section>;
}
