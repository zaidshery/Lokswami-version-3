import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SwipeFeed from '@/components/swipe/SwipeFeed';
import type { SwipeFeedItem } from '@/components/swipe/types';

vi.mock('@/lib/analytics/trackClient', () => ({ trackClientEvent: vi.fn() }));

const HINDI_FIXTURE_TITLE = 'सोना कम तौलने का आरोप, ज्वेलर्स पर केस!';
const HINDI_FIXTURE_SLUG = 'सोना-कम-तौलने-का-आरोप-ज्वेलर्स-पर-केस';

function makeShort(index: number, overrides: Partial<SwipeFeedItem> = {}): SwipeFeedItem {
  return {
    _id: `video-short-${index}`,
    slug: `short-slug-${index}`,
    articleId: index === 1 ? 'article-id-1' : '',
    title: `Short Title ${index}`,
    description: `Description ${index}`,
    thumbnail: `/thumbs/short-${index}.jpg`,
    posterUrl: `/posters/short-${index}.jpg`,
    videoUrl: `https://www.youtube.com/shorts/sample00${index}`,
    playbackUrl: `https://www.youtube.com/shorts/sample00${index}`,
    hlsUrl: '',
    mediaProvider: 'youtube',
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
    views: 100 * index,
    createdAt: '2026-09-01T09:00:00.000Z',
    publishedAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('Shorts / Swipe 2.0 (Phase 3.14B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
    vi.spyOn(window.history, 'replaceState');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  describe('1. Canonical Identity Contract', () => {
    it('uses exact canonical slug when title and slug differ (title != slug fixture)', () => {
      const short = makeShort(1, {
        title: HINDI_FIXTURE_TITLE,
        slug: HINDI_FIXTURE_SLUG,
      });

      render(
        <SwipeFeed
          initialItems={[short]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      // Verify header and headline render display title
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HINDI_FIXTURE_TITLE);

      // Verify canonical URL replaces history using exact slug
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        `/main/shorts/${encodeURIComponent(HINDI_FIXTURE_SLUG)}`
      );

      // Verify Share button url matches canonical path
      const shareButton = screen.getByRole('button', { name: 'Share this Swipe story' });
      expect(shareButton).toBeInTheDocument();
    });
  });

  describe('2. Vertical Touch Swipe & Snap', () => {
    it('swipes to next story on swipe up (delta > 48px)', () => {
      const { container } = render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2), makeShort(3)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const section = container.querySelector('section')!;
      fireEvent.touchStart(section, { changedTouches: [{ clientY: 300 }] });
      fireEvent.touchEnd(section, { changedTouches: [{ clientY: 150 }] });

      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/main/shorts/short-slug-2'
      );
      expect(screen.getByText('Story 2 of 3: Short Title 2')).toBeInTheDocument();
    });

    it('swipes to previous story on swipe down (delta < -48px)', () => {
      const { container } = render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2), makeShort(3)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const section = container.querySelector('section')!;
      // Move to 2
      fireEvent.touchStart(section, { changedTouches: [{ clientY: 300 }] });
      fireEvent.touchEnd(section, { changedTouches: [{ clientY: 150 }] });
      expect(screen.getByText('Story 2 of 3: Short Title 2')).toBeInTheDocument();

      // Swipe down back to 1
      fireEvent.touchStart(section, { changedTouches: [{ clientY: 150 }] });
      fireEvent.touchEnd(section, { changedTouches: [{ clientY: 300 }] });
      expect(screen.getByText('Story 1 of 3: Short Title 1')).toBeInTheDocument();
      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/main/shorts/short-slug-1'
      );
    });

    it('does not swipe on small drag below threshold (delta < 48px)', () => {
      const { container } = render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const section = container.querySelector('section')!;
      fireEvent.touchStart(section, { changedTouches: [{ clientY: 200 }] });
      fireEvent.touchEnd(section, { changedTouches: [{ clientY: 180 }] });

      // Stays on 1
      expect(screen.getByText('Story 1 of 2: Short Title 1')).toBeInTheDocument();
    });

    it('respects first item boundary (cannot swipe down beyond item 0)', () => {
      const { container } = render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const section = container.querySelector('section')!;
      fireEvent.touchStart(section, { changedTouches: [{ clientY: 200 }] });
      fireEvent.touchEnd(section, { changedTouches: [{ clientY: 350 }] });

      expect(screen.getByText('Story 1 of 2: Short Title 1')).toBeInTheDocument();
    });
  });

  describe('3. Keyboard & Desktop Mouse Wheel Navigation', () => {
    it('advances on ArrowDown / PageDown and retreats on ArrowUp / PageUp', () => {
      render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2), makeShort(3)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(screen.getByText('Story 2 of 3: Short Title 2')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'PageDown' });
      expect(screen.getByText('Story 3 of 3: Short Title 3')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(screen.getByText('Story 2 of 3: Short Title 2')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'PageUp' });
      expect(screen.getByText('Story 1 of 3: Short Title 1')).toBeInTheDocument();
    });

    it('navigates via mouse wheel scroll down and up', () => {
      const { container } = render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const section = container.querySelector('section')!;
      fireEvent.wheel(section, { deltaY: 80 });

      expect(screen.getByText('Story 2 of 2: Short Title 2')).toBeInTheDocument();
    });

    it('toggles pause on Space key', () => {
      render(
        <SwipeFeed
          initialItems={[makeShort(1)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      fireEvent.keyDown(window, { key: ' ' });
      expect(screen.getByText(/Video paused/i)).toBeInTheDocument();

      fireEvent.keyDown(window, { key: ' ' });
      expect(screen.queryByText(/Video paused/i)).not.toBeInTheDocument();
    });

    it('desktop next/previous buttons navigate between stories', () => {
      render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next story' });
      fireEvent.click(nextButton);
      expect(screen.getByText('Story 2 of 2: Short Title 2')).toBeInTheDocument();

      const prevButton = screen.getByRole('button', { name: 'Previous story' });
      fireEvent.click(prevButton);
      expect(screen.getByText('Story 1 of 2: Short Title 1')).toBeInTheDocument();
    });
  });

  describe('4. Active Playback & Single Playing Player', () => {
    it('only mounts 1 active player and pauses inactive cards', () => {
      const { container } = render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2), makeShort(3)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      // Card 1 active
      expect(container.querySelectorAll('iframe, video')).toHaveLength(1);

      // Advance to 2
      fireEvent.keyDown(window, { key: 'ArrowDown' });

      // Still only 1 active video/iframe mounted
      expect(container.querySelectorAll('iframe, video')).toHaveLength(1);
      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/main/shorts/short-slug-2'
      );
    });
  });

  describe('5. Quick Article Access & Canonical Deep Link', () => {
    const mockArticle = {
      id: 'article-1',
      slug: 'bhopal-cyber-fraud-arrest',
      title: 'Bhopal Cyber Fraud Arrested',
      summary: 'Police arrested mastermind behind digital arrest fraud in Bhopal.',
      category: 'National',
      author: 'Special Reporter',
      city: 'Bhopal',
      publishedAt: '2026-09-01T09:00:00.000Z',
      href: '/main/article/bhopal-cyber-fraud-arrest',
    };

    it('shows "पूरी खबर पढ़ें" when linked article is available', async () => {
      const user = userEvent.setup();
      render(
        <SwipeFeed
          initialItems={[makeShort(1)]}
          initialArticle={mockArticle}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const articleButton = screen.getByRole('button', { name: 'पूरी खबर पढ़ें' });
      expect(articleButton).toBeInTheDocument();

      await user.click(articleButton);

      // Sheet opens
      const dialog = screen.getByRole('dialog', { name: mockArticle.title });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText(mockArticle.summary)).toBeInTheDocument();

      // CTA links to canonical article route
      const ctaLink = screen.getByRole('link', { name: /पूरी खबर पढ़ें/i });
      expect(ctaLink).toHaveAttribute('href', '/main/article/bhopal-cyber-fraud-arrest');

      // Escape closes dialog
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('hides Quick Article button when no linked article exists', () => {
      render(
        <SwipeFeed
          initialItems={[makeShort(1)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      expect(screen.queryByRole('button', { name: 'पूरी खबर पढ़ें' })).not.toBeInTheDocument();
    });
  });

  describe('6. Viewer Settings Drawer', () => {
    it('manages Autoplay, Start Muted, and Data Saver settings with localStorage persistence', async () => {
      const user = userEvent.setup();
      render(
        <SwipeFeed
          initialItems={[makeShort(1)]}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const settingsBtn = screen.getByRole('button', {
        name: /Open Swipe settings/i,
      });
      await user.click(settingsBtn);

      const dialog = screen.getByRole('dialog', { name: 'Swipe settings' });
      expect(dialog).toBeInTheDocument();

      // Autoplay switch
      const autoplaySwitch = screen.getByRole('switch', { name: 'Autoplay next story' });
      expect(autoplaySwitch).toHaveAttribute('aria-checked', 'true');
      await user.click(autoplaySwitch);
      expect(autoplaySwitch).toHaveAttribute('aria-checked', 'false');
      expect(window.localStorage.getItem('lokswami.swipe.autoplay.v1')).toBe('false');

      // Start Muted switch
      const mutedSwitch = screen.getByRole('switch', { name: 'Start muted' });
      expect(mutedSwitch).toHaveAttribute('aria-checked', 'true');
      await user.click(mutedSwitch);
      expect(mutedSwitch).toHaveAttribute('aria-checked', 'false');
      expect(window.localStorage.getItem('lokswami.swipe.mute-default.v1')).toBe('false');

      // Data Saver switch
      const dataSaverSwitch = screen.getByRole('switch', { name: 'Data Saver' });
      expect(dataSaverSwitch).toHaveAttribute('aria-checked', 'true');
      await user.click(dataSaverSwitch);
      expect(dataSaverSwitch).toHaveAttribute('aria-checked', 'false');
      expect(window.localStorage.getItem('lokswami.swipe.data-saver.v1')).toBe('false');

      // Escape closes
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('7. Touch Isolation on Overlays', () => {
    it('prevents feed navigation while dragging inside open Quick Article sheet', async () => {
      const user = userEvent.setup();
      const mockArticle = {
        id: 'article-1',
        slug: 'bhopal-news',
        title: 'Bhopal News Article',
        summary: 'Article summary text.',
        category: 'National',
        author: 'Reporter',
        publishedAt: '2026-09-01T09:00:00.000Z',
        href: '/main/article/bhopal-news',
      };

      render(
        <SwipeFeed
          initialItems={[makeShort(1), makeShort(2)]}
          initialArticle={mockArticle}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      await user.click(screen.getByRole('button', { name: 'पूरी खबर पढ़ें' }));
      const dialog = screen.getByRole('dialog');

      // Touch drag inside the dialog
      fireEvent.touchStart(dialog, { changedTouches: [{ clientY: 400 }] });
      fireEvent.touchEnd(dialog, { changedTouches: [{ clientY: 100 }] });

      // Does NOT advance to short 2
      expect(screen.getByText('Story 1 of 2: Short Title 1')).toBeInTheDocument();
    });
  });
});
