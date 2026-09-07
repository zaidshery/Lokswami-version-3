'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import type { EPaperPageData } from '@/lib/types/epaper';

export interface EPaperFilmstripProps {
  pages: EPaperPageData[];
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  className?: string;
}

/**
 * EPaperFilmstrip: Bottom/drawer thumbnail rail with smooth horizontal scrolling,
 * active page focus, and rapid page jumping.
 */
export default function EPaperFilmstrip({
  pages = [],
  currentPage,
  onPageSelect,
  isOpen = true,
  onToggleOpen,
  className = '',
}: EPaperFilmstripProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -220, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 220, behavior: 'smooth' });
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Pages strip"
      data-epaper-rail="filmstrip"
      className={`relative z-30 flex w-full items-center border-t border-zinc-800 bg-zinc-950/95 px-3 py-2 text-white shadow-lg backdrop-blur-md ${className}`}
    >
      {/* Scroll Left Button */}
      <button
        type="button"
        onClick={scrollLeft}
        aria-label="Scroll pages left"
        className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800 hover:text-white md:flex"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Thumbnails Row */}
      <div
        ref={scrollRef}
        className="scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 mx-2 flex flex-1 items-center gap-3 overflow-x-auto py-1"
      >
        {pages.map((page) => {
          const isActive = page.pageNumber === currentPage;
          return (
            <button
              key={page.pageNumber}
              type="button"
              onClick={() => onPageSelect(page.pageNumber)}
              aria-label={`Jump to page ${page.pageNumber}`}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex h-20 w-14 shrink-0 flex-col items-center overflow-hidden rounded-md border text-center transition-all ${
                isActive
                  ? 'border-orange-500 ring-2 ring-orange-500/60 shadow-[0_0_10px_rgba(249,115,22,0.4)]'
                  : 'border-zinc-700/80 opacity-70 hover:border-zinc-500 hover:opacity-100'
              }`}
            >
              {page.imagePath ? (
                <div className="relative h-16 w-full bg-zinc-800">
                  <img
                    src={page.imagePath}
                    alt={`Page ${page.pageNumber}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-full items-center justify-center bg-zinc-800 text-[10px] text-zinc-400">
                  P.{page.pageNumber}
                </div>
              )}

              <span
                className={`w-full py-0.5 text-[9px] font-semibold tracking-wide ${
                  isActive ? 'bg-orange-600 text-white' : 'bg-zinc-900 text-zinc-300'
                }`}
              >
                P. {page.pageNumber}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        onClick={scrollRight}
        aria-label="Scroll pages right"
        className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800 hover:text-white md:flex"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </aside>
  );
}
