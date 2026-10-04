import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEPaperPageTurn } from '@/components/epaper/reader/useEPaperPageTurn';
import EPaperCanvasViewport from '@/components/epaper/reader/EPaperCanvasViewport';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function readyImages(reduced = false) {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('Image', class { complete = true; onload = null; onerror = null; src = ''; });
}
describe('settled page turn state', () => {
  it.each([1, -1] as const)('preloads then commits exactly once after direction %s settles', async direction => {
    readyImages(); const commit = vi.fn();
    const { result } = renderHook(() => useEPaperPageTurn('issue:spread'));
    await act(async () => { result.current.start({ page: direction === 1 ? 3 : 1, direction, image: '/next.webp', secondImage: '/right.webp' }, commit); });
    expect(result.current.turn?.phase).toBe('turning'); expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(360)); expect(commit).not.toHaveBeenCalled();
    act(() => result.current.complete()); expect(commit).toHaveBeenCalledOnce(); expect(result.current.turn).toBeNull();
  });
  it('ignores rapid requests and cancels a stale turn on issue/view replacement', async () => {
    readyImages(); const commit = vi.fn(); const other = vi.fn();
    const { result, rerender } = renderHook(({ identity }) => useEPaperPageTurn(identity), {initialProps:{identity:'one:spread'}});
    await act(async () => { result.current.start({page:3,direction:1,image:'/next'},commit); });
    act(() => { expect(result.current.start({page:5,direction:1,image:'/other'},other)).toBe(false); });
    rerender({identity:'two:single'}); act(() => vi.advanceTimersByTime(1000));
    expect(commit).not.toHaveBeenCalled(); expect(other).not.toHaveBeenCalled(); expect(result.current.turn).toBeNull();
  });
  it('commits immediately for reduced motion', () => {
    readyImages(true); const commit = vi.fn(); const { result } = renderHook(() => useEPaperPageTurn('one'));
    act(() => { result.current.start({page:2,direction:1,image:'/next'},commit); });
    expect(commit).toHaveBeenCalledOnce(); expect(result.current.turn).toBeNull();
  });
  it('does not commit twice when animation completion and the recovery timer race', async () => {
    readyImages();const commit=vi.fn();const {result}=renderHook(()=>useEPaperPageTurn('one'));
    await act(async()=>{result.current.start({page:2,direction:1,image:'/two'},commit);});
    act(()=>{result.current.complete();result.current.complete();vi.advanceTimersByTime(1000);});
    expect(commit).toHaveBeenCalledOnce();
  });
  it('keeps the old page while a destination is slow or fails', async () => {
    readyImages();vi.stubGlobal('Image', class { complete=false; onload=null; onerror=null; src=''; });
    const commit=vi.fn();const {result}=renderHook(()=>useEPaperPageTurn('one'));
    act(()=>{result.current.start({page:2,direction:1,image:'/slow'},commit);});
    expect(result.current.turn?.phase).toBe('loading');expect(commit).not.toHaveBeenCalled();
    await act(async()=>vi.advanceTimersByTime(1500));expect(result.current.turn?.phase).toBe('turning');
    act(()=>vi.advanceTimersByTime(800));expect(commit).toHaveBeenCalledOnce();
  });
});
describe('page input and departing leaf', () => {
  it('turns at a non-story desktop edge but keeps a hotspot click separate', () => {
    const next=vi.fn();const select=vi.fn();render(<EPaperCanvasViewport imagePath="/one" pageNumber={1} zoom={1} onNextPage={next} onSelectStory={select} articles={[{_id:'story',epaperId:'one',slug:'story',title:'Story',pageNumber:1,hotspot:{x:.1,y:.1,w:.3,h:.3}}]} />);
    const image=screen.getByAltText('Page 1');fireEvent.load(image);
    const book=image.closest('[data-reader-book]')!;vi.spyOn(book,'getBoundingClientRect').mockReturnValue({left:100,right:500,width:400} as DOMRect);
    fireEvent.click(image.parentElement!,{clientX:490,detail:1});expect(next).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText('Read story: Story'));expect(select).toHaveBeenCalledOnce();expect(next).toHaveBeenCalledOnce();
  });
  it('turns after a fitted horizontal mouse drag and suppresses its click', () => {
    const next=vi.fn();render(<EPaperCanvasViewport imagePath="/one" pageNumber={1} zoom={1} onNextPage={next} />);
    const page=screen.getByAltText('Page 1').parentElement!;
    fireEvent.mouseDown(page,{button:0,clientX:300,clientY:200});fireEvent.mouseMove(page,{clientX:150,clientY:205});fireEvent.mouseUp(page);fireEvent.click(page,{clientX:150,detail:1});
    expect(next).toHaveBeenCalledOnce();
  });
  it('keeps old image and spine leaf faces while suspending hotspot interaction', () => {
    render(<EPaperCanvasViewport imagePath="/one" pageNumber={1} zoom={1} isSpreadMode spreadSecondImagePath="/two" spreadSecondPageNumber={2} pageTurn={{page:3,direction:1,image:'/three',secondImage:'/four',phase:'turning'}} />);
    expect(screen.getByAltText('Page 1')).toHaveAttribute('src','/one');expect(screen.getByAltText('Page 2')).toHaveAttribute('src','/two');
    expect(screen.getByLabelText('Newspaper page canvas viewport')).toHaveAttribute('aria-busy','true');
    expect(document.querySelector('[data-reader-turn="forward"] img[src="/four"]')).toBeInTheDocument();
    expect(document.querySelector('[data-reader-turn="forward"] img[src="/three"]')).toBeInTheDocument();
  });
});
