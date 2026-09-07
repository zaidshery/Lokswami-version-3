'use client';

import React from 'react';
import type { EPaperArticleRecord } from '@/lib/types/epaper';
import { epaperHotspotStyle } from '@/lib/utils/epaperHotspotGeometry';

export interface EPaperHotspotLayerProps {
  articles: EPaperArticleRecord[];
  activeStoryId?: string | null;
  onSelectStory: (article: EPaperArticleRecord) => void;
  visible?: boolean;
  className?: string;
}

/**
 * Interactive Hotspot Layer overlaid on the newspaper canvas.
 * Highlights mapped stories, handles hover focus, and triggers article view on tap/click.
 */
export default function EPaperHotspotLayer({
  articles = [],
  activeStoryId,
  onSelectStory,
  visible = true,
  className = '',
}: EPaperHotspotLayerProps) {
  if (!visible || articles.length === 0) return null;

  return (
    <div
      data-epaper-layer="hotspots"
      className={`pointer-events-none absolute inset-0 z-30 overflow-hidden ${className}`}
      style={{ width: '100%', height: '100%' }}
    >
      {articles.map((article) => {
        const { hotspot } = article;
        const position = epaperHotspotStyle(hotspot);
        if (!position) return null;

        const isActive = activeStoryId === article._id || activeStoryId === article.slug;

        return (
          <button
            key={article._id}
            type="button"
            data-hotspot-id={article._id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectStory(article);
            }}
            style={{
              position: 'absolute',
              ...position,
            }}
            aria-label={`Read story: ${article.title}`}
            title={article.title}
            className={`group pointer-events-auto cursor-pointer rounded-sm border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/80 ${
              isActive
                ? 'border-orange-500 bg-orange-500/25 shadow-[0_0_12px_rgba(249,115,22,0.45)]'
                : 'border-transparent bg-transparent hover:border-orange-400/80 hover:bg-orange-500/15'
            }`}
          >
            {/* Visual indicator badge on hover / active */}
            <span
              className={`absolute bottom-1 right-1 hidden rounded bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm transition-opacity group-hover:inline-block ${
                isActive ? 'inline-block bg-orange-600' : ''
              }`}
            >
              Read
            </span>
          </button>
        );
      })}
    </div>
  );
}
