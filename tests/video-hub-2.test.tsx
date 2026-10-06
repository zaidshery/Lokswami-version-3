import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideosPageClient from '@/app/(reader)/main/videos/VideosPageClient';
import VideoPlayer from '@/components/ui/VideoPlayer';
import type { PublicVideoFeedItem } from '@/components/video/types';

const mockAppState = {
  language: 'en',
  isMobile: false,
  isTablet: false,
  isImmersiveVideoMode: false,
  setImmersiveVideoMode: vi.fn(),
};

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: (selector?: (state: typeof mockAppState) => any) =>
    typeof selector === 'function' ? selector(mockAppState) : mockAppState,
}));
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
    window.localStorage.clear();
    window.history.replaceState({}, '', '/main/videos');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('hydrates an off-page saved video after reload and selects it without changing feed pagination', async () => {
    window.localStorage.setItem('lokswami.video.watch-later.v1', JSON.stringify({ 'vid-beta': true }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [mockVideos[1]] })));
    render(<VideosPageClient initialItems={[mockVideos[0]]} initialLimit={20} initialHasMore={true} initialNextCursor={{ id: 'vid-alpha', publishedAt: mockVideos[0].publishedAt }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved videos' }));
    const drawer = screen.getByRole('dialog');
    fireEvent.click(await within(drawer).findByRole('button', { name: 'Beta Regional Updates' }));
    expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute('data-video-id', 'vid-beta');
    expect(window.location.search).toBe('?video=vid-beta');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/public/videos?ids=vid-beta', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('keeps unavailable saved videos removable instead of claiming the list is empty', async () => {
    window.localStorage.setItem('lokswami.video.watch-later.v1', JSON.stringify({ 'vid-beta': true }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    render(<VideosPageClient initialItems={[mockVideos[0]]} initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved videos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove unavailable saved video' }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('lokswami.video.watch-later.v1') || '{}')).toEqual({}));
    fetchMock.mockRestore();
  });

  it('preserves bookmarks after a hydration failure and retries on reopening', async () => {
    window.localStorage.setItem('lokswami.video.watch-later.v1', JSON.stringify({ 'vid-beta': true }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ items: [mockVideos[1]] })));
    render(<VideosPageClient initialItems={[mockVideos[0]]} initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved videos' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('lokswami.video.watch-later.v1') || '{}')).toEqual({ 'vid-beta': true });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saved videos' }));
    expect(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Beta Regional Updates' })).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it('retains the selected hydrated video when its watch-later bookmark is removed while playing', async () => {
    window.localStorage.setItem('lokswami.video.watch-later.v1', JSON.stringify({ 'vid-beta': true }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [mockVideos[1]] })));
    render(<VideosPageClient initialItems={[mockVideos[0]]} initialLimit={20} initialHasMore={true} initialNextCursor={{ id: 'vid-alpha', publishedAt: mockVideos[0].publishedAt }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved videos' }));
    const drawer = screen.getByRole('dialog');
    fireEvent.click(await within(drawer).findByRole('button', { name: 'Beta Regional Updates' }));
    expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute('data-video-id', 'vid-beta');

    // Open drawer again to remove bookmark
    fireEvent.click(screen.getByRole('button', { name: 'Saved videos' }));
    const activeDrawer = screen.getByRole('dialog');
    const removeBtn = within(activeDrawer).getByRole('button', { name: 'Remove from watch later' });
    fireEvent.click(removeBtn);

    // Close drawer
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Selected video MUST remain vid-beta and not revert to vid-alpha
    await waitFor(() => {
      expect(screen.getByTestId('mock-video-detail-hero')).toHaveAttribute('data-video-id', 'vid-beta');
    });
    fetchMock.mockRestore();
  });

  it('traps focus within the watch later drawer and restores focus to the trigger on close', async () => {
    render(<VideosPageClient initialItems={[mockVideos[0]]} initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
    const savedButton = screen.getByRole('button', { name: 'Saved videos' });
    savedButton.focus();
    expect(document.activeElement).toBe(savedButton);

    fireEvent.click(savedButton);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Initial focus moves inside the drawer
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Press Escape to close and verify focus restores to trigger
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(savedButton);
    });
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
    it.each(['no-shorts', 'search', 'category'])('shows the Shorts empty state for %s', (scenario) => {
      render(<VideosPageClient initialItems={scenario === 'no-shorts' ? mockVideos.slice(0, 2) : mockVideos} initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
      fireEvent.click(screen.getByRole('button', { name: /Shorts|शॉर्ट्स/i }));
      if (scenario === 'search') fireEvent.change(screen.getByPlaceholderText(/Search videos|वीडियो खोजें/i), { target: { value: 'NoMatchTermXYZ' } });
      if (scenario === 'category') fireEvent.click(screen.getByRole('button', { name: /State|राज्य/i }));
      expect(screen.getByText(/No videos found|कोई वीडियो नहीं मिला/i)).toBeInTheDocument();
    });

    it.each(['search', 'category'])('applies %s to the mobile Shorts carousel', (filter) => {
      const items = [...mockVideos,
        { ...mockVideos[0], _id: 'national-second', title: 'Headlines Second' },
        { ...mockVideos[0], _id: 'national-third', title: 'Headlines Third' },
        { ...mockVideos[2], _id: 'national-short', title: 'Headlines Short', category: 'National' },
      ];
      render(<VideosPageClient initialItems={items} initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
      if (filter === 'search') fireEvent.change(screen.getByPlaceholderText(/Search videos|वीडियो खोजें/i), { target: { value: 'Headlines' } });
      else fireEvent.click(screen.getByRole('button', { name: /National|राष्ट्रीय/i }));
      expect(screen.getAllByRole('button', { name: /Headlines Short/i }).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /Gamma Quick Short/i })).not.toBeInTheDocument();
    });

    it('collapses descriptions when selection changes through the queue or history', () => {
      const items = mockVideos.map((video) => ({ ...video, description: 'Detailed news description. '.repeat(20) }));
      render(<VideosPageClient initialItems={items} initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
      fireEvent.click(screen.getByRole('button', { name: /Show more|और देखें/i }));
      fireEvent.click(screen.getAllByRole('button', { name: /Beta Regional Updates/i })[0]);
      expect(screen.getByRole('button', { name: /Show more|और देखें/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Show more|और देखें/i }));
      window.history.replaceState({}, '', '/main/videos?video=vid-alpha');
      fireEvent(window, new PopStateEvent('popstate', { state: { videoId: 'vid-alpha' } }));
      expect(screen.getByRole('button', { name: /Show more|और देखें/i })).toBeInTheDocument();
    });

    it('filters videos by search term in the queue', () => {
      render(
        <VideosPageClient
          initialItems={mockVideos}
          initialLimit={20}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Search videos|वीडियो खोजें/i);
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

      const searchInput = screen.getByPlaceholderText(/Search videos|वीडियो खोजें/i);
      fireEvent.change(searchInput, { target: { value: 'NoMatchTermXYZ' } });

      expect(
        screen.getAllByText(/No videos found|कोई वीडियो नहीं मिला/i).length
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
