import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideosPageClient from '@/app/(reader)/main/videos/VideosPageClient';
import { trackClientEvent } from '@/lib/analytics/trackClient';
import type { PublicVideoFeedItem } from '@/components/video/types';

vi.mock('@/lib/analytics/trackClient', () => ({ trackClientEvent: vi.fn() }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => 'en' }));
vi.mock('@/components/ui/ShareMenu', () => ({ default: () => null }));
vi.mock('@/components/ui/ReaderImage', () => ({ default: () => null }));

const item: PublicVideoFeedItem = {
  _id: 'confirmed-video', slug: 'confirmed-video', title: 'Confirmed playback',
  description: '', thumbnail: '/poster.jpg', videoUrl: 'https://example.com/video.mp4',
  duration: 100, category: 'National', isShort: false, isPublished: true,
  shortsRank: 0, views: 1, publishedAt: '2026-09-01T10:00:00.000Z',
};
function mount(videoUrl = item.videoUrl) {
  return render(<VideosPageClient initialItems={[{ ...item, videoUrl }]}
    initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
}
function starts() {
  return vi.mocked(trackClientEvent).mock.calls.filter(([event]) => event.event === 'watch_start');
}

describe('Video Hub provider-confirmed telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/main/videos');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Playback rejected'));
  });
  afterEach(() => { delete window.YT; vi.restoreAllMocks(); });

  it('does not count rejected Play, play events, or source errors', async () => {
    const { container } = mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument());
    const video = container.querySelector('video')!;
    fireEvent.play(video);
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    fireEvent.error(video);
    expect(screen.getByRole('button', { name: /पुनः प्रयास करें/ })).toBeInTheDocument();
    expect(starts()).toHaveLength(0);
  });

  it('counts actual playing once, excludes buffering, and requires confirmation after failed visibility resume', async () => {
    const { container } = mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument());
    vi.mocked(HTMLMediaElement.prototype.play).mockResolvedValue();
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    const video = container.querySelector('video')!;
    fireEvent.playing(video);
    fireEvent.waiting(video);
    fireEvent.playing(video);
    expect(starts()).toHaveLength(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('Resume rejected'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument());
    expect(starts()).toHaveLength(1);
  });

  it('requires the current YouTube API player PLAYING event and ignores raw forged messages', async () => {
    type Namespace = NonNullable<typeof window.YT>;
    let events: ConstructorParameters<Namespace['Player']>[1]['events'];
    const player = {
      destroy: vi.fn(), getAvailablePlaybackRates: () => [1], getCurrentTime: () => 0,
      getDuration: () => 100, getPlaybackRate: () => 1, mute: vi.fn(), pauseVideo: vi.fn(),
      playVideo: vi.fn(), seekTo: vi.fn(), setPlaybackRate: vi.fn(), setVolume: vi.fn(), unMute: vi.fn(),
    };
    window.YT = {
      Player: class { constructor(_element: HTMLIFrameElement, options: { events: typeof events }) {
        events = options.events; return player;
      } } as Namespace['Player'],
      PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
    };
    const { container } = mount('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await waitFor(() => expect(events!).toBeDefined());
    act(() => events!.onReady({ target: player, data: undefined }));
    expect(player.playVideo).toHaveBeenCalled();
    expect(starts()).toHaveLength(0);
    const iframe = container.querySelector('iframe')!;
    for (const [origin, source] of [
      ['https://evil.example', iframe.contentWindow], ['https://www.youtube.com', window],
    ] as const) {
      fireEvent(window, new MessageEvent('message', {
        origin, source, data: JSON.stringify({ event: 'onStateChange', info: 1 }),
      }));
    }
    act(() => events!.onStateChange({ target: { ...player }, data: 1 }));
    expect(starts()).toHaveLength(0);
    act(() => {
      events!.onStateChange({ target: player, data: 1 });
      events!.onStateChange({ target: player, data: 3 });
      events!.onStateChange({ target: player, data: 1 });
    });
    expect(starts()).toHaveLength(1);
  });
});
