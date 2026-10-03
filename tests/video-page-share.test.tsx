import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideosPageClient from '@/app/(reader)/main/videos/VideosPageClient';
import type { PublicVideoFeedItem } from '@/components/video/types';

vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => 'en' }));
vi.mock('@/components/video/VideoDetailHero', () => ({ default: () => null }));
vi.mock('@/components/video/VideoFeedGrid', () => ({ default: ({ onSelectVideo }: { onSelectVideo: (id: string) => void }) => <button onClick={() => onSelectVideo('second')}>Select second</button> }));
vi.mock('@/components/ui/ShareMenu', () => ({ default: ({ url }: { url: string }) => <button data-testid="video-share" data-url={url}>Share video</button> }));
const row: PublicVideoFeedItem = { _id: 'first', slug: 'short-slug', title: 'Different headline', description: '', thumbnail: '/poster.jpg', videoUrl: 'https://youtu.be/abcdefghijk', duration: 30, category: 'National', isShort: false, isPublished: true, shortsRank: 0, views: 0, publishedAt: '2026-09-01' };
describe('standard video sharing', () => {
  it('shares the exact selected ID and updates when the queue selection changes', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<VideosPageClient initialItems={[row, { ...row, _id: 'second' }]} initialLimit={20} initialHasMore={false} initialNextCursor={null} />);
    expect(screen.getByTestId('video-share')).toHaveAttribute('data-url', '/main/videos?video=first');
    fireEvent.click(screen.getAllByRole('button', { name: 'Select second' })[0]);
    expect(screen.getByTestId('video-share')).toHaveAttribute('data-url', '/main/videos?video=second');
    vi.restoreAllMocks();
  });
});
