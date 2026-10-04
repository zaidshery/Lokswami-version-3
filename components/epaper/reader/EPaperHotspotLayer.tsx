'use client';

import React, { memo } from 'react';
import type { EPaperArticleRecord } from '@/lib/types/epaper';
import { epaperHotspotStyle } from '@/lib/utils/epaperHotspotGeometry';

export interface EPaperHotspotLayerProps {
  articles: EPaperArticleRecord[];
  activeStoryId?: string | null;
  onSelectStory: (article: EPaperArticleRecord) => void;
  visible?: boolean;
  showHints?: boolean;
  className?: string;
}

/**
 * EPaperHotspotLayer: Renders interactive SVG/HTML bounding boxes over the newspaper page.
 * Provides tap-to-read triggers, hover highlight effects, and story title tooltips.
 */
function EPaperHotspotLayerComponent({
  articles = [],
  activeStoryId,
  onSelectStory,
  visible = true,
  showHints = false,
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
            tabIndex={articles.length > 8 ? -1 : 0}
            title={article.title}
            className={`group pointer-events-auto cursor-pointer rounded-sm border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-500/80 ${
              isActive ? 'border-red-600 bg-red-600/[0.06] ring-1 ring-red-500'
                : showHints ? 'border-red-500/30 bg-red-500/[0.02] hover:border-red-600 hover:bg-red-500/[0.04] focus-visible:border-red-600 focus-visible:bg-red-500/[0.04]'
                  : 'border-transparent bg-transparent hover:border-red-600/60 hover:bg-red-500/[0.04] focus-visible:border-red-600 focus-visible:bg-red-500/[0.04]'
            }`}
          >
            {/* Visual indicator badge on hover or when active */}
            <span
              className="absolute bottom-1 right-1 hidden rounded bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:inline-block group-focus-visible:inline-block"
            >
              Read story
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const EPaperHotspotLayer = memo(EPaperHotspotLayerComponent);
export default EPaperHotspotLayer;
