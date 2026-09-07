'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Loader2, Newspaper, Minus, Plus, RotateCcw } from 'lucide-react';
import EPaperHotspotLayer from './EPaperHotspotLayer';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

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
  className?: string;
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
  maxZoom = 6,
  onZoomChange,
  articles = [],
  activeStoryId,
  onSelectStory = () => {},
  showHotspots = true,
  onNextPage,
  onPrevPage,
  className = '',
  isSpreadMode = false,
  spreadSecondImagePath,
  spreadSecondPageNumber,
  spreadSecondArticles = [],
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

  const [loadedSource, setLoadedSource] = useState('');
  const [failedSource, setFailedSource] = useState('');
  const [secondLoadedSource, setSecondLoadedSource] = useState('');
  const imageLoaded = loadedSource === imagePath && Boolean(imagePath);
  const imageError = failedSource === imagePath && Boolean(imagePath);
  const gesture = useRef({ x: 0, y: 0, suppressClick: false });

  // Apply pan transform directly to content element via CSS transform for 60fps gesture rendering
  const applyTransform = useCallback((x: number, y: number, currentZoom: number) => {
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
  }, [zoom, imagePath, applyTransform]);

  useEffect(() => {
    return () => {
      if (swipeResetTimerRef.current !== null) {
        window.clearTimeout(swipeResetTimerRef.current);
      }
    };
  }, []);

  const resetSwipeTransform = useCallback(() => {
    if (swipeResetTimerRef.current !== null) {
      window.clearTimeout(swipeResetTimerRef.current);
    }

    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
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
    if (zoom <= 1) return;
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
    if (!isDraggingRef.current || zoom <= 1) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    applyTransform(newX, newY, zoom);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (contentRef.current) {
      contentRef.current.style.willChange = 'auto';
    }
  };

  // Touch handlers with pinch-to-zoom and pan
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
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
      const timeDiff = now - lastTapRef.current.time;
      const dist = Math.hypot(
        touch.clientX - lastTapRef.current.x,
        touch.clientY - lastTapRef.current.y
      );

      if (timeDiff < 300 && dist < 30) {
        // Multi-stage Double Tap: 1x -> 3x -> 5.5x -> 1x
        let nextZoom = 1;
        let targetX = 0;
        let targetY = 0;
        if (zoom < 2.5) {
          nextZoom = 3;
        } else if (zoom < 4.5) {
          nextZoom = Math.min(maxZoom, 5.5);
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
    if (e.touches.length === 2 && pinchRef.current.isPinching) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / pinchRef.current.startDist;
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
        applyTransform(deltaX * 0.72, 0, 1);
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

        if (horizontalIntent && (clearsDistance || clearsVelocity)) {
          const exitDistance = Math.max(56, (containerRef.current?.clientWidth || 320) * 0.16);
          if (contentRef.current) {
            contentRef.current.style.transition = 'transform 120ms ease-out';
          }
          applyTransform(deltaX < 0 ? -exitDistance : exitDistance, 0, 1);
          if (deltaX < 0) {
            onNextPage?.();
          } else {
            onPrevPage?.();
          }
        }
        resetSwipeTransform();
        lastTapRef.current = { time: 0, x: 0, y: 0 };
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
    resetSwipeTransform();
  };

  return (
    <main
      ref={containerRef}
      onPointerDownCapture={(event) => {
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
        if (event.detail !== 0 && gesture.current.suppressClick) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      aria-label="Newspaper page canvas viewport"
      className={`relative flex-1 overflow-hidden select-none bg-zinc-100 dark:bg-zinc-900 touch-none flex items-center justify-center p-3 sm:p-5 ${
        zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      } ${className}`}
    >
      <div
        ref={contentRef}
        className="relative flex items-center justify-center transition-[transform] duration-75 origin-center"
        style={{
          transform: `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoom})`,
        }}
      >
        {/* Spread View or Single Page */}
        <div className={`flex items-center gap-1 ${isSpreadMode ? 'flex-row' : ''}`}>
          {/* Primary Page */}
          <div
            className="relative overflow-hidden bg-white shadow-2xl rounded-xs ring-1 ring-black/20 dark:ring-white/10"
            style={{
              maxHeight: 'calc(100dvh - 225px)',
              maxWidth: isSpreadMode ? '47vw' : '92vw',
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
                  maxHeight: 'calc(100dvh - 225px)',
                  imageRendering: zoom >= 2 ? '-webkit-optimize-contrast' : 'auto',
                  WebkitFontSmoothing: 'antialiased',
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                <Newspaper className="h-12 w-12 text-zinc-400" />
              </div>
            )}

            {/* Hotspots Layer */}
            {imageLoaded ? (
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
              className="relative overflow-hidden bg-white shadow-2xl rounded-xs ring-1 ring-black/20 dark:ring-white/10"
              style={{
                maxHeight: 'calc(100dvh - 225px)',
                maxWidth: '47vw',
              }}
            >
              <img
                src={spreadSecondImagePath}
                alt={`Page ${spreadSecondPageNumber}`}
                onLoad={() => setSecondLoadedSource(spreadSecondImagePath)}
                className="block h-auto w-auto max-w-full pointer-events-none select-none transition-[image-rendering]"
                style={{
                  maxHeight: 'calc(100dvh - 225px)',
                  imageRendering: zoom >= 2 ? '-webkit-optimize-contrast' : 'auto',
                  WebkitFontSmoothing: 'antialiased',
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
              {secondLoadedSource === spreadSecondImagePath ? (
                <EPaperHotspotLayer
                  articles={spreadSecondArticles}
                  activeStoryId={activeStoryId}
                  onSelectStory={onSelectStory}
                  showHints={showHotspots}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile Floating Quick Zoom Controls */}
      <div
        className="sm:hidden absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-black/80 px-3.5 py-1.5 backdrop-blur-md border border-white/20 text-white shadow-2xl"
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
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const nextZoom = zoom < 2.5 ? 3 : zoom < 4.5 ? Math.min(maxZoom, 5.5) : 1;
            onZoomChange?.(nextZoom);
            applyTransform(nextZoom === 1 ? 0 : panRef.current.x, nextZoom === 1 ? 0 : panRef.current.y, nextZoom);
          }}
          className="px-2 py-0.5 text-xs font-bold tracking-wider text-white hover:text-orange-400 active:scale-95 transition"
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
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition disabled:opacity-30 disabled:pointer-events-none"
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
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition"
            aria-label="Reset zoom"
            title="Reset to 100%"
          >
            <RotateCcw className="h-3 w-3 text-orange-400" />
          </button>
        )}
      </div>
    </main>
  );
}

export const EPaperCanvasViewport = memo(EPaperCanvasViewportComponent);
export default EPaperCanvasViewport;
