import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SwipeFeed from '@/components/swipe/SwipeFeed';
import type { SwipeFeedItem } from '@/components/swipe/types';
import { trackClientEvent } from '@/lib/analytics/trackClient';

vi.mock('@/lib/analytics/trackClient', () => ({ trackClientEvent: vi.fn() }));

function item(index: number): SwipeFeedItem {
  return {
    _id: `video-${index}`,
    slug: `video-${index}`,
    articleId: index === 1 ? 'article-1' : '',
    title: `Swipe story ${index}`,
    description: `Summary ${index}`,
    thumbnail: `/poster-${index}.jpg`,
    posterUrl: `/poster-${index}.jpg`,
    videoUrl: `https://www.youtube.com/shorts/youtube000${index}`,
    playbackUrl: `https://www.youtube.com/shorts/youtube000${index}`,
    hlsUrl: '',
    mediaProvider: 'youtube',
    aspectRatio: '9:16',
    captionUrl: '',
    transcript: '',
    processingStatus: 'ready',
    instagramUrl: '',
    youtubeUrl: '',
    duration: 60,
    category: 'National',
    isShort: true,
    isPublished: true,
    shortsRank: index,
    views: 0,
    createdAt: '2026-09-01T09:00:00.000Z',
    publishedAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

describe('SwipeFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(window.history, 'replaceState');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('keeps only previous/current/next cards and one active player mounted', () => {
    const { container } = render(
      <SwipeFeed initialItems={[item(1), item(2), item(3), item(4)]} initialArticle={null} initialHasMore={false} initialNextCursor={null} />
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(container.querySelectorAll('[data-swipe-card]')).toHaveLength(3);
    expect(container.querySelectorAll('iframe, video')).toHaveLength(1);
    expect(window.history.replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      '/main/shorts/video-2'
    );
  });

  it('opens an accessible quick article dialog and closes with Escape', async () => {
    const user = userEvent.setup();
    render(
      <SwipeFeed
        initialItems={[item(1)]}
        initialArticle={{
          id: 'article-1',
          slug: 'full-report',
          title: 'Full report',
          summary: 'Published article summary',
          category: 'National',
          author: 'Reporter',
          publishedAt: '2026-09-01T09:00:00.000Z',
          href: '/main/article/full-report',
        }}
        initialHasMore={false}
        initialNextCursor={null}
      />
    );
    await user.click(screen.getByRole('button', { name: 'पूरी खबर पढ़ें' }));
    expect(screen.getByRole('dialog', { name: 'Full report' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });

  it('fires playback milestones only once per story', () => {
    const { container } = render(
      <SwipeFeed initialItems={[item(1)]} initialArticle={null} initialHasMore={false} initialNextCursor={null} />
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    fireEvent.load(iframe!);
    fireEvent.load(iframe!);
    const events = vi.mocked(trackClientEvent).mock.calls.map(([payload]) => payload.event);
    expect(events.filter((event) => event === 'short_impression')).toHaveLength(1);
    expect(events.filter((event) => event === 'video_play')).toHaveLength(1);
  });

  it('opens an accessible settings dialog and persists Data Saver preference', async () => {
    const user = userEvent.setup();
    render(
      <SwipeFeed
        initialItems={[item(1)]}
        initialArticle={null}
        initialHasMore={false}
        initialNextCursor={null}
      />
    );

    const settingsButton = screen.getByRole('button', {
      name: 'Open Swipe settings. Data Saver is on',
    });
    await user.click(settingsButton);
    expect(screen.getByRole('dialog', { name: 'Swipe settings' })).toBeInTheDocument();
    const dataSaver = screen.getByRole('switch', { name: 'Data Saver' });
    expect(dataSaver).toHaveAttribute('aria-checked', 'true');
    await user.click(dataSaver);
    expect(dataSaver).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem('lokswami.swipe.data-saver.v1')).toBe('false');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Swipe settings' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(settingsButton);
  });
});
