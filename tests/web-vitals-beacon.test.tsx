import { createElement, useEffect } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebVitalsBeacon from '@/components/seo/WebVitalsBeacon';

type Metric = {
  name: string;
  value: number;
  id: string;
  delta: number;
  entries: never[];
  rating: string;
  navigationType: string;
};
const mocks = vi.hoisted(() => ({
  setup: vi.fn(),
  cleanup: vi.fn(),
  report: null as ((metric: Metric) => void) | null,
}));

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: (callback: (metric: Metric) => void) => {
    useEffect(() => {
      mocks.setup();
      mocks.report = callback;
      return () => {
        mocks.cleanup();
        mocks.report = null;
      };
    }, [callback]);
  },
}));

function metric(name: Metric['name'], value: number, id = 'v1'): Metric {
  return { name, value, id, delta: value, entries: [], rating: 'good', navigationType: 'navigate' };
}

describe('WebVitalsBeacon', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    history.replaceState(null, '', '/main');
    mocks.setup.mockClear();
    mocks.cleanup.mockClear();
    mocks.report = null;
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
  });

  it('keeps one document-level registration across renders without adding route listeners', () => {
    const pagehide = vi.spyOn(window, 'addEventListener');
    const view = render(createElement(WebVitalsBeacon));
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    view.rerender(createElement(WebVitalsBeacon));
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(pagehide.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(0);
    view.unmount();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    pagehide.mockRestore();
  });

  it('reports INP and preserves the library CLS session-window value', async () => {
    render(createElement(WebVitalsBeacon));
    mocks.report?.(metric('INP', 175, 'inp-1'));
    mocks.report?.(metric('CLS', 0.08, 'cls-1'));
    expect(beacon).toHaveBeenCalledTimes(2);
    const payloads = await Promise.all(
      beacon.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text()))
    );
    expect(payloads).toEqual([
      expect.objectContaining({ name: 'INP', value: 175, path: '/main' }),
      expect.objectContaining({ name: 'CLS', value: 0.08, path: '/main' }),
    ]);
  });

  it('retains initial pathname after SPA navigation and suppresses duplicate reports', async () => {
    const view = render(createElement(WebVitalsBeacon));
    history.pushState(null, '', '/main/videos');
    view.rerender(createElement(WebVitalsBeacon));
    mocks.report?.(metric('LCP', 1800, 'lcp-1'));
    mocks.report?.(metric('LCP', 1800, 'lcp-1'));
    mocks.report?.(metric('LCP', 1900, 'lcp-1'));
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(beacon).toHaveBeenCalledTimes(2);
    const payloads = await Promise.all(
      beacon.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text()))
    );
    expect(payloads).toEqual([
      expect.objectContaining({ name: 'LCP', value: 1800, path: '/main' }),
      expect.objectContaining({ name: 'LCP', value: 1900, path: '/main' }),
    ]);
  });

  it('attributes a back-forward-cache metric to the current videos path', async () => {
    const view = render(createElement(WebVitalsBeacon));
    history.pushState(null, '', '/main/videos');
    view.rerender(createElement(WebVitalsBeacon));
    mocks.report?.({ ...metric('LCP', 1600, 'lcp-bfcache-videos'), navigationType: 'back-forward-cache' });
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(beacon).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(await (beacon.mock.calls[0][1] as Blob).text());
    expect(payload).toEqual(expect.objectContaining({
      name: 'LCP', navigationType: 'back-forward-cache', path: '/main/videos',
    }));
  });

  it('attributes a later back-forward-cache metric to the current epaper path', async () => {
    render(createElement(WebVitalsBeacon));
    history.pushState(null, '', '/main/videos');
    history.pushState(null, '', '/main/epaper');
    mocks.report?.({ ...metric('CLS', 0.03, 'cls-bfcache-epaper'), navigationType: 'back-forward-cache' });
    expect(beacon).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(await (beacon.mock.calls[0][1] as Blob).text());
    expect(payload).toEqual(expect.objectContaining({
      name: 'CLS', navigationType: 'back-forward-cache', path: '/main/epaper',
    }));
  });

  it('preserves FCP and TTFB and ignores unsupported FID', async () => {
    render(createElement(WebVitalsBeacon));
    mocks.report?.(metric('FCP', 900));
    mocks.report?.(metric('TTFB', 250));
    mocks.report?.(metric('FID', 20));
    expect(beacon).toHaveBeenCalledTimes(2);
    const payloads = await Promise.all(
      beacon.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text()))
    );
    expect(payloads).toEqual([
      expect.objectContaining({ name: 'FCP', value: 900, path: '/main' }),
      expect.objectContaining({ name: 'TTFB', value: 250, path: '/main' }),
    ]);
  });
});
