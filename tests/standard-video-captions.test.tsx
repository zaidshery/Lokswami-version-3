import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer from '@/components/ui/VideoPlayer';
import { getPublicVideoCaption } from '@/lib/content/videoPublication';
import { mapApiVideo } from '@/components/video/types';

afterEach(() => vi.restoreAllMocks());
const props = { videoId: 'qa', title: 'QA controlled video', src: 'https://qa.example/video.mp4',
  isActive: false, isPaused: true, isMuted: true, autoAdvance: false, playbackRate: 1,
  defaultVolume: 1, captionsEnabled: true, onPausedChange: vi.fn(), onMutedChange: vi.fn(),
  onTimeChange: vi.fn(), onEnded: vi.fn() };
describe('standard reader uses existing caption delivery and player controls', () => {
  it('preserves CMS caption URL/language through the standard feed mapper', () => {
    const caption = getPublicVideoCaption({ accessibilityMeta: { captionsUrl: 'https://qa.example/en.vtt', captionLanguage: 'en' } });
    expect(caption).toEqual({ captionUrl: 'https://qa.example/en.vtt', captionLanguage: 'en' });
    const mapped = mapApiVideo({ _id: 'qa', title: 'QA', description: '', thumbnail: '', videoUrl: props.src,
      duration: 4, category: 'Regional', isShort: false, isPublished: true, shortsRank: 0, views: 0,
      publishedAt: '2026-10-14T00:00:00Z', ...caption });
    expect(mapped).toMatchObject(caption);
    expect(getPublicVideoCaption({ captionUrl: 'https://qa.example/hi.vtt' }).captionLanguage).toBe('hi');
    expect(getPublicVideoCaption({})).toEqual({ captionUrl: '', captionLanguage: '' });
  });
  it('renders a labelled native track with anonymous CORS and toggles its mode', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const track = { mode: 'disabled' };
    const tracks = Object.assign([track], { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.spyOn(HTMLMediaElement.prototype, 'textTracks', 'get').mockReturnValue(tracks as unknown as TextTrackList);
    function Controlled() { const [enabled, setEnabled] = useState(true); return <VideoPlayer {...props}
      captionUrl="https://qa.example/en.vtt" captionLanguage="en" captionsEnabled={enabled} onCaptionsChange={setEnabled} />; }
    const { container } = render(<Controlled />);
    expect(container.querySelector('video')).toHaveAttribute('crossorigin', 'anonymous');
    expect(container.querySelector('track')).toHaveAttribute('srclang', 'en');
    expect(container.querySelector('track')).toHaveAttribute('label', 'English');
    fireEvent.load(container.querySelector('track')!);
    expect(track.mode).toBe('showing');
    const control = screen.getByRole('button', { name: 'Captions: English' });
    fireEvent.click(control); expect(control).toHaveAttribute('aria-pressed', 'false'); expect(track.mode).toBe('disabled');
    fireEvent.click(control); expect(track.mode).toBe('showing');
  });
  it('leaves uncaptioned videos free of tracks, caption controls and CORS mode', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const { container } = render(<VideoPlayer {...props} />);
    expect(container.querySelector('track')).toBeNull();
    expect(container.querySelector('video')).not.toHaveAttribute('crossorigin');
    expect(screen.queryByRole('button', { name: /^Captions:/ })).toBeNull();
  });
});
