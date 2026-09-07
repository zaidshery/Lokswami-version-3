'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { X } from 'lucide-react';

type SwipeSettingsSheetProps = {
  open: boolean;
  dataSaver: boolean;
  onDataSaverChange: (enabled: boolean) => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement>;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function SwipeSettingsSheet({
  open,
  dataSaver,
  onDataSaverChange,
  onClose,
  returnFocusRef,
}: SwipeSettingsSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose, open, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end bg-black/65"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swipe-settings-title"
        className="w-full rounded-t-[28px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 text-zinc-950 shadow-2xl dark:bg-zinc-950 dark:text-white"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="swipe-settings-title" className="text-xl font-extrabold">
              Swipe settings
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Control how much media is loaded while you browse.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="reader-focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10"
            aria-label="Close Swipe settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between gap-5 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <p className="font-bold">Data Saver</p>
            <p id="swipe-data-saver-help" className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
              Keep upcoming stories as posters until you open them.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dataSaver}
            aria-describedby="swipe-data-saver-help"
            onClick={() => onDataSaverChange(!dataSaver)}
            className={`reader-focus-ring relative h-11 w-16 shrink-0 rounded-full transition-colors ${
              dataSaver ? 'bg-emerald-600' : 'bg-zinc-400 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`absolute left-0 top-1.5 h-8 w-8 rounded-full bg-white shadow transition-transform ${
                dataSaver ? 'translate-x-6' : 'translate-x-1.5'
              }`}
            />
            <span className="sr-only">Data Saver</span>
          </button>
        </div>
      </div>
    </div>
  );
}
