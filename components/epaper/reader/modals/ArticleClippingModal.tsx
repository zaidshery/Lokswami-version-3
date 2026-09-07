'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { Newspaper, Share2, X, Check } from 'lucide-react';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

export interface ArticleClippingModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: EPaperArticleRecord | null;
  pageImageUrl?: string;
  shareUrl?: string;
  shareText?: string;
  editionName?: string;
  publishDate?: string;
  language?: 'en' | 'hi';
  publicationType?: 'epaper' | 'emagazine';
}

/**
 * ArticleClippingModal: WhatsApp crop-and-share dialog and branded social preview clipper.
 * Lazy-loaded on demand via next/dynamic.
 */
function ArticleClippingModalComponent({
  isOpen,
  onClose,
  article,
  shareUrl = '',
  shareText = '',
  editionName = '',
  publishDate = '',
  language = 'hi',
  publicationType = 'epaper',
}: ArticleClippingModalProps) {
  const [copied, setCopied] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [shareError, setShareError] = React.useState('');
  const [imageReady, setImageReady] = React.useState(false);

  if (!isOpen || !article) return null;

  const handleCopy = async () => {
    if (shareUrl && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
      } catch { setShareError('Could not copy the link. Please retry.'); }
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`${shareText}\n${shareUrl}`);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${text}`;
    if (typeof window !== 'undefined') {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const assetQuery = new URLSearchParams({ publicationType, brand: '1' });
  if (article.releaseVersion) assetQuery.set('v', String(article.releaseVersion));
  const displayImage = `/api/epapers/${encodeURIComponent(article.epaperId)}/articles/${encodeURIComponent(article._id)}/share-image?${assetQuery}`;
  const handleImageShare = async () => {
    setSharing(true);
    setShareError('');
    try {
      const response = await fetch(displayImage);
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Clipping could not be prepared. Please retry.');
      const file = new File([await response.blob()], `lokswami-page-${article.pageNumber}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: article.title, text: shareText, url: shareUrl });
      } else {
        setShareError('Image sharing is unavailable on this device. Use Download image, then Copy Link.');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setShareError(error instanceof Error ? error.message : 'Sharing failed. Please retry.');
    } finally { setSharing(false); }
  };
  const pageLabel = article.pageNumber ? `पृष्ठ ${article.pageNumber}` : '';
  const metaParts = [editionName, publishDate, pageLabel].filter(Boolean).join(' • ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clipping-modal-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 p-0.5 shadow-xs">
              <Image
                src="/logo-header-cutout.png"
                alt="लो"
                width={24}
                height={24}
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
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              | {language === 'hi' ? 'क्लिपिंग' : 'Clipping'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Branded Newspaper Card Frame */}
          <div className="overflow-hidden rounded-xl border border-zinc-300 bg-amber-50/40 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            {/* Masthead Ribbon */}
            <div className="border-b border-zinc-200/80 bg-gradient-to-r from-red-700 via-red-600 to-red-700 px-3.5 py-2 text-white shadow-xs dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image
                    src="/logo-header-cutout.png"
                    alt="Logo"
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain drop-shadow-sm"
                  />
                  <div className="relative h-6 w-24">
                    <Image
                      src="/logo-wordmark-final.png"
                      alt="लोकस्वामी"
                      fill
                      className="object-contain brightness-0 invert"
                    />
                  </div>
                  <span className="font-bold text-xs tracking-tight">
                    {publicationType === 'emagazine' ? 'Lokswami E-Magazine' : language === 'hi' ? 'दैनिक लोकस्वामी' : 'Lokswami E-Paper'}
                  </span>
                  <span className="rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    {publicationType === 'emagazine' ? 'E-Magazine' : 'ई-पेपर'}
                  </span>
                </div>
                {metaParts ? (
                  <span className="text-[10px] font-medium text-red-100">
                    {metaParts}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Clipping Image */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950">
              {displayImage ? (
                <Image
                  src={displayImage}
                  alt={article.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 512px"
                  className="object-contain"
                  unoptimized
                  onLoad={() => setImageReady(true)}
                  onError={() => { setImageReady(false); setShareError('Clipping is unavailable. Retry or share the link.'); }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                  {language === 'hi' ? 'कोई पूर्वावलोकन उपलब्ध नहीं' : 'No preview available'}
                </div>
              )}
            </div>

            {/* Footer Attribution */}
            <div className="border-t border-zinc-200/80 bg-zinc-50 px-3 py-1.5 text-center text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {language === 'hi'
                ? 'पूरा अखबार पढ़ने के लिए lokswami.com पर जाएं'
                : 'Read full edition online at lokswami.com'}
            </div>
          </div>

          <h3 className="mt-3 text-base font-bold text-zinc-900 line-clamp-2 dark:text-zinc-100">
            {article.title}
          </h3>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button type="button" disabled={sharing || !imageReady} onClick={() => void handleImageShare()} className="min-h-11 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{sharing ? 'Preparing…' : 'Share image + link'}</button>
            {imageReady ? <a href={`${displayImage}&download=1`} download className="min-h-11 rounded-xl border px-4 py-2 text-sm">Download image</a> : null}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Share2 className="h-4 w-4" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-700 shadow-xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              <span>{copied ? 'Copied' : 'Copy Link'}</span>
            </button>
          </div>
          <p role="status" className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{shareError}</p>
        </div>
      </div>
    </div>
  );
}

export const ArticleClippingModal = memo(ArticleClippingModalComponent);
export default ArticleClippingModal;
