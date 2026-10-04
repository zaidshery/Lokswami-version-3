'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Newspaper } from 'lucide-react';
import type { EPaperArticleRecord } from '@/lib/types/epaper';
import styles from './reader.module.css';

export interface PageStripItem {
  pageNumber: number;
  imagePath?: string;
  articles?: EPaperArticleRecord[];
  storyCount?: number;
}

export interface EPaperPageStripProps {
  pages: PageStripItem[];
  activePage: number;
  onSelectPage: (pageNumber: number) => void;
  isOpen?: boolean;
  className?: string;
  companionPage?: number;
  onReturnToReading?: () => void;
}

/**
 * EPaperPageStrip: Horizontal thumbnail navigation strip for fast page switching.
 * Automatically scrolls to center the active page and displays mapped story badges.
 */
function EPaperPageStripComponent({
  pages = [],
  activePage,
  onSelectPage,
  isOpen = true,
  className = '',
  companionPage,
  onReturnToReading,
}: EPaperPageStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const [failedImages, setFailedImages] = useState<string[]>([]);

  // Auto-scroll to center active page thumbnail
  useEffect(() => {
    if (
      typeof activeThumbnailRef.current?.scrollIntoView === 'function' &&
      scrollContainerRef.current
    ) {
      activeThumbnailRef.current.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activePage, isOpen]);

  if (pages.length === 0) return null;

  return (
    <nav
      aria-label="Page navigation thumbnails"
      id="publication-page-thumbnails"
      hidden={!isOpen}
      className={`${styles.controls} shrink-0 border-t border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 sm:rounded-b-2xl ${className}`}
    >
      {isOpen ? <>
      {onReturnToReading ? <div className={`${styles.stripHeading} flex items-center justify-between px-4 pt-1 text-xs text-zinc-500`}><span>Choose a page</span><button type="button" onClick={onReturnToReading} className="min-h-11 rounded-lg px-2 font-semibold text-red-700 dark:text-red-300 sm:min-h-8">Return to reading</button></div> : null}
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        aria-label="Page thumbnails list"
        className={`${styles.stripList} flex items-center gap-3 overflow-x-auto px-4 py-2.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700`}
      >
        {pages.map((page) => {
          const isActive = page.pageNumber === activePage;
          const inSpread = isActive || page.pageNumber === companionPage;
          const storyCount = page.storyCount ?? (page.articles?.length || 0);

          return (
            <button
              key={page.pageNumber}
              ref={isActive ? activeThumbnailRef : null}
              type="button"
              onClick={() => onSelectPage(page.pageNumber)}
              aria-label={`Jump to page ${page.pageNumber}`}
              aria-current={isActive ? 'page' : undefined}
              aria-pressed={inSpread}
              className={`group relative flex shrink-0 flex-col items-center rounded-lg border-2 transition-colors duration-200 ${
                inSpread
                  ? 'border-red-600 shadow-md shadow-red-600/10'
                  : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              {/* Thumbnail Container */}
              <div className={`${styles.thumbnailImage} relative h-20 w-14 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800 sm:h-24 sm:w-16`}>
                {page.imagePath && !failedImages.includes(page.imagePath) ? (
                  <Image
                    src={page.imagePath}
                    alt={`Page ${page.pageNumber}`}
                    fill
                    sizes="64px"
                    className="object-contain"
                    quality={55}
                    onError={() => setFailedImages((failed) => [...failed, page.imagePath!])}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-500">
                    <Newspaper className="h-6 w-6 opacity-60" />
                  </div>
                )}

                {/* Story count badge */}
                {storyCount > 0 ? (
                  <span className="absolute bottom-1 right-1 rounded bg-zinc-950/80 px-1 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
                    {storyCount}
                  </span>
                ) : null}
              </div>

              {/* Page Number Label */}
              <span
                className={`mt-1 text-[11px] font-semibold ${
                  inSpread
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Page {page.pageNumber}
              </span>
            </button>
          );
        })}
      </div>
      </> : null}
    </nav>
  );
}

export const EPaperPageStrip = memo(EPaperPageStripComponent);
export default EPaperPageStrip;
