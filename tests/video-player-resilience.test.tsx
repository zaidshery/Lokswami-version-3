import { createRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer, { type VideoPlayerHandle } from '@/components/ui/VideoPlayer';

describe('VideoPlayer resilience & lifecycle', () => {
  const commonProps = {
    videoId: 'regression', title: 'Regression', isActive: true, isMuted: true,
    autoAdvance: true, playbackRate: 1, defaultVolume: 1, captionsEnabled: false,
    onMutedChange: vi.fn(), onTimeChange: vi.fn(), onEnded: vi.fn(),
  };

  it('hydrates offline entry without regenerating the server tree', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const element = <VideoPlayer {...commonProps} src="https://example.com/video.mp4" isPaused={false} onPausedChange={vi.fn()} />;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')!;
    const container = document.createElement('div');
    try {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
      container.innerHTML = renderToString(element);
    } finally { Object.defineProperty(globalThis, 'navigator', descriptor); }
    document.body.appendChild(container);
    // JSDOM does not initialize the media muted property from the parsed defaultMuted attribute.
    container.querySelectorAll('video').forEach((video) => { video.muted = video.defaultMuted; });
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, element, { onRecoverableError }); });
    try {
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container).toHaveTextContent(/Offline/);
    } finally {
      await act(async () => root!.unmount());
      container.remove();
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });

  it('keeps the YouTube iframe stable across controlled visibility pauses and mute changes', () => {
    function ControlledPlayer() {
      const [paused, setPaused] = useState(false);
      const [muted, setMuted] = useState(true);
      return <><button onClick={() => setMuted(false)}>Unmute test</button><VideoPlayer
        {...commonProps} src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        isPaused={paused} isMuted={muted} onPausedChange={setPaused}
      /></>;
    }
    const { container } = render(<ControlledPlayer />);
    const iframe = container.querySelector('iframe')!;
    const source = iframe.src;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
    expect(iframe.src).toBe(source);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Unmute test'));
    expect(container.querySelector('iframe')).toBe(iframe);
    expect(iframe.src).toBe(source);
  });

  it('forwards native and imperative seeks before reporting their new position', () => {
    const playerRef = createRef<VideoPlayerHandle>();
    const onSeeking = vi.fn();
    const onTimeChange = vi.fn();
    const { container } = render(<VideoPlayer {...commonProps} ref={playerRef}
      src="https://example.com/video.mp4" isPaused={false} onPausedChange={vi.fn()}
      onSeeking={onSeeking} onTimeChange={onTimeChange} />);
    const video = container.querySelector('video')!;
    fireEvent.seeking(video);
    expect(onSeeking).toHaveBeenCalledTimes(1);
    fireEvent.seeked(video);
    expect(onSeeking).toHaveBeenCalledTimes(2);
    playerRef.current?.seekTo(1);
    expect(onSeeking).toHaveBeenCalledTimes(3);
    expect(onSeeking.mock.invocationCallOrder[2]).toBeLessThan(onTimeChange.mock.invocationCallOrder[0]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('renders a single active HTML5 video element for MP4 sources', () => {
    const { container } = render(
      <VideoPlayer
        videoId="v1"
        title="Test Video"
        src="https://example.com/video.mp4"
        poster="/poster.jpg"
        isActive={true}
        isPaused={false}
        isMuted={true}
        autoAdvance={true}
        playbackRate={1}
        defaultVolume={1}
        captionsEnabled={false}
        onPausedChange={vi.fn()}
        onMutedChange={vi.fn()}
        onTimeChange={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    const videos = container.querySelectorAll('video');
    const iframes = container.querySelectorAll('iframe');
    expect(videos).toHaveLength(1);
    expect(iframes).toHaveLength(0);
  });

  it('renders a single iframe for YouTube sources without extra video elements', () => {
    const { container } = render(
      <VideoPlayer
        videoId="v2"
        title="YouTube Video"
        src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        poster="/poster.jpg"
        isActive={true}
        isPaused={false}
        isMuted={true}
        autoAdvance={true}
        playbackRate={1}
        defaultVolume={1}
        captionsEnabled={false}
        onPausedChange={vi.fn()}
        onMutedChange={vi.fn()}
        onTimeChange={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    const videos = container.querySelectorAll('video');
    const iframes = container.querySelectorAll('iframe');
    expect(videos).toHaveLength(0);
    expect(iframes).toHaveLength(1);
  });

  it('displays bounded retry counter and prevents infinite retry loops', () => {
    const onPausedChange = vi.fn();
    const { container } = render(
      <VideoPlayer
        videoId="v3"
        title="Failing Video"
        src="https://example.com/broken.mp4"
        poster="/poster.jpg"
        isActive={true}
        isPaused={false}
        isMuted={true}
        autoAdvance={true}
        playbackRate={1}
        defaultVolume={1}
        captionsEnabled={false}
        onPausedChange={onPausedChange}
        onMutedChange={vi.fn()}
        onTimeChange={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    const video = container.querySelector('video')!;
    // Simulate media error (code 2 = NETWORK)
    Object.defineProperty(video, 'error', {
      configurable: true,
      value: { code: 2, message: 'Network failure' },
    });
    fireEvent.error(video);

    expect(screen.getByText(/नेटवर्क त्रुटि: वीडियो लोड नहीं हो सका/i)).toBeInTheDocument();

    // Retry 1
    fireEvent.click(screen.getByRole('button', { name: /पुनः प्रयास करें/i }));
    fireEvent.error(video);

    // Retry 2
    fireEvent.click(screen.getByRole('button', { name: /पुनः प्रयास करें/i }));
    fireEvent.error(video);

    // Retry 3
    fireEvent.click(screen.getByRole('button', { name: /पुनः प्रयास करें/i }));
    fireEvent.error(video);

    // After 3 retries, maximum retry limit is reached - retry button should be replaced with exhausted message
    expect(screen.getByText(/अधिकतम प्रयास सीमा समाप्त/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /पुनः प्रयास करें/i })).not.toBeInTheDocument();
  });

  it('shows offline alert and pauses playback when network disconnects', () => {
    const onPausedChange = vi.fn();
    render(
      <VideoPlayer
        videoId="v4"
        title="Offline Test"
        src="https://example.com/video.mp4"
        isActive={true}
        isPaused={false}
        isMuted={true}
        autoAdvance={true}
        playbackRate={1}
        defaultVolume={1}
        captionsEnabled={false}
        onPausedChange={onPausedChange}
        onMutedChange={vi.fn()}
        onTimeChange={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    // Simulate offline event
    fireEvent(window, new Event('offline'));

    expect(screen.getByText(/इंटरनेट कनेक्शन नहीं है \/ Offline/i)).toBeInTheDocument();
    expect(onPausedChange).toHaveBeenCalledWith(true);

    // Simulate online event
    fireEvent(window, new Event('online'));
    expect(screen.queryByText(/इंटरनेट कनेक्शन नहीं है \/ Offline/i)).not.toBeInTheDocument();
  });

  it('pauses playback when document is hidden and resumes when foregrounded if not manually paused', () => {
    const onPausedChange = vi.fn();
    render(
      <VideoPlayer
        videoId="v5"
        title="Visibility Test"
        src="https://example.com/video.mp4"
        isActive={true}
        isPaused={false}
        isMuted={true}
        autoAdvance={true}
        playbackRate={1}
        defaultVolume={1}
        captionsEnabled={false}
        onPausedChange={onPausedChange}
        onMutedChange={vi.fn()}
        onTimeChange={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    // Document hidden
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(onPausedChange).toHaveBeenCalledWith(true);

    // Document restored to foreground
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    expect(onPausedChange).toHaveBeenCalledWith(false);
  });

  it('rejects dangerous or invalid media source schemes', () => {
    const { container } = render(
      <VideoPlayer
        videoId="v6"
        title="Malicious Video"
        src="javascript:alert(1)"
        isActive={true}
        isPaused={false}
        isMuted={true}
        autoAdvance={true}
        playbackRate={1}
        defaultVolume={1}
        captionsEnabled={false}
        onPausedChange={vi.fn()}
        onMutedChange={vi.fn()}
        onTimeChange={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    // Should indicate playback/format error and not mount active video source
    expect(screen.getByText(/वीडियो प्रारूप समर्थित नहीं है/i)).toBeInTheDocument();
    const video = container.querySelector('video');
    expect(video).not.toBeInTheDocument();
    // Retry button must NOT be present for unsupported schemes to avoid replacing error with blank box
    expect(screen.queryByRole('button', { name: /पुनः प्रयास करें/i })).not.toBeInTheDocument();
  });

  it('sends postMessage with safe YouTube targetOrigin and never "*"', () => {
    const playerRef = createRef<VideoPlayerHandle>();
    const { container } = render(
      <VideoPlayer
        ref={playerRef}
        videoId="v7"
        title="YouTube Safety Test"
        src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        isActive={true}
        isPaused={false}
        isMuted={true}
        autoAdvance={true}
        playbackRate={1}
        defaultVolume={1}
        captionsEnabled={false}
        onPausedChange={vi.fn()}
        onMutedChange={vi.fn()}
        onTimeChange={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    if (iframe && iframe.contentWindow) {
      const postMessageSpy = vi.spyOn(iframe.contentWindow, 'postMessage');
      playerRef.current?.seekTo(30);
      expect(postMessageSpy).toHaveBeenCalled();
      const [, targetOrigin] = postMessageSpy.mock.calls[0];
      expect(targetOrigin).not.toBe('*');
      expect(targetOrigin).toMatch(/^https:\/\/(www\.)?youtube/);
    }
  });

  it('does not emit onPausedChange(false) on HTML5 play event until onPlaying confirms rendering', () => {
    const onPausedChange = vi.fn();
    const { container } = render(
      <VideoPlayer
        {...commonProps}
        src="https://example.com/video.mp4"
        isPaused={true}
        onPausedChange={onPausedChange}
      />
    );

    const video = container.querySelector('video')!;
    expect(video).toBeInTheDocument();

    fireEvent.play(video);
    expect(onPausedChange).not.toHaveBeenCalledWith(false);

    fireEvent.playing(video);
    expect(onPausedChange).toHaveBeenCalledWith(false);
  });
});
