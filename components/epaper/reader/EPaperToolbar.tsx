'use client';

import React, { memo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  Plus,
  Moon,
  Sun,
  X,
  Bookmark,
  Sparkles,
} from 'lucide-react';
import Logo from '@/components/layout/Logo';
import ShareMenu from '@/components/ui/ShareMenu';

export interface EPaperToolbarProps {
  title: string;
  editionLabel: string;
  issueDateLabel: string;
  currentPage: number;
  pageCount: number;
  zoom: number;
  canUseSpreadMode?: boolean;
  isSpreadMode?: boolean;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageSelect: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleSpreadMode?: () => void;
  onOpenDownload?: () => void;
  onClose: () => void;
  shareUrl: string;
  shareText: string;
  shareContentType?: 'epaper' | 'emagazine';
  shareContentId?: string;
  language?: 'en' | 'hi';
  isSaved?: boolean;
  onToggleSave?: () => void;
  theme?: string;
  onToggleTheme?: () => void;
}

/**
 * EPaperToolbar: Modular header controls for the e-paper reader.
 * Contains responsive mobile & desktop viewports, zoom, page stepping, and multi-channel sharing.
 */
function EPaperToolbarComponent({
  title,
  editionLabel,
  issueDateLabel,
  currentPage,
  pageCount,
  zoom,
  canUseSpreadMode = false,
  isSpreadMode = false,
  canGoPrevious = false,
  canGoNext = false,
  onPreviousPage,
  onNextPage,
  onPageSelect,
  onZoomIn,
  onZoomOut,
  onToggleSpreadMode,
  onOpenDownload,
  onClose,
  shareUrl,
  shareText,
  shareContentType = 'epaper',
  shareContentId = '',
  language = 'hi',
  isSaved = false,
  onToggleSave,
  theme = 'light',
  onToggleTheme,
}: EPaperToolbarProps) {
  return (
    <header className="relative z-40 w-full shrink-0 border-b border-zinc-200/90 bg-white/95 px-2.5 py-2 shadow-xs backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 sm:rounded-t-2xl sm:px-3 lg:px-4">
      {/* Mobile Top Header */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reader"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100/90 text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex shrink-0 items-center justify-center">
          <div className={theme === 'dark' ? 'dark' : ''}>
            <Logo size="headerCompact" />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch reader to light mode' : 'Switch reader to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          ) : null}
          <ShareMenu
            title={title}
            url={shareUrl}
            text={shareText}
            whatsappText={shareText}
            contentType={shareContentType}
            contentId={shareContentId}
            placement="publication_reader_mobile_toolbar"
            language={language}
            triggerLabel="Share"
            ariaLabel="Share edition"
            buttonClassName="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 px-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          />
        </div>
      </div>

      {/* Desktop & Tablet Main Toolbar */}
      <div className="hidden items-center justify-between gap-1.5 sm:flex md:gap-2.5 lg:gap-4">
        {/* Left: Back button and Edition details */}
        <div className="flex min-w-0 shrink items-center gap-1.5 md:gap-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to editions"
            title="Back to editions"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <span className="hidden text-zinc-300 dark:text-zinc-700 md:inline">|</span>

          <div className="flex min-w-0 flex-col justify-center">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600 dark:bg-red-500" aria-hidden="true" />
              <p className="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100 max-w-[100px] sm:max-w-[130px] md:max-w-[180px] lg:max-w-none">
                {editionLabel}
              </p>
            </div>
            <span className="truncate text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              {issueDateLabel}
            </span>
          </div>
        </div>

        {/* Center: Navigation & Quick Jump */}
        <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
          <button
            type="button"
            onClick={onPreviousPage}
            disabled={!canGoPrevious}
            aria-label="Previous page"
            title="Previous page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="inline-flex items-center rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 py-1 text-center text-xs font-semibold text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            <span className="hidden md:inline">Page&nbsp;</span>
            <span>{currentPage}</span>
            <span className="mx-1 text-zinc-400 dark:text-zinc-500">/</span>
            <span>{pageCount}</span>
          </div>

          <button
            type="button"
            onClick={onNextPage}
            disabled={!canGoNext}
            aria-label="Next page"
            title="Next page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Quick jump select on larger tablet / desktop */}
          <div className="relative hidden xl:inline-flex items-center">
            <select
              value={currentPage}
              onChange={(e) => onPageSelect(Number.parseInt(e.target.value, 10))}
              aria-label="Jump to page"
              className="appearance-none rounded-lg border border-zinc-300/90 bg-zinc-50 px-2.5 py-1 pr-6 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  Page {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Zoom, Spread mode, Bookmark, Download, Share, Close */}
        <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center rounded-lg border border-zinc-300/90 bg-zinc-50 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800">
            <button
              type="button"
              onClick={onZoomOut}
              aria-label="Zoom out"
              title="Zoom out"
              className="inline-flex h-8 w-7 items-center justify-center rounded-l-lg text-zinc-800 transition hover:bg-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[34px] px-1 text-center text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={onZoomIn}
              aria-label="Zoom in"
              title="Zoom in"
              className="inline-flex h-8 w-7 items-center justify-center rounded-r-lg text-zinc-800 transition hover:bg-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {canUseSpreadMode && onToggleSpreadMode ? (
            <button
              type="button"
              onClick={onToggleSpreadMode}
              title={isSpreadMode ? 'Switch to single page view' : 'Switch to spread view'}
              aria-label={isSpreadMode ? 'Switch to single page view' : 'Switch to spread view'}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <span className="hidden lg:inline">{isSpreadMode ? 'Single page' : 'Spread view'}</span>
              <span className="lg:hidden">{isSpreadMode ? '1P' : '2P'}</span>
            </button>
          ) : null}

          {onToggleSave ? (
            <button
              type="button"
              onClick={onToggleSave}
              aria-label={isSaved ? 'Saved' : 'Save for later'}
              title={isSaved ? 'Saved' : 'Save for later'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border shadow-2xs transition ${
                isSaved
                  ? 'border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400'
                  : 'border-zinc-300/90 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          ) : null}

          {onOpenDownload ? (
            <button
              type="button"
              onClick={onOpenDownload}
              aria-label="Download edition"
              title="Download edition"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 md:px-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xl:inline">Download</span>
            </button>
          ) : null}

          <ShareMenu
            title={title}
            url={shareUrl}
            text={shareText}
            whatsappText={shareText}
            contentType={shareContentType}
            contentId={shareContentId}
            placement="publication_reader_desktop_toolbar"
            language={language}
            triggerLabel="Share"
            ariaLabel="Share edition"
            buttonClassName="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 md:px-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 [&>span]:hidden xl:[&>span]:inline"
          />

          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch reader to light mode' : 'Switch reader to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close reader"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export const EPaperToolbar = memo(EPaperToolbarComponent);
export default EPaperToolbar;
