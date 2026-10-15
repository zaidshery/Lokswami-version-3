import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import EPaperStoryImageViewport from '@/components/epaper/reader/EPaperStoryImageViewport';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

const story: EPaperArticleRecord = { _id: 'released', epaperId: 'paper', title: 'Headline', slug: 'headline', pageNumber: 1, coverImagePath: '/crop.webp', hotspot: { x: .1, y: .1, w: .5, h: .5 } };
function open() { render(<EPaperStoryImageViewport story={story} language="en" />); }
describe('independent story image reader', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps touch zoom compact and responds when the primary input changes', () => {
    let change: (() => void) | undefined;
    const media = {matches:true,addEventListener:vi.fn((_event, listener) => {change = listener;}),removeEventListener:vi.fn()};
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
    open();
    expect(screen.queryByLabelText('Zoom in story image')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show zoom controls'));
    fireEvent.click(screen.getByLabelText('Zoom in story image'));
    expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('150%');
    fireEvent.click(screen.getByLabelText('Hide zoom controls'));
    expect(screen.queryByLabelText('Zoom in story image')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('region'), {key:'+'});
    expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('200%');
    media.matches = false;
    act(() => change?.());
    expect(screen.getByLabelText('Zoom in story image')).toBeVisible();
    expect(screen.queryByLabelText('Show zoom controls')).not.toBeInTheDocument();
  });
  it('zooms with buttons and resets to fit', () => {
    open(); expect(screen.getByLabelText('Zoom out story image')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Zoom in story image'));
    expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('150%');
    fireEvent.click(screen.getByLabelText('Fit story image'));
    expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('100%');
  });
  it('supports mouse wheel, double click presets, and keyboard zoom', () => {
    open(); const stage = screen.getByRole('region');
    fireEvent.wheel(stage, { deltaY: -350 });
    expect(parseInt(screen.getByLabelText('Story image zoom').textContent || '')).toBeGreaterThan(100);
    fireEvent.keyDown(stage, { key: '0' });
    fireEvent.doubleClick(stage); expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('200%');
    fireEvent.doubleClick(stage); expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('400%');
    fireEvent.doubleClick(stage); expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('100%');
    fireEvent.keyDown(stage, { key: '+' }); expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('150%');
  });
  it('clamps zoom at eight times and prevents shrinking below fit', () => {
    open(); const stage = screen.getByRole('region');
    fireEvent.wheel(stage, { deltaY: -10000 }); expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('800%');
    expect(screen.getByLabelText('Zoom in story image')).toBeDisabled();
    fireEvent.wheel(stage, { deltaY: 10000 }); expect(screen.getByLabelText('Story image zoom')).toHaveTextContent('100%');
  });
});
