'use client';

import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Download,
  Minus,
  Plus,
  Printer,
  Share2,
  Volume2,
  X,
} from 'lucide-react';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

export interface EPaperStoryModalProps {
  article: EPaperArticleRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onPlayAudio?: (article: EPaperArticleRecord) => void;
  isAudioPlaying?: boolean;
  onSaveStory?: (article: EPaperArticleRecord) => void;
  isSaved?: boolean;
  onShareStory?: (article: EPaperArticleRecord) => void;
  language?: 'hi' | 'en';
}

/**
 * EPaperStoryModal: Clean, focused reader modal for digitized newspaper stories.
 * Offers visual mode (newspaper clipping) and text mode with customizable font sizing.
 */
export default function EPaperStoryModal({
  article,
  isOpen,
  onClose,
  onPlayAudio,
  isAudioPlaying = false,
  onSaveStory,
  isSaved = false,
  onShareStory,
  language = 'hi',
}: EPaperStoryModalProps) {
  const [fontSizeOffset, setFontSizeOffset] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'text' | 'visual'>('text');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !article) return null;

  const increaseFontSize = () => setFontSizeOffset((prev) => Math.min(6, prev + 2));
  const decreaseFontSize = () => setFontSizeOffset((prev) => Math.max(-4, prev - 2));

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`${article.title}\n\nRead more on Lokswami E-Paper: ${window.location.href}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="epaper-story-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
      >
        {/* Header Toolbar */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              Page {article.pageNumber}
            </span>

            {/* Mode Switcher */}
            <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className={`rounded px-2.5 py-1 transition ${
                  viewMode === 'text'
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                Text
              </button>
              {article.coverImagePath && (
                <button
                  type="button"
                  onClick={() => setViewMode('visual')}
                  className={`rounded px-2.5 py-1 transition ${
                    viewMode === 'visual'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  Visual Clip
                </button>
              )}
            </div>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Font Resizing */}
            {viewMode === 'text' && (
              <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={decreaseFontSize}
                  aria-label="Decrease text size"
                  className="p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={increaseFontSize}
                  aria-label="Increase text size"
                  className="p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* TTS Audio */}
            {onPlayAudio && (
              <button
                type="button"
                onClick={() => onPlayAudio(article)}
                aria-label="Listen to article"
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  isAudioPlaying
                    ? 'bg-orange-600 text-white'
                    : 'border border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                }`}
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{isAudioPlaying ? 'Playing' : 'Listen'}</span>
              </button>
            )}

            {/* Bookmark / Save */}
            {onSaveStory && (
              <button
                type="button"
                onClick={() => onSaveStory(article)}
                aria-label="Save story"
                className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {isSaved ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </button>
            )}

            {/* WhatsApp / Share */}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              aria-label="Share story"
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Share2 className="h-4 w-4" />
            </button>

            {/* Print */}
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print story"
              className="hidden rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:inline-flex"
            >
              <Printer className="h-4 w-4" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close story modal"
              className="ml-1 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <h2
            id="epaper-story-title"
            style={{ fontSize: `${22 + fontSizeOffset}px` }}
            className="mb-4 font-bold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            {article.title}
          </h2>

          {viewMode === 'visual' && article.coverImagePath ? (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <img
                src={article.coverImagePath}
                alt={article.title}
                className="mx-auto max-h-[60vh] w-auto object-contain"
              />
            </div>
          ) : (
            <div
              style={{ fontSize: `${16 + fontSizeOffset}px`, lineHeight: '1.75' }}
              className="prose prose-zinc max-w-none dark:prose-invert"
            >
              {article.contentHtml ? (
                <div dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
              ) : article.excerpt ? (
                <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">
                  {article.excerpt}
                </p>
              ) : (
                <p className="italic text-zinc-500">
                  Detailed digitized text is being processed for this story. Use visual mode to view the newspaper clipping.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
