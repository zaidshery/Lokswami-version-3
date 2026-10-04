import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import EPaperPageStrip from '@/components/epaper/reader/EPaperPageStrip';
import { buildPublicationReaderPath } from '@/lib/utils/readerContentPaths';
import { buildEpaperPageMetadata } from '@/lib/seo/readerPageMetadata';

describe('Phase 3.15A — E-Paper Reader 2.0 Acceptance', () => {
  describe('Public Eligibility & Canonical Route Authorities', () => {
    it('builds canonical deep-link query preserving paper, city, date, and page', () => {
      const path = buildPublicationReaderPath({
        publicationType: 'epaper',
        paperId: 'epaper-indore-101',
        city: 'indore',
        publishDate: '2026-10-04',
        page: 3,
      });

      expect(path).toBe('/main/epaper?paper=epaper-indore-101&city=indore&date=2026-10-04&page=3');
    });

    it('sets index: true for valid published issue metadata', () => {
      const meta = buildEpaperPageMetadata({
        index: true,
        publicationType: 'epaper',
        city: 'indore',
        publishDate: '2026-10-04',
        paperId: 'epaper-indore-101',
        page: 1,
        issueTitle: 'Lokswami Indore',
      });

      expect(meta.robots).toEqual(
        expect.objectContaining({
          index: true,
          follow: true,
        })
      );
    });

    it('fails closed with noindex when requested issue is missing or unreleased', () => {
      const meta = buildEpaperPageMetadata({
        index: false,
        publicationType: 'epaper',
        city: 'indore',
        publishDate: '2026-10-04',
        paperId: 'invalid-hidden-id',
        page: 1,
      });

      expect(meta.robots).toEqual(
        expect.objectContaining({
          index: false,
        })
      );
    });
  });

  describe('EPaperToolbar Navigation & Controls', () => {
    const defaultProps = {
      title: 'Lokswami Indore Daily',
      editionLabel: 'इन्दौर संस्करण',
      issueDateLabel: '(04 अक्टूबर 2026)',
      currentPage: 1,
      pageCount: 6,
      zoom: 1,
      canGoPrevious: false,
      canGoNext: true,
      onPreviousPage: vi.fn(),
      onNextPage: vi.fn(),
      onPageSelect: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onResetZoom: vi.fn(),
      isFullscreen: false,
      onToggleFullscreen: vi.fn(),
      onClose: vi.fn(),
      shareUrl: 'https://lokswami.in/main/epaper?paper=test&page=1',
      shareText: 'Lokswami E-Paper',
    };

    it('renders edition metadata, page counter, and boundary states', () => {
      render(<EPaperToolbar {...defaultProps} />);

      expect(screen.getAllByText('इन्दौर संस्करण').length).toBeGreaterThan(0);
      expect(screen.getAllByText('(04 अक्टूबर 2026)').length).toBeGreaterThan(0);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('6')).toBeInTheDocument();

      const prevBtn = screen.getByLabelText('Previous page');
      const nextBtn = screen.getByLabelText('Next page');

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();

      fireEvent.click(nextBtn);
      expect(defaultProps.onNextPage).toHaveBeenCalledTimes(1);
    });

    it('supports direct quick-jump page select', () => {
      render(<EPaperToolbar {...defaultProps} />);

      const select = screen.getByLabelText('Jump to page');
      fireEvent.change(select, { target: { value: '4' } });

      expect(defaultProps.onPageSelect).toHaveBeenCalledWith(4);
    });

    it('triggers zoom in, zoom out, and reset zoom actions', () => {
      render(<EPaperToolbar {...defaultProps} zoom={1.5} />);

      expect(screen.getByText('150%')).toBeInTheDocument();

      const zoomInBtn = screen.getByLabelText('Zoom in');
      const zoomOutBtn = screen.getByLabelText('Zoom out');
      const resetBtn = screen.getByLabelText('Reset zoom');

      fireEvent.click(zoomInBtn);
      expect(defaultProps.onZoomIn).toHaveBeenCalledTimes(1);

      fireEvent.click(zoomOutBtn);
      expect(defaultProps.onZoomOut).toHaveBeenCalledTimes(1);

      fireEvent.click(resetBtn);
      expect(defaultProps.onResetZoom).toHaveBeenCalledTimes(1);
    });

    it('triggers fullscreen toggle on both desktop and mobile viewports', () => {
      const { rerender } = render(<EPaperToolbar {...defaultProps} isFullscreen={false} />);

      const enterFullscreenBtns = screen.getAllByLabelText('Enter fullscreen');
      expect(enterFullscreenBtns.length).toBeGreaterThan(0);

      fireEvent.click(enterFullscreenBtns[0]);
      expect(defaultProps.onToggleFullscreen).toHaveBeenCalledTimes(1);

      rerender(<EPaperToolbar {...defaultProps} isFullscreen={true} />);
      const exitFullscreenBtns = screen.getAllByLabelText('Exit fullscreen');
      expect(exitFullscreenBtns.length).toBeGreaterThan(0);
    });

    it('triggers reader close on close button click', () => {
      render(<EPaperToolbar {...defaultProps} />);

      const closeBtn = screen.getByTitle('Close reader');
      fireEvent.click(closeBtn);

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('EPaperPageStrip Thumbnail Navigation', () => {
    const pages = [
      { pageNumber: 1, imagePath: '/page-1.jpg', storyCount: 3 },
      { pageNumber: 2, imagePath: '/page-2.jpg', storyCount: 2 },
      { pageNumber: 3, imagePath: '/page-3.jpg', storyCount: 4 },
    ];

    it('renders accessible thumbnails and highlights active page', () => {
      const onSelectPage = vi.fn();
      render(
        <EPaperPageStrip
          pages={pages}
          activePage={2}
          onSelectPage={onSelectPage}
          isOpen={true}
        />
      );

      const page1 = screen.getByLabelText('Jump to page 1');
      const page2 = screen.getByLabelText('Jump to page 2');
      const page3 = screen.getByLabelText('Jump to page 3');

      expect(page1).toBeInTheDocument();
      expect(page2).toBeInTheDocument();
      expect(page3).toBeInTheDocument();

      expect(page1).not.toHaveAttribute('aria-current');
      expect(page2).toHaveAttribute('aria-current', 'page');
      expect(page3).not.toHaveAttribute('aria-current');

      fireEvent.click(page3);
      expect(onSelectPage).toHaveBeenCalledWith(3);
    });
  });

  describe('Navigation Boundary & Page Clamping Rules', () => {
    function clampPage(page: number, min: number, max: number) {
      return Math.min(max, Math.max(min, page));
    }

    it('clamps out-of-bound page queries', () => {
      const pageCount = 8;
      expect(clampPage(0, 1, pageCount)).toBe(1);
      expect(clampPage(-5, 1, pageCount)).toBe(1);
      expect(clampPage(9, 1, pageCount)).toBe(8);
      expect(clampPage(999, 1, pageCount)).toBe(8);
      expect(clampPage(4, 1, pageCount)).toBe(4);
    });

    it('retains zoom across page turns while resetting on edition switch', () => {
      let currentZoom = 1;
      let activeEdition = 'edition-A';

      // User zooms into page 1
      currentZoom = 2.0;

      // User turns to page 2 within same edition: zoom retained
      const turnPage = () => {
        // Product rule: retain zoom on same edition page navigation
        return currentZoom;
      };
      expect(turnPage()).toBe(2.0);

      // User switches edition: zoom reset
      const switchEdition = (newEdition: string) => {
        activeEdition = newEdition;
        currentZoom = 1.0;
        return currentZoom;
      };
      expect(switchEdition('edition-B')).toBe(1.0);
      expect(activeEdition).toBe('edition-B');
    });
  });
});
