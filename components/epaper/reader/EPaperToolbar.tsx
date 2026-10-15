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
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import Logo from '@/components/layout/Logo';
import ShareMenu from '@/components/ui/ShareMenu';
import styles from './reader.module.css';

export interface EPaperToolbarProps {
  title: string;
  editionLabel: string;
  issueDateLabel: string;
  currentPage: number;
  pageCount: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  canUseSpreadMode?: boolean;
  isSpreadMode?: boolean;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageSelect: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onToggleSpreadMode?: () => void;
  onOpenDownload?: () => void;
  onClose: () => void;
  shareUrl: string;
  shareText: string;
  shareContentType?: 'epaper' | 'emagazine';
  publicationType?: 'epaper' | 'emagazine';
  shareContentId?: string;
  language?: 'en' | 'hi';
  isSaved?: boolean;
  onToggleSave?: () => void;
  theme?: string;
  onToggleTheme?: () => void;
  companionPage?: number;
  thumbnailsOpen?: boolean;
  onToggleThumbnails?: () => void;
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
  minZoom = 1,
  maxZoom = 4,
  canUseSpreadMode = false,
  isSpreadMode = false,
  canGoPrevious = false,
  canGoNext = false,
  onPreviousPage,
  onNextPage,
  onPageSelect,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isFullscreen = false,
  onToggleFullscreen,
  onToggleSpreadMode,
  onOpenDownload,
  onClose,
  shareUrl,
  shareText,
  shareContentType = 'epaper',
  publicationType,
  shareContentId = '',
  language = 'hi',
  isSaved = false,
  onToggleSave,
  theme = 'light',
  onToggleTheme,
  companionPage,
  thumbnailsOpen = true,
  onToggleThumbnails,
}: EPaperToolbarProps) {
  const isEmagazine = publicationType === 'emagazine' || shareContentType === 'emagazine';
  const pageLabel = isSpreadMode && companionPage ? `${currentPage}–${companionPage}` : `${currentPage}`;

  const copy = {
    closeReader: language === 'hi' ? 'रीडर बंद करें' : 'Close reader',
    backToEditions: language === 'hi'
      ? (isEmagazine ? 'अंकों पर वापस जाएं' : 'संस्करणों पर वापस जाएं')
      : (isEmagazine ? 'Back to issues' : 'Back to editions'),
    back: language === 'hi' ? 'वापस' : 'Back',
    previousPage: language === 'hi' ? 'पिछला पृष्ठ' : 'Previous page',
    nextPage: language === 'hi' ? 'अगला पृष्ठ' : 'Next page',
    page: language === 'hi' ? 'पृष्ठ ' : 'Page ',
    jumpToPage: language === 'hi' ? 'पृष्ठ पर जाएं' : 'Jump to page',
    zoomIn: language === 'hi' ? 'ज़ूम इन' : 'Zoom in',
    zoomOut: language === 'hi' ? 'ज़ूम आउट' : 'Zoom out',
    resetZoom: language === 'hi' ? 'ज़ूम रीसेट करें' : 'Reset zoom',
    enterFullscreen: language === 'hi' ? 'फुलस्क्रीन करें' : 'Enter fullscreen',
    exitFullscreen: language === 'hi' ? 'फुलस्क्रीन से बाहर निकलें' : 'Exit fullscreen',
    switchToSinglePage: language === 'hi' ? 'सिंगल पेज दृश्य में बदलें' : 'Switch to single page view',
    switchToSpread: language === 'hi' ? 'दो पेज दृश्य में बदलें' : 'Switch to spread view',
    singlePage: language === 'hi' ? 'सिंगल पेज' : 'Single page',
    spreadView: language === 'hi' ? 'दो पेज' : 'Spread view',
    saved: language === 'hi' ? 'सहेजा गया' : 'Saved',
    saveForLater: language === 'hi' ? 'बाद के लिए सहेजें' : 'Save for later',
    downloadEdition: language === 'hi'
      ? (isEmagazine ? 'अंक डाउनलोड करें' : 'संस्करण डाउनलोड करें')
      : (isEmagazine ? 'Download issue' : 'Download edition'),
    download: language === 'hi' ? 'डाउनलोड' : 'Download',
    shareEdition: language === 'hi'
      ? (isEmagazine ? 'अंक साझा करें' : 'संस्करण साझा करें')
      : (isEmagazine ? 'Share issue' : 'Share edition'),
    share: language === 'hi' ? 'साझा करें' : 'Share',
    switchToLightMode: language === 'hi' ? 'लाइट मोड में बदलें' : 'Switch reader to light mode',
    switchToDarkMode: language === 'hi' ? 'डार्क मोड में बदलें' : 'Switch reader to dark mode',
    lightMode: language === 'hi' ? 'लाइट मोड' : 'Light mode',
    darkMode: language === 'hi' ? 'डार्क मोड' : 'Dark mode',
    close: language === 'hi' ? 'बंद करें' : 'Close',
    hidePages: language === 'hi' ? 'पृष्ठ छुपाएं' : 'Hide pages',
    showPages: language === 'hi' ? 'पृष्ठ दिखाएं' : 'Show pages',
  };

  return (
    <header className={`${styles.toolbar} ${styles.controls} relative z-40 w-full shrink-0 border-b border-zinc-200/90 bg-white/95 px-2.5 py-2 shadow-xs backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 sm:rounded-t-2xl sm:px-3 lg:px-4`}>
      <h1 className="sr-only">
        {title ? `${title}${issueDateLabel ? ` - ${issueDateLabel}` : ''}` : `${editionLabel}${issueDateLabel ? ` - ${issueDateLabel}` : ''}`}
      </h1>
      {/* Mobile Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.closeReader}
          className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100/90 text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex shrink-0 items-center justify-center">
          <div className={theme === 'dark' ? 'dark' : ''}>
            <Logo size="headerCompact" responsiveHeader />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleFullscreen ? (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? copy.exitFullscreen : copy.enterFullscreen}
              title={isFullscreen ? copy.exitFullscreen : copy.enterFullscreen}
              className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          ) : null}
          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? copy.switchToLightMode : copy.switchToDarkMode}
              title={theme === 'dark' ? copy.lightMode : copy.darkMode}
              className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
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
            triggerLabel={copy.share}
            ariaLabel={copy.shareEdition}
            buttonClassName="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 [&>span]:hidden"
          />
        </div>
      </div>

      {/* Desktop & Tablet Main Toolbar */}
      <div className="hidden flex-wrap items-center justify-between gap-1.5 sm:flex md:gap-2.5 lg:gap-4 xl:flex-nowrap">
        {/* Left: Back button and Edition details */}
        <div className="flex min-w-0 shrink items-center gap-1.5 md:gap-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.backToEditions}
            title={copy.backToEditions}
            className="reader-focus-ring inline-flex h-11 min-w-11 items-center gap-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{copy.back}</span>
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
            aria-label={copy.previousPage}
            title={copy.previousPage}
            className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="inline-flex items-center rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 py-1 text-center text-xs font-semibold text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            <span className="hidden md:inline">{copy.page}</span>
            <span>{pageLabel}</span>
            <span className="mx-1 text-zinc-400 dark:text-zinc-400">/</span>
            <span>{pageCount}</span>
          </div>

          <button
            type="button"
            onClick={onNextPage}
            disabled={!canGoNext}
            aria-label={copy.nextPage}
            title={copy.nextPage}
            className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Zoom, Spread mode, Bookmark, Download, Share, Close */}
        <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center rounded-lg border border-zinc-300/90 bg-zinc-50 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800">
            <button
              type="button"
              onClick={onZoomOut}
              disabled={zoom <= minZoom}
              aria-label={copy.zoomOut}
              title={copy.zoomOut}
              className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-zinc-800 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[34px] px-1 text-center text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={onZoomIn}
              disabled={zoom >= maxZoom}
              aria-label={copy.zoomIn}
              title={copy.zoomIn}
              className={`reader-focus-ring inline-flex h-11 w-11 items-center justify-center text-zinc-800 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-100 dark:hover:bg-zinc-700 ${
                onResetZoom ? '' : 'rounded-r-lg'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {onResetZoom ? (
              <button
                type="button"
                onClick={onResetZoom}
                aria-label={copy.resetZoom}
                title={copy.resetZoom}
                className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-r-lg border-l border-zinc-300/80 text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          {canUseSpreadMode && onToggleSpreadMode ? (
            <button
              type="button"
              onClick={onToggleSpreadMode}
              title={isSpreadMode ? copy.switchToSinglePage : copy.switchToSpread}
              aria-label={isSpreadMode ? copy.switchToSinglePage : copy.switchToSpread}
              className="reader-focus-ring inline-flex h-11 min-w-11 items-center gap-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <span className="hidden lg:inline">{isSpreadMode ? copy.singlePage : copy.spreadView}</span>
              <span className="lg:hidden">{isSpreadMode ? '1P' : '2P'}</span>
            </button>
          ) : null}

          {onToggleFullscreen ? (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? copy.exitFullscreen : copy.enterFullscreen}
              title={isFullscreen ? copy.exitFullscreen : copy.enterFullscreen}
              className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          ) : null}

          {onToggleSave ? (
            <button
              type="button"
              onClick={onToggleSave}
              aria-label={isSaved ? copy.saved : copy.saveForLater}
              title={isSaved ? copy.saved : copy.saveForLater}
              className={`reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg border shadow-2xs transition ${
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
              aria-label={copy.downloadEdition}
              title={copy.downloadEdition}
              className="reader-focus-ring inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 md:px-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xl:inline">{copy.download}</span>
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
            triggerLabel={copy.share}
            ariaLabel={copy.shareEdition}
            buttonClassName="reader-focus-ring inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2 md:px-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 [&>span]:hidden xl:[&>span]:inline"
          />

          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? copy.switchToLightMode : copy.switchToDarkMode}
              title={theme === 'dark' ? copy.lightMode : copy.darkMode}
              className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            title={copy.closeReader}
            className="reader-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300/90 bg-zinc-50 text-zinc-800 shadow-2xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
        <div className="flex min-w-0 items-center gap-1.5">
          <button type="button" onClick={onPreviousPage} disabled={!canGoPrevious} aria-label={copy.previousPage} className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-100 disabled:opacity-30 dark:bg-zinc-800 sm:hidden"><ChevronLeft className="h-4 w-4" /></button>
          <select value={currentPage} onChange={(e) => onPageSelect(Number(e.target.value))} aria-label={copy.jumpToPage} className="reader-focus-ring h-11 max-w-28 rounded-lg border border-zinc-200 bg-white px-2 font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 min-w-11">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => <option key={page} value={page}>{language === 'hi' ? `पृष्ठ ${page}` : `Page ${page}`}</option>)}
          </select>
          <button type="button" onClick={onNextPage} disabled={!canGoNext} aria-label={copy.nextPage} className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-100 disabled:opacity-30 dark:bg-zinc-800 sm:hidden"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{language === 'hi' ? `पृष्ठ ${pageLabel} / ${pageCount}` : `Page ${pageLabel} of ${pageCount}`}</span>
        <span aria-hidden="true" className="hidden sm:inline">{Math.round(((companionPage && isSpreadMode ? companionPage : currentPage) / Math.max(1, pageCount)) * 100)}% through this issue</span>
        {onToggleThumbnails ? <button type="button" aria-expanded={thumbnailsOpen} aria-controls="publication-page-thumbnails" onClick={onToggleThumbnails} className="reader-focus-ring min-h-11 min-w-11 shrink-0 rounded-lg px-2 font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-zinc-800">{thumbnailsOpen ? copy.hidePages : copy.showPages}</button> : null}
      </div>
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-200 dark:bg-zinc-800"><div className="h-full bg-red-600" style={{ width: `${Math.min(100, ((isSpreadMode && companionPage ? companionPage : currentPage) / Math.max(1, pageCount)) * 100)}%` }} /></div>
    </header>
  );
}

export const EPaperToolbar = memo(EPaperToolbarComponent);
export default EPaperToolbar;
