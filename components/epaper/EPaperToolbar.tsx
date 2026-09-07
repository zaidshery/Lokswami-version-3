'use client';

import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  Newspaper,
  Plus,
  RotateCcw,
  Share2,
  Bookmark,
} from 'lucide-react';
import EPaperCityPicker from '@/components/ui/EPaperCityPicker';
import EPaperDatePicker from '@/components/ui/EPaperDatePicker';
import type { EPaperCityFilter } from '@/lib/utils/publicEpaperFilters';
import type { EPaperPublicationType } from '@/lib/types/epaper';
import { isMonthlyEPaperPublication } from '@/lib/utils/epaperPublication';

export interface EPaperToolbarProps {
  city: EPaperCityFilter;
  onCityChange: (city: EPaperCityFilter) => void;
  date: string;
  onDateChange: (date: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  maxZoom?: number;
  publicationType?: EPaperPublicationType;
  pdfUrl?: string;
  onShare?: () => void;
  onSave?: () => void;
  isSaved?: boolean;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  language?: 'hi' | 'en';
  className?: string;
}

/**
 * EPaperToolbar: Top reader navigation bar with responsive controls,
 * zoom indicators (100% - 500%), edition/date selectors, and quick actions.
 */
export default function EPaperToolbar({
  city,
  onCityChange,
  date,
  onDateChange,
  currentPage,
  totalPages,
  onPageChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  maxZoom = 5,
  publicationType = 'epaper',
  pdfUrl,
  onShare,
  onSave,
  isSaved = false,
  onToggleFullscreen,
  isFullscreen = false,
  language = 'hi',
  className = '',
}: EPaperToolbarProps) {
  const isMonthly = isMonthlyEPaperPublication(publicationType);
  const zoomPercent = Math.round(zoom * 100);

  return (
    <header
      role="toolbar"
      aria-label="E-Paper controls"
      className={`relative z-40 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2 text-zinc-900 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:px-4 ${className}`}
    >
      {/* Left: Edition & Date Controls */}
      <div className="flex items-center gap-2">
        {!isMonthly && (
          <EPaperCityPicker
            value={city}
            onChange={onCityChange}
            language={language}
            className="text-xs"
          />
        )}
        <EPaperDatePicker
          value={date}
          onChange={onDateChange}
          className="text-xs"
        />
      </div>

      {/* Center: Page Jumper & Zoom Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Page selector */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-zinc-500 dark:text-zinc-400">Page</span>
            <select
              value={currentPage}
              onChange={(e) => onPageChange(Number(e.target.value))}
              aria-label="Select page"
              className="bg-transparent font-bold text-orange-600 focus:outline-none dark:text-orange-400"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  {p} / {totalPages}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Zoom Engine Controls */}
        <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoom <= 1}
            aria-label="Zoom out"
            className="rounded p-1 text-zinc-600 hover:bg-zinc-200 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onZoomReset}
            aria-label={`Current zoom: ${zoomPercent}%. Click to reset.`}
            title="Reset zoom"
            className="px-2 text-center text-xs font-bold text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400"
          >
            {zoomPercent}%
          </button>

          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoom >= maxZoom}
            aria-label="Zoom in"
            className="rounded p-1 text-zinc-600 hover:bg-zinc-200 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Actions (PDF, Fullscreen, Save, Share) */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* PDF Download */}
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            aria-label="Download full edition PDF"
            className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden md:inline">PDF</span>
          </a>
        )}

        {/* Save Edition */}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            aria-label="Save issue for offline reading"
            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isSaved ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Share */}
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            aria-label="Share edition"
            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Share2 className="h-4 w-4" />
          </button>
        )}

        {/* Fullscreen */}
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="hidden rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:inline-flex"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </header>
  );
}
