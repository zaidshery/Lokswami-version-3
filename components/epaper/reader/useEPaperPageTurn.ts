'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ReaderPageTurn = {
  page: number;
  direction: 1 | -1;
  image: string;
  secondImage?: string;
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
    const preload = (src?: string) => new Promise<void>(resolve => {
      if (!src) { resolve(); return; }
      const image = new Image();
      const timeout = setTimeout(done, 1500);
      function done() { clearTimeout(timeout); image.onload = null; image.onerror = null; resolve(); }
      image.onload = done; image.onerror = done; image.src = src;
      if (image.complete) done();
    });
    void Promise.all([preload(input.image), preload(input.secondImage)]).then(() => {
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
    });
    return true;
  }, []);
  const complete = useCallback(() => finish.current?.(), []);
  return { turn, start, cancel, complete };
}
