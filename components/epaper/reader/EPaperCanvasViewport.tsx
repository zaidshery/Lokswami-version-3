'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Newspaper, Minus, Plus, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './reader.module.css';
import EPaperHotspotLayer from './EPaperHotspotLayer';
import type { EPaperArticleRecord } from '@/lib/types/epaper';
import type { ReaderPageTurn } from './useEPaperPageTurn';

const PAGE_SWIPE_MIN_DISTANCE_PX = 36;
const PAGE_SWIPE_MIN_VELOCITY_PX_MS = 0.20;

export interface EPaperCanvasViewportProps {
  imagePath: string;
  pageNumber: number;
  pageWidth?: number;
  pageHeight?: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  onZoomChange?: (newZoom: number) => void;
  articles?: EPaperArticleRecord[];
  activeStoryId?: string | null;
  onSelectStory?: (article: EPaperArticleRecord) => void;
  showHotspots?: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  className?: string;
  pageTurn?: ReaderPageTurn | null;
  onTurnComplete?: () => void;
  // Spread view support
  isSpreadMode?: boolean;
  spreadSecondImagePath?: string;
  spreadSecondPageNumber?: number;
  spreadSecondArticles?: EPaperArticleRecord[];
}

/**
 * EPaperCanvasViewport: High-performance interactive newspaper canvas.
 * Encapsulates pan & pinch gesture coordinates inside useRef to avoid full component tree re-renders on coordinate shifts.
 */
function EPaperCanvasViewportComponent({
  imagePath,
  pageNumber,
  zoom,
  minZoom = 1,
  maxZoom = 4,
  onZoomChange,
  articles = [],
  activeStoryId,
  onSelectStory = () => {},
  showHotspots = true,
  onNextPage,
  onPrevPage,
  canGoPrevious = true,
  canGoNext = true,
  className = '',
  isSpreadMode = false,
  spreadSecondImagePath,
  spreadSecondPageNumber,
  spreadSecondArticles = [],
  pageTurn,
  onTurnComplete,
}: EPaperCanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Gesture coordinate state encapsulated inside useRef to avoid rendering cascades
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    isPinching: boolean;
  }>({
    startDist: 0,
    startZoom: 1,
    isPinching: false,
  });
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });
  const pageSwipeRef = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    startedAt: 0,
    tracking: false,
  });
  const swipeResetTimerRef = useRef<number | null>(null);
  const storyTapTimerRef = useRef<number | null>(null);
  const lastInputRef = useRef('mouse');
  const mouseVerticalRef = useRef(0);

  const [loadedSource, setLoadedSource] = useState('');
  const [failedSource, setFailedSource] = useState('');
  const [secondLoadedSource, setSecondLoadedSource] = useState('');
  const [secondFailedSource, setSecondFailedSource] = useState('');
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const imageLoaded = loadedSource === imagePath && Boolean(imagePath);
  const imageError = failedSource === imagePath && Boolean(imagePath);
  const gesture = useRef({ x: 0, y: 0, suppressClick: false });
  // The content box already excludes CSS padding; reserve only the page-stack shadow.
  const pageMaxHeight = bounds.height ? Math.max(1, bounds.height - 8) : 'calc(100dvh - 280px)';
  const pageMaxWidth = bounds.width ? Math.max(1, (bounds.width - 8 - (isSpreadMode ? 1 : 0)) / (isSpreadMode ? 2 : 1)) : (isSpreadMode ? '43vw' : '92vw');

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Apply pan transform directly to content element via CSS transform for 60fps gesture rendering
  const applyTransform = useCallback((x: number, y: number, currentZoom: number) => {
    const content = contentRef.current;
    const viewport = containerRef.current;
    if (currentZoom > 1 && content?.offsetWidth && viewport?.clientWidth) {
      const limitX = Math.max(0, (content.offsetWidth * currentZoom - viewport.clientWidth) / 2 + 24);
      const limitY = Math.max(0, (content.offsetHeight * currentZoom - viewport.clientHeight) / 2 + 48);
      x = Math.min(limitX, Math.max(-limitX, x));
      y = Math.min(limitY, Math.max(-limitY, y));
    }
    panRef.current = { x, y };
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${currentZoom})`;
    }
  }, []);

  // Reset pan on source replacement, while preserving the controlled zoom value.
  const previousSource = useRef(imagePath);
  useEffect(() => {
    if (zoom <= 1 || previousSource.current !== imagePath) {
      applyTransform(0, 0, Math.max(1, zoom));
    } else {
      applyTransform(panRef.current.x, panRef.current.y, zoom);
    }
    previousSource.current = imagePath;
  }, [zoom, imagePath, applyTransform, bounds.width, bounds.height]);

  useEffect(() => {
    return () => {
      if (storyTapTimerRef.current !== null) window.clearTimeout(storyTapTimerRef.current);
      if (swipeResetTimerRef.current !== null) {
        window.clearTimeout(swipeResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (storyTapTimerRef.current !== null) window.clearTimeout(storyTapTimerRef.current);
  }, [imagePath]);

  const resetSwipeTransform = useCallback(() => {
    if (swipeResetTimerRef.current !== null) {
      window.clearTimeout(swipeResetTimerRef.current);
    }

    if (contentRef.current) {
      contentRef.current.style.transition = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'none' : 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
    }
    applyTransform(0, 0, 1);
    swipeResetTimerRef.current = window.setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.style.transition = '';
      }
      swipeResetTimerRef.current = null;
    }, 170);
  }, [applyTransform]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (pageTurn) return;
    if (zoom <= 1 && e.button === 0 && !(e.target as HTMLElement).closest('button:not([data-hotspot-id])') && (e.target as HTMLElement).closest('[data-reader-page]')) {
      mouseVerticalRef.current = 0;
      pageSwipeRef.current = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, startedAt: Date.now(), tracking: true };
      return;
    }
    if (zoom <= 1 || e.button !== 0 || (e.target as HTMLElement).closest('button:not([data-hotspot-id])')) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - panRef.current.x,
      y: e.clientY - panRef.current.y,
    };
    if (contentRef.current) {
      contentRef.current.style.willChange = 'transform';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (pageSwipeRef.current.tracking && zoom <= 1) {
      mouseVerticalRef.current = e.clientY - pageSwipeRef.current.startY;
      if (Math.hypot(e.clientX - pageSwipeRef.current.startX, e.clientY - pageSwipeRef.current.startY) > 8) gesture.current.suppressClick = true;
      pageSwipeRef.current.lastX = e.clientX;
      return;
    }
    if (!isDraggingRef.current || zoom <= 1) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    if (Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 8) gesture.current.suppressClick = true;
    applyTransform(newX, newY, zoom);
  };

  const handleMouseUp = () => {
    const swipe = pageSwipeRef.current;
    if (swipe.tracking && zoom <= 1 && !pageTurn) {
      const distance = swipe.lastX - swipe.startX;
      if (Math.abs(distance) >= 50 && Math.abs(distance) > Math.abs(mouseVerticalRef.current) * 1.05) {
        gesture.current.suppressClick = true;
        if (distance < 0 && canGoNext) onNextPage?.();
        if (distance > 0 && canGoPrevious) onPrevPage?.();
      }
      swipe.tracking = false;
    }
    isDraggingRef.current = false;
    if (contentRef.current) {
      contentRef.current.style.willChange = 'auto';
    }
  };

  // Touch handlers with pinch-to-zoom and pan
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (pageTurn) return;
    lastInputRef.current = 'touch';
    if (storyTapTimerRef.current !== null) window.clearTimeout(storyTapTimerRef.current);
    if ((e.target as HTMLElement).closest('button:not([data-hotspot-id])')) return;
    if (e.touches.length === 2) {
      pageSwipeRef.current.tracking = false;
      lastTapRef.current = { time: 0, x: 0, y: 0 };
      gesture.current.suppressClick = true;
      // 2-finger pinch gesture
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchRef.current = {
        startDist: dist,
        startZoom: zoom,
        isPinching: true,
      };
      if (contentRef.current) {
        contentRef.current.style.willChange = 'transform';
      }
    } else if (e.touches.length === 1) {
      // 1-finger pan or double-tap check
      const now = Date.now();
      const touch = e.touches[0];
      gesture.current.suppressClick = false;
      gesture.current.x = touch.clientX;
      gesture.current.y = touch.clientY;
      const timeDiff = now - lastTapRef.current.time;
      const dist = Math.hypot(
        touch.clientX - lastTapRef.current.x,
        touch.clientY - lastTapRef.current.y
      );

      if (timeDiff < 300 && dist < 30) {
        pageSwipeRef.current.tracking = false;
        gesture.current.suppressClick = true;
        // Double tap: fitted page -> 2x -> 4x -> fitted page.
        let nextZoom = 1;
        let targetX = 0;
        let targetY = 0;
        if (zoom < 1.9) {
          nextZoom = 2;
        } else if (zoom < 3.9) {
          nextZoom = Math.min(maxZoom, 4);
        } else {
          nextZoom = 1;
        }

        if (nextZoom > 1 && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const offsetX = touch.clientX - rect.left - centerX;
          const offsetY = touch.clientY - rect.top - centerY;
          targetX = -offsetX * (nextZoom - 1) * 0.5;
          targetY = -offsetY * (nextZoom - 1) * 0.5;
        }

        onZoomChange?.(nextZoom);
        applyTransform(targetX, targetY, nextZoom);
        if (contentRef.current) {
          contentRef.current.style.willChange = 'auto';
        }
        lastTapRef.current = { time: 0, x: 0, y: 0 };
        return;
      }

      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

      if (zoom > 1) {
        isDraggingRef.current = true;
        dragStartRef.current = {
          x: touch.clientX - panRef.current.x,
          y: touch.clientY - panRef.current.y,
        };
        if (contentRef.current) {
          contentRef.current.style.willChange = 'transform';
        }
      } else {
        pageSwipeRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          startedAt: now,
          tracking: true,
        };
        if (contentRef.current) {
          contentRef.current.style.transition = 'none';
          contentRef.current.style.willChange = 'transform';
        }
      }
    }
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 1 && Math.hypot(e.touches[0].clientX - gesture.current.x, e.touches[0].clientY - gesture.current.y) > 8) gesture.current.suppressClick = true;
    if (e.touches.length === 2 && pinchRef.current.isPinching) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / Math.max(1, pinchRef.current.startDist);
      const newZoom = Math.min(
        maxZoom,
        Math.max(minZoom, pinchRef.current.startZoom * scale)
      );
      onZoomChange?.(newZoom);
      applyTransform(panRef.current.x, panRef.current.y, newZoom);
    } else if (e.touches.length === 1 && isDraggingRef.current && zoom > 1) {
      const touch = e.touches[0];
      const newX = touch.clientX - dragStartRef.current.x;
      const newY = touch.clientY - dragStartRef.current.y;
      applyTransform(newX, newY, zoom);
    } else if (e.touches.length === 1 && pageSwipeRef.current.tracking && zoom <= 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - pageSwipeRef.current.startX;
      const deltaY = touch.clientY - pageSwipeRef.current.startY;

      // Only cancel horizontal swipe if movement is predominantly vertical with significant displacement
      if (Math.abs(deltaY) > 36 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
        pageSwipeRef.current.tracking = false;
        resetSwipeTransform();
        return;
      }

      if (Math.abs(deltaX) > 6) {
        e.preventDefault();
        gesture.current.suppressClick = true;
        pageSwipeRef.current.lastX = touch.clientX;
      }
    }
  };

  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current.isPinching = false;
    }
    if (e.touches.length === 0) {
      isDraggingRef.current = false;
      const swipe = pageSwipeRef.current;
      if (swipe.tracking && zoom <= 1) {
        const endTouch = e.changedTouches[0];
        const endX = endTouch?.clientX ?? swipe.lastX;
        const endY = endTouch?.clientY ?? swipe.startY;
        const deltaX = endX - swipe.startX;
        const deltaY = endY - swipe.startY;
        const elapsed = Math.max(1, Date.now() - swipe.startedAt);
        const horizontalIntent = Math.abs(deltaX) > Math.abs(deltaY) * 1.05;
        const clearsDistance = Math.abs(deltaX) >= PAGE_SWIPE_MIN_DISTANCE_PX;
        const clearsVelocity = Math.abs(deltaX) / elapsed >= PAGE_SWIPE_MIN_VELOCITY_PX_MS;

        if (horizontalIntent && Math.abs(deltaX) > 12 && (clearsDistance || clearsVelocity)) {
          if (deltaX < 0) {
            if (canGoNext) onNextPage?.();
          } else {
            if (canGoPrevious) onPrevPage?.();
          }
        }
        resetSwipeTransform();
        if (Math.hypot(deltaX, deltaY) > 8) lastTapRef.current = { time: 0, x: 0, y: 0 };
      }
      pageSwipeRef.current.tracking = false;
      if (contentRef.current) {
        contentRef.current.style.willChange = 'auto';
      }
    }
  };

  const handleTouchCancel = () => {
    pinchRef.current.isPinching = false;
    isDraggingRef.current = false;
    pageSwipeRef.current.tracking = false;
    if (zoom > 1) applyTransform(panRef.current.x, panRef.current.y, zoom);
    else resetSwipeTransform();
  };

  return (
    <main
      ref={containerRef}
      onPointerDownCapture={(event) => {
        lastInputRef.current = event.pointerType;
        if (!event.isPrimary && event.pointerType === 'touch') {
          gesture.current.suppressClick = true;
          return;
        }
        gesture.current = { x: event.clientX, y: event.clientY, suppressClick: false };
      }}
      onPointerMoveCapture={(event) => {
        if (event.buttons && Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 8) {
          gesture.current.suppressClick = true;
        }
      }}
      onClickCapture={(event) => {
        if (pageTurn) { event.preventDefault(); event.stopPropagation(); return; }
        if (event.detail !== 0 && gesture.current.suppressClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const hotspot = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hotspot-id]');
        if (event.detail !== 0 && lastInputRef.current === 'touch' && hotspot) {
          event.preventDefault();
          event.stopPropagation();
          // Defer the first touch tap so a second tap can select a zoom preset.
          storyTapTimerRef.current = window.setTimeout(() => {
            storyTapTimerRef.current = null;
            if (hotspot.isConnected && !gesture.current.suppressClick) {
              hotspot.focus({ preventScroll: true });
              hotspot.click();
            }
          }, 300);
        }
      }}
      onMouseDown={handleMouseDown}
      onClick={(event) => {
        if (zoom > 1 || lastInputRef.current === 'touch' || (event.target as HTMLElement).closest('button, a') || pageTurn) return;
        const book = (event.target as HTMLElement).closest<HTMLElement>('[data-reader-book]');
        if (!book) return;
        const box = book.getBoundingClientRect();
        const edge = Math.min(44, box.width * .1);
        if (event.clientX >= box.right - edge && canGoNext) onNextPage?.();
        else if (event.clientX <= box.left + edge && canGoPrevious) onPrevPage?.();
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { pageSwipeRef.current.tracking = false; handleMouseUp(); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      aria-label="Newspaper page canvas viewport"
      tabIndex={0}
      data-reader-canvas="true"
      aria-busy={Boolean(pageTurn)}
      className={`${styles.canvas} ${styles.controls} relative min-h-0 flex-1 overflow-hidden select-none bg-zinc-100 dark:bg-zinc-900 touch-none flex items-center justify-center px-3 pb-16 pt-3 sm:px-16 sm:py-6 ${
        zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      } ${className}`}
    >
      <div
        ref={contentRef}
        className="relative flex items-center justify-center origin-center"
        style={{
          transform: `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoom})`,
        }}
      >
        {/* Spread View or Single Page */}
        <div data-reader-book className={`${styles.book} ${isSpreadMode ? styles.spread : ''} flex items-center gap-px`}>
          {/* Primary Page */}
          <div
            data-reader-page={pageNumber}
            className={`${styles.page} relative overflow-hidden bg-white ring-1 ring-black/10`}
            style={{
              maxHeight: pageMaxHeight,
              maxWidth: pageMaxWidth,
            }}
          >
            {imagePath && !imageError ? (
              <img
                src={imagePath}
                alt={`Page ${pageNumber}`}
                onLoad={() => setLoadedSource(imagePath)}
                onError={() => setFailedSource(imagePath)}
                className="block h-auto w-auto max-w-full pointer-events-none select-none transition-[image-rendering]"
                style={{
                  maxHeight: pageMaxHeight,
                  imageRendering: zoom >= 2 ? '-webkit-optimize-contrast' : 'auto',
                  WebkitFontSmoothing: 'antialiased',
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            ) : (
              <div
                className="flex w-64 max-w-full flex-col items-center justify-center p-5 bg-zinc-100 dark:bg-zinc-800 text-center"
                role="alert"
                aria-label={`Page ${pageNumber} unavailable`}
              >
                <Newspaper className="h-12 w-12 text-zinc-400 dark:text-zinc-500 mb-2" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Page image unavailable
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[220px]">
                  Could not load page {pageNumber}. Please check your connection or retry.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFailedSource('');
                    setLoadedSource('');
                  }}
                  className="reader-focus-ring mt-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry page
                </button>
              </div>
            )}

            {/* Hotspots Layer */}
            {imageLoaded && !imageError && !pageTurn ? (
              <EPaperHotspotLayer
                articles={articles}
                activeStoryId={activeStoryId}
                onSelectStory={onSelectStory}
                showHints={showHotspots}
              />
            ) : null}
          </div>

          {/* Optional Second Page in Spread Mode */}
          {isSpreadMode && spreadSecondImagePath ? (
            <div
              data-reader-page={spreadSecondPageNumber}
              className={`${styles.page} relative overflow-hidden bg-white ring-1 ring-black/10`}
              style={{
                maxHeight: pageMaxHeight,
                maxWidth: pageMaxWidth,
              }}
            >
              {secondFailedSource === spreadSecondImagePath ? (
                <div role="alert" aria-label={`Page ${spreadSecondPageNumber} unavailable`} className="flex w-64 max-w-full flex-col items-center justify-center p-5 text-center text-zinc-700">
                  <Newspaper className="mb-2 h-10 w-10 text-zinc-400" />
                  <p className="text-sm">Page image unavailable</p>
                  <button type="button" onClick={() => { setSecondFailedSource(''); setSecondLoadedSource(''); }} className="reader-focus-ring mt-3 min-h-11 min-w-11 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold">Retry page {spreadSecondPageNumber}</button>
                </div>
              ) : <img
                src={spreadSecondImagePath}
                alt={`Page ${spreadSecondPageNumber}`}
                onLoad={() => setSecondLoadedSource(spreadSecondImagePath)}
                onError={() => setSecondFailedSource(spreadSecondImagePath)}
                className="block h-auto w-auto max-w-full pointer-events-none select-none transition-[image-rendering]"
                style={{
                  maxHeight: pageMaxHeight,
                  imageRendering: zoom >= 2 ? '-webkit-optimize-contrast' : 'auto',
                  WebkitFontSmoothing: 'antialiased',
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />}
              {secondLoadedSource === spreadSecondImagePath && secondFailedSource !== spreadSecondImagePath && !pageTurn ? (
                <EPaperHotspotLayer
                  articles={spreadSecondArticles}
                  activeStoryId={activeStoryId}
                  onSelectStory={onSelectStory}
                  showHints={showHotspots}
                />
              ) : null}
            </div>
          ) : null}
          {pageTurn?.phase === 'turning' ? <div aria-hidden="true" data-reader-turn={pageTurn.direction === 1 ? 'forward' : 'backward'} className={`${styles.turnStage} ${isSpreadMode ? styles.turnSpread : ''} ${pageTurn.direction === 1 ? styles.turnForward : styles.turnBackward}`}>
            <div className={styles.turnUnderlay}>{(isSpreadMode && pageTurn.direction === 1 ? pageTurn.secondImage : pageTurn.image) ? <img src={isSpreadMode && pageTurn.direction === 1 ? pageTurn.secondImage : pageTurn.image} alt="" draggable={false} /> : <span>Page image unavailable</span>}</div>
            <div className={styles.turnLeaf} data-turn-leaf onAnimationEnd={(event) => { if (event.target === event.currentTarget) onTurnComplete?.(); }}>
              <div className={styles.turnFront}><img src={isSpreadMode && pageTurn.direction === 1 ? spreadSecondImagePath : imagePath} alt="" draggable={false} /></div>
              <div className={styles.turnBack}>{(isSpreadMode && pageTurn.direction === -1 ? pageTurn.secondImage : pageTurn.image) ? <img src={isSpreadMode && pageTurn.direction === -1 ? pageTurn.secondImage : pageTurn.image} alt="" draggable={false} /> : <span>Page image unavailable</span>}</div>
            </div>
          </div> : null}
        </div>
      </div>

      {onPrevPage ? <button type="button" onClick={onPrevPage} disabled={!canGoPrevious} aria-label="Turn to previous page" className="absolute left-3 hidden h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-white/90 text-zinc-700 shadow-sm disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:flex"><ChevronLeft className="h-5 w-5" /></button> : null}
      {onNextPage ? <button type="button" onClick={onNextPage} disabled={!canGoNext} aria-label="Turn to next page" className="absolute right-3 hidden h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-white/90 text-zinc-700 shadow-sm disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:flex"><ChevronRight className="h-5 w-5" /></button> : null}

      {/* Mobile Floating Quick Zoom Controls */}
      <div
        className="sm:hidden absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 border border-white/20 text-white shadow-lg"
        data-testid="mobile-epaper-zoom-hud"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = Math.max(minZoom, Number((zoom - 0.5).toFixed(2)));
            onZoomChange?.(next);
            applyTransform(panRef.current.x, panRef.current.y, next);
          }}
          disabled={zoom <= minZoom}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const nextZoom = zoom < 1.9 ? 2 : zoom < 3.9 ? Math.min(maxZoom, 4) : 1;
            onZoomChange?.(nextZoom);
            applyTransform(nextZoom === 1 ? 0 : panRef.current.x, nextZoom === 1 ? 0 : panRef.current.y, nextZoom);
          }}
          className="min-h-11 px-2 text-xs font-bold tracking-wider text-white hover:text-red-300"
          aria-label="Toggle zoom preset"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = Math.min(maxZoom, Number((zoom + 0.5).toFixed(2)));
            onZoomChange?.(next);
            applyTransform(panRef.current.x, panRef.current.y, next);
          }}
          disabled={zoom >= maxZoom}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        {zoom > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoomChange?.(1);
              applyTransform(0, 0, 1);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Reset zoom"
            title="Reset to 100%"
          >
            <RotateCcw className="h-3 w-3 text-red-300" />
          </button>
        )}
      </div>
    </main>
  );
}

export const EPaperCanvasViewport = memo(EPaperCanvasViewportComponent);
export default EPaperCanvasViewport;
