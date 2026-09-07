'use client';

import { useState, useRef, useEffect } from 'react';
import {
  BookmarkPlus,
  Grid2X2,
  ListVideo,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  type SortMode,
  type ViewMode,
  getCategoryLabel,
} from './types';

export interface VideoFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  sortMode: SortMode;
  onSortModeChange: (sortMode: SortMode) => void;
  viewMode: ViewMode;
  onViewModeChange: (viewMode: ViewMode) => void;
  categoryOptions: string[];
  language: 'hi' | 'en';
  copy: {
    searchPlaceholder: string;
    latest: string;
    trending: string;
    feed: string;
    shorts: string;
    all: string;
    saved?: string;
  };
  savedCount?: number;
  onOpenWatchLater?: () => void;
}

export default function VideoFilterBar({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  sortMode,
  onSortModeChange,
  viewMode,
  onViewModeChange,
  categoryOptions,
  language,
  copy,
  savedCount = 0,
  onOpenWatchLater,
}: VideoFilterBarProps) {
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Close options popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setIsOptionsExpanded(false);
      }
    }
    if (isOptionsExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOptionsExpanded]);

  return (
    <div className="relative z-30 space-y-3">
      {/* Top Search & Filter Bar */}
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={language === 'hi' ? 'वीडियो खोजें...' : 'Search videos...'}
            className="w-full rounded-full border border-zinc-200 bg-zinc-100 py-2 pl-9 pr-8 text-xs text-zinc-900 outline-none transition-all placeholder:text-zinc-400 hover:bg-zinc-200 focus:border-zinc-300 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40 dark:hover:bg-white/10 dark:focus:border-white/20 dark:focus:bg-zinc-900 sm:text-sm"
            aria-label={copy.searchPlaceholder}
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-white/40" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-white/10"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5 text-zinc-500 dark:text-white/60" />
            </button>
          )}
        </div>

        {/* View Mode Toggle: Feed vs Shorts */}
        <div className="hidden sm:flex gap-1 rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/8 dark:bg-[#0f0f12]">
          <button
            type="button"
            onClick={() => onViewModeChange('feed')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'feed'
                ? 'bg-[#ff6257] text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-950 dark:text-white/70 dark:hover:text-white'
            }`}
          >
            <ListVideo className="h-3.5 w-3.5" />
            {copy.feed}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('shorts')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'shorts'
                ? 'bg-[#ff6257] text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-950 dark:text-white/70 dark:hover:text-white'
            }`}
          >
            <Grid2X2 className="h-3.5 w-3.5" />
            {copy.shorts}
          </button>
        </div>

        {/* Watch Later Drawer Trigger */}
        {onOpenWatchLater && (
          <button
            type="button"
            onClick={onOpenWatchLater}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/15"
            aria-label="Saved videos"
            title="Saved videos"
          >
            <BookmarkPlus className="h-4 w-4" />
            {savedCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold text-white">
                {savedCount > 99 ? '99+' : savedCount}
              </span>
            )}
          </button>
        )}

        {/* Sliders Icon Options Popover Trigger */}
        <div className="relative" ref={optionsRef}>
          <button
            type="button"
            onClick={() => setIsOptionsExpanded((prev) => !prev)}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-95 ${
              isOptionsExpanded
                ? 'border-zinc-400 bg-zinc-200 text-zinc-950 dark:border-white/30 dark:bg-white/20 dark:text-white'
                : 'border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:border-white/10 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/15'
            }`}
            aria-label="Filter and sort options"
            aria-expanded={isOptionsExpanded}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {/* Rounded Glassmorphic Popover Card */}
          {isOptionsExpanded && (
            <div className="absolute right-0 top-11 z-50 w-72 sm:w-80 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
              <div className="space-y-4">
                {/* Mobile View Mode Switcher */}
                <div className="space-y-1.5 sm:hidden">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {language === 'hi' ? 'देखने का तरीका' : 'View Mode'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onViewModeChange('feed');
                        setIsOptionsExpanded(false);
                      }}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        viewMode === 'feed'
                          ? 'bg-red-600 text-white shadow-md'
                          : 'bg-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      {copy.feed}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onViewModeChange('shorts');
                        setIsOptionsExpanded(false);
                      }}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        viewMode === 'shorts'
                          ? 'bg-red-600 text-white shadow-md'
                          : 'bg-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      {copy.shorts}
                    </button>
                  </div>
                </div>

                {/* Sort Mode Selection */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {language === 'hi' ? 'क्रमबद्ध करें' : 'Sort Mode'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSortModeChange('latest');
                        setIsOptionsExpanded(false);
                      }}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        sortMode === 'latest'
                          ? 'bg-white text-zinc-950 font-bold shadow-md'
                          : 'bg-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      {copy.latest}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSortModeChange('trending');
                        setIsOptionsExpanded(false);
                      }}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        sortMode === 'trending'
                          ? 'bg-white text-zinc-950 font-bold shadow-md'
                          : 'bg-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      {copy.trending}
                    </button>
                  </div>
                </div>

                {/* Categories */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {language === 'hi' ? 'श्रेणियाँ' : 'Categories'}
                  </p>
                  <div className="scrollbar-hide flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {categoryOptions.map((category) => {
                      const isActive = activeCategory === category;
                      const label =
                        category === 'all' ? copy.all : getCategoryLabel(category, language);

                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => {
                            onCategoryChange(category);
                            setIsOptionsExpanded(false);
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            isActive
                              ? 'bg-red-600 text-white shadow'
                              : 'bg-white/10 text-white/80 hover:bg-white/15'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Category Pill Strip */}
      <div className="scrollbar-hide flex items-center gap-1.5 overflow-x-auto pb-1" data-reader-scroll="x">
        {categoryOptions.map((category) => {
          const isActive = activeCategory === category;
          const label = category === 'all' ? copy.all : getCategoryLabel(category, language);

          return (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-black'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/6 dark:text-white/68 dark:hover:bg-white/12'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
