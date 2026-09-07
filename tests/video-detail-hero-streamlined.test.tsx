import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VideoDetailHero from '@/components/video/VideoDetailHero';
import type { VideoItem } from '@/components/video/types';

vi.mock('@/components/ui/VideoPlayer', () => ({
  default: React.forwardRef(function MockVideoPlayer(props: any, ref: any) {
    return <div data-testid="mock-video-player" data-title={props.title} />;
  }),
}));

vi.mock('@/components/ui/ShareMenu', () => ({
  default: function MockShareMenu(props: any) {
    return <button data-testid="mock-share-menu" data-content-type={props.contentType}>{props.title}</button>;
  },
}));

describe('VideoDetailHero Streamlined YouTube/Instagram Experience', () => {
  const sampleVideo: VideoItem = {
    id: 'vid-101',
    title: 'स्वतंत्रता दिवस पर लाल किले से विशेष रिपोर्ट',
    description: 'लाल किले से स्वतंत्रता दिवस समारोह का विस्तृत विश्लेषण।',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnail: '/images/independence-day.jpg',
    duration: 180,
    category: 'national',
    publishedAt: new Date(Date.now() - 3600000).toISOString(),
    isShort: false,
    isPublished: true,
    views: 1200,
    shortsRank: 1,
  };

  const defaultCopy = {
    liveNow: 'लाइव 🔴',
    liveStream: 'लाइव स्ट्रीम',
    nowPlaying: 'अभी चल रहा है',
    views: 'व्यूज',
    autoAdvance: 'ऑटो प्ले',
    save: 'सेव',
    saved: 'सेव किया',
    showMore: 'और देखें',
    showLess: 'कम दिखाएं',
    shorts: 'शॉर्ट्स',
  };

  const defaultProps = {
    selectedVideo: sampleVideo,
    playerRef: { current: null },
    isPaused: false,
    isMuted: false,
    autoAdvance: true,
    captionsEnabled: false,
    playbackRate: 1 as const,
    progressCurrent: 10,
    progressDuration: 180,
    isSavedWatchLater: false,
    language: 'hi' as const,
    copy: defaultCopy,
    onSeek: vi.fn(),
    onPausedChange: vi.fn(),
    onMutedChange: vi.fn(),
    onCaptionsChange: vi.fn(),
    onPlaybackRateChange: vi.fn(),
    onToggleWatchLater: vi.fn(),
    onAdvanceToNext: vi.fn(),
  };

  it('renders pure video player without redundant lower metadata card or controls', () => {
    const { container } = render(<VideoDetailHero {...defaultProps} />);

    // Video player should be present
    expect(screen.getByTestId('mock-video-player')).toBeInTheDocument();

    // Redundant metadata card elements (crossed out with red X) must NOT exist
    expect(screen.queryByText('लोकस्वामी न्यूज़')).not.toBeInTheDocument();
    expect(screen.queryByText(/आधिकारिक चैनल/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('अगला वीडियो')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('सेव')).not.toBeInTheDocument();
    expect(screen.queryByText(/विशेष कवरेज/)).not.toBeInTheDocument();

    // Secondary duplicate control elements should NOT exist
    expect(container.querySelector('[aria-label="Fullscreen"]')).toBeNull();
    expect(container.querySelector('[aria-label="Play"]')).toBeNull();
    expect(container.querySelector('[aria-label="Pause"]')).toBeNull();
    expect(container.querySelector('[aria-label="Playback speed"]')).toBeNull();
  });

  it('adapts container for vertical shorts (9:16) and horizontal videos (16:9)', () => {
    // 1. Horizontal video
    const { rerender, container } = render(<VideoDetailHero {...defaultProps} />);
    expect(container.querySelector('.aspect-video')).toBeInTheDocument();

    // 2. Vertical short video
    const shortVideo: VideoItem = {
      ...sampleVideo,
      id: 'short-202',
      isShort: true,
      duration: 45,
    };
    rerender(<VideoDetailHero {...defaultProps} selectedVideo={shortVideo} />);
    expect(container.querySelector('.aspect-\\[9\\/16\\]')).toBeInTheDocument();
  });

  it('triggers onBackToList callback when back button is present', () => {
    const onBackToList = vi.fn();
    render(<VideoDetailHero {...defaultProps} onBackToList={onBackToList} />);

    const backBtn = screen.getByLabelText('Back to list');
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBackToList).toHaveBeenCalledTimes(1);
  });
});
