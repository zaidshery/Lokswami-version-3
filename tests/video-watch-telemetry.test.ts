import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useVideoWatchTelemetry from '@/lib/analytics/useVideoWatchTelemetry';
import { trackClientEvent } from '@/lib/analytics/trackClient';

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: vi.fn(),
}));

describe('useVideoWatchTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
  });

  it('emits watch_start when playback starts with privacy-safe metadata', () => {
    const { result } = renderHook(() =>
      useVideoWatchTelemetry({
        contentId: 'vid-101',
        slug: 'slug-101',
        title: 'Title 101',
        contentType: 'video',
        mediaProvider: 'youtube',
        pagePath: '/main/videos?video=vid-101',
        source: 'lokswami_video_hub',
        duration: 100,
        isPlaying: true,
      })
    );

    act(() => {
      result.current.onPlay();
    });

    expect(trackClientEvent).toHaveBeenCalledTimes(1);
    expect(trackClientEvent).toHaveBeenCalledWith({
      event: 'watch_start',
      page: '/main/videos?video=vid-101',
      source: 'lokswami_video_hub',
      metadata: {
        videoId: 'vid-101',
        videoSlug: 'slug-101',
        videoTitle: 'Title 101',
        contentType: 'video',
        mediaProvider: 'youtube',
        duration: 100,
        watchedSeconds: 0,
      },
    });

    // Calling onPlay again should not fire duplicate watch_start
    act(() => {
      result.current.onPlay();
    });
    expect(trackClientEvent).toHaveBeenCalledTimes(1);
  });

  it('emits 25%, 50%, 75%, and complete milestones once during continuous playback', () => {
    const { result } = renderHook(() =>
      useVideoWatchTelemetry({
        contentId: 'vid-202',
        slug: 'slug-202',
        title: 'Title 202',
        contentType: 'video',
        mediaProvider: 'html5',
        pagePath: '/main/videos?video=vid-202',
        source: 'lokswami_video_hub',
        duration: 100,
        isPlaying: true,
      })
    );

    act(() => {
      result.current.onPlay();
    });

    // Simulate 1-second ticks up to 25s
    for (let t = 1; t <= 25; t++) {
      act(() => {
        result.current.onTimeUpdate(t, 100);
      });
    }

    const events25 = vi.mocked(trackClientEvent).mock.calls.map(([call]) => call.event);
    expect(events25).toContain('watch_start');
    expect(events25).toContain('watch_25');
    expect(events25).not.toContain('watch_50');

    // Simulate continuous ticks up to 50s
    for (let t = 26; t <= 50; t++) {
      act(() => {
        result.current.onTimeUpdate(t, 100);
      });
    }
    const events50 = vi.mocked(trackClientEvent).mock.calls.map(([call]) => call.event);
    expect(events50).toContain('watch_50');
    expect(events50).not.toContain('watch_75');

    // Simulate continuous ticks up to 75s
    for (let t = 51; t <= 75; t++) {
      act(() => {
        result.current.onTimeUpdate(t, 100);
      });
    }
    const events75 = vi.mocked(trackClientEvent).mock.calls.map(([call]) => call.event);
    expect(events75).toContain('watch_75');
    expect(events75).not.toContain('watch_complete');

    // Simulate continuous ticks up to 96s
    for (let t = 76; t <= 96; t++) {
      act(() => {
        result.current.onTimeUpdate(t, 100);
      });
    }
    const events96 = vi.mocked(trackClientEvent).mock.calls.map(([call]) => call.event);
    expect(events96).toContain('watch_complete');

    // Verify deduplication: duplicate time updates at 96s do not fire complete again
    act(() => {
      result.current.onTimeUpdate(96, 100);
    });
    const counts = vi.mocked(trackClientEvent).mock.calls.reduce<Record<string, number>>((acc, [call]) => {
      acc[call.event] = (acc[call.event] || 0) + 1;
      return acc;
    }, {});
    expect(counts['watch_start']).toBe(1);
    expect(counts['watch_25']).toBe(1);
    expect(counts['watch_50']).toBe(1);
    expect(counts['watch_75']).toBe(1);
    expect(counts['watch_complete']).toBe(1);
  });

  it('does NOT credit skipped milestones when user seeks forward', () => {
    const { result } = renderHook(() =>
      useVideoWatchTelemetry({
        contentId: 'vid-303',
        slug: 'slug-303',
        title: 'Title 303',
        contentType: 'video',
        mediaProvider: 'html5',
        pagePath: '/main/videos?video=vid-303',
        source: 'lokswami_video_hub',
        duration: 100,
        isPlaying: true,
      })
    );

    act(() => {
      result.current.onPlay();
      result.current.onTimeUpdate(1, 100);
      result.current.onTimeUpdate(2, 100);
    });

    // User seeks from 2s to 85s
    act(() => {
      result.current.onSeek();
      result.current.onTimeUpdate(85, 100);
    });

    // Accumulated watch time is only 2 seconds! Position is 85%, but watched is only 2s.
    // Milestones 25%, 50%, 75% MUST NOT be credited because user did not watch them!
    const events = vi.mocked(trackClientEvent).mock.calls.map(([call]) => call.event);
    expect(events).toEqual(['watch_start']);
    expect(result.current.getAccumulatedWatchTime()).toBe(2);
  });

  it('suspends watch time accumulation when document is hidden', () => {
    const { result } = renderHook(() =>
      useVideoWatchTelemetry({
        contentId: 'vid-404',
        slug: 'slug-404',
        title: 'Title 404',
        contentType: 'short',
        mediaProvider: 'youtube',
        pagePath: '/main/shorts/slug-404',
        source: 'lokswami_swipe',
        duration: 60,
        isPlaying: true,
      })
    );

    act(() => {
      result.current.onPlay();
      result.current.onTimeUpdate(1, 60);
      result.current.onTimeUpdate(2, 60);
    });
    expect(result.current.getAccumulatedWatchTime()).toBe(2);

    // Document is backgrounded
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Time ticks while hidden
    act(() => {
      result.current.onTimeUpdate(3, 60);
      result.current.onTimeUpdate(4, 60);
    });
    // Watch time should still be 2!
    expect(result.current.getAccumulatedWatchTime()).toBe(2);

    // Foreground restored
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      result.current.onTimeUpdate(5, 60);
    });
    // delta between 4 and 5 is 1s, so now 3
    expect(result.current.getAccumulatedWatchTime()).toBe(3);
  });

  it('resets milestone state when contentId changes', () => {
    let currentId = 'content-A';
    const { result, rerender } = renderHook(
      ({ id }) =>
        useVideoWatchTelemetry({
          contentId: id,
          slug: `${id}-slug`,
          title: `${id} Title`,
          contentType: 'video',
          mediaProvider: 'html5',
          pagePath: `/main/videos?video=${id}`,
          source: 'lokswami_video_hub',
          duration: 100,
          isPlaying: true,
        }),
      { initialProps: { id: currentId } }
    );

    act(() => {
      result.current.onPlay();
      for (let t = 1; t <= 30; t++) {
        result.current.onTimeUpdate(t, 100);
      }
    });

    const eventsA = vi.mocked(trackClientEvent).mock.calls.map(([call]) => call.event);
    expect(eventsA).toContain('watch_start');
    expect(eventsA).toContain('watch_25');

    // Switch to content-B
    currentId = 'content-B';
    rerender({ id: currentId });

    act(() => {
      result.current.onPlay();
    });

    const eventsB = vi.mocked(trackClientEvent).mock.calls.map(([call]) => ({
      event: call.event,
      id: call.metadata?.videoId,
    }));

    const bStart = eventsB.filter((e) => e.event === 'watch_start' && e.id === 'content-B');
    expect(bStart).toHaveLength(1);
    expect(result.current.getAccumulatedWatchTime()).toBe(0);
  });
});
