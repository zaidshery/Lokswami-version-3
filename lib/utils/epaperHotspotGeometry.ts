import type { EPaperArticleHotspot } from '@/lib/types/epaper';

/** Domain coordinates are fractions; legacy stores convert at their adapter. */
export function isValidEpaperHotspot(box: EPaperArticleHotspot | null | undefined): box is EPaperArticleHotspot {
  return Boolean(box && [box.x, box.y, box.w, box.h].every(Number.isFinite) &&
    box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0 &&
    box.x + box.w <= 1.000001 && box.y + box.h <= 1.000001);
}

export function epaperHotspotStyle(box: EPaperArticleHotspot) {
  if (!isValidEpaperHotspot(box)) return null;
  return { top: `${box.y * 100}%`, left: `${box.x * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` };
}
