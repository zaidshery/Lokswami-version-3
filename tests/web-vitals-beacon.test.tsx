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

function restorePageAt(path: string) {
  history.pushState(null, '', path);
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
}

async function sentPayloads(beacon: ReturnType<typeof vi.fn>) {
  return Promise.all(beacon.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text())));
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

  it('keeps one document-level registration across renders and cleans up the restoration listener', () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const view = render(createElement(WebVitalsBeacon));
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    view.rerender(createElement(WebVitalsBeacon));
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(addListener.mock.calls.filter(([name]) => name === 'pageshow')).toHaveLength(1);
    view.unmount();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    expect(removeListener.mock.calls.filter(([name]) => name === 'pageshow')).toHaveLength(1);
    addListener.mockRestore();
    removeListener.mockRestore();
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
    mocks.report?.(metric('LCP', 1900, 'lcp-1'));
    mocks.report?.(metric('LCP', 1700, 'lcp-1'));
    mocks.report?.(metric('CLS', 0.04, 'cls-original'));
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(beacon).toHaveBeenCalledTimes(4);
    const payloads = await Promise.all(
      beacon.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text()))
    );
    expect(payloads).toEqual([
      expect.objectContaining({ name: 'LCP', value: 1800, path: '/main', reportSequence: 1 }),
      expect.objectContaining({ name: 'LCP', value: 1900, path: '/main', reportSequence: 2 }),
      expect.objectContaining({ name: 'LCP', value: 1700, path: '/main', reportSequence: 3 }),
      expect.objectContaining({ name: 'CLS', value: 0.04, path: '/main', reportSequence: 1 }),
    ]);
  });

  it('uses the restoration snapshot when the first bfcache callback follows SPA navigation', async () => {
    render(createElement(WebVitalsBeacon));
    restorePageAt('/main/videos');
    history.pushState(null, '', '/main/epaper');
    mocks.report?.({ ...metric('LCP', 1600, 'lcp-bf-videos'), navigationType: 'back-forward-cache' });
    expect(await sentPayloads(beacon)).toEqual([
      expect.objectContaining({ id: 'lcp-bf-videos', path: '/main/videos' }),
    ]);
  });

  it('keeps a restored lifecycle on its pageshow path after SPA navigation and value updates', async () => {
    const view = render(createElement(WebVitalsBeacon));
    restorePageAt('/main/videos');
    view.rerender(createElement(WebVitalsBeacon));
    mocks.report?.({ ...metric('CLS', 0.04, 'cls-bf-1'), navigationType: 'back-forward-cache' });
    history.pushState(null, '', '/main/epaper');
    mocks.report?.({ ...metric('CLS', 0.12, 'cls-bf-1'), navigationType: 'back-forward-cache' });
    mocks.report?.({ ...metric('INP', 180, 'inp-bf-1'), navigationType: 'back-forward-cache' });
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(beacon).toHaveBeenCalledTimes(3);
    expect(await sentPayloads(beacon)).toEqual([
      expect.objectContaining({ name: 'CLS', id: 'cls-bf-1', value: 0.04, path: '/main/videos' }),
      expect.objectContaining({ name: 'CLS', id: 'cls-bf-1', value: 0.12, path: '/main/videos' }),
      expect.objectContaining({ name: 'INP', id: 'inp-bf-1', path: '/main/videos' }),
    ]);
  });

  it('snapshots a second restoration for a new metric without moving the prior metric', async () => {
    render(createElement(WebVitalsBeacon));
    restorePageAt('/main/videos');
    mocks.report?.({ ...metric('CLS', 0.04, 'cls-bf-1'), navigationType: 'back-forward-cache' });
    restorePageAt('/main/epaper');
    mocks.report?.({ ...metric('CLS', 0.03, 'cls-bf-2'), navigationType: 'back-forward-cache' });
    mocks.report?.({ ...metric('CLS', 0.12, 'cls-bf-1'), navigationType: 'back-forward-cache' });
    expect(await sentPayloads(beacon)).toEqual([
      expect.objectContaining({ id: 'cls-bf-1', path: '/main/videos' }),
      expect.objectContaining({ id: 'cls-bf-2', path: '/main/epaper' }),
      expect.objectContaining({ id: 'cls-bf-1', path: '/main/videos' }),
    ]);
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
