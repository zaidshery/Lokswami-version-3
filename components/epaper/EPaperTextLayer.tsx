'use client';

import React, { useMemo } from 'react';

export interface TextLayerItem {
  id: string;
  text: string;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  width: number; // percentage (0 - 100)
  height: number; // percentage (0 - 100)
  fontSize?: number; // approximate font size in px
}

export interface EPaperTextLayerProps {
  items?: TextLayerItem[];
  pageWidth: number;
  pageHeight: number;
  visible?: boolean;
  className?: string;
}

/**
 * Renders an invisible, precisely aligned DOM text layer over the newspaper canvas.
 * Enables native cursor selection, text copy-paste, screen reader accessibility,
 * and in-page browser search (Ctrl+F).
 */
export default function EPaperTextLayer({
  items = [],
  pageWidth,
  pageHeight,
  visible = true,
  className = '',
}: EPaperTextLayerProps) {
  const renderedItems = useMemo(() => {
    if (!items || items.length === 0) return null;

    return items.map((item, idx) => {
      const topPct = `${item.y}%`;
      const leftPct = `${item.x}%`;
      const widthPct = `${item.width}%`;
      const heightPct = `${item.height}%`;

      return (
        <span
          key={item.id || `text-item-${idx}`}
          style={{
            position: 'absolute',
            top: topPct,
            left: leftPct,
            width: widthPct,
            height: heightPct,
            fontSize: item.fontSize ? `${item.fontSize}px` : 'inherit',
            lineHeight: '1.15',
            color: 'transparent',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            cursor: 'text',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            pointerEvents: 'auto',
          }}
          className="select-text selection:bg-orange-500/30 selection:text-zinc-900 dark:selection:text-zinc-100"
          aria-hidden={false}
        >
          {item.text}
        </span>
      );
    });
  }, [items]);

  if (!visible || !renderedItems) return null;

  return (
    <div
      data-epaper-layer="text"
      className={`pointer-events-none absolute inset-0 z-20 overflow-hidden leading-none ${className}`}
      style={{ width: '100%', height: '100%' }}
      aria-label="Selectable page text layer"
    >
      {renderedItems}
    </div>
  );
}
