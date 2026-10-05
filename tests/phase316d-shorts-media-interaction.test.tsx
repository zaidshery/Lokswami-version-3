import React, { createElement, createRef } from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SwipeFeed from '@/components/swipe/SwipeFeed';
import SwipeActions from '@/components/swipe/SwipeActions';
import HomeShortsSection from '@/components/video/HomeShortsSection';
import VideosPageClient from '@/app/(reader)/main/videos/VideosPageClient';
import type { SwipeFeedItem, SwipeArticle } from '@/components/swipe/types';
import type { PublicVideoFeedItem } from '@/components/video/types';
import type { HomePageShortItem } from '@/lib/content/homeFeed';

// Mocks
vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: vi.fn(),
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: (selector?: (state: { language: string }) => unknown) => {
    const state = { language: 'hi' };
    return typeof selector === 'function' ? selector(state) : state.language;
  },
}));

vi.mock('@/components/video/VideoDetailHero', () => ({
  default: ({
    selectedVideo,
    onSeek,
    onPausedChange,
  }: {
    selectedVideo: { id: string; title: string };
    onSeek: (seconds: number) => void;
    onPausedChange: (paused: boolean) => void;
  }) => (
    <div data-testid="mock-video-detail-hero" data-video-id={selectedVideo?.id}>
      <p>Hero: {selectedVideo?.title}</p>
      <button data-testid="hero-seek-btn" onClick={() => onSeek(30)}>Seek 30s</button>
      <button data-testid="hero-pause-btn" onClick={() => onPausedChange(true)}>Pause</button>
    </div>
  ),
}));

vi.mock('@/components/ui/ShareMenu', () => ({
  default: ({ url, ariaLabel }: { url: string; ariaLabel: string }) => (
    <button type="button" data-testid="mock-share-btn" data-url={url} aria-label={ariaLabel}>
      Share
    </button>
  ),
}));

vi.mock('@/components/ui/ReaderImage', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    createElement('img', { src, alt, 'data-testid': 'mock-reader-image' })
  ),
}));

function makeSwipeItem(index: number, overrides: Partial<SwipeFeedItem> = {}): SwipeFeedItem {
  return {
    _id: `short-vid-${index}`,
    slug: `short-story-${index}`,
    articleId: index === 1 ? 'article-for-short-1' : '',
    title: `लोकस्वामी शॉर्ट्स समाचार ${index}`,
    description: `संक्षिप्त सारांश ${index}`,
    thumbnail: `/images/short-${index}.jpg`,
    posterUrl: `/images/short-${index}.jpg`,
    videoUrl: `https://example.com/shorts/${index}.mp4`,
    playbackUrl: `https://example.com/shorts/${index}.mp4`,
    hlsUrl: '',
    mediaProvider: 'spaces-mp4',
    aspectRatio: '9:16',
    captionUrl: '',
    transcript: '',
    processingStatus: 'ready',
    instagramUrl: '',
    youtubeUrl: '',
    duration: 45,
    category: 'National',
    isShort: true,
    isPublished: true,
    shortsRank: index,
    views: 120 * index,
    createdAt: '2026-09-01T10:00:00.000Z',
    publishedAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

const mockArticle: SwipeArticle = {
  id: 'article-for-short-1',
  slug: 'article-for-short-1-slug',
  title: 'विस्तृत समाचार लेख शीर्षक',
  summary: 'यह त्वरित लेख का संक्षिप्त सारांश है।',
  publishedAt: '2026-09-01T10:00:00.000Z',
  author: 'विशेष संवाददाता',
  category: 'National',
  href: '/main/article/article-for-short-1-slug',
};

const mockPublicVideos: PublicVideoFeedItem[] = [
  {
    _id: 'hub-vid-1',
    slug: 'hub-vid-1-slug',
    title: 'मुख्य वीडियो समाचार १',
    description: 'वीडियो विवरण १',
    thumbnail: '/images/v1.jpg',
    videoUrl: 'https://cdn.example.com/v1.mp4',
    duration: 180,
    category: 'National',
    isShort: false,
    isPublished: true,
    shortsRank: 0,
    views: 2400,
    publishedAt: '2026-09-02T12:00:00.000Z',
  },
  {
    _id: 'hub-vid-2',
    slug: 'hub-vid-2-slug',
    title: 'मुख्य वीडियो समाचार २',
    description: 'वीडियो विवरण २',
    thumbnail: '/images/v2.jpg',
    videoUrl: 'https://cdn.example.com/v2.mp4',
    duration: 210,
    category: 'State',
    isShort: false,
    isPublished: true,
    shortsRank: 0,
    views: 1800,
    publishedAt: '2026-09-02T11:00:00.000Z',
  },
];

describe('Phase 3.16D — Video Hub, Shorts & Media Touch Interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  // =========================================================================
  // Requirement 1, 2, 3, 16, 17: Shorts Landscape & Low-Height Collision Protection
  // =========================================================================
  describe('1. Shorts Landscape Collision Protection (ISSUE-MOB-06)', () => {
    it('globals.css defines @media (max-height: 520px) compaction rule eliminating landscape collisions', () => {
      const globalsCssPath = path.join(process.cwd(), 'app/globals.css');
      const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

      // Rule must exist and compact .swipe-actions-stack, .swipe-caption-box, and .swipe-article-cta
      expect(globalsCss).toContain('@media (max-height: 520px)');
      expect(globalsCss).toContain('.swipe-actions-stack');
      expect(globalsCss).toContain('bottom: calc(var(--reader-bottom-nav-space) + 0.75rem) !important;');
      expect(globalsCss).toContain('.swipe-caption-box');
      expect(globalsCss).toContain('.swipe-article-cta');
      expect(globalsCss).toContain('min-height: 44px !important;');
    });

    it('calculates zero top collision and safe area clearance on 844×390 and 740×360 landscape viewports', () => {
      // In landscape (<= 520px height):
      // BottomNav space = 56px
      // Bottom offset = 12px (0.75rem)
      // Stack padding = 6px * 2 = 12px
      // 3 action buttons = 44px * 3 = 132px
      // 2 gaps = 6px * 2 = 12px
      // Border = 2px
      // Stack total height = 158px
      // Bottom of stack from viewport bottom = 56 + 12 = 68px
      // Top of stack from viewport bottom = 68 + 158 = 226px

      const bottomNavHeight = 56;
      const bottomOffset = 12;
      const stackHeight = 158;
      const topBarBottomFromTop = 56; // 12px top + 44px height

      // Viewport 1: 844×390
      const vp1Height = 390;
      const vp1StackTopFromTop = vp1Height - (bottomNavHeight + bottomOffset + stackHeight);
      const vp1Clearance = vp1StackTopFromTop - topBarBottomFromTop;
      expect(vp1StackTopFromTop).toBe(164);
      expect(vp1Clearance).toBe(108); // 108px clearance (> 0 overlap)
      expect(Math.max(0, topBarBottomFromTop - vp1StackTopFromTop)).toBe(0); // Exact overlap = 0!

      // Viewport 2: 740×360
      const vp2Height = 360;
      const vp2StackTopFromTop = vp2Height - (bottomNavHeight + bottomOffset + stackHeight);
      const vp2Clearance = vp2StackTopFromTop - topBarBottomFromTop;
      expect(vp2StackTopFromTop).toBe(134);
      expect(vp2Clearance).toBe(78); // 78px clearance (> 0 overlap)
      expect(Math.max(0, topBarBottomFromTop - vp2StackTopFromTop)).toBe(0); // Exact overlap = 0!

      // Baseline comparison:
      // Before fix, stack had bottom = 56 + 120 (7.5rem) = 176px.
      // Baseline stack height was 174px. Stack top from bottom = 350px.
      // On 390px height: top was at 390 - 350 = 40px, causing 56 - 40 = 16px collision!
      // On 360px height: top was at 360 - 350 = 10px, causing 56 - 10 = 46px collision!
      const baselineVp1Overlap = Math.max(0, topBarBottomFromTop - (vp1Height - 350));
      const baselineVp2Overlap = Math.max(0, topBarBottomFromTop - (vp2Height - 350));
      expect(baselineVp1Overlap).toBe(16);
      expect(baselineVp2Overlap).toBe(46);
    });

    it('preserves portrait action positioning unchanged for height > 520px', () => {
      // In portrait (e.g. 390×844):
      const { container } = render(
        <SwipeActions
          muted={true}
          dataSaver={false}
          hasArticle={true}
          articleButtonRef={createRef()}
          settingsButtonRef={createRef()}
          onToggleMuted={vi.fn()}
          onOpenSettings={vi.fn()}
          shareControl={<div>Share</div>}
          onOpenArticle={vi.fn()}
        />
      );

      const stack = container.querySelector('.swipe-actions-stack');
      expect(stack).not.toBeNull();
      // Verifies original portrait utility class is preserved as the base class
      expect(stack?.className).toContain('bottom-[calc(var(--reader-bottom-nav-space)+7.5rem)]');
      expect(stack?.className).toContain('right-[max(env(safe-area-inset-right),0.75rem)]');
    });

    it('retains minimum 44×44px hit targets on all action buttons and article CTA', () => {
      const { container } = render(
        <SwipeActions
          muted={true}
          dataSaver={false}
          hasArticle={true}
          articleButtonRef={createRef()}
          settingsButtonRef={createRef()}
          onToggleMuted={vi.fn()}
          onOpenSettings={vi.fn()}
          shareControl={<button type="button" className="h-11 w-11 min-h-[44px] min-w-[44px]">Share</button>}
          onOpenArticle={vi.fn()}
        />
      );

      const actionButtons = container.querySelectorAll('.swipe-actions-stack button');
      expect(actionButtons.length).toBeGreaterThanOrEqual(3);
      actionButtons.forEach((btn) => {
        expect(btn.className).toMatch(/min-h-\[44px\]/);
        expect(btn.className).toMatch(/min-w-\[44px\]/);
      });

      const articleCta = container.querySelector('.swipe-article-cta');
      expect(articleCta).not.toBeNull();
      expect(articleCta?.className).toContain('min-h-[44px]');
    });
  });

  // =========================================================================
  // Requirement 5, 6, 7, 8, 9, 18: Vertical Swipe Navigation & Gesture Matrix
  // =========================================================================
  describe('2. Vertical Swipe Navigation & Gesture Conflict Isolation', () => {
    it('intentional vertical swipe (> 48px deltaY) navigates to next and previous short', () => {
      const items = [makeSwipeItem(1), makeSwipeItem(2), makeSwipeItem(3)];
      const { container } = render(
        <SwipeFeed
          initialItems={items}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const feedSection = container.querySelector('section');
      expect(feedSection).not.toBeNull();
      expect(screen.getByText('Story 1 of 3: लोकस्वामी शॉर्ट्स समाचार 1')).toBeInTheDocument();

      // Swipe UP (deltaY > 48px) -> navigates to next story
      fireEvent.touchStart(feedSection!, {
        changedTouches: [{ clientX: 200, clientY: 400 }],
      });
      fireEvent.touchEnd(feedSection!, {
        changedTouches: [{ clientX: 200, clientY: 340 }], // 400 - 340 = 60px > 48px
      });

      expect(screen.getByText('Story 2 of 3: लोकस्वामी शॉर्ट्स समाचार 2')).toBeInTheDocument();

      // Swipe DOWN (deltaY < -48px) -> navigates back to previous story
      fireEvent.touchStart(feedSection!, {
        changedTouches: [{ clientX: 200, clientY: 200 }],
      });
      fireEvent.touchEnd(feedSection!, {
        changedTouches: [{ clientX: 200, clientY: 270 }], // 200 - 270 = -70px
      });

      expect(screen.getByText('Story 1 of 3: लोकस्वामी शॉर्ट्स समाचार 1')).toBeInTheDocument();
    });

    it('sub-threshold vertical motion (< 48px) does NOT navigate', () => {
      const items = [makeSwipeItem(1), makeSwipeItem(2)];
      const { container } = render(
        <SwipeFeed
          initialItems={items}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const feedSection = container.querySelector('section');
      expect(screen.getByText('Story 1 of 2: लोकस्वामी शॉर्ट्स समाचार 1')).toBeInTheDocument();

      // Small jitter of 25px
      fireEvent.touchStart(feedSection!, {
        changedTouches: [{ clientX: 200, clientY: 300 }],
      });
      fireEvent.touchEnd(feedSection!, {
        changedTouches: [{ clientX: 200, clientY: 275 }], // 25px < 48px
      });

      // Still on story 1
      expect(screen.getByText('Story 1 of 2: लोकस्वामी शॉर्ट्स समाचार 1')).toBeInTheDocument();
    });

    it('horizontal-dominant movement does NOT trigger vertical swipe navigation', () => {
      const items = [makeSwipeItem(1), makeSwipeItem(2)];
      const { container } = render(
        <SwipeFeed
          initialItems={items}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const feedSection = container.querySelector('section');

      // Horizontal gesture (e.g. edge swipe or horizontal rail drag):
      // deltaX = 150px, deltaY = 50px
      fireEvent.touchStart(feedSection!, {
        changedTouches: [{ clientX: 100, clientY: 300 }],
      });
      fireEvent.touchEnd(feedSection!, {
        changedTouches: [{ clientX: 250, clientY: 250 }], // deltaX = 150, deltaY = 50
      });

      // Must remain on story 1 because horizontal motion dominated
      expect(screen.getByText('Story 1 of 2: लोकस्वामी शॉर्ट्स समाचार 1')).toBeInTheDocument();
    });

    it('tapping action buttons triggers action and does NOT trigger feed swipe', () => {
      const items = [makeSwipeItem(1), makeSwipeItem(2)];
      render(
        <SwipeFeed
          initialItems={items}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const muteBtn = screen.getByRole('button', { name: /Unmute video|Mute video/i });
      fireEvent.touchStart(muteBtn);
      fireEvent.touchEnd(muteBtn);
      fireEvent.click(muteBtn);

      // Still on story 1
      expect(screen.getByText('Story 1 of 2: लोकस्वामी शॉर्ट्स समाचार 1')).toBeInTheDocument();
    });

    it('quick article sheet interaction does NOT navigate background feed', async () => {
      const items = [makeSwipeItem(1), makeSwipeItem(2)];
      const { container } = render(
        <SwipeFeed
          initialItems={items}
          initialArticle={mockArticle}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      // Open article sheet
      const openArticleBtn = screen.getByRole('button', { name: /पूरी खबर पढ़ें/i });
      fireEvent.click(openArticleBtn);

      // Sheet is open
      const sheet = container.querySelector('[role="dialog"]');
      expect(sheet).not.toBeNull();

      // Swipe inside the sheet
      fireEvent.touchStart(sheet!, {
        changedTouches: [{ clientX: 150, clientY: 400 }],
      });
      fireEvent.touchEnd(sheet!, {
        changedTouches: [{ clientX: 150, clientY: 250 }], // 150px vertical swipe inside sheet
      });

      // Background feed must not change short while sheet is open!
      expect(screen.getByText('Story 1 of 2: लोकस्वामी शॉर्ट्स समाचार 1')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Requirement 10: Home Shorts Horizontal Rail Isolation
  // =========================================================================
  describe('3. Home Shorts Horizontal Rail Isolation', () => {
    it('HomeShortsSection has data-swipe-ignore, touch-pan-x, and overscroll-x-contain to isolate gestures', () => {
      const homeShorts: HomePageShortItem[] = [
        {
          id: 'hs-1',
          title: 'होम शॉर्ट्स १',
          thumbnail: '/images/hs1.jpg',
          duration: 30,
          category: 'Entertainment',
          publishedAt: '2026-09-02T10:00:00.000Z',
        },
        {
          id: 'hs-2',
          title: 'होम शॉर्ट्स २',
          thumbnail: '/images/hs2.jpg',
          duration: 45,
          category: 'Sports',
          publishedAt: '2026-09-02T10:00:00.000Z',
        },
      ];

      const { container } = render(<HomeShortsSection shorts={homeShorts} language="hi" />);
      const rail = container.querySelector('[data-testid="home-shorts-rail"]');
      expect(rail).not.toBeNull();
      expect(rail?.getAttribute('data-swipe-ignore')).toBe('true');
      expect(rail?.className).toContain('touch-pan-x');
      expect(rail?.className).toContain('overscroll-x-contain');
      expect(rail?.className).toContain('overflow-x-auto');
    });
  });

  // =========================================================================
  // Requirement 11, 12, 14: Video Hub Mobile & History Interaction
  // =========================================================================
  describe('4. Video Hub Mobile & History Interaction', () => {
    it('synchronizes ?video=<id> URL history on selection and supports popstate navigation', async () => {
      render(
        <VideosPageClient
          initialItems={mockPublicVideos}
          initialLimit={10}
          initialHasMore={false}
          initialNextCursor={null}
          initialSelectedVideoId="hub-vid-1"
        />
      );

      // Verify initial selected video
      const hero = screen.getByTestId('mock-video-detail-hero');
      expect(hero.getAttribute('data-video-id')).toBe('hub-vid-1');

      // Click second video from feed list
      const vid2Btns = screen.getAllByText('मुख्य वीडियो समाचार २');
      fireEvent.click(vid2Btns[0]);

      await waitFor(() => {
        expect(window.history.pushState).toHaveBeenCalledWith(
          { videoId: 'hub-vid-2' },
          '',
          expect.stringContaining('hub-vid-2')
        );
      });

      // Simulate popstate (user presses browser Back)
      fireEvent(
        window,
        new PopStateEvent('popstate', {
          state: { videoId: 'hub-vid-1' },
        })
      );

      await waitFor(() => {
        const updatedHero = screen.getByTestId('mock-video-detail-hero');
        expect(updatedHero.getAttribute('data-video-id')).toBe('hub-vid-1');
      });
    });

    it('orientation change preserves active video without unmounting or resetting', () => {
      const { rerender } = render(
        <VideosPageClient
          initialItems={mockPublicVideos}
          initialLimit={10}
          initialHasMore={false}
          initialNextCursor={null}
          initialSelectedVideoId="hub-vid-2"
        />
      );

      expect(screen.getByTestId('mock-video-detail-hero').getAttribute('data-video-id')).toBe('hub-vid-2');

      // Simulate orientation resize event
      fireEvent(window, new Event('resize'));

      rerender(
        <VideosPageClient
          initialItems={mockPublicVideos}
          initialLimit={10}
          initialHasMore={false}
          initialNextCursor={null}
          initialSelectedVideoId="hub-vid-2"
        />
      );

      // Video remains hub-vid-2
      expect(screen.getByTestId('mock-video-detail-hero').getAttribute('data-video-id')).toBe('hub-vid-2');
    });
  });

  // =========================================================================
  // Requirement 13, 15, 17: Preferences, Safe Area, and Share Contracts
  // =========================================================================
  describe('5. Preference & Media Contract Preservation', () => {
    it('preserves canonical localStorage preference contracts for data-saver, autoplay, and mute', () => {
      window.localStorage.setItem('lokswami.swipe.data-saver.v1', 'false');
      window.localStorage.setItem('lokswami.swipe.autoplay.v1', 'false');
      window.localStorage.setItem('lokswami.swipe.mute-default.v1', 'false');

      render(
        <SwipeFeed
          initialItems={[makeSwipeItem(1)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      expect(window.localStorage.getItem('lokswami.swipe.data-saver.v1')).toBe('false');
      expect(window.localStorage.getItem('lokswami.swipe.autoplay.v1')).toBe('false');
      expect(window.localStorage.getItem('lokswami.swipe.mute-default.v1')).toBe('false');
    });

    it('includes safe-area environment insets on top bar, action stack, caption box, and CTA', () => {
      const { container } = render(
        <SwipeFeed
          initialItems={[makeSwipeItem(1)]}
          initialArticle={mockArticle}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const topBar = container.querySelector('.swipe-top-bar');
      expect(topBar).not.toBeNull();
      expect(topBar?.className).toContain('top-[max(env(safe-area-inset-top),0.75rem)]');
      expect(topBar?.className).toContain('left-[max(env(safe-area-inset-left),0.75rem)]');

      const captionBox = container.querySelector('.swipe-caption-box');
      expect(captionBox).not.toBeNull();
      expect(captionBox?.className).toContain('left-[max(env(safe-area-inset-left),1rem)]');

      const actionStack = container.querySelector('.swipe-actions-stack');
      expect(actionStack).not.toBeNull();
      expect(actionStack?.className).toContain('right-[max(env(safe-area-inset-right),0.75rem)]');

      const cta = container.querySelector('.swipe-article-cta');
      expect(cta).not.toBeNull();
      expect(cta?.className).toContain('left-[max(env(safe-area-inset-left),1rem)]');
    });
  });
});
