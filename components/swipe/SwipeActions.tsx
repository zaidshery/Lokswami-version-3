'use client';

import { BookOpen, Settings, Share2, Volume2, VolumeX } from 'lucide-react';
import type { RefObject } from 'react';

type SwipeActionsProps = {
  muted: boolean;
  dataSaver: boolean;
  hasArticle: boolean;
  articleButtonRef: RefObject<HTMLButtonElement>;
  settingsButtonRef: RefObject<HTMLButtonElement>;
  onToggleMuted: () => void;
  onOpenSettings: () => void;
  onShare: () => void;
  onOpenArticle: () => void;
};

const actionClass =
  'reader-focus-ring flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95';

export default function SwipeActions({
  muted,
  dataSaver,
  hasArticle,
  articleButtonRef,
  settingsButtonRef,
  onToggleMuted,
  onOpenSettings,
  onShare,
  onOpenArticle,
}: SwipeActionsProps) {
  return (
    <>
      <div className="absolute bottom-[calc(var(--reader-bottom-nav-space)+7.5rem)] right-3 z-30 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-2 backdrop-blur-md">
        <button type="button" className={actionClass} onClick={onToggleMuted} aria-label={muted ? 'Unmute video' : 'Mute video'}>
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <button type="button" className={actionClass} onClick={onShare} aria-label="Share this Swipe story">
          <Share2 className="h-5 w-5" />
        </button>
        <button
          ref={settingsButtonRef}
          type="button"
          className={`${actionClass} ${dataSaver ? 'border border-emerald-400 text-emerald-300' : ''}`}
          onClick={onOpenSettings}
          aria-label={`Open Swipe settings. Data Saver is ${dataSaver ? 'on' : 'off'}`}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {hasArticle ? (
        <button
          ref={articleButtonRef}
          type="button"
          onClick={onOpenArticle}
          className="reader-focus-ring absolute bottom-[calc(var(--reader-bottom-nav-space)+1rem)] left-4 z-30 flex min-h-[40px] items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-semibold text-white shadow-lg"
        >
          <BookOpen className="h-4 w-4" />
          पूरी खबर पढ़ें
        </button>
      ) : null}
    </>
  );
}
