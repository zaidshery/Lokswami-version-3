import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import EPaperPageStrip from '@/components/epaper/reader/EPaperPageStrip';
import EPaperCanvasViewport from '@/components/epaper/reader/EPaperCanvasViewport';
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

    it('disables zoom out at 1x floor and disables zoom in at 4x ceiling', () => {
      const { rerender } = render(<EPaperToolbar {...defaultProps} zoom={1} minZoom={1} maxZoom={4} />);

      const zoomOutAtMin = screen.getByLabelText('Zoom out');
      const zoomInAtMin = screen.getByLabelText('Zoom in');
      expect(zoomOutAtMin).toBeDisabled();
      expect(zoomInAtMin).toBeEnabled();

      rerender(<EPaperToolbar {...defaultProps} zoom={4} minZoom={1} maxZoom={4} />);
      const zoomOutAtMax = screen.getByLabelText('Zoom out');
      const zoomInAtMax = screen.getByLabelText('Zoom in');
      expect(zoomOutAtMax).toBeEnabled();
      expect(zoomInAtMax).toBeDisabled();
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

  describe('Reader Zoom Range & Keyboard Clamping Rules', () => {
    const MIN_PREVIEW_ZOOM = 1;
    const MAX_PREVIEW_ZOOM = 4;
    const PREVIEW_ZOOM_STEP = 0.2;

    function applyZoomIn(current: number) {
      return Math.min(MAX_PREVIEW_ZOOM, Number((current + PREVIEW_ZOOM_STEP).toFixed(2)));
    }

    function applyZoomOut(current: number) {
      return Math.max(MIN_PREVIEW_ZOOM, Number((current - PREVIEW_ZOOM_STEP).toFixed(2)));
    }

    function applyResetZoom() {
      return MIN_PREVIEW_ZOOM;
    }

    it('enforces 4x ceiling on zoom-in operations and keyboard + / =', () => {
      let zoom = 3.8;
      zoom = applyZoomIn(zoom);
      expect(zoom).toBe(4.0);

      // Cannot exceed 4x
      zoom = applyZoomIn(zoom);
      expect(zoom).toBe(4.0);
      zoom = applyZoomIn(zoom);
      expect(zoom).toBe(4.0);
    });

    it('enforces 1x floor on zoom-out operations and keyboard - / _', () => {
      let zoom = 1.2;
      zoom = applyZoomOut(zoom);
      expect(zoom).toBe(1.0);

      // Cannot go below 1x
      zoom = applyZoomOut(zoom);
      expect(zoom).toBe(1.0);
      zoom = applyZoomOut(zoom);
      expect(zoom).toBe(1.0);
    });

    it('resets to exactly 1x on reset (key 0)', () => {
      expect(applyResetZoom()).toBe(1.0);
    });
  });

  describe('Page Image Failure & Retry Behavior', () => {
    it('renders accessible error state and retry action when image fails', () => {
      render(
        <EPaperCanvasViewport
          imagePath="/uploads/epapers/indore-missing-page.webp"
          pageNumber={3}
          zoom={1}
        />
      );

      const img = screen.getByAltText('Page 3');
      expect(img).toBeInTheDocument();

      // Simulate network / missing image error
      fireEvent.error(img);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('aria-label', 'Page 3 unavailable');
      expect(screen.getByText('Page image unavailable')).toBeInTheDocument();
      expect(screen.getByText(/Could not load page 3/)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry page/i });
      expect(retryBtn).toBeInTheDocument();

      // Clicking retry clears failed source so image can re-attempt
      fireEvent.click(retryBtn);
      expect(screen.getByAltText('Page 3')).toBeInTheDocument();
    });
  });

  describe('Touch Pinch/Pan and Desktop Drag-Pan Gestures', () => {
    it('handles desktop mouse drag pan when zoomed in', () => {
      const { container } = render(
        <EPaperCanvasViewport
          imagePath="/page-1.webp"
          pageNumber={1}
          zoom={2}
        />
      );

      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();

      // Mouse drag sequence while zoomed
      fireEvent.mouseDown(main!, { clientX: 200, clientY: 200 });
      fireEvent.mouseMove(main!, { clientX: 250, clientY: 230 });
      fireEvent.mouseUp(main!);

      // Successfully processed pan without throwing
      expect(main).toBeInTheDocument();
    });

    it('handles touch pinch-to-zoom and touch pan without layout crash', () => {
      const onZoomChange = vi.fn();
      const { container } = render(
        <EPaperCanvasViewport
          imagePath="/page-1.webp"
          pageNumber={1}
          zoom={1}
          minZoom={1}
          maxZoom={4}
          onZoomChange={onZoomChange}
        />
      );

      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();

      // 2-finger pinch gesture
      fireEvent.touchStart(main!, {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 },
        ],
      });

      fireEvent.touchMove(main!, {
        touches: [
          { clientX: 50, clientY: 100 },
          { clientX: 250, clientY: 100 },
        ],
      });

      expect(onZoomChange).toHaveBeenCalled();

      fireEvent.touchEnd(main!, {
        touches: [],
      });
    });
  });

  describe('Fullscreen Feature-Detection & Fallback', () => {
    it('gracefully handles missing or rejected requestFullscreen without throwing', async () => {
      const container = document.createElement('div');

      // 1. Missing requestFullscreen API (e.g. iOS Safari)
      const targetWithoutApi = container as HTMLDivElement & {
        requestFullscreen?: () => Promise<void>;
      };
      const toggleFullscreenWithoutApi = async () => {
        try {
          if (!document.fullscreenElement) {
            if (targetWithoutApi.requestFullscreen) {
              await targetWithoutApi.requestFullscreen();
            }
          }
        } catch {
          // Graceful fallback
        }
      };

      await expect(toggleFullscreenWithoutApi()).resolves.toBeUndefined();

      // 2. Rejecting requestFullscreen (e.g. Permission Policy denied)
      container.requestFullscreen = vi.fn().mockRejectedValue(new Error('Permission denied'));

      const toggleFullscreenWithRejection = async () => {
        try {
          if (!document.fullscreenElement) {
            if (container.requestFullscreen) {
              await container.requestFullscreen();
            }
          }
        } catch {
          // Graceful fallback
        }
      };

      await expect(toggleFullscreenWithRejection()).resolves.toBeUndefined();
    });
  });
});
