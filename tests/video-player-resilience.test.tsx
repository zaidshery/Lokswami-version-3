import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer from '@/components/ui/VideoPlayer';

describe('VideoPlayer resilience & lifecycle', () => {
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
});
