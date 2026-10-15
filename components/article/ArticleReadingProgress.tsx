'use client';

import { useEffect, useRef, type RefObject } from 'react';

export default function ArticleReadingProgress({ regionRef, articleId, onProgress }: {
  regionRef: RefObject<HTMLElement | null>;
  articleId: string;
  onProgress?: (percent: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const region = regionRef.current;
    const bar = barRef.current;
    if (!region || !bar) return;
    let frame: number | null = null;
    let previousPercent = -1;
    let hasScrolled = false;
    bar.style.transform = 'scaleX(0)';

    const measure = () => {
      frame = null;
      const scrollTop = window.scrollY;
      const rect = region.getBoundingClientRect();
      const start = rect.top + scrollTop;
      const distance = Math.max(1, rect.height - window.innerHeight);
      const percent = Math.min(100, Math.max(0, (scrollTop - start) / distance * 100));
      bar.style.transform = `scaleX(${percent / 100})`;
      // Analytics can observe progress without rerendering the reading view.
      const rounded = Math.round(percent);
      // A restored scroll position on a different story must not immediately
      // count as a read of that story. Visual progress still restores normally.
      if ((hasScrolled || rounded === 0) && rounded !== previousPercent) {
        previousPercent = rounded;
        onProgress?.(rounded);
      }
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };
    const handleScroll = () => { hasScrolled = true; schedule(); };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(region);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', schedule);
    region.addEventListener('load', schedule, true);
    schedule();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', schedule);
      region.removeEventListener('load', schedule, true);
    };
  }, [articleId, regionRef, onProgress]);

  return (
    <div data-article-reading-progress aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1">
      <div ref={barRef} className="h-full origin-left bg-red-600" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}
