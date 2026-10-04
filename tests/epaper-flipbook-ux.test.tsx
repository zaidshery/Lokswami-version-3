import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaperCanvasViewport from '@/components/epaper/reader/EPaperCanvasViewport';
import EPaperPageStrip from '@/components/epaper/reader/EPaperPageStrip';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import { epaperReaderKeyboardAction } from '@/lib/utils/epaperReaderKeyboard';

afterEach(() => vi.restoreAllMocks());

describe('flipbook reader interactions', () => {
  it('requests a thumbnail quality allowed by the production image optimizer', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');
    const strip = fs.readFileSync(path.join(process.cwd(), 'components/epaper/reader/EPaperPageStrip.tsx'), 'utf8');
    const allowed = config.match(/qualities:\s*\[([\d,\s]+)\]/)?.[1].split(',').map(Number);
    const requested = Number(strip.match(/quality=\{(\d+)\}/)?.[1]);
    expect(allowed).toBeDefined();
    expect(allowed).toContain(requested);
  });
  it('keeps direct page jump and thumbnail toggle available, announcing the spread', () => {
    const jump = vi.fn();
    const toggle = vi.fn();
    render(<EPaperToolbar title="Lokswami" editionLabel="Indore" issueDateLabel="October" currentPage={2} pageCount={6} zoom={1} isSpreadMode companionPage={3} onPreviousPage={vi.fn()} onNextPage={vi.fn()} onPageSelect={jump} onZoomIn={vi.fn()} onZoomOut={vi.fn()} onClose={vi.fn()} shareUrl="/main/epaper" shareText="Lokswami" thumbnailsOpen={false} onToggleThumbnails={toggle} />);
    fireEvent.change(screen.getByLabelText('Jump to page'), { target: { value: '5' } });
    expect(jump).toHaveBeenCalledWith(5);
    expect(screen.getByRole('status')).toHaveTextContent('Page 2–3 of 6');
    const button = screen.getByRole('button', { name: 'Show pages' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('marks both spread thumbnails and returns to reading without changing page', () => {
    const select = vi.fn();
    const close = vi.fn();
    render(<EPaperPageStrip pages={[{ pageNumber: 1 }, { pageNumber: 2 }, { pageNumber: 3 }]} activePage={1} companionPage={2} onSelectPage={select} onReturnToReading={close} />);
    expect(screen.getByLabelText('Jump to page 1')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Jump to page 2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Jump to page 3')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Return to reading' }));
    expect(close).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
  });

  it('does not mount thumbnail images while the strip is collapsed', () => {
    render(<EPaperPageStrip pages={[{ pageNumber: 1, imagePath: '/one.jpg' }]} activePage={1} onSelectPage={vi.fn()} isOpen={false} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.getElementById('publication-page-thumbnails')).toHaveAttribute('hidden');
  });

  it('centers the active thumbnail without motion when reduced motion is requested', () => {
    const scroll = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      render(<EPaperPageStrip pages={[{ pageNumber: 1 }]} activePage={1} onSelectPage={vi.fn()} />);
      expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
      vi.unstubAllGlobals();
    }
  });

  it('respects page boundaries for side buttons and fitted swipes', () => {
    const next = vi.fn();
    const previous = vi.fn();
    render(<EPaperCanvasViewport imagePath="/one.jpg" pageNumber={1} zoom={1} onNextPage={next} onPrevPage={previous} canGoPrevious={false} canGoNext={false} />);
    expect(screen.getByLabelText('Turn to previous page')).toBeDisabled();
    expect(screen.getByLabelText('Turn to next page')).toBeDisabled();
    const canvas = screen.getByLabelText('Newspaper page canvas viewport');
    fireEvent.touchStart(canvas, { touches: [{ clientX: 250, clientY: 100 }] });
    fireEvent.touchEnd(canvas, { touches: [], changedTouches: [{ clientX: 100, clientY: 100 }] });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not turn a page after a pinch that began as a one-finger swipe', () => {
    const next = vi.fn();
    render(<EPaperCanvasViewport imagePath="/one.jpg" pageNumber={1} zoom={1} onNextPage={next} />);
    const canvas = screen.getByLabelText('Newspaper page canvas viewport');
    fireEvent.touchStart(canvas, { touches: [{ clientX: 250, clientY: 100 }] });
    fireEvent.touchMove(canvas, { touches: [{ clientX: 190, clientY: 100 }] });
    fireEvent.touchStart(canvas, { touches: [{ clientX: 190, clientY: 100 }, { clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(canvas, { touches: [], changedTouches: [{ clientX: 100, clientY: 100 }] });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not treat a zoom-control tap as a page double tap', () => {
    const zoom = vi.fn();
    render(<EPaperCanvasViewport imagePath="/one.jpg" pageNumber={1} zoom={1} onZoomChange={zoom} />);
    const preset = screen.getByLabelText('Toggle zoom preset');
    fireEvent.touchStart(preset, { touches: [{ clientX: 150, clientY: 300 }] });
    fireEvent.touchStart(preset, { touches: [{ clientX: 150, clientY: 300 }] });
    expect(zoom).not.toHaveBeenCalled();
    fireEvent.click(preset);
    expect(zoom).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('keeps the controlled zoom after a cancelled touch gesture', () => {
    const { container } = render(<EPaperCanvasViewport imagePath="/one.jpg" pageNumber={1} zoom={2} />);
    fireEvent.touchCancel(screen.getByLabelText('Newspaper page canvas viewport'));
    expect(container.querySelector('[data-reader-canvas] > div')).toHaveStyle({ transform: 'translate3d(0px, 0px, 0) scale(2)' });
  });

  it('bounds desktop panning so the zoomed page cannot be dragged away', () => {
    const { container } = render(<EPaperCanvasViewport imagePath="/one.jpg" pageNumber={1} zoom={2} />);
    const viewport = screen.getByLabelText('Newspaper page canvas viewport');
    const content = container.querySelector('[data-reader-canvas] > div')!;
    Object.defineProperties(viewport, { clientWidth: { value: 400 }, clientHeight: { value: 500 } });
    Object.defineProperties(content, { offsetWidth: { value: 300 }, offsetHeight: { value: 400 } });
    fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(viewport, { clientX: 2000, clientY: 2000 });
    fireEvent.mouseUp(viewport);
    expect(content).toHaveStyle({ transform: 'translate3d(124px, 198px, 0) scale(2)' });
  });

  it('keeps a failed thumbnail navigable', () => {
    const select = vi.fn();
    render(<EPaperPageStrip pages={[{ pageNumber: 1, imagePath: '/one.jpg' }]} activePage={1} onSelectPage={select} />);
    fireEvent.error(screen.getByAltText('Page 1'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Jump to page 1'));
    expect(select).toHaveBeenCalledWith(1);
  });

  it('recovers a failed second page independently and hides its stale hotspots', () => {
    render(<EPaperCanvasViewport imagePath="/one.jpg" pageNumber={1} zoom={1} isSpreadMode spreadSecondImagePath="/two.jpg" spreadSecondPageNumber={2} />);
    fireEvent.load(screen.getByAltText('Page 1'));
    fireEvent.error(screen.getByAltText('Page 2'));
    expect(screen.getByRole('alert')).toHaveAttribute('aria-label', 'Page 2 unavailable');
    expect(screen.getByAltText('Page 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry page 2' }));
    expect(screen.getByAltText('Page 2')).toBeInTheDocument();
  });
});

describe('reader shortcut routing', () => {
  it.each([['ArrowLeft', 'previous'], ['ArrowRight', 'next'], ['Home', 'first'], ['End', 'last'], ['+', 'zoom-in'], ['-', 'zoom-out'], ['0', 'reset'], ['Escape', 'escape']])('routes %s to %s', (key, action) => {
    expect(epaperReaderKeyboardAction(new KeyboardEvent('keydown', { key }))).toBe(action);
  });
  it.each(['input', 'select', 'textarea'])('leaves %s keyboard interactions intact', (tag) => {
    const target = document.createElement(tag);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    target.dispatchEvent(event);
    expect(epaperReaderKeyboardAction(event)).toBeNull();
  });
  it('preserves browser shortcuts and already handled keys', () => {
    expect(epaperReaderKeyboardAction(new KeyboardEvent('keydown', { key: '+', ctrlKey: true }))).toBeNull();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    event.preventDefault();
    expect(epaperReaderKeyboardAction(event)).toBeNull();
  });
  it('preserves editing in nested contenteditable elements', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editor.append(child);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    child.dispatchEvent(event);
    expect(epaperReaderKeyboardAction(event)).toBeNull();
  });
});
