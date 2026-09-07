'use client';

import React, { memo, useState } from 'react';
import Image from 'next/image';
import { useArticleTts } from '@/lib/hooks/useArticleTts';
import {
  FileText,
  ImageIcon,
  Minus,
  Moon,
  PauseCircle,
  Plus,
  Share2,
  Sun,
  Volume2,
  X,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

export interface ArticleStoryModalProps {
  article: EPaperArticleRecord | null;
  isOpen: boolean;
  onClose: () => void;
  pageImageUrl?: string;
  language?: 'en' | 'hi';
  onShareWhatsApp?: () => void;
  onShareClipping?: () => void;
  onPlayAudio?: () => void;
  onPauseAudio?: () => void;
  isPlayingAudio?: boolean;
  isPreparingAudio?: boolean;
  hasAudioSource?: boolean;
}

/**
 * ArticleStoryModal: High-performance, branded visual clipping & readable text story reader.
 * Lazy-loaded via next/dynamic.
 */
function ArticleStoryModalComponent(props: ArticleStoryModalProps) {
  if (!props.isOpen || !props.article) return null;
  return <ArticleStoryModalContent key={props.article._id} {...props} article={props.article} />;
}

function ArticleStoryModalContent({
  article,
  onClose,
  pageImageUrl,
  language = 'hi',
  onShareWhatsApp,
  onShareClipping,
  onPlayAudio,
  onPauseAudio,
  isPlayingAudio = false,
  isPreparingAudio = false,
  hasAudioSource = false,
}: ArticleStoryModalProps & { article: EPaperArticleRecord }) {
  const [viewMode, setViewMode] = useState<'visual' | 'text'>('visual');
  const [textScale, setTextScale] = useState(1);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [cropViewMode, setCropViewMode] = useState<'crop' | 'full'>('crop');
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  // Cropped story clipping URL with official Lokswami branding
  const croppedStoryUrl = article.hotspot && article.epaperId && article._id
    ? `/api/epapers/${encodeURIComponent(article.epaperId)}/articles/${encodeURIComponent(article._id)}/share-image?publicationType=epaper&brand=1${article.releaseVersion ? `&v=${article.releaseVersion}` : ''}`
    : '';

  // Determine active visual image based on mode and availability
  const activeVisualSrc = cropViewMode === 'crop'
    ? (article.coverImagePath || (!imageFailed ? croppedStoryUrl : '') || pageImageUrl)
    : (pageImageUrl || article.coverImagePath || croppedStoryUrl);

  const textContent = article.contentHtml
    ? article.contentHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    : String(article.excerpt || '').trim();
  const hasText = Boolean(textContent);

  const tts = useArticleTts({
    audioUrl: (article as unknown as { audioUrl?: string })?.audioUrl || null,
    text: textContent ? `${article.title}। ${textContent}` : article.title,
    title: article.title,
    lang: language === 'hi' ? 'hi-IN' : 'en-IN',
  });

  const isSpeaking = tts.isSpeaking || isPlayingAudio;
  const canListen = hasText || hasAudioSource || Boolean(onPlayAudio);

  const handleAudioToggle = () => {
    if (isSpeaking) {
      if (tts.isSpeaking) {
        tts.pause();
      }
      onPauseAudio?.();
      return;
    }

    if (tts.isPaused) {
      tts.resume();
      return;
    }

    if (hasText) {
      void tts.play({
        audioUrl: (article as unknown as { audioUrl?: string })?.audioUrl || null,
        text: `${article.title}। ${textContent}`,
        lang: language === 'hi' ? 'hi-IN' : 'en-IN',
      });
      return;
    }

    onPlayAudio?.();
  };

  const handleClose = () => {
    tts.stop();
    onPauseAudio?.();
    onClose();
  };

  const pageBadge = article.pageNumber ? `पृष्ठ ${article.pageNumber}` : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-modal-title"
      className="fixed inset-0 z-[105] flex items-center justify-center bg-black/80 p-0 backdrop-blur-md sm:p-4"
    >
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-950 sm:h-[90vh] sm:rounded-2xl sm:border sm:border-zinc-200 sm:dark:border-zinc-800">
        {/* Header toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5 sm:px-4 sm:py-3 dark:border-zinc-800">
          {/* Mode Switcher */}
          <div className="flex shrink-0 items-center rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              aria-pressed={viewMode === 'visual'}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === 'visual'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>{language === 'hi' ? 'विजुअल' : 'Visual'}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('text')}
              aria-pressed={viewMode === 'text'}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === 'text'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{language === 'hi' ? 'टेक्स्ट' : 'Text'}</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Visual crop vs page toggle */}
            {viewMode === 'visual' && croppedStoryUrl && pageImageUrl ? (
              <div className="hidden sm:flex items-center rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setCropViewMode('crop'); setImageLoaded(false); }}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition ${cropViewMode === 'crop' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'}`}
                >
                  {language === 'hi' ? 'खबर क्लिपिंग' : 'Story Crop'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCropViewMode('full'); setImageLoaded(false); }}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition ${cropViewMode === 'full' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'}`}
                >
                  {language === 'hi' ? 'पूरा पृष्ठ' : 'Full Page'}
                </button>
              </div>
            ) : null}

            {/* Visual zoom controls */}
            {viewMode === 'visual' ? (
              <div className="flex items-center rounded-md border border-zinc-300 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                  disabled={imageZoom <= 1}
                  aria-label="Zoom out"
                  className="px-1.5 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
                <span className="px-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                  {Math.round(imageZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
                  disabled={imageZoom >= 2.5}
                  aria-label="Zoom in"
                  className="px-1.5 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
                {imageZoom > 1 ? (
                  <button
                    type="button"
                    onClick={() => setImageZoom(1)}
                    aria-label="Reset zoom"
                    className="border-l border-zinc-200 px-1 py-1 text-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Audio narration button */}
            {canListen ? (
              <button
                type="button"
                onClick={handleAudioToggle}
                disabled={isPreparingAudio}
                aria-label={isSpeaking ? 'Pause audio' : 'Listen to story'}
                className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-semibold transition ${
                  isSpeaking
                    ? 'border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                {isPreparingAudio ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isSpeaking ? (
                  <PauseCircle className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
                <span>
                  {isSpeaking
                    ? language === 'hi'
                      ? 'रोकें'
                      : 'Pause'
                    : language === 'hi'
                      ? 'सुनें'
                      : 'Listen'}
                </span>
              </button>
            ) : null}

            {/* Font size adjustment (text mode only) */}
            {viewMode === 'text' ? (
              <div className="flex items-center rounded-md border border-zinc-300 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setTextScale((s) => Math.max(0.85, s - 0.1))}
                  aria-label="Decrease text size"
                  className="px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="px-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                  {Math.round(textScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setTextScale((s) => Math.min(1.4, s + 0.1))}
                  aria-label="Increase text size"
                  className="px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ) : null}

            {onShareWhatsApp ? (
              <button
                type="button"
                onClick={onShareWhatsApp}
                aria-label="Share on WhatsApp"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
            ) : null}

            {onShareClipping ? (
              <button
                type="button"
                onClick={onShareClipping}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-red-700 px-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-red-800"
              >
                <span className="hidden sm:inline">{language === 'hi' ? 'क्लिपिंग शेयर करें' : 'Share clipping'}</span>
                <span className="sm:hidden">{language === 'hi' ? 'क्लिपिंग' : 'Clip'}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close story"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Story Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Branded Newspaper Masthead Strip */}
          <div className="mb-3 flex items-center justify-between border-b border-zinc-200/80 pb-2.5 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-600 p-0.5 shadow-xs">
                <Image
                  src="/logo-header-cutout.png"
                  alt="Logo"
                  width={20}
                  height={20}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="relative h-5 w-24">
                <Image
                  src="/logo-wordmark-final.png"
                  alt="लोकस्वामी"
                  fill
                  className="object-contain dark:brightness-0 dark:invert"
                />
              </div>
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {pageBadge || (language === 'hi' ? 'ई-पेपर' : 'E-Paper')}
              </span>
            </div>
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {language === 'hi' ? 'डिजिटल स्टोरी' : 'Digital Story'}
            </span>
          </div>

          <h1
            id="story-modal-title"
            className="font-hindi text-xl font-bold leading-tight text-zinc-900 dark:text-zinc-100 sm:text-2xl"
          >
            {article.title}
          </h1>

          {/* Visual Mode: Crystal Clear Cropped Story with Zoom & Pan */}
          {viewMode === 'visual' && activeVisualSrc ? (
            <div className="mt-4">
              <div
                className={`relative w-full overflow-auto rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm transition-all dark:border-zinc-800 dark:bg-zinc-900 ${imageZoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{ maxHeight: 'calc(80vh - 180px)' }}
              >
                {!imageLoaded ? (
                  <div className="flex min-h-[260px] w-full flex-col items-center justify-center gap-2.5 bg-zinc-50 text-zinc-400 dark:bg-zinc-900">
                    <Loader2 className="h-6 w-6 animate-spin text-red-600" />
                    <span className="text-xs font-semibold text-zinc-500">
                      {language === 'hi' ? 'खबर लोड हो रही है…' : 'Loading story…'}
                    </span>
                  </div>
                ) : null}

                <img
                  src={activeVisualSrc}
                  alt={article.title}
                  loading="eager"
                  decoding="async"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    if (activeVisualSrc === croppedStoryUrl) {
                      setImageFailed(true);
                    }
                  }}
                  className={`mx-auto block h-auto max-w-full object-contain transition-transform duration-200 ${!imageLoaded ? 'hidden' : ''}`}
                  style={{
                    transform: `scale(${imageZoom})`,
                    transformOrigin: 'top center',
                  }}
                />
              </div>

              {/* Quick toolbar below image */}
              <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>
                  {cropViewMode === 'crop'
                    ? (language === 'hi' ? 'अखबार से सीधे कटी हुई खबर' : 'Cropped story clipping')
                    : (language === 'hi' ? 'पूरा पृष्ठ दृश्य' : 'Full page view')}
                </span>
                {croppedStoryUrl && pageImageUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCropViewMode((m) => (m === 'crop' ? 'full' : 'crop'));
                      setImageLoaded(false);
                    }}
                    className="sm:hidden font-semibold text-red-600 hover:underline dark:text-red-400"
                  >
                    {cropViewMode === 'crop' ? (language === 'hi' ? 'पूरा पृष्ठ देखें' : 'View full page') : (language === 'hi' ? 'क्लिपिंग देखें' : 'View clipping')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Text Mode */}
          {viewMode === 'text' || !activeVisualSrc ? (
            <div className="mt-4">
              {hasText ? (
                <div
                  className="font-hindi space-y-4 leading-relaxed text-zinc-800 dark:text-zinc-200"
                  style={{ fontSize: `${16 * textScale}px` }}
                >
                  {textContent.split('\n\n').map((paragraph: string, index: number) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'hi'
                      ? 'यह खबर सीधे अखबार के प्रिंट संस्करण से मैप्ड है। पूरी खबर पढ़ने के लिए विजुअल क्लिपिंग देखें।'
                      : 'This story was clipped directly from the print edition. View the visual clipping to read.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMode('visual')}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-800"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>{language === 'hi' ? 'विजुअल क्लिपिंग देखें' : 'View Visual Clipping'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ArticleStoryModal = memo(ArticleStoryModalComponent);
export default ArticleStoryModal;
