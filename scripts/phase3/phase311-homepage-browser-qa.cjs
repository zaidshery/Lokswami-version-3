'use strict';

// Real local/staging content only. No fixture injection or publication mutations.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const baseUrl = process.argv[2] || 'http://localhost:3111';
const target = new URL(baseUrl);
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Local app required.');
const outputDir = path.resolve('artifacts/phase3-qa/phase311');
const widths = [320, 360, 375, 390, 414, 430, 768, 1024, 1440];

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
  let suppressedMutations = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/*', (route) => {
    if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
    suppressedMutations++;
    return route.fulfill({ status: 204 });
  });
  try {
    const response = await page.goto(`${baseUrl}/main`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('header nav').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="lead-story"]')?.textContent.includes('लोड हो रही'), null, { timeout: 60000 });
    const results = [];
    const navigationHrefs = await page.locator('header nav a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    const linkChecks = [];
    for (const href of navigationHrefs) {
      const destination = await page.request.get(new URL(href, baseUrl).href, { timeout: 120000 });
      const html = await destination.text();
      linkChecks.push({ href, status: destination.status(), hasH1: /<h1[\s>]/.test(html), hasCanonical: /rel="canonical"/.test(html) });
    }
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (dark !== (theme === 'dark')) await page.getByRole('button', { name: 'Toggle theme' }).click();
      for (const width of widths) {
        await page.setViewportSize({ width, height: width < 768 ? 900 : 1000 });
        const result = await page.evaluate(() => {
          const box = (testId) => {
            const element = document.querySelector(`[data-testid="${testId}"]`);
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          };
          const storyIds = [...document.querySelectorAll('[data-testid="homepage-top-package"] [data-story-id]')].map((item) => item.dataset.storyId).filter(Boolean);
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            lead: box('lead-story'), latest: box('latest-news-rail'), popular: box('popular-news-rail'),
            storyCount: storyIds.length, distinctStories: new Set(storyIds).size,
            headline: document.querySelector('[data-testid="lead-story"] h1')?.textContent || null,
            overlay: Boolean(document.querySelector('[data-nextjs-dialog]')),
          };
        });
        results.push({ theme, width, ...result });
        await page.screenshot({ path: path.join(outputDir, `${theme}-${width}.png`), fullPage: false });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /More categories|अन्य श्रेणियां/ }).click();
    const moreUsable = await page.getByRole('link', { name: /Latest News|ताज़ा खबरें/, exact: true }).last().isVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole('button', { name: /Open menu|मेनू खोलें/ }).click();
    const drawer = page.getByRole('dialog');
    const mobileDestinations = await drawer.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    await page.keyboard.press('Escape');
    const report = {
      httpStatus: response.status(), results, linkChecks, moreUsable, mobileDestinations, pageErrors, consoleErrors,
      suppressedMutations, productionMutations: 0,
      populatedContentVerified: results.every((result) => Boolean(result.headline)),
    };
    fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (results.some((result) => result.overflow || result.overlay) || linkChecks.some((result) => result.status !== 200) || pageErrors.length || consoleErrors.length || !moreUsable || !report.populatedContentVerified) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
