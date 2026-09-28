'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const base = process.argv[2] || 'http://localhost:3112';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required');
const out = path.resolve('artifacts/phase3-qa/phase311-header-polish');
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/*', (route) => ['GET', 'HEAD'].includes(route.request().method())
    ? route.continue() : route.fulfill({ status: 204 }));
  const results = [];
  try {
    await page.goto(`${base}/main`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByTestId('reader-category-bar').waitFor();
    for (const language of ['hi', 'en']) {
      await page.getByRole('button', { name: language === 'en' ? /Select English language/ : /Select Hindi/ }).click();
      for (const theme of ['light', 'dark']) {
        await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
        for (const width of [320, 360, 390, 414, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(250);
          const geometry = await page.evaluate(() => {
            const live = document.querySelector('[data-testid="reader-live-bar"]');
            const header = document.querySelector('[data-testid="reader-brand-navigation"]');
            const strip = document.querySelector('[data-testid="reader-category-bar"] > div');
            const brand = header.firstElementChild;
            const controls = [...brand.querySelectorAll('button, a, [role="group"]')].filter((el) => el.getBoundingClientRect().width > 0);
            const boxes = controls.map((el) => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label'), x: r.x, right: r.right, y: r.y, height: r.height }; });
            const left = brand.querySelector('a[aria-label="Lokswami Home"]').getBoundingClientRect();
            const right = brand.querySelector('a[href="/main/epaper"]').getBoundingClientRect();
            const logo = brand.querySelector('[data-logo-element="wordmark"] img');
            const logoBox = logo.getBoundingClientRect();
            const layerBoxes = [live, header, strip.parentElement].map((el) => el.getBoundingClientRect());
            const lang = brand.querySelector('[data-testid="reader-mobile-language"]');
            return { pageOverflow: document.documentElement.scrollWidth > innerWidth,
              edgeToEdge: layerBoxes.every((r) => Math.abs(r.x) < 1 && Math.abs(r.width - innerWidth) < 1),
              canonicalLogo: logo.getAttribute('src').includes('logo-wordmark-final.png'),
              logoLoaded: logo.complete && logo.naturalWidth > 0,
              logoWidth: logoBox.width, logoHeight: logoBox.height,
              logoProportional: Math.abs(logoBox.width / logoBox.height - 847 / 181) < 0.03,
              mobileLanguageVisible: innerWidth >= 768 || lang.getBoundingClientRect().width >= 40,
              controlsSingleRow: boxes.every((r) => Math.abs((r.y + r.height / 2) - (left.y + left.height / 2)) < 2),
              layersVisible: [live, brand, strip].every((el) => el.getBoundingClientRect().height > 0),
              controlsInside: boxes.every((r) => r.x >= 0 && r.right <= innerWidth),
              noBrandOverlap: left.right <= right.x, boxes,
              scrollable: getComputedStyle(strip).overflowX === 'auto',
              canScroll: strip.scrollWidth > strip.clientWidth,
              activeHome: !!strip.querySelector('a[href="/main"][aria-current="page"]') };
          });
          const strip = page.getByTestId('reader-category-bar').locator('> div');
          await strip.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
          const more = page.getByTestId('reader-category-bar').getByRole('button');
          await more.click();
          await page.locator('a[href="/main/digital-newsroom"]').filter({ visible: true }).waitFor();
          await page.keyboard.press('Escape');
          const moreRestoresFocus = await more.evaluate((el) => document.activeElement === el);
          await strip.evaluate((el) => { el.scrollLeft = 0; });
          await page.screenshot({ path: path.join(out, `${language}-${theme}-${width}.png`) });
          results.push({ language, theme, width, ...geometry, moreRestoresFocus });
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    const mobileLanguage = page.getByTestId('reader-mobile-language');
    await mobileLanguage.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Language: HI. Switch to English' }).waitFor();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Language: EN. Switch to Hindi' }).waitFor();
    const mobileLanguageKeyboard = true;
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const drawerEscape = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Open menu' }).waitFor();
    const persistedLanguageReload = (await page.getByTestId('reader-mobile-language').textContent()).trim() === 'EN';
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    const ssrPage = await context.newPage();
    await ssrPage.goto(`${base}/main`, { waitUntil: 'domcontentloaded' });
    const ssrLayers = await ssrPage.evaluate(() => ['reader-live-bar', 'reader-brand-navigation', 'reader-category-bar']
      .every((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().height > 0));
    await context.close();
    const pass = results.every((r) => r.layersVisible && !r.pageOverflow && r.controlsInside && r.noBrandOverlap && r.scrollable && r.activeHome && r.moreRestoresFocus
      && r.edgeToEdge && r.canonicalLogo && r.logoLoaded && r.logoProportional && r.mobileLanguageVisible && r.controlsSingleRow && r.logoWidth >= 119)
      && drawerEscape && persistedLanguageReload && ssrLayers && !errors.length;
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ pass, results, mobileLanguageKeyboard, drawerEscape, persistedLanguageReload, ssrLayers, errors, consoleErrors, realLocalContentOnly: true }, null, 2));
    console.log(JSON.stringify({ pass, checks: results.length, mobileLanguageKeyboard, drawerEscape, persistedLanguageReload, ssrLayers, errors, consoleErrors, output: out }));
    if (!pass) process.exitCode = 1;
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
