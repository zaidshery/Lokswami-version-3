// Read-only local browser baseline. Start a production build on an isolated port,
// then run with PERF_BASE_URL=http://127.0.0.1:3318 node this-script.cjs.
const { chromium } = require('playwright');

const baseUrl = String(process.env.PERF_BASE_URL || 'http://127.0.0.1:3318').replace(/\/$/, '');
const defaultRoutes = [
  '/main',
  '/main/videos',
  '/main/epaper',
  '/main/e-magazine',
  '/signin',
  ...(process.env.PERF_ARTICLE_PATH ? [process.env.PERF_ARTICLE_PATH] : []),
  ...(process.env.PERF_SHORTS_PATH ? [process.env.PERF_SHORTS_PATH] : []),
];
const selectedRoutes = process.argv[2] || process.env.PERF_ROUTES;
const explicitlyRequestedRoutes = Boolean(selectedRoutes);
const routes = selectedRoutes
  ? selectedRoutes.split(',').map((value) => value.trim()).filter(Boolean)
  : defaultRoutes;
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
const settleMs = process.env.PERF_SETTLE_MS === undefined
  ? 3000
  : Math.max(0, Number(process.env.PERF_SETTLE_MS) || 0);
const optionalDefaultRoutes = new Set([
  process.env.PERF_ARTICLE_PATH,
  process.env.PERF_SHORTS_PATH,
].filter(Boolean));

async function measure(browser, route, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  // Keep the local baseline read-only even when the app uses file-store analytics.
  await page.route('**/api/analytics/track', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/public/analytics/vitals', (route) => route.fulfill({ status: 204 }));
  const client = await context.newCDPSession(page);
  const resourceTypes = new Map();
  const publicationRequestIds = new Set();
  const transfer = {
    bytes: 0, requests: 0, images: 0, jsBytes: 0, jsFiles: [],
    requestUrls: {}, publicationFeedRequests: 0, fonts: 0, fontBytes: 0,
  };
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  client.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (
      request.method === 'GET' &&
      new URL(request.url).pathname === '/api/v1/public/epapers/latest' &&
      !publicationRequestIds.has(requestId)
    ) {
      publicationRequestIds.add(requestId);
      transfer.publicationFeedRequests += 1;
    }
    resourceTypes.set(requestId, { method: request.method, url: request.url });
  });
  client.on('Network.responseReceived', ({ requestId, type, response }) => {
    resourceTypes.set(requestId, { ...resourceTypes.get(requestId), type, url: response.url });
  });
  client.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const resource = resourceTypes.get(requestId);
    if (!resource) return;
    transfer.requests += 1;
    transfer.bytes += encodedDataLength;
    if (resource.method === 'GET') {
      transfer.requestUrls[resource.url] = (transfer.requestUrls[resource.url] || 0) + 1;
    }
    if (resource.type === 'Image') transfer.images += 1;
    if (resource.type === 'Font') {
      transfer.fonts += 1;
      transfer.fontBytes += encodedDataLength;
    }
    if (resource.type === 'Script') {
      transfer.jsBytes += encodedDataLength;
      transfer.jsFiles.push({ url: resource.url.split('/').pop(), bytes: encodedDataLength });
    }
  });
  await page.addInitScript(() => {
    window.__perfBaseline = { lcp: null, shifts: [], longTasks: [] };
    for (const [type, callback] of [
      ['largest-contentful-paint', (entry) => {
        window.__perfBaseline.lcp = { ms: entry.startTime, element: entry.element?.tagName || null };
      }],
      ['layout-shift', (entry) => {
        if (!entry.hadRecentInput) window.__perfBaseline.shifts.push({
          at: entry.startTime,
          value: entry.value,
          sources: (entry.sources || []).map((source) => ({
            node: source.node?.tagName || null,
            className: typeof source.node?.className === 'string'
              ? source.node.className.slice(0, 100) : null,
            parentClass: typeof source.node?.parentElement?.className === 'string'
              ? source.node.parentElement.className.slice(0, 100) : null,
            previousY: source.previousRect?.y ?? null,
            currentY: source.currentRect?.y ?? null,
          })),
        });
      }],
      ['longtask', (entry) => window.__perfBaseline.longTasks.push(entry.duration)],
    ]) {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(callback))
          .observe({ type, buffered: true });
      } catch { /* unsupported metric */ }
    }
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const response = await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(settleMs);
    const pageData = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      const shifts = window.__perfBaseline.shifts;
      let windowStart = 0;
      let previous = 0;
      let windowValue = 0;
      let cls = 0;
      for (const shift of shifts) {
        if (shift.at - previous > 1000 || shift.at - windowStart > 5000) {
          windowStart = shift.at;
          windowValue = 0;
        }
        windowValue += shift.value;
        cls = Math.max(cls, windowValue);
        previous = shift.at;
      }
      return {
        ttfbMs: nav?.responseStart ?? null,
        fcpMs: paint?.startTime ?? null,
        lcpCandidate: window.__perfBaseline.lcp,
        clsObserved: cls,
        shifts,
        longTasks: window.__perfBaseline.longTasks,
        navigationType: nav?.type ?? null,
      };
    });
    const repeatedRequests = Object.entries(transfer.requestUrls)
      .filter(([, count]) => count > 1)
      .map(([url, count]) => ({ url, count }));
    return {
      route, viewport: viewport.name, status: response?.status() ?? null,
      bytes: transfer.bytes, requests: transfer.requests, images: transfer.images,
      jsBytes: transfer.jsBytes, repeatedRequests,
      publicationFeedRequests: transfer.publicationFeedRequests,
      fonts: transfer.fonts, fontBytes: transfer.fontBytes,
      jsFiles: transfer.jsFiles.sort((a, b) => b.bytes - a.bytes).slice(0, 5),
      ...pageData, errors,
    };
  } catch (error) {
    return { route, viewport: viewport.name, error: String(error) };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const viewport of viewports) {
      for (const route of routes) {
        const result = await measure(browser, route, viewport);
        console.log(JSON.stringify(result));
        const isOptionalDefaultRoute = !explicitlyRequestedRoutes && optionalDefaultRoutes.has(route);
        const hasRuntimePageErrors = result.status === 200 && result.errors?.length > 0;
        if ((!isOptionalDefaultRoute && (result.error || result.status !== 200)) || hasRuntimePageErrors) {
          const reason = result.error || (hasRuntimePageErrors
            ? `runtime page error(s): ${result.errors.length}`
            : `HTTP ${result.status}`);
          failures.push(`${route} (${viewport.name}): ${reason}`);
        }
        if (
          process.argv.includes('--assert-publication-initial') &&
          ['/main/epaper', '/main/e-magazine'].includes(route) &&
          (result.status !== 200 || result.publicationFeedRequests !== 0)
        ) {
          failures.push(`Initial publication feed was refetched on ${route} (${viewport.name})`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length > 0) {
    console.error(`Baseline failed: ${failures.join('; ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
