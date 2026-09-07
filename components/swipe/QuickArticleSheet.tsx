'use client';

import Link from 'next/link';
import { useEffect, useRef, type RefObject } from 'react';
import { ExternalLink, Share2, X } from 'lucide-react';
import type { SwipeArticle } from '@/components/swipe/types';
import { trackClientEvent } from '@/lib/analytics/trackClient';

type QuickArticleSheetProps = {
  article: SwipeArticle;
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement>;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function QuickArticleSheet({
  article,
  open,
  onClose,
  returnFocusRef,
}: QuickArticleSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((item) => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose, open, returnFocusRef]);

  if (!open) return null;

  const shareUrl = typeof window === 'undefined' ? article.href : new URL(article.href, window.location.origin).toString();
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${article.title}\n${shareUrl}`)}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/65" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-article-title"
        aria-describedby="quick-article-summary"
        className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 text-zinc-950 shadow-2xl dark:bg-zinc-950 dark:text-white"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">
              {article.category}
            </p>
            <h2 id="quick-article-title" className="mt-2 text-xl font-extrabold leading-8">
              {article.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="reader-focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10"
            aria-label="Close quick article"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p id="quick-article-summary" className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-200">
          {article.summary}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span>{article.author}</span>
          {article.city ? (
            <>
              <span aria-hidden="true">•</span>
              <span>{article.city}</span>
            </>
          ) : null}
          <span aria-hidden="true">•</span>
          <time dateTime={article.publishedAt}>
            {new Date(article.publishedAt).toLocaleString('hi-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href={article.href}
            onClick={() =>
              trackClientEvent({
                event: 'full_article_open',
                source: 'lokswami_swipe',
                metadata: { articleId: article.id, articleSlug: article.slug },
              })
            }
            className="reader-focus-ring flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 font-bold text-white"
          >
            पूरी खबर पढ़ें <ExternalLink className="h-4 w-4" />
          </Link>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              trackClientEvent({
                event: 'whatsapp_share',
                source: 'lokswami_swipe',
                metadata: { articleId: article.id, articleSlug: article.slug },
              })
            }
            className="reader-focus-ring flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 font-bold dark:border-zinc-700"
          >
            WhatsApp <Share2 className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
