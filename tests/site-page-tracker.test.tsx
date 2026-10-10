import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { StrictMode } from 'react';
import { render } from '@testing-library/react';
import SitePageTracker from '@/components/analytics/SitePageTracker';

const navigationState = vi.hoisted(() => ({
  pathname: '/main',
}));

const trackClientEventMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: trackClientEventMock,
}));

vi.mock('@/components/seo/WebVitalsBeacon', () => ({
  default: () => null,
}));

describe('SitePageTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState.pathname = '/main';
  });

  it('emits initial page view exactly once', () => {
    navigationState.pathname = '/main';
    render(<SitePageTracker />);

    expect(trackClientEventMock).toHaveBeenCalledTimes(1);
    expect(trackClientEventMock).toHaveBeenCalledWith({
      event: 'page_view',
      page: '/main',
      source: 'reader_home',
      metadata: {
        pageType: 'home',
        section: 'home',
        pathnameDepth: 1,
      },
    });
  });

  it('emits page view on SPA pathname transition', () => {
    navigationState.pathname = '/main';
    const { rerender } = render(<SitePageTracker />);

    expect(trackClientEventMock).toHaveBeenCalledTimes(1);

    // Transition to article page
    navigationState.pathname = '/main/article/breaking-news-slug';
    rerender(<SitePageTracker />);

    expect(trackClientEventMock).toHaveBeenCalledTimes(2);
    expect(trackClientEventMock).toHaveBeenLastCalledWith({
      event: 'page_view',
      page: '/main/article/breaking-news-slug',
      source: 'article_page',
      metadata: {
        pageType: 'article_detail',
        section: 'article',
        pathnameDepth: 3,
      },
    });
  });

  it('does not emit duplicate event on component rerender with same pathname', () => {
    navigationState.pathname = '/main';
    const { rerender } = render(<SitePageTracker />);

    expect(trackClientEventMock).toHaveBeenCalledTimes(1);

    // Rerender same component
    rerender(<SitePageTracker />);
    rerender(<SitePageTracker />);

    expect(trackClientEventMock).toHaveBeenCalledTimes(1);
  });

  it('does not emit duplicate event under React StrictMode', () => {
    navigationState.pathname = '/main/category/politics';
    render(
      <StrictMode>
        <SitePageTracker />
      </StrictMode>
    );

    // Under StrictMode, effects might be run twice in dev, but lastTrackedPathRef protects duplicate
    expect(trackClientEventMock).toHaveBeenCalledTimes(1);
  });

  it('does not emit page view when pathname does not change (e.g. hash or query changes)', () => {
    navigationState.pathname = '/main';
    const { rerender } = render(<SitePageTracker />);

    expect(trackClientEventMock).toHaveBeenCalledTimes(1);

    // Hash or query changes in URL do not alter Next.js usePathname
    // pathname remains '/main'
    rerender(<SitePageTracker />);

    expect(trackClientEventMock).toHaveBeenCalledTimes(1);
  });

  it('does not emit page view for excluded paths (/admin, /api, /signin)', () => {
    navigationState.pathname = '/admin/dashboard';
    const { rerender } = render(<SitePageTracker />);
    expect(trackClientEventMock).not.toHaveBeenCalled();

    navigationState.pathname = '/api/health';
    rerender(<SitePageTracker />);
    expect(trackClientEventMock).not.toHaveBeenCalled();

    navigationState.pathname = '/signin';
    rerender(<SitePageTracker />);
    expect(trackClientEventMock).not.toHaveBeenCalled();
  });
});
