import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideosPageClient from '@/app/(reader)/main/videos/VideosPageClient';
import VideoPlayer from '@/components/ui/VideoPlayer';
import type { PublicVideoFeedItem } from '@/components/video/types';

vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => 'hi' }));
vi.mock('@/components/video/VideoDetailHero', () => ({
  default: ({ selectedVideo }: { selectedVideo: { id: string; title: string } }) => (
    <div data-testid="mock-video-detail-hero" data-video-id={selectedVideo?.id}>
      Hero: {selectedVideo?.title}
    </div>
  ),
}));
vi.mock('@/components/ui/ShareMenu', () => ({
  default: ({ url }: { url: string }) => (
    <button data-testid="video-share" data-url={url} aria-label="share-action">
      Share
    </button>
  ),
}));

const mockVideos: PublicVideoFeedItem[] = [
  {
    _id: 'vid-alpha',
    slug: 'slug-alpha',
    title: 'Alpha Headlines Today',
    description: 'Detailed description of alpha news',
    thumbnail: '/images/alpha.jpg',
    videoUrl: 'https://cdn.example.com/alpha.mp4',
    duration: 120,
    category: 'National',
    isShort: false,
    isPublished: true,
    shortsRank: 0,
    views: 1500,
    publishedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    _id: 'vid-beta',
    slug: 'slug-beta',
    title: 'Beta Regional Updates',
    description: 'Important updates from the state',
    thumbnail: '/images/beta.jpg',
    videoUrl: 'https://cdn.example.com/beta.mp4',
    duration: 90,
    category: 'State',
    isShort: false,
    isPublished: true,
    shortsRank: 0,
    views: 850,
    publishedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    _id: 'short-gamma',
    slug: 'गामा-शॉर्ट-स्टोरी',
    title: 'Gamma Quick Short',
    description: 'Fast viral short',
    thumbnail: '/images/gamma.jpg',
    videoUrl: 'https://cdn.example.com/gamma.mp4',
    duration: 30,
    category: 'Trending',
    isShort: true,
    isPublished: true,
    shortsRank: 1,
    views: 4200,
    publishedAt: '2026-09-01T08:00:00.000Z',
  },
];

describe('Video Hub 2.0 (Phase 3.14A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/main/videos');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  describe('Default & Direct Selection', () => {
    it('defaults to the first eligible video when no query parameter is present', () => {
      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute(
        'data-video-id',
        'vid-alpha'
      );
      expect(
        screen.getByRole('heading', { level: 2, name: /Alpha Headlines Today/i })
      ).toBeInTheDocument();
      expect(screen.getByTestId('video-share')).toHaveAttribute(
        'data-url',
        '/main/videos?video=vid-alpha'
      );
    });

    it('selects the requested video when a valid ?video=<id> parameter is in the URL', () => {
      window.history.replaceState({}, '', '/main/videos?video=vid-beta');

      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
          initialSelectedVideoId="vid-beta"
        />
      );

      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute(
        'data-video-id',
        'vid-beta'
      );
      expect(
        screen.getByRole('heading', { level: 2, name: /Beta Regional Updates/i })
      ).toBeInTheDocument();
      expect(screen.getByTestId('video-share')).toHaveAttribute(
        'data-url',
        '/main/videos?video=vid-beta'
      );
    });

    it('falls back safely to the first video when ?video=<missing-id> is provided', () => {
      window.history.replaceState({}, '', '/main/videos?video=non-existent-id');

      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
          initialSelectedVideoId="non-existent-id"
        />
      );

      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute(
        'data-video-id',
        'vid-alpha'
      );
      expect(
        screen.getByRole('heading', { level: 2, name: /Alpha Headlines Today/i })
      ).toBeInTheDocument();
    });
  });

  describe('Queue Selection and History Synchronization', () => {
    it('updates URL via pushState and changes active video when a queue item is clicked', () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      // Select Beta video from the queue cards
      const betaCard = screen.getAllByRole('button', {
        name: /Beta Regional Updates/i,
      })[0];
      fireEvent.click(betaCard);

      expect(pushStateSpy).toHaveBeenCalledWith(
        { videoId: 'vid-beta' },
        '',
        '/main/videos?video=vid-beta'
      );
      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute(
        'data-video-id',
        'vid-beta'
      );
      expect(screen.getByTestId('video-share')).toHaveAttribute(
        'data-url',
        '/main/videos?video=vid-beta'
      );
    });

    it('uses canonical /main/shorts/<slug> for share when a Short is selected in the queue', () => {
      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const gammaCard = screen.getAllByRole('button', {
        name: /Gamma Quick Short/i,
      })[0];
      fireEvent.click(gammaCard);

      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute(
        'data-video-id',
        'short-gamma'
      );
      expect(screen.getByTestId('video-share')).toHaveAttribute(
        'data-url',
        `/main/shorts/${encodeURIComponent('गामा-शॉर्ट-स्टोरी')}`
      );
    });

    it('synchronizes selected video on popstate (browser back/forward)', () => {
      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      // Select Beta video
      fireEvent.click(
        screen.getAllByRole('button', { name: /Beta Regional Updates/i })[0]
      );
      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute(
        'data-video-id',
        'vid-beta'
      );

      // Simulate popstate back to vid-alpha
      window.history.replaceState({}, '', '/main/videos?video=vid-alpha');
      fireEvent(window, new PopStateEvent('popstate', { state: { videoId: 'vid-alpha' } }));

      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute(
        'data-video-id',
        'vid-alpha'
      );
    });
  });

  describe('Search and Filter Behavior', () => {
    it('filters videos by search term in the queue', () => {
      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const searchInput = screen.getByPlaceholderText(/वीडियो खोजें/i);
      fireEvent.change(searchInput, { target: { value: 'Regional' } });

      expect(
        screen.getAllByRole('button', { name: /Beta Regional Updates/i }).length
      ).toBeGreaterThan(0);
      expect(
        screen.queryByRole('button', { name: /Alpha Headlines Today/i })
      ).not.toBeInTheDocument();
    });

    it('shows a friendly empty state when search matches no videos', () => {
      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const searchInput = screen.getByPlaceholderText(/वीडियो खोजें/i);
      fireEvent.change(searchInput, { target: { value: 'NoMatchTermXYZ' } });

      expect(
        screen.getAllByText(/कोई वीडियो नहीं मिला/i).length
      ).toBeGreaterThan(0);
    });

    it('filters videos by category chips', () => {
      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      // Click "State" category button
      const stateFilterBtn = screen.getByRole('button', { name: 'State' });
      fireEvent.click(stateFilterBtn);

      expect(
        screen.getAllByRole('button', { name: /Beta Regional Updates/i }).length
      ).toBeGreaterThan(0);
      expect(
        screen.queryByRole('button', { name: /Alpha Headlines Today/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('VideoPlayer Error Resilience', () => {
    it('renders an accessible alert when video source is missing or fails', () => {
      render(
        <VideoPlayer
          videoId="test-err-vid"
          title="Error Test Video"
          src=""
          poster="/images/fallback.jpg"
          isActive={true}
          isPaused={false}
          isMuted={true}
          autoAdvance={false}
          playbackRate={1}
          defaultVolume={1}
          captionsEnabled={false}
          onTimeChange={() => {}}
          onPausedChange={() => {}}
          onMutedChange={() => {}}
          onEnded={() => {}}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/वीडियो लोड करने में समस्या हुई/i);
    });
  });
});
