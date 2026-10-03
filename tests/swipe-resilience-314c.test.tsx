import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SwipeFeed from '@/components/swipe/SwipeFeed';
import useSwipeAnalytics from '@/components/swipe/useSwipeAnalytics';
import type { SwipeFeedItem } from '@/components/swipe/types';
import { trackClientEvent } from '@/lib/analytics/trackClient';

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: vi.fn(),
}));

function createShortItem(index: number): SwipeFeedItem {
  return {
    _id: `short-${index}`,
    slug: `short-slug-${index}`,
    articleId: '',
    title: `Short title ${index}`,
    description: `Description ${index}`,
    thumbnail: `/thumb-${index}.jpg`,
    posterUrl: `/poster-${index}.jpg`,
    videoUrl: `https://example.com/short-${index}.mp4`,
    playbackUrl: `https://example.com/short-${index}.mp4`,
    hlsUrl: '',
    mediaProvider: 'spaces-mp4',
    aspectRatio: '9:16',
    captionUrl: '',
    transcript: '',
    processingStatus: 'ready',
    instagramUrl: '',
    youtubeUrl: '',
    duration: 30,
    category: 'General',
    isShort: true,
    isPublished: true,
    shortsRank: index,
    views: 10,
    createdAt: '2026-09-01T09:00:00.000Z',
    publishedAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

describe('SwipeFeed 3.14C Resilience & Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('renders offline pill indicator when network goes offline and removes when online', () => {
    render(
      <SwipeFeed
        initialItems={[createShortItem(1), createShortItem(2)]}
        initialArticle={null}
        initialHasMore={false}
        initialNextCursor={null}
      />
    );

    expect(screen.queryByText(/इंटरनेट कनेक्शन नहीं है \(ऑफ़लाइन\)/i)).not.toBeInTheDocument();

    // Trigger offline
    act(() => {
      fireEvent(window, new Event('offline'));
    });
    expect(screen.getByText(/इंटरनेट कनेक्शन नहीं है \(ऑफ़लाइन\)/i)).toBeInTheDocument();

    // Trigger online
    act(() => {
      fireEvent(window, new Event('online'));
    });
    expect(screen.queryByText(/इंटरनेट कनेक्शन नहीं है \(ऑफ़लाइन\)/i)).not.toBeInTheDocument();
  });

  it('pauses playback on document background and resumes if not manually paused', () => {
    const { container } = render(
      <SwipeFeed
        initialItems={[createShortItem(1), createShortItem(2)]}
        initialArticle={null}
        initialHasMore={false}
        initialNextCursor={null}
      />
    );

    const video = container.querySelector('video')!;
    expect(video).toBeInTheDocument();

    // Background tab
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      fireEvent(document, new Event('visibilitychange'));
    });

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    // Foreground tab
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      fireEvent(document, new Event('visibilitychange'));
    });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('preserves manual pause across document visibility changes', async () => {
    render(
      <SwipeFeed
        initialItems={[createShortItem(1), createShortItem(2)]}
        initialArticle={null}
        initialHasMore={false}
        initialNextCursor={null}
      />
    );

    // Manually pause using Space key
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });

    const playCallsBefore = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;

    // Background tab
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      fireEvent(document, new Event('visibilitychange'));
    });

    // Foreground tab
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      fireEvent(document, new Event('visibilitychange'));
    });

    // play() should NOT have been called again because user explicitly manually paused!
    const playCallsAfter = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    expect(playCallsAfter).toBe(playCallsBefore);
  });

  it('detects Data Saver from navigator.connection.saveData when no stored preference exists', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });

    render(
      <SwipeFeed
        initialItems={[createShortItem(1)]}
        initialArticle={null}
        initialHasMore={false}
        initialNextCursor={null}
      />
    );

    const settingsButton = screen.getByRole('button', {
      name: 'Open Swipe settings. Data Saver is on',
    });
    expect(settingsButton).toBeInTheDocument();
  });

  it('applies stored autoplay=false preference to the initial story', () => {
    window.localStorage.setItem('lokswami.swipe.autoplay.v1', 'false');

    render(
      <SwipeFeed
        initialItems={[createShortItem(1)]}
        initialArticle={null}
        initialHasMore={false}
        initialNextCursor={null}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Video paused.');
  });

  it('drives Swipe watch milestones from confirmed onProgress rather than synthetic timer', () => {
    const item = createShortItem(10);
    item.duration = 40;
    const { result } = renderHook(() =>
      useSwipeAnalytics({
        activeItem: item,
        paused: false,
        playbackStarted: true,
      })
    );

    // Initial state does not fire watch_25
    expect(trackClientEvent).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'watch_25' }));

    // Progress 10s (25% of 40s) via onProgress ticks
    for (let t = 1; t <= 10; t++) {
      act(() => {
        result.current.onProgress(t, 40);
      });
    }

    expect(trackClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'watch_25',
        metadata: expect.objectContaining({ videoId: item._id }),
      })
    );
  });
});
