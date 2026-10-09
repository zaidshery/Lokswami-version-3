'use client';

import { useCallback, useRef } from 'react';
import { useReportWebVitals } from 'next/web-vitals';

type Metric = {
  name: string;
  value: number;
  id: string;
  navigationType?: string;
};

const SUPPORTED_METRICS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);

function getDeviceCategory(): 'mobile' | 'desktop' | 'tablet' {
  const ua = navigator.userAgent.toLowerCase();
  const width = window.innerWidth || 0;
  if (/ipad|tablet/.test(ua) || (width >= 768 && width < 1024)) return 'tablet';
  if (/mobile|android|iphone|ipod/.test(ua) || width < 768) return 'mobile';
  return 'desktop';
}

function sendVitalBeacon(metric: Metric, path: string) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    navigationType: metric.navigationType,
    path,
    deviceType: getDeviceCategory(),
  });
  const endpoint = '/api/v1/public/analytics/vitals';

  if (typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
  } else {
    void fetch(endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  }
}

export default function WebVitalsBeacon() {
  // Original document metrics retain the initial path across SPA transitions.
  // A bfcache restoration starts a new metric lifecycle at the current path.
  const documentPath = useRef<string | null>(null);
  if (documentPath.current === null && typeof window !== 'undefined') {
    documentPath.current = window.location.pathname;
  }
  const reported = useRef(new Set<string>());

  const reportMetric = useCallback((metric: Metric) => {
    if (!SUPPORTED_METRICS.has(metric.name) || !documentPath.current) return;
    // The Web Vitals library can report a metric again as its value changes.
    // Suppress repeated delivery of the same measurement, retaining updates.
    const key = `${metric.name}:${metric.id}:${metric.value}`;
    if (reported.current.has(key)) return;
    reported.current.add(key);
    const path = metric.navigationType === 'back-forward-cache'
      ? window.location.pathname
      : documentPath.current;
    sendVitalBeacon(metric, path);
  }, []);

  // Next owns the observers and session-window CLS/INP calculations. This hook
  // is registered once for the root-layout lifetime, not per pathname change.
  useReportWebVitals(reportMetric);
  return null;
}

export { WebVitalsBeacon };
