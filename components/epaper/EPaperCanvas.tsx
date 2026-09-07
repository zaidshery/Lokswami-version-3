'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import EPaperTextLayer, { type TextLayerItem } from './EPaperTextLayer';
import EPaperHotspotLayer from './EPaperHotspotLayer';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

export interface EPaperCanvasProps {
  imagePath: string;
  pageNumber: number;
  pageWidth?: number;
  pageHeight?: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  onZoomChange: (newZoom: number) => void;
  articles?: EPaperArticleRecord[];
  activeStoryId?: string | null;
  onSelectStory?: (article: EPaperArticleRecord) => void;
  textLayerItems?: TextLayerItem[];
  showTextLayer?: boolean;
  showHotspots?: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  className?: string;
  children?: ReactNode;
}

/**
 * EPaperCanvas: High-performance interactive newspaper canvas.
 * Delivers razor-sharp 500% deep-zoom, inertial pan, multi-touch pinch-to-zoom,
 * and seamlessly aligned text & hotspot layers.
 */
export default function EPaperCanvas({
  imagePath,
  pageNumber,
  pageWidth = 3000,
  pageHeight = 4200,
  zoom,
  minZoom = 1,
  maxZoom = 5,
  onZoomChange,
  articles = [],
  activeStoryId,
  onSelectStory,
  textLayerItems = [],
  showTextLayer = true,
  showHotspots = true,
  onNextPage,
  onPrevPage,
  className = '',
  children,
}: EPaperCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialPan, setInitialPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Touch pinch tracking
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    midpoint: { x: number; y: number };
    isPinching: boolean;
  }>({
    startDist: 0,
    startZoom: 1,
    midpoint: { x: 0, y: 0 },
    isPinching: false,
  });

  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  // Reset pan when zoom resets to 1
  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Reset loading states when page image changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setPan({ x: 0, y: 0 });
  }, [imagePath, pageNumber]);

  // Mouse Drag to Pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1 || e.button !== 0) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialPan({ ...pan });
    },
    [zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || zoom <= 1) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPan({
        x: initialPan.x + dx,
        y: initialPan.y + dy,
      });
    },
    [isDragging, zoom, dragStart, initialPan]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse Wheel Zoom
  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (e.ctrlKey || e.metaKey || zoom > 1) {
        e.preventDefault();
        const delta = e.deltaY * -0.005;
        const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom + delta));
        onZoomChange(Number(nextZoom.toFixed(2)));
      }
    },
    [zoom, minZoom, maxZoom, onZoomChange]
  );

  // Touch handlers: Pinch zoom & Pan
  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch start
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        pinchRef.current = {
          startDist: dist,
          startZoom: zoom,
          midpoint: {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
          },
          isPinching: true,
        };
      } else if (e.touches.length === 1) {
        // Single touch: double tap detection or pan start
        const touch = e.touches[0];
        const now = Date.now();
        const last = lastTapRef.current;
        const timeDiff = now - last.time;
        const distDiff = Math.hypot(touch.clientX - last.x, touch.clientY - last.y);

        if (timeDiff < 300 && distDiff < 30) {
          // Double Tap: Toggle between 1x and 2.5x
          const nextZoom = zoom > 1.2 ? 1 : 2.5;
          onZoomChange(nextZoom);
          lastTapRef.current = { time: 0, x: 0, y: 0 };
        } else {
          lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
          if (zoom > 1) {
            setIsDragging(true);
            setDragStart({ x: touch.clientX, y: touch.clientY });
            setInitialPan({ ...pan });
          }
        }
      }
    },
    [zoom, pan, onZoomChange]
  );

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current.isPinching) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const scale = dist / pinchRef.current.startDist;
        const newZoom = Math.min(
          maxZoom,
          Math.max(minZoom, pinchRef.current.startZoom * scale)
        );
        onZoomChange(Number(newZoom.toFixed(2)));
      } else if (e.touches.length === 1 && isDragging && zoom > 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - dragStart.x;
        const dy = touch.clientY - dragStart.y;
        setPan({
          x: initialPan.x + dx,
          y: initialPan.y + dy,
        });
      }
    },
    [isDragging, zoom, dragStart, initialPan, minZoom, maxZoom, onZoomChange]
  );

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current.isPinching = false;
      }
      if (e.touches.length === 0) {
        setIsDragging(false);
      }
    },
    []
  );

  return (
    <div
      ref={containerRef}
      data-epaper-canvas="true"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative flex h-full w-full select-none items-center justify-center overflow-hidden bg-zinc-900/95 ${
        zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      } ${className}`}
      style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}
    >
      {/* Loading Spinner */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-zinc-900/80 text-zinc-300">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <span className="text-xs font-medium tracking-wide text-zinc-400">Loading Page {pageNumber}...</span>
        </div>
      )}

      {/* Main Transform Container */}
      <div
        ref={contentRef}
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging || pinchRef.current.isPinching ? 'none' : 'transform 0.15s ease-out',
          willChange: 'transform',
        }}
        className="relative max-h-full max-w-full origin-center shadow-2xl"
      >
        {/* Newspaper Page Image */}
        <div className="relative overflow-hidden bg-white shadow-lg">
          <img
            src={imagePath}
            alt={`E-Paper Page ${pageNumber}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageLoaded(true);
              setImageError(true);
            }}
            className={`block max-h-[86vh] w-auto max-w-full object-contain ${
              zoom >= 2.5 ? 'image-crisp' : ''
            }`}
            style={{
              imageRendering: zoom >= 2.5 ? 'crisp-edges' : 'auto',
            }}
            draggable={false}
          />

          {/* Selectable Text Layer */}
          {showTextLayer && (
            <EPaperTextLayer
              items={textLayerItems}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              visible={imageLoaded}
            />
          )}

          {/* Clickable Hotspots Layer */}
          {showHotspots && onSelectStory && (
            <EPaperHotspotLayer
              articles={articles}
              activeStoryId={activeStoryId}
              onSelectStory={onSelectStory}
              visible={imageLoaded}
            />
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
