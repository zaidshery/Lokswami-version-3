'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

/** Independent crop gestures never navigate the publication underneath the dialog. */
export default function EPaperStoryImageViewport({ story, pageImagePath, language, fullPage = false, controlsTarget }: {
  story: EPaperArticleRecord; pageImagePath?: string; language: 'en' | 'hi'; fullPage?: boolean; controlsTarget?: HTMLElement | null;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const [failedCrop, setFailedCrop] = useState(false);
  const [failedPage, setFailedPage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [touchControls, setTouchControls] = useState(false);
  const [zoomControlsExpanded, setZoomControlsExpanded] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(pointer: coarse) and (hover: none)');
    const update = () => { setTouchControls(media.matches); setZoomControlsExpanded(false); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const transform = useRef({ x: 0, y: 0, zoom: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ distance: 0, moved: false, pinched: false });
  const lastTap = useRef({ time: 0, x: 0, y: 0 });
  const lastInput = useRef('mouse');
  const crop = Boolean(story.coverImagePath && !failedCrop && !fullPage);
  const available = crop || Boolean(pageImagePath && !failedPage);
  const width = Math.max(1, Math.min(bounds.width - 32, (bounds.height - 32) * ratio));
  const height = width / ratio;

  function apply(x: number, y: number, scale: number) {
    const next = Math.max(1, Math.min(8, scale));
    const limitX = Math.max(0, (width * next - bounds.width) / 2);
    const limitY = Math.max(0, (height * next - bounds.height) / 2);
    transform.current = { x: Math.max(-limitX, Math.min(limitX, x)), y: Math.max(-limitY, Math.min(limitY, y)), zoom: next };
    if (image.current) image.current.style.transform = `translate(${transform.current.x}px, ${transform.current.y}px) scale(${next})`;
    setZoom(next);
  }
  function zoomAt(scale: number, clientX?: number, clientY?: number) {
    const box = viewport.current?.getBoundingClientRect();
    const state = transform.current;
    const next = Math.max(1, Math.min(8, scale));
    const factor = next / state.zoom;
    const anchorX = box && clientX !== undefined ? clientX - box.left - box.width / 2 : 0;
    const anchorY = box && clientY !== undefined ? clientY - box.top - box.height / 2 : 0;
    apply(anchorX - (anchorX - state.x) * factor, anchorY - (anchorY - state.y) * factor, next);
  }
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setBounds({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAtRef.current(transform.current.zoom * Math.exp(-event.deltaY * .002), event.clientX, event.clientY);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => { observer?.disconnect(); node.removeEventListener('wheel', wheel); };
  }, []);
  useEffect(() => {
    transform.current = { x: 0, y: 0, zoom: 1 };
    if (image.current) image.current.style.transform = 'translate(0px, 0px) scale(1)';
    setZoom(1);
  }, [bounds.width, bounds.height, crop, fullPage]);

  const controls = <div role="group" aria-label="Image zoom controls" className="flex shrink-0 items-center gap-1">
    {(!touchControls || zoomControlsExpanded) ? <button type="button" aria-label="Zoom out story image" disabled={zoom <= 1 || !available} onClick={() => zoomAt(zoom - .5)} className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-40"><Minus size={20} /></button> : null}
    {touchControls ? <button type="button" aria-label={zoomControlsExpanded ? 'Hide zoom controls' : 'Show zoom controls'} aria-expanded={zoomControlsExpanded} onClick={() => setZoomControlsExpanded(value => !value)} className="reader-focus-ring flex h-11 min-w-14 items-center justify-center rounded-lg px-2 hover:bg-zinc-200 dark:hover:bg-zinc-800"><output aria-label="Story image zoom" className="text-sm tabular-nums">{Math.round(zoom * 100)}%</output></button> : <output aria-label="Story image zoom" className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</output>}
    {(!touchControls || zoomControlsExpanded) ? <button type="button" aria-label="Zoom in story image" disabled={zoom >= 8 || !available} onClick={() => zoomAt(zoom + .5)} className="reader-focus-ring flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-40"><Plus size={20} /></button> : null}
    <button type="button" aria-label="Fit story image" onClick={() => apply(0, 0, 1)} className="reader-focus-ring flex h-11 items-center gap-2 rounded-lg px-3 text-sm"><RotateCcw size={18} />{language === 'hi' ? 'फिट' : 'Fit'}</button>
  </div>;

  return <div className="flex min-h-0 flex-1 flex-col">
    {controlsTarget ? createPortal(controls, controlsTarget) : <div className="flex shrink-0 justify-center border-b border-zinc-200 p-2 dark:border-zinc-800">{controls}</div>}
    <div ref={viewport} role="region" aria-label={fullPage ? 'Released story page' : 'Released story crop'} tabIndex={0}
      className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 dark:bg-zinc-900"
      style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
      onKeyDown={event => {
        const state = transform.current;
        if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (event.key === '0') apply(0, 0, 1);
          else if (event.key === '-' || event.key === '+' || event.key === '=') zoomAt(state.zoom + (event.key === '-' ? -.5 : .5));
          else apply(state.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0), state.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0), state.zoom);
        }
      }}
      onDoubleClick={event => { if (lastInput.current !== 'touch') zoomAt(zoom < 2 ? 2 : zoom < 4 ? 4 : 1, event.clientX, event.clientY); }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        lastInput.current = event.pointerType;
        // Programmatically dispatched events do not own a browser pointer to capture.
        if (event.nativeEvent.isTrusted) event.currentTarget.setPointerCapture?.(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 1) gesture.current = { distance: 0, moved: false, pinched: false };
        if (pointers.current.size === 2) {
          const [a, b] = Array.from(pointers.current.values());
          gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y);
          gesture.current.pinched = true;
        }
      }}
      onPointerMove={event => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) gesture.current.moved = true;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size >= 2) {
          const [a, b] = Array.from(pointers.current.values());
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (gesture.current.distance > 0) zoomAt(transform.current.zoom * distance / gesture.current.distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
          gesture.current.distance = distance;
        } else if (transform.current.zoom > 1) apply(transform.current.x + dx, transform.current.y + dy, transform.current.zoom);
      }}
      onPointerUp={event => {
        pointers.current.delete(event.pointerId);
        if (event.pointerType === 'touch' && !gesture.current.moved && !gesture.current.pinched) {
          const now = Date.now();
          if (now - lastTap.current.time < 300 && Math.hypot(event.clientX - lastTap.current.x, event.clientY - lastTap.current.y) < 24) {
            zoomAt(transform.current.zoom < 2 ? 2 : transform.current.zoom < 4 ? 4 : 1, event.clientX, event.clientY);
            lastTap.current.time = 0;
          } else lastTap.current = { time: now, x: event.clientX, y: event.clientY };
        }
      }}
      onPointerCancel={event => { pointers.current.delete(event.pointerId); gesture.current.pinched = true; }}>
      {available ? <div ref={image} style={{ width, height, flexShrink: 0 }} className="relative overflow-hidden bg-white shadow-xl">
        <div data-story-page-crop={!crop || undefined} className="relative h-full w-full overflow-hidden">
          <img key={crop ? story.coverImagePath : pageImagePath} draggable={false} src={crop ? story.coverImagePath : pageImagePath} alt={`Story crop: ${story.title}`}
            onLoad={event => { const node = event.currentTarget; setRatio(node.naturalWidth / node.naturalHeight * (crop || fullPage ? 1 : story.hotspot.w / story.hotspot.h)); setLoaded(true); }}
            onError={() => { setLoaded(false); if (crop) setFailedCrop(true); else setFailedPage(true); }}
            style={crop || fullPage ? { width: '100%', height: '100%', objectFit: 'contain' } : { position: 'absolute', width: `${100 / story.hotspot.w}%`, maxWidth: 'none', left: `${-100 * story.hotspot.x / story.hotspot.w}%`, top: `${-100 * story.hotspot.y / story.hotspot.h}%` }} />
        </div>
      </div> : <p role="status">{language === 'hi' ? 'खबर की तस्वीर उपलब्ध नहीं है।' : 'Story image unavailable.'}</p>}
      {available && !loaded ? <span className="pointer-events-none absolute text-sm text-zinc-500">{language === 'hi' ? 'तस्वीर लोड हो रही है…' : 'Loading story image…'}</span> : null}
    </div>
  </div>;
}
