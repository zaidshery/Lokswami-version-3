#!/usr/bin/env node

/**
 * scripts/phase3/responsive-qa.js
 *
 * Reusable responsive QA and viewport verification utility for LokSwami B3.
 * Validates reader routes across the 9 canonical responsive viewports:
 * 360, 375, 390, 412, 430, 768, 820, 1024, 1440 px.
 *
 * Checks per viewport:
 * - Route HTTP status
 * - Uncaught browser errors (pageerror)
 * - Document scrollWidth vs window.innerWidth
 * - Horizontal overflow detection
 * - Optional visual screenshot capture to artifacts/phase3-qa/
 *
 * NEVER writes production data.
 * NEVER starts uncontrolled background servers.
 * NEVER kills global Node processes.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const projectRoot = path.resolve(__dirname, '..', '..');
const artifactsDir = path.join(projectRoot, 'artifacts', 'phase3-qa');

const CANONICAL_VIEWPORTS = [
  { width: 360, height: 800, label: 'Compact Android' },
  { width: 375, height: 667, label: 'Compact iOS' },
  { width: 390, height: 844, label: 'Baseline Mobile (iPhone 12/13/14/15)' },
  { width: 412, height: 915, label: 'Modern Android' },
  { width: 430, height: 932, label: 'Large Mobile (iPhone Plus/Max)' },
  { width: 768, height: 1024, label: 'Portrait Tablet (iPad)' },
  { width: 820, height: 1180, label: 'Mid Tablet (iPad Air)' },
  { width: 1024, height: 1366, label: 'Landscape Tablet / Small Laptop' },
  { width: 1440, height: 900, label: 'Standard Desktop' },
];

function parseCliArgs() {
  const args = process.argv.slice(2);
  let baseUrl = process.env.B3_QA_BASE_URL || 'http://127.0.0.1:3000';
  let routes = process.env.B3_QA_ROUTES
    ? process.env.B3_QA_ROUTES.split(',').map((r) => r.trim()).filter(Boolean)
    : ['/main'];
  let captureScreenshots = Boolean(process.env.B3_QA_SCREENSHOTS);

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--base-url' && args[i + 1]) {
      baseUrl = args[i + 1];
      i += 1;
    } else if (args[i] === '--routes' && args[i + 1]) {
      routes = args[i + 1].split(',').map((r) => r.trim()).filter(Boolean);
      i += 1;
    } else if (args[i] === '--screenshots' || args[i] === '--screenshot') {
      captureScreenshots = true;
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    routes,
    captureScreenshots,
  };
}

async function checkServerAvailable(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/main`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    return res.status < 500;
  } catch {
    try {
      const fallback = await fetch(baseUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      });
      return fallback.status < 500;
    } catch {
      return false;
    }
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    try {
      return await chromium.launch({ channel: 'msedge', headless: true });
    } catch {
      throw err;
    }
  }
}

async function runResponsiveQA() {
  const { baseUrl, routes, captureScreenshots } = parseCliArgs();

  console.log('================================================================================');
  console.log('LokSwami B3 — Standard Responsive QA Runner');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Routes:   ${routes.join(', ')}`);
  console.log(`Screenshots: ${captureScreenshots ? 'ENABLED (artifacts/phase3-qa/)' : 'DISABLED'}`);
  console.log('================================================================================\n');

  const isUp = await checkServerAvailable(baseUrl);
  if (!isUp) {
    console.error(`ERROR: Target server is not reachable at ${baseUrl}.`);
    console.error('Please ensure the canonical LokSwami development server is running:');
    console.error('  npm run dev');
    console.error('Or provide a valid server URL using:');
    console.error('  npm run qa:responsive -- --base-url http://127.0.0.1:3000');
    process.exit(1);
  }

  if (captureScreenshots) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const browser = await launchBrowser();
  const results = [];
  let totalFailures = 0;

  try {
    const page = await browser.newPage();

    for (const route of routes) {
      console.log(`--- Testing Route: ${route} ---`);

      for (const vp of CANONICAL_VIEWPORTS) {
        const pageErrors = [];
        const errorHandler = (err) => pageErrors.push(err.message);
        page.on('pageerror', errorHandler);

        await page.setViewportSize({ width: vp.width, height: vp.height });

        let httpStatus = 0;
        let loadFailed = false;

        try {
          const response = await page.goto(`${baseUrl}${route}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          });
          httpStatus = response ? response.status() : 0;
          await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
        } catch (err) {
          loadFailed = true;
          pageErrors.push(err.message);
        }

        // Measure document and window dimensions for horizontal overflow
        const metrics = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const innerWidth = window.innerWidth;
          const docScrollWidth = docEl ? docEl.scrollWidth : 0;
          const bodyScrollWidth = body ? body.scrollWidth : 0;
          const maxScroll = Math.max(docScrollWidth, bodyScrollWidth);
          return {
            innerWidth,
            scrollWidth: maxScroll,
            overflow: maxScroll > innerWidth,
            overflowDelta: Math.max(0, maxScroll - innerWidth),
          };
        }).catch(() => ({
          innerWidth: vp.width,
          scrollWidth: vp.width,
          overflow: false,
          overflowDelta: 0,
        }));

        page.off('pageerror', errorHandler);

        const hasErrors = pageErrors.length > 0 || loadFailed || httpStatus >= 400;
        const hasOverflow = metrics.overflow;
        const passed = !hasErrors && !hasOverflow;

        if (!passed) {
          totalFailures += 1;
        }

        if (captureScreenshots) {
          const sanitizedRoute = route.replace(/[^a-z0-9]/gi, '_').replace(/^_+|_+$/g, '') || 'root';
          const filename = `${sanitizedRoute}-${vp.width}px.png`;
          const filePath = path.join(artifactsDir, filename);
          await page.screenshot({ path: filePath, fullPage: false }).catch(() => undefined);
        }

        const statusTag = passed ? '[PASS]' : '[FAIL]';
        const overflowText = hasOverflow ? `YES (+${metrics.overflowDelta}px)` : 'None';
        const errorText = pageErrors.length > 0 ? `${pageErrors.length} errors` : '0';

        console.log(
          `${statusTag} ${String(vp.width).padStart(4)}px (${vp.label.padEnd(20)}) | ` +
          `Status: ${httpStatus} | Errors: ${errorText} | ` +
          `Scroll: ${metrics.scrollWidth}px vs Inner: ${metrics.innerWidth}px | ` +
          `Overflow: ${overflowText}`
        );

        if (pageErrors.length > 0) {
          for (const err of pageErrors) {
            console.error(`       -> ${err}`);
          }
        }

        results.push({
          route,
          viewport: vp.width,
          label: vp.label,
          status: httpStatus,
          passed,
          pageErrors,
          metrics,
        });
      }
      console.log('');
    }
  } finally {
    await browser.close();
  }

  console.log('================================================================================');
  console.log(`LokSwami B3 Responsive QA Summary: ${results.length - totalFailures}/${results.length} PASSED`);
  if (totalFailures > 0) {
    console.error(`FAIL: ${totalFailures} viewport check(s) failed with overflow or errors.`);
    process.exit(1);
  } else {
    console.log('PASS: All canonical viewports validated with zero horizontal overflow.');
  }
}

runResponsiveQA().catch((err) => {
  console.error('Fatal error running responsive QA:', err);
  process.exit(1);
});
