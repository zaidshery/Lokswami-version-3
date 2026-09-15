'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import Container from '@/components/layout/Container';
import { type BreakingNewsItem } from '@/lib/types/breaking';
import styles from './BreakingNews.module.css';
import { useBreakingNewsController } from './useBreakingNewsController';

interface BreakingNewsProps {
  items?: BreakingNewsItem[];
  news?: BreakingNewsItem[];
  speedSeconds?: number;
  pauseOnHover?: boolean;
  showTime?: boolean;
}

function formatHeadlineTime(value: string | undefined, language: 'hi' | 'en') {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function buildItemHref(item: BreakingNewsItem) {
  const explicit = (item.href || '').trim();
  if (explicit) return explicit;
  return `/main/article/${encodeURIComponent(item.id)}`;
}

export default function BreakingNews({
  items,
  news,
  speedSeconds,
  pauseOnHover = true,
  showTime = false,
}: BreakingNewsProps) {
  const { language } = useAppStore();
  const {
    currentIndex,
    isLoading,
    isPlaying,
    isPreparingAudio,
    queue,
    soundEnabled,
    toggleSound,
    ttsAvailable,
    visibleItem,
  } = useBreakingNewsController({
    items,
    news,
    preferredLanguage: language,
  });

  const marqueeItems = useMemo(() => {
    if (queue.length) return queue;
    if (visibleItem) return [visibleItem];
    return [];
  }, [queue, visibleItem]);

  const queueProgressLabel =
    queue.length > 1
      ? `${String(currentIndex + 1).padStart(2, '0')}/${String(queue.length).padStart(2, '0')}`
      : '';

  const computedDurationSeconds = useMemo(() => {
    const totalCharacters = marqueeItems.reduce((sum, item) => {
      return sum + item.title.length + (item.city?.length || 0) + (item.category?.length || 0);
    }, 0);

    if (Number.isFinite(speedSeconds) && typeof speedSeconds === 'number') {
      return Math.max(20, Math.min(150, speedSeconds));
    }

    return Math.max(28, Math.min(80, Math.round(totalCharacters * 0.28)));
  }, [marqueeItems, speedSeconds]);

  const buttonTitle = isPreparingAudio
    ? 'Preparing breaking news voice'
    : soundEnabled
      ? 'Disable breaking news voice'
      : ttsAvailable === false
        ? 'Breaking news voice is unavailable'
        : 'Enable breaking news voice';

  if (!visibleItem && !isLoading) {
    return null;
  }

  const renderMarqueeSequence = (keyPrefix: string, ariaHidden = false) =>
    marqueeItems.map((item, index) => {
      const titleText = `${item.city ? `${item.city}: ` : ''}${item.title}`;
      const timeLabel = showTime ? formatHeadlineTime(item.createdAt, language) : '';
      const categoryLabel = (item.category || '').trim();
      const isActive = currentIndex === index;

      return (
        <span
          key={`${keyPrefix}-${item.id}-${index}`}
          className={`${styles.marqueeEntry} ${isActive ? styles.marqueeEntryActive : ''}`}
          aria-hidden={ariaHidden}
        >
          {categoryLabel ? <span className={styles.categoryPill}>{categoryLabel}</span> : null}
          {timeLabel ? <span className={styles.timeLabel}>{timeLabel}</span> : null}
          <Link
            href={buildItemHref(item)}
            className={`${styles.marqueeLink} ${isActive ? styles.marqueeLinkActive : ''}`}
          >
            <span className={styles.marqueeTitle}>{titleText}</span>
          </Link>
          <span className={styles.marqueeSeparator} aria-hidden="true">
            *
          </span>
        </span>
      );
    });

  return (
    <div
      className="relative z-[45] w-full bg-gradient-to-r from-[#7f1116] via-[#97131a] to-[#7f1116] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(0,0,0,0.28),0_8px_24px_rgba(0,0,0,0.22)]"
      role="region"
      aria-label={language === 'hi' ? 'Breaking news' : 'Breaking News'}
    >
      <Container>
        <div className="flex h-11 items-center gap-2 md:h-12 md:gap-3">
          <div className="flex h-full items-center">
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} />
              LIVE
            </span>
          </div>

          <div className="min-w-0 flex-1" suppressHydrationWarning>
            {marqueeItems.length > 0 ? (
              <div className={styles.inlineShell}>
                <span className="sr-only" aria-live="polite" aria-atomic="true">
                  {visibleItem ? `${visibleItem.city ? `${visibleItem.city}: ` : ''}${visibleItem.title}` : ''}
                </span>
                <div
                  className={`${styles.marqueeViewport} ${pauseOnHover ? styles.pausable : ''}`}
                  style={{ ['--marquee-duration' as string]: `${computedDurationSeconds}s` }}
                >
                  <div className={`${styles.marqueeTrack} ${styles.marqueeAnimate}`}>
                    <div className={styles.marqueeSequence}>{renderMarqueeSequence('primary')}</div>
                    <div className={styles.marqueeSequence} aria-hidden="true">
                      {renderMarqueeSequence('repeat', true)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.inlineShell}>
                <div className={styles.marqueeStatic}>
                  <span className={styles.marqueeEntry}>
                    <span className={styles.marqueeTitle}>
                      {language === 'hi' ? 'ताज़ा समाचार लोड हो रहे हैं...' : 'Loading latest updates...'}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {queueProgressLabel ? (
            <span className="hidden text-[11px] font-semibold text-white/70 sm:inline">
              {queueProgressLabel}
            </span>
          ) : null}

          <button
            type="button"
            onClick={toggleSound}
            className="editorial-focus-ring flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={ttsAvailable === false || isPreparingAudio}
            aria-label={buttonTitle}
            aria-pressed={soundEnabled}
            aria-busy={isPreparingAudio}
            title={buttonTitle}
          >
            <span className="sr-only">
              {isPreparingAudio
                ? 'Preparing breaking news voice'
                : isPlaying
                  ? 'Breaking news voice is playing'
                  : soundEnabled
                    ? 'Breaking news voice is enabled'
                    : 'Breaking news voice is disabled'}
            </span>
            {isPreparingAudio ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </Container>
    </div>
  );
}
