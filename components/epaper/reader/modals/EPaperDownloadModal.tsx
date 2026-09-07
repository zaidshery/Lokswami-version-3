'use client';

import React, { memo } from 'react';
import { Download, FileText, Image as ImageIcon, X } from 'lucide-react';

export interface EPaperDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl?: string;
  currentPageImageUrl?: string;
  currentPageNumber?: number;
  editionTitle?: string;
  language?: 'en' | 'hi';
}

/**
 * EPaperDownloadModal: PDF export and page image download interfaces.
 * Lazy-loaded on demand via next/dynamic.
 */
function EPaperDownloadModalComponent({
  isOpen,
  onClose,
  pdfUrl,
  currentPageImageUrl,
  currentPageNumber = 1,
  editionTitle = 'Lokswami E-Paper',
  language = 'hi',
}: EPaperDownloadModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-modal-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id="download-modal-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {language === 'hi' ? 'डाउनलोड विकल्प' : 'Download Options'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3 p-4">
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 transition hover:border-orange-500 hover:bg-orange-50/50 dark:border-zinc-800 dark:hover:border-orange-500/60 dark:hover:bg-orange-950/20"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {language === 'hi' ? 'पूरा ई-पेपर PDF डाउनलोड करें' : 'Download Full Edition PDF'}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {editionTitle}
                </p>
              </div>
              <Download className="h-4 w-4 text-zinc-400" />
            </a>
          ) : null}

          {currentPageImageUrl ? (
            <a
              href={currentPageImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={`page-${currentPageNumber}.jpg`}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 transition hover:border-orange-500 hover:bg-orange-50/50 dark:border-zinc-800 dark:hover:border-orange-500/60 dark:hover:bg-orange-950/20"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {language === 'hi' ? `पेज ${currentPageNumber} इमेज डाउनलोड करें` : `Download Page ${currentPageNumber} Image`}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  High-resolution JPEG
                </p>
              </div>
              <Download className="h-4 w-4 text-zinc-400" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const EPaperDownloadModal = memo(EPaperDownloadModalComponent);
export default EPaperDownloadModal;
