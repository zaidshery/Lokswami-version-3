import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EPaperCanvasViewport from '@/components/epaper/reader/EPaperCanvasViewport';
import Hotspots from '@/components/epaper/reader/EPaperHotspotLayer';
import { epaperHotspotStyle } from '@/lib/utils/epaperHotspotGeometry';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

const story: EPaperArticleRecord = { _id: 'one', epaperId: 'paper', slug: 'one', title: 'Mapped story', pageNumber: 1, hotspot: { x: 0.25, y: 0.1, w: 0.5, h: 0.3 } };

describe('reader mapping geometry and lifecycle', () => {
  it('positions normalized coordinates and rejects invalid page boxes', () => {
    expect(epaperHotspotStyle(story.hotspot)).toEqual({ left: '25%', top: '10%', width: '50%', height: '30%' });
    expect(epaperHotspotStyle({ x: 0.9, y: 0, w: 0.5, h: 0.2 })).toBeNull();
    expect(epaperHotspotStyle({ x: NaN, y: 0, w: 0.5, h: 0.2 })).toBeNull();
  });
  it('keeps stories clickable when visual hints are off', () => {
    const select = vi.fn();
    render(<Hotspots articles={[story]} onSelectStory={select} showHints={false} />);
    const button = screen.getByRole('button', { name: 'Read story: Mapped story' });
    expect(button).toHaveStyle({ left: '25%', width: '50%' });
    fireEvent.click(button);
    expect(select).toHaveBeenCalledWith(story);
  });
  it('does not lose loaded hotspots when zoom changes and loads spread pages independently', () => {
    const select = vi.fn();
    const props = { imagePath: '/one.jpg', pageNumber: 1, articles: [story], onSelectStory: select, showHotspots: false };
    const { rerender } = render(<EPaperCanvasViewport {...props} zoom={1} />);
    fireEvent.load(screen.getByAltText('Page 1'));
    rerender(<EPaperCanvasViewport {...props} zoom={3} isSpreadMode spreadSecondImagePath="/two.jpg" spreadSecondPageNumber={2} spreadSecondArticles={[{ ...story, _id: 'two', title: 'Second story', pageNumber: 2 }]} />);
    expect(screen.getByRole('button', { name: 'Read story: Mapped story' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read story: Second story' })).not.toBeInTheDocument();
    fireEvent.load(screen.getByAltText('Page 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Read story: Second story' }));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ pageNumber: 2 }));
    rerender(<EPaperCanvasViewport {...props} imagePath="/new.jpg" zoom={1} />);
    expect(screen.queryByRole('button', { name: 'Read story: Mapped story' })).not.toBeInTheDocument();
  });

  it('changes pages with a horizontal touch swipe at fitted zoom', () => {
    const nextPage = vi.fn();
    const previousPage = vi.fn();
    render(
      <EPaperCanvasViewport
        imagePath="/one.jpg"
        pageNumber={1}
        zoom={1}
        onNextPage={nextPage}
        onPrevPage={previousPage}
      />
    );

    const viewport = screen.getByLabelText('Newspaper page canvas viewport');
    fireEvent.touchStart(viewport, { touches: [{ clientX: 280, clientY: 220 }] });
    fireEvent.touchMove(viewport, { touches: [{ clientX: 170, clientY: 224 }] });
    fireEvent.touchEnd(viewport, {
      touches: [],
      changedTouches: [{ clientX: 150, clientY: 225 }],
    });

    expect(nextPage).toHaveBeenCalledTimes(1);
    expect(previousPage).not.toHaveBeenCalled();
  });

  it('keeps hotspot taps clickable without treating them as page swipes', () => {
    const select = vi.fn();
    const nextPage = vi.fn();
    render(
      <EPaperCanvasViewport
        imagePath="/one.jpg"
        pageNumber={1}
        zoom={1}
        articles={[story]}
        onSelectStory={select}
        onNextPage={nextPage}
      />
    );
    fireEvent.load(screen.getByAltText('Page 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Read story: Mapped story' }));

    expect(select).toHaveBeenCalledWith(story);
    expect(nextPage).not.toHaveBeenCalled();
  });
});
