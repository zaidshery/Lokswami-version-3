import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaperCanvasViewport from '@/components/epaper/reader/EPaperCanvasViewport';
import EPaperStoryPreview from '@/components/epaper/reader/EPaperStoryPreview';
import { isReleasedEpaperIssue } from '@/lib/content/epaperStoryPublication';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

const story: EPaperArticleRecord = { _id: 'released', epaperId: 'paper', title: 'Public headline', slug: 'public', pageNumber: 2, excerpt: 'Released deck', hotspot: { x: .1, y: .2, w: .3, h: .4 } };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('clickable story intent', () => {
  function canvas(zoom = 1) {
    const select = vi.fn(); const changeZoom = vi.fn(); const next = vi.fn();
    render(<EPaperCanvasViewport imagePath="/page.webp" pageNumber={2} articles={[story]} zoom={zoom} onSelectStory={select} onZoomChange={changeZoom} onNextPage={next} />);
    fireEvent.load(screen.getByAltText('Page 2'));
    return { select, changeZoom, next, hotspot: screen.getByRole('button', { name: 'Read story: Public headline' }) };
  }
  it('waits briefly for a touch tap, then selects exactly once', () => {
    vi.useFakeTimers(); const { hotspot, select } = canvas();
    fireEvent.touchStart(hotspot, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(hotspot, { touches: [], changedTouches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.click(hotspot, { detail: 1 });
    expect(select).not.toHaveBeenCalled(); vi.advanceTimersByTime(310);
    expect(select).toHaveBeenCalledExactlyOnceWith(story);
  });
  it('double tapping a story zooms without opening its preview', () => {
    vi.useFakeTimers(); const { hotspot, select, changeZoom } = canvas();
    fireEvent.touchStart(hotspot, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(hotspot, { touches: [], changedTouches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.click(hotspot, { detail: 1 }); vi.advanceTimersByTime(100);
    fireEvent.touchStart(hotspot, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(hotspot, { touches: [], changedTouches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.click(hotspot, { detail: 2 }); vi.advanceTimersByTime(400);
    expect(select).not.toHaveBeenCalled(); expect(changeZoom).toHaveBeenCalledWith(2);
  });
  it('suppresses a mouse click after dragging a zoomed hotspot', () => {
    const { hotspot, select } = canvas(2);
    fireEvent.mouseDown(hotspot, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(hotspot, { clientX: 130, clientY: 110 });
    fireEvent.mouseUp(hotspot); fireEvent.click(hotspot, { detail: 1 });
    expect(select).not.toHaveBeenCalled();
  });
  it('pans a zoomed touch without selecting or changing pages', () => {
    vi.useFakeTimers(); const { hotspot, select, next } = canvas(2);
    fireEvent.touchStart(hotspot, { touches: [{ clientX: 250, clientY: 150 }] });
    fireEvent.touchMove(hotspot, { touches: [{ clientX: 100, clientY: 150 }] });
    fireEvent.touchEnd(hotspot, { touches: [], changedTouches: [{ clientX: 100, clientY: 150 }] });
    fireEvent.click(hotspot, { detail: 1 }); vi.advanceTimersByTime(400);
    expect(select).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled();
  });
});
describe('released preview and issue authority', () => {
  it('places one set of controls and story details above the image', () => {
    render(<EPaperStoryPreview story={{...story,coverImagePath:'/crop.webp'}} articlePath="" issueTitle="Issue" language="en" onClose={vi.fn()} onOpenClipping={vi.fn()} shareControl={null} clippingControl={<div>Inline clipping tools</div>} />);
    const stage = screen.getByRole('region', {name:'Released story crop'});
    const zoom = screen.getByRole('group', {name:'Image zoom controls'});
    expect(zoom.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', {name:'Public headline'}).compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Inline clipping tools').compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByLabelText('Zoom in story image')).toHaveLength(1);
    expect(stage.contains(zoom)).toBe(false);
  });
  it('keeps text, full-page context and listening inside the full-screen reader', () => {
    const play = vi.fn();
    render(<EPaperStoryPreview story={{...story,coverImagePath:'/crop.webp'}} pageImagePath="/page.webp" articlePath="" issueTitle="Issue" language="en" onClose={vi.fn()} onOpenClipping={vi.fn()} shareControl={null} canListen onPlayAudio={play} />);
    fireEvent.click(screen.getByRole('button', {name:'Text'}));
    expect(screen.getByRole('region', {name:'Released story text'})).toHaveTextContent('Released deck');
    fireEvent.click(screen.getByLabelText('Listen to story')); expect(play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', {name:'Visual'}));
    fireEvent.click(screen.getByRole('button', {name:'Full Page'}));
    expect(screen.getByAltText('Story crop: Public headline')).toHaveAttribute('src','/page.webp');
    expect(screen.getByRole('region', {name:'Released story page'})).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('button', {name:'Clipping & audio'})).not.toBeInTheDocument();
  });
  it('shows the released crop first and hides full-story navigation for image-only releases', () => {
    render(<EPaperStoryPreview story={{...story,excerpt:'',coverImagePath:'/released-crop.webp'}} articlePath="/main/article/released" issueTitle="Public issue" language="en" onClose={vi.fn()} onOpenClipping={vi.fn()} shareControl={null} />);
    expect(screen.getByAltText('Story crop: Public headline')).toHaveAttribute('src','/released-crop.webp');
    expect(screen.queryByRole('link',{name:'Read full story'})).not.toBeInTheDocument();
    expect(screen.queryByText('Released deck')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Visual'})).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', {name:'Share story'})).toHaveLength(1);
    expect(screen.queryByRole('button', {name:'Share clipping'})).not.toBeInTheDocument();
  });
  it('falls back to the released page-local area if the crop image fails', () => {
    render(<EPaperStoryPreview story={{...story,coverImagePath:'/failed.webp'}} pageImagePath="/released-page.webp" articlePath="/main/article/released" issueTitle="Public issue" language="en" onClose={vi.fn()} onOpenClipping={vi.fn()} shareControl={null} />);
    fireEvent.error(screen.getByAltText('Story crop: Public headline'));
    const image=screen.getByAltText('Story crop: Public headline');expect(image).toHaveAttribute('src','/released-page.webp');
    expect(image).toHaveStyle({width:`${100/story.hotspot.w}%`,left:`${-100*story.hotspot.x/story.hotspot.w}%`,top:`${-100*story.hotspot.y/story.hotspot.h}%`});
    fireEvent.error(image);expect(screen.getByText('Story image unavailable.')).toHaveAttribute('role', 'status');
  });
  it('focuses close, exposes the existing article route, and restores the trigger', () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const close = vi.fn();
    const { unmount } = render(<EPaperStoryPreview story={story} articlePath="/main/article/released?paper=paper&page=2&story=released" issueTitle="Public issue" language="en" onClose={close} onOpenClipping={vi.fn()} shareControl={null} />);
    expect(screen.getByLabelText('Close story')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Read full story' })).toHaveAttribute('href', '/main/article/released?paper=paper&page=2&story=released');
    expect(screen.queryByText('Released deck')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
    unmount(); expect(trigger).toHaveFocus(); trigger.remove();
  });
  it.each([{ status: 'draft' }, { status: 'scheduled' }, { publishDate: '2999-01-01' }, { publishedAt: '2999-01-01' }, { isCurrentRevision: false }, { isPublished: false }])('denies non-public issue %j', hidden => {
    expect(isReleasedEpaperIssue({ status: 'published', publishDate: '2026-01-01', ...hidden })).toBe(false);
  });
  it('retains eligible released legacy issues', () => {
    expect(isReleasedEpaperIssue({ publishDate: '2026-01-01' })).toBe(true);
  });
});
