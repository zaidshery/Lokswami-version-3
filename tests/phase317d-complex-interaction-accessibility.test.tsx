import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SwipeFeed from '@/components/swipe/SwipeFeed';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import VideoFilterBar from '@/components/video/VideoFilterBar';
import VideoDetailHero from '@/components/video/VideoDetailHero';
import EPaperStoryPreview from '@/components/epaper/reader/EPaperStoryPreview';
import EPaperCanvasViewport from '@/components/epaper/reader/EPaperCanvasViewport';
import { createRef } from 'react';
import type { VideoPlayerHandle } from '@/components/ui/VideoPlayer';
import type { SwipeFeedItem } from '@/components/swipe/types';

const state = vi.hoisted(() => ({ language: 'en' as 'en' | 'hi' }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn(), trackOnce: vi.fn(), onProgress: vi.fn() }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: (selector?: (value: typeof state) => unknown) => selector ? selector(state) : state }));
vi.mock('@/components/swipe/useSwipeAnalytics', () => ({ default: () => analytics }));
vi.mock('@/components/swipe/SwipeVideoCard', () => ({ default: ({ item, active, paused }: {item: SwipeFeedItem; active: boolean; paused: boolean}) => <div data-swipe-card data-active={active} data-paused={paused}>{item.title}</div> }));

function item(index: number): SwipeFeedItem {
  return { _id: `video-${index}`, slug: `story-${index}`, articleId: '', title: `Story ${index}`, description: 'Reader story', thumbnail: '/poster.jpg', posterUrl: '/poster.jpg', videoUrl: 'https://www.youtube.com/shorts/lmnopqrstuv', playbackUrl: 'https://www.youtube.com/shorts/lmnopqrstuv', hlsUrl: '', mediaProvider: 'youtube', aspectRatio: '9:16', captionUrl: '', transcript: '', processingStatus: 'ready', instagramUrl: '', youtubeUrl: '', duration: 30, category: 'Regional', isShort: true, isPublished: true, shortsRank: index, views: 0, createdAt: '2026-09-01T09:00:00.000Z', publishedAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' };
}
const feed = (items = [item(1), item(2), item(3)]) => render(<SwipeFeed initialItems={items} initialArticle={null} initialHasMore={false} initialNextCursor={null} />);
const previous = () => screen.getByRole('button', { name: state.language === 'hi' ? 'पिछली स्टोरी' : 'Previous story' });
const next = () => screen.getByRole('button', { name: state.language === 'hi' ? 'अगली स्टोरी' : 'Next story' });
const active = () => document.querySelector('[data-swipe-card][data-active="true"]')?.textContent;
const touch = (node: Element, start: number, end: number) => {
  fireEvent.touchStart(node, { changedTouches: [{ clientX: 150, clientY: start }] });
  fireEvent.touchEnd(node, { changedTouches: [{ clientX: 150, clientY: end }] });
};
beforeEach(() => {
  vi.clearAllMocks(); state.language = 'en'; window.localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(window.history, 'replaceState');
});

describe('Phase 3.17D Shorts single-point navigation', () => {
  it.each(['en', 'hi'] as const)('provides one native, localized Previous/Next pair in %s at every breakpoint', language => {
    state.language = language; feed();
    for (const button of [previous(), next()]) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveClass('reader-focus-ring', 'h-12', 'w-12');
      const group = button.closest('[data-swipe-navigation]')!;
      expect(group).toHaveAttribute('data-swipe-ignore', 'true');
      expect(group).toHaveClass('flex', 'md:static');
      expect(group).not.toHaveClass('hidden');
      expect(group).not.toHaveClass('md:hidden');
    }
    expect(previous()).toBeDisabled(); expect(next()).toBeEnabled();
  });
  it('uses the same state, canonical history and analytics for Next and Previous', () => {
    feed(); fireEvent.click(next()); expect(active()).toBe('Story 2');
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/main/shorts/story-2');
    fireEvent.click(previous()); expect(active()).toBe('Story 1');
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/main/shorts/story-1');
    expect(analytics.trackEvent.mock.calls.map(call => call[0])).toEqual(['swipe_next', 'swipe_back']);
  });
  it('disables both boundaries and cannot activate a disabled control', () => {
    feed([item(1)]); expect(previous()).toBeDisabled(); expect(next()).toBeDisabled();
    fireEvent.click(previous()); fireEvent.click(next()); expect(active()).toBe('Story 1');
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
  it('keeps the existing final-story load-more lifecycle without duplicate requests or identity reset', async () => {
    let resolve!: (response: Response) => void;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    render(<SwipeFeed initialItems={[item(1)]} initialArticle={null} initialHasMore initialNextCursor={{ publishedAt: item(1).publishedAt, id: item(1)._id }} />);
    expect(next()).toBeEnabled(); fireEvent.click(next()); expect(next()).toBeDisabled(); fireEvent.click(next());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/public/shorts?limit=8&cursorPublishedAt=2026-09-01T09%3A00%3A00.000Z&cursorId=video-1', {cache:'no-store'});
    resolve({ ok: true, json: async () => ({items:[item(1),item(2)],hasMore:false,nextCursor:null}) } as Response);
    await waitFor(() => expect(next()).toBeEnabled()); expect(active()).toBe('Story 1');
    fireEvent.click(next()); expect(active()).toBe('Story 2'); expect(next()).toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledTimes(1); fetchSpy.mockRestore();
  });
  it('preserves upward/downward swipe and shares active state with buttons', () => {
    feed(); const section = screen.getByRole('region', {name:'Lokswami Swipe news feed'});
    touch(section, 400, 250); expect(active()).toBe('Story 2');
    fireEvent.click(next()); expect(active()).toBe('Story 3');
    touch(section, 250, 400); expect(active()).toBe('Story 2');
    fireEvent.click(previous()); expect(active()).toBe('Story 1');
  });
  it.each([['ArrowDown','ArrowUp'],['PageDown','PageUp']])('preserves %s/%s navigation', (forward, back) => {
    feed(); fireEvent.keyDown(window,{key:forward}); expect(active()).toBe('Story 2');
    fireEvent.keyDown(window,{key:back}); expect(active()).toBe('Story 1');
  });
  it('lets Enter and Space activate the native navigation button once without toggling playback', async () => {
    const user=userEvent.setup(); feed(); next().focus();
    await user.keyboard('{Enter}'); expect(active()).toBe('Story 2');
    await user.keyboard(' '); expect(active()).toBe('Story 3');
    expect(document.querySelector('[data-active="true"]')).toHaveAttribute('data-paused','false');
    expect(analytics.trackEvent).toHaveBeenCalledTimes(2);
  });
  it('isolates touch movement on navigation controls from feed swipes and only activates once', () => {
    feed(); touch(next(),400,250); expect(active()).toBe('Story 1');
    fireEvent.click(next()); expect(active()).toBe('Story 2');
    touch(previous(),250,260); fireEvent.click(previous()); expect(active()).toBe('Story 1');
    expect(analytics.trackEvent).toHaveBeenCalledTimes(2);
  });
});

describe('Phase 3.17D auxiliary target contracts', () => {
  it.each([1,2])('keeps page %s retry at 44px and preserves independent image recovery', page => {
    render(<EPaperCanvasViewport imagePath="/one.jpg" pageNumber={1} zoom={1} isSpreadMode spreadSecondImagePath="/two.jpg" spreadSecondPageNumber={2} />);
    fireEvent.error(screen.getByAltText(`Page ${page}`));
    const retry=screen.getByRole('button',{name:page===1?'Retry page':'Retry page 2'});
    expect(retry).toHaveClass('reader-focus-ring','min-h-11','min-w-11');
    fireEvent.click(retry);expect(screen.getByAltText(`Page ${page}`)).toBeInTheDocument();
  });
  it('expands the detail back target while preserving its 20px icon and callback', () => {
    const back=vi.fn();render(<VideoDetailHero selectedVideo={{...item(1),id:'video-1'}} playerRef={createRef<VideoPlayerHandle>()} isPaused isMuted autoAdvance={false} captionsEnabled={false} playbackRate={1} onPausedChange={vi.fn()} onMutedChange={vi.fn()} onCaptionsChange={vi.fn()} onPlaybackRateChange={vi.fn()} onAdvanceToNext={vi.fn()} onBackToList={back} />);
    const button=screen.getByRole('button',{name:'Back to list'});expect(button).toHaveClass('h-11','w-11','reader-focus-ring');expect(button.querySelector('svg')).toHaveClass('h-5','w-5');fireEvent.click(button);expect(back).toHaveBeenCalledOnce();
  });
  it.each(['en','hi'] as const)('keeps narrow story audio/text-size targets at least 44px in %s', language => {
    render(<EPaperStoryPreview story={{_id:'released',epaperId:'paper',pageNumber:1,title:'Released story',slug:'released',contentHtml:'Released text',hotspot:{x:0,y:0,w:1,h:1}}} articlePath="/main/article/released" issueTitle="Publication" language={language} onClose={vi.fn()} onOpenClipping={vi.fn()} canListen onPlayAudio={vi.fn()} />);
    const listen=screen.getByRole('button',{name:language==='hi'?'खबर सुनें':'Listen to story'});expect(listen).toHaveClass('min-h-11','min-w-11','reader-focus-ring');
    fireEvent.click(screen.getByRole('button',{name:language==='hi'?'टेक्स्ट':'Text'}));
    for(const name of language==='hi'?['अक्षर का आकार घटाएं','अक्षर का आकार बढ़ाएं']:['Decrease text size','Increase text size'])expect(screen.getByRole('button',{name})).toHaveClass('min-h-11','min-w-11','reader-focus-ring');
  });
  it.each(['epaper','emagazine'] as const)('keeps %s toolbar targets at 44px and preserves publication names', publicationType => {
    const noop=vi.fn(); const {container}=render(<EPaperToolbar title="Reader fixture" editionLabel="Publication" issueDateLabel="October 2026" currentPage={2} pageCount={6} zoom={1.5} canGoPrevious canGoNext canUseSpreadMode onPreviousPage={noop} onNextPage={noop} onPageSelect={noop} onZoomIn={noop} onZoomOut={noop} onResetZoom={noop} onToggleFullscreen={noop} onToggleSave={noop} onToggleSpreadMode={noop} onToggleTheme={noop} onToggleThumbnails={noop} onOpenDownload={noop} onClose={noop} shareUrl="/main/epaper" shareText="Reader" publicationType={publicationType} language="en" />);
    for(const target of container.querySelectorAll('button,select')) {
      expect(target.className).toMatch(/(?:h-11|min-h-11)/);
      expect(target.className).not.toMatch(/(?:\bsm:h-8\b|\bsm:min-h-8\b)/);
      expect(target).toHaveClass('reader-focus-ring');
    }
    expect(screen.getByRole('button',{name:publicationType==='epaper'?'Back to editions':'Back to issues'})).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:publicationType==='epaper'?'Share edition':'Share issue'})).toHaveLength(2);
    expect(screen.getByRole('button',{name:publicationType==='epaper'?'Download edition':'Download issue'})).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toHaveClass('h-11');
  });
  it('enlarges video saved, options and clear targets without enlarging icons or regressing contrast', () => {
    const change=vi.fn();render(<VideoFilterBar searchQuery="News" onSearchChange={change} activeCategory="all" onCategoryChange={vi.fn()} sortMode="latest" onSortModeChange={vi.fn()} viewMode="feed" onViewModeChange={vi.fn()} categoryOptions={['all','National']} language="en" onOpenWatchLater={vi.fn()} />);
    for(const name of ['Saved videos','Filter and sort options','Clear search']){
      const button=screen.getByRole('button',{name});expect(button).toHaveClass('h-11','w-11','reader-focus-ring');
      expect(button.querySelector('svg')).not.toHaveClass('h-11');
    }
    expect(screen.getByRole('textbox')).toHaveClass('reader-focus-ring','h-11','pr-12','placeholder:text-zinc-600','dark:placeholder:text-zinc-400');
    fireEvent.click(screen.getByRole('button',{name:'Clear search'}));expect(change).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button',{name:'Filter and sort options'}));
    for(const button of screen.getAllByRole('button')) expect(button.className).toMatch(/(?:h-11|min-h-11)/);
  });
});
