'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ReaderPageTurn = {
  page: number;
  direction: 1 | -1;
  image: string;
  secondImage?: string;
  srcSet?: string;
  secondSrcSet?: string;
  sizes?: string;
  phase: 'loading' | 'turning';
};

/** Keep settled page/history authoritative until the leaf finishes turning. */
export function useEPaperPageTurn(identity: string) {
  const [turn, setTurn] = useState<ReaderPageTurn | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    if (timer.current) clearTimeout(timer.current);
    finish.current = null;
    setTurn(null);
  }, []);
  useEffect(() => { cancel(); return cancel; }, [identity, cancel]);

  const start = useCallback((input: Omit<ReaderPageTurn, 'phase'>, commit: () => void) => {
    if (busy.current) return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { commit(); return true; }
    busy.current = true;
    const token = ++generation.current;
    setTurn({ ...input, phase: 'loading' });
    const preload = (src?: string, srcSet?: string) => new Promise<void>(resolve => {
      if (!src) { resolve(); return; }
      const image = new Image();
      let finished = false;
      const timeout = setTimeout(done, 1500);
      function done() { if (finished) return; finished = true; clearTimeout(timeout); image.onload = null; image.onerror = null; resolve(); }
      const decoded = () => {
        if (typeof image.decode === 'function') void image.decode().catch(() => {}).then(done);
        else done();
      };
      image.onload = decoded; image.onerror = done;
      if (input.sizes) image.sizes = input.sizes;
      if (srcSet) image.srcset = srcSet;
      image.src = src;
      if (image.complete) { if (image.naturalWidth) decoded(); else done(); }
    });
    void Promise.all([preload(input.image, input.srcSet), preload(input.secondImage, input.secondSrcSet)]).then(() => {
      if (generation.current !== token) return;
      // Paint the existing loading phase before inserting the animated image
      // layers, rather than doing image preparation in the input's frame.
      requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation.current !== token) return;
      setTurn({ ...input, phase: 'turning' });
      finish.current = () => {
        if (generation.current !== token) return;
        generation.current += 1;
        if (timer.current) clearTimeout(timer.current);
        commit();
        busy.current = false;
        finish.current = null;
        setTurn(null);
      };
      // Animationend owns normal completion; keep a bounded recovery for a
      // browser that drops that event (for example during a visibility change).
      timer.current = setTimeout(() => finish.current?.(), 800);
      }));
    });
    return true;
  }, []);
  const complete = useCallback(() => finish.current?.(), []);
  return { turn, start, cancel, complete };
}
