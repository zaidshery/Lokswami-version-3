'use client';

import React, { memo, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Newspaper } from 'lucide-react';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

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
}: EPaperPageStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll to center active page thumbnail
  useEffect(() => {
    if (activeThumbnailRef.current && scrollContainerRef.current) {
      activeThumbnailRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activePage, isOpen]);

  if (!isOpen || pages.length === 0) return null;

  return (
    <nav
      aria-label="Page navigation thumbnails"
      className={`border-t border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 sm:rounded-b-2xl ${className}`}
    >
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        aria-label="Page thumbnails list"
        className="flex items-center gap-3 overflow-x-auto px-4 py-2.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700"
      >
        {pages.map((page) => {
          const isActive = page.pageNumber === activePage;
          const storyCount = page.storyCount ?? (page.articles?.length || 0);

          return (
            <button
              key={page.pageNumber}
              ref={isActive ? activeThumbnailRef : null}
              type="button"
              onClick={() => onSelectPage(page.pageNumber)}
              aria-label={`Jump to page ${page.pageNumber}`}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex shrink-0 flex-col items-center rounded-lg border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                isActive
                  ? 'border-orange-500 shadow-md shadow-orange-500/20'
                  : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              {/* Thumbnail Container */}
              <div className="relative h-20 w-14 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800 sm:h-24 sm:w-16">
                {page.imagePath ? (
                  <Image
                    src={page.imagePath}
                    alt={`Page ${page.pageNumber}`}
                    fill
                    sizes="64px"
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                    quality={50}
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
                  isActive
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Page {page.pageNumber}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export const EPaperPageStrip = memo(EPaperPageStripComponent);
export default EPaperPageStrip;
