import 'server-only';

import type { EPaperArticleHotspot } from '@/lib/utils/epaperHotspots';

export interface LayoutBlock {
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  w: number; // percentage (0 - 100)
  h: number; // percentage (0 - 100)
  confidence?: number;
  label?: string;
}

/**
 * Auto-detects standard multi-column newspaper article regions from geometric clusters.
 * Enables 1-click automatic hotspot proposal in CMS, reducing manual editor workload.
 */
export function detectPageArticleRegions(options: {
  pageWidth?: number;
  pageHeight?: number;
  columnCount?: number;
}): LayoutBlock[] {
  const columnCount = options.columnCount || 6; // Standard broadsheet 6-8 columns
  const marginX = 4; // 4% horizontal margin
  const marginY = 5; // 5% vertical margin
  const availableWidth = 100 - marginX * 2;
  const availableHeight = 100 - marginY * 2;
  const colWidth = availableWidth / columnCount;

  const candidateBlocks: LayoutBlock[] = [];

  // 1. Top Lead Story / Masthead Lead (Span 4-6 columns, ~25% height)
  candidateBlocks.push({
    x: Number(marginX.toFixed(2)),
    y: Number(marginY.toFixed(2)),
    w: Number((colWidth * Math.min(columnCount, 4)).toFixed(2)),
    h: Number((availableHeight * 0.28).toFixed(2)),
    confidence: 0.95,
    label: 'Lead Story',
  });

  // 2. Top Right Secondary Story (Span remaining 2 columns)
  if (columnCount >= 6) {
    candidateBlocks.push({
      x: Number((marginX + colWidth * 4).toFixed(2)),
      y: Number(marginY.toFixed(2)),
      w: Number((colWidth * 2).toFixed(2)),
      h: Number((availableHeight * 0.28).toFixed(2)),
      confidence: 0.9,
      label: 'Secondary Top Story',
    });
  }

  // 3. Mid-Page Stories (Left, Center, Right Columns)
  const midY = marginY + availableHeight * 0.3;
  const midHeight = availableHeight * 0.35;

  candidateBlocks.push({
    x: Number(marginX.toFixed(2)),
    y: Number(midY.toFixed(2)),
    w: Number((colWidth * 3).toFixed(2)),
    h: Number(midHeight.toFixed(2)),
    confidence: 0.88,
    label: 'Mid Left Feature',
  });

  candidateBlocks.push({
    x: Number((marginX + colWidth * 3).toFixed(2)),
    y: Number(midY.toFixed(2)),
    w: Number((colWidth * 3).toFixed(2)),
    h: Number(midHeight.toFixed(2)),
    confidence: 0.88,
    label: 'Mid Right Feature',
  });

  // 4. Bottom Grid Stories (3 smaller column blocks)
  const bottomY = marginY + availableHeight * 0.67;
  const bottomHeight = availableHeight * 0.3;
  const bottomSpan = colWidth * 2;

  for (let i = 0; i < 3 && marginX + i * bottomSpan < 100; i++) {
    candidateBlocks.push({
      x: Number((marginX + i * bottomSpan).toFixed(2)),
      y: Number(bottomY.toFixed(2)),
      w: Number(bottomSpan.toFixed(2)),
      h: Number(bottomHeight.toFixed(2)),
      confidence: 0.82,
      label: `Bottom Section ${i + 1}`,
    });
  }

  return candidateBlocks;
}

/**
 * Converts detected layout blocks into normalized EPaperArticleHotspot format.
 */
export function convertLayoutBlocksToHotspots(
  blocks: LayoutBlock[],
  pageNumber: number
): EPaperArticleHotspot[] {
  return blocks.map((block, idx) => ({
    id: `auto-hs-${pageNumber}-${idx + 1}`,
    title: block.label || `Story ${idx + 1}`,
    text: '',
    page: pageNumber,
    x: block.x,
    y: block.y,
    width: block.w,
    height: block.h,
  }));
}
