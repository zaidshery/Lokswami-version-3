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
  showHints = true,
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
            onMouseEnter={() => {
              if (typeof window !== 'undefined' && article.epaperId && article._id) {
                const preloader = new window.Image();
                preloader.src = `/api/epapers/${encodeURIComponent(article.epaperId)}/articles/${encodeURIComponent(article._id)}/share-image?publicationType=epaper&brand=1${article.releaseVersion ? `&v=${article.releaseVersion}` : ''}`;
              }
            }}
            style={{
              position: 'absolute',
              ...position,
            }}
            aria-label={`Read story: ${article.title}`}
            title={article.title}
            className={`group pointer-events-auto cursor-pointer rounded-sm border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-500/80 ${
              !showHints ? 'border-transparent bg-transparent' : isActive
                ? 'border-red-600 bg-red-600/25 shadow-[0_0_12px_rgba(220,38,38,0.45)] ring-2 ring-red-500'
                : 'border-red-500/30 bg-red-500/[0.04] hover:border-red-600 hover:bg-red-500/20 hover:shadow-md'
            }`}
          >
            {/* Visual indicator badge on hover or when active */}
            {showHints ? <span
              className={`absolute bottom-1 right-1 hidden rounded bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm transition-opacity group-hover:inline-block ${
                isActive ? 'inline-block bg-orange-600' : ''
              }`}
            >
              Read
            </span> : null}
          </button>
        );
      })}
    </div>
  );
}

export const EPaperHotspotLayer = memo(EPaperHotspotLayerComponent);
export default EPaperHotspotLayer;
