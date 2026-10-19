'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackClientEvent } from '@/lib/analytics/trackClient';
import WebVitalsBeacon from '@/components/seo/WebVitalsBeacon';

type PageTrackingPayload = {
  source: string;
  metadata: Record<string, unknown>;
};

export function getPublicPageTrackingPayload(pathname: string): PageTrackingPayload | null {
  const normalizedPath = String(pathname || '/').trim() || '/';

  if (
    normalizedPath.startsWith('/admin') ||
    normalizedPath.startsWith('/api') ||
    normalizedPath.startsWith('/signin')
  ) {
    return null;
  }

  const pathnameDepth = normalizedPath.split('/').filter(Boolean).length;

  if (normalizedPath === '/' || normalizedPath === '/main') {
    return {
      source: 'reader_home',
      metadata: { pageType: 'home', section: 'home', pathnameDepth },
    };
  }

  if (normalizedPath.startsWith('/main/article/')) {
    return {
      source: 'article_page',
      metadata: { pageType: 'article_detail', section: 'article', pathnameDepth },
    };
  }

  if (normalizedPath.startsWith('/main/category/')) {
    return {
      source: 'category_page',
      metadata: { pageType: 'category_listing', section: 'category', pathnameDepth },
    };
  }

  if (normalizedPath.startsWith('/main/videos')) {
    return {
      source: 'video_page',
      metadata: { pageType: 'video_surface', section: 'videos', pathnameDepth },
    };
  }

  if (normalizedPath.startsWith('/main/epaper')) {
    return {
      source: 'epaper_page',
      metadata: { pageType: 'epaper_surface', section: 'epaper', pathnameDepth },
    };
  }

  if (normalizedPath.startsWith('/main/contact')) {
    return {
      source: 'contact_page',
      metadata: { pageType: 'contact_page', section: 'contact', pathnameDepth },
    };
  }

  if (normalizedPath.startsWith('/main/account')) {
    return {
      source: 'account_page',
      metadata: { pageType: 'account_page', section: 'account', pathnameDepth },
    };
  }

  if (normalizedPath.startsWith('/main')) {
    return {
      source: 'reader_page',
      metadata: { pageType: 'reader_surface', section: 'main', pathnameDepth },
    };
  }

  return {
    source: 'marketing_page',
    metadata: { pageType: 'marketing_page', section: 'marketing', pathnameDepth },
  };
}

export default function SitePageTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef('');

  useEffect(() => {
    const normalizedPath = String(pathname || '/').trim() || '/';
    const payload = getPublicPageTrackingPayload(normalizedPath);

    if (!payload) {
      lastTrackedPathRef.current = '';
      return;
    }
    if (lastTrackedPathRef.current === normalizedPath) return;

    lastTrackedPathRef.current = normalizedPath;

    trackClientEvent({
      event: 'page_view',
      page: normalizedPath,
      source: payload.source,
      metadata: payload.metadata,
      destination: 'first-party',
    });
  }, [pathname]);

  return <WebVitalsBeacon />;
}
