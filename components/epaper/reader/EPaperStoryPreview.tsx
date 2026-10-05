'use client';

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Share2 } from 'lucide-react';
import Logo from '@/components/layout/Logo';
import EPaperStoryImageViewport from './EPaperStoryImageViewport';
import type { EPaperArticleRecord } from '@/lib/types/epaper';
import styles from './reader.module.css';
import { stripHtmlAndMarkdown } from '@/lib/hooks/useArticleTts';

export default function EPaperStoryPreview({ story, articlePath, pageImagePath, issueTitle, issueContext, language, onClose, onOpenClipping, whatsappControl, clippingControl, onCloseClipping, onPlayAudio, onPauseAudio, canListen = false, isPlayingAudio = false, isPreparingAudio = false, audioError }: {
  story: EPaperArticleRecord;
  articlePath: string;
  pageImagePath?: string;
  issueTitle: string;
  issueContext?: string;
  language: 'en' | 'hi';
  onClose: () => void;
  onOpenClipping: () => void;
  shareControl?: ReactNode;
  whatsappControl?: ReactNode;
  clippingControl?: ReactNode;
  onCloseClipping?: () => void;
  onPlayAudio?: () => void;
  onPauseAudio?: () => void;
  canListen?: boolean;
  isPlayingAudio?: boolean;
  isPreparingAudio?: boolean;
  audioError?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const clippingButton = useRef<HTMLButtonElement>(null);
  const clippingWasOpen = useRef(false);
  const text = stripHtmlAndMarkdown(story.contentHtml || story.excerpt || '');
  const hasReleasedText = Boolean(text.trim());
  const [view, setView] = useState<'visual' | 'text'>('visual');
  const [fullPage, setFullPage] = useState(false);
  const [textScale, setTextScale] = useState(1);
  const [zoomToolbar, setZoomToolbar] = useState<HTMLDivElement | null>(null);
  const [sharingHeight, setSharingHeight] = useState(128);
  const escapeAction = useRef(onClose);
  escapeAction.current = clippingControl && onCloseClipping ? onCloseClipping : onClose;
  useEffect(() => {
    if (clippingWasOpen.current && !clippingControl) clippingButton.current?.focus();
    clippingWasOpen.current = Boolean(clippingControl);
  }, [clippingControl]);
  const sharingOpen = Boolean(clippingControl);
  useEffect(() => {
    const sheet = panel.current?.querySelector<HTMLElement>('#story-sharing-panel');
    if (!sharingOpen || !sheet) return;
    const measure = () => setSharingHeight(sheet.offsetHeight);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(sheet);
    return () => observer?.disconnect();
  }, [sharingOpen]);
  useEffect(() => {
    if (!sharingOpen || !panel.current) return;
    // Sharing tools load on demand; focus their first action once the chunk mounts.
    const focusAction = () => {
      const action = panel.current?.querySelector<HTMLElement>('[aria-label="Clipping sharing tools"] button');
      if (!action) return false;
      action.focus();
      return true;
    };
    if (focusAction()) return;
    const observer = new MutationObserver(() => { if (focusAction()) observer.disconnect(); });
    observer.observe(panel.current, {childList:true,subtree:true});
    return () => observer.disconnect();
  }, [sharingOpen]);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (panel.current?.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')) return;
      if (event.key === 'Escape' && !panel.current?.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')) {
        event.preventDefault();
        event.stopPropagation();
        escapeAction.current();
      }
      if (event.key === 'Tab') {
        const scope = panel.current?.querySelector('#story-sharing-panel') || panel.current;
        const controls = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') || []).filter((node) => node.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (first && last && (!scope?.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last))) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (trigger?.isConnected) trigger.focus();
      else document.querySelector<HTMLElement>('[data-reader-canvas]')?.focus();
    };
  }, [onClose, story._id]);

  return <div className="fixed inset-0 z-[105]">
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="publication-story-preview-title" aria-describedby="publication-story-preview-context" style={{'--story-sharing-height':`${sharingHeight}px`} as CSSProperties} className={`${styles.controls} ${sharingOpen ? styles.storySharingOpen : ''} flex h-[100dvh] w-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <div className="relative flex min-h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-2 dark:border-zinc-800">
        <button ref={close} type="button" onClick={onClose} aria-label={language === 'hi' ? 'खबर बंद करें' : 'Close story'} title={language === 'hi' ? 'ई-पेपर पर वापस जाएं' : 'Back to publication'} className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"><ArrowLeft className="h-5 w-5" /></button>
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2"><Logo responsiveHeader /></div>
        <div className="flex items-center gap-1">{whatsappControl}<button ref={clippingButton} type="button" onClick={onOpenClipping} aria-label={language === 'hi' ? 'खबर साझा करें' : 'Share story'} aria-expanded={Boolean(clippingControl)} aria-controls="story-sharing-panel" className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"><Share2 className="h-5 w-5" /></button></div>
      </div>
      <div data-story-reading-bar className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-zinc-200 px-3 py-1 dark:border-zinc-800">
      <div className="min-w-[120px] flex-1 basis-[120px] overflow-hidden">
        <p id="publication-story-preview-context" title={`${issueTitle} · Page ${story.pageNumber}`} className="truncate text-xs text-zinc-500 dark:text-zinc-400">{issueContext || issueTitle} · {language === 'hi' ? 'पृष्ठ' : 'Page'} {story.pageNumber}</p>
        <h2 id="publication-story-preview-title" title={story.title} className="line-clamp-2 text-sm font-semibold">{story.title || (language === 'hi' ? 'खबर' : 'Story')}</h2>
      </div>
      <div className="flex max-w-full shrink-0 items-center gap-1 overflow-x-auto text-xs" aria-label={language === 'hi' ? 'खबर पढ़ने के विकल्प' : 'Story reading options'}>
        {hasReleasedText ? <button type="button" aria-pressed={view === 'visual'} onClick={() => setView('visual')} className="reader-focus-ring min-h-11 shrink-0 rounded-lg px-3 aria-pressed:bg-red-50 aria-pressed:text-red-700 dark:aria-pressed:bg-red-950">{language === 'hi' ? 'विजुअल' : 'Visual'}</button> : null}
        {hasReleasedText ? <button type="button" aria-pressed={view === 'text'} onClick={() => setView('text')} className="reader-focus-ring min-h-11 shrink-0 rounded-lg px-3 aria-pressed:bg-red-50 aria-pressed:text-red-700 dark:aria-pressed:bg-red-950">{language === 'hi' ? 'टेक्स्ट' : 'Text'}</button> : null}
        {view === 'visual' && pageImagePath ? <button type="button" aria-pressed={fullPage} onClick={() => setFullPage(value => !value)} className="reader-focus-ring min-h-11 shrink-0 rounded-lg px-3">{fullPage ? (language === 'hi' ? 'खबर क्लिपिंग' : 'Story Crop') : (language === 'hi' ? 'पूरा पृष्ठ' : 'Full Page')}</button> : null}
        {canListen && onPlayAudio ? <button type="button" disabled={isPreparingAudio} aria-label={isPlayingAudio ? (language === 'hi' ? 'ऑडियो रोकें' : 'Pause audio') : (language === 'hi' ? 'खबर सुनें' : 'Listen to story')} onClick={() => isPlayingAudio ? onPauseAudio?.() : onPlayAudio()} className="reader-focus-ring min-h-11 shrink-0 rounded-lg px-3 disabled:opacity-50">{isPreparingAudio ? (language === 'hi' ? 'तैयार हो रहा है…' : 'Preparing…') : isPlayingAudio ? (language === 'hi' ? 'रोकें' : 'Pause') : (language === 'hi' ? 'सुनें' : 'Listen')}</button> : null}
        {view === 'text' ? <><button type="button" aria-label={language === 'hi' ? 'अक्षर का आकार घटाएं' : 'Decrease text size'} disabled={textScale <= .85} onClick={() => setTextScale(value => Math.max(.85, value - .15))} className="reader-focus-ring min-h-11 shrink-0 px-3 disabled:opacity-40">A−</button><button type="button" aria-label={language === 'hi' ? 'अक्षर का आकार बढ़ाएं' : 'Increase text size'} disabled={textScale >= 1.6} onClick={() => setTextScale(value => Math.min(1.6, value + .15))} className="reader-focus-ring min-h-11 shrink-0 px-3 disabled:opacity-40">A+</button></> : null}
        <div ref={setZoomToolbar} className="shrink-0" />
        {hasReleasedText && articlePath ? <Link href={articlePath} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {}); }} className="reader-focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-red-700 px-3 font-semibold text-white hover:bg-red-800">{language === 'hi' ? 'पूरी खबर पढ़ें' : 'Read full story'}<ArrowRight className="h-4 w-4" /></Link> : null}
      </div>
      </div>
      {clippingControl ? <div className="absolute inset-0 z-10" onClick={event => { if (event.target === event.currentTarget) onCloseClipping?.(); }}><div id="story-sharing-panel" className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-auto rounded-t-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-16 sm:w-72 sm:rounded-xl">{clippingControl}</div></div> : null}
      {audioError ? <p role="status" className="shrink-0 px-3 py-1 text-sm text-red-700 dark:text-red-300">{audioError}</p> : null}
      {view === 'visual' ? <EPaperStoryImageViewport key={fullPage ? 'page' : 'crop'} story={story} pageImagePath={pageImagePath} language={language} fullPage={fullPage} controlsTarget={zoomToolbar} /> : <div role="region" aria-label={language === 'hi' ? 'जारी खबर का टेक्स्ट' : 'Released story text'} tabIndex={0} className="reader-focus-ring min-h-0 flex-1 overflow-y-auto p-5"><div className="mx-auto max-w-3xl whitespace-pre-line leading-relaxed" style={{fontSize: `${18 * textScale}px`}}>{text}</div></div>}
    </div>
  </div>;
}
