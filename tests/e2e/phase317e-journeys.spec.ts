import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const evidenceRoot = process.env.PHASE317E_EVIDENCE_DIR;
async function focus(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  await page.keyboard.press('Tab');
  await target.focus();
  await page.waitForTimeout(300);
  const evidence = await target.evaluate(node => {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const clipping = [];
    if (!style.boxShadow.includes('inset')) for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      const clipsX = /(hidden|clip|auto|scroll)/.test(parentStyle.overflowX);
      const clipsY = /(hidden|clip|auto|scroll)/.test(parentStyle.overflowY);
      if ((clipsX && (rect.left - 4 < bounds.left || rect.right + 4 > bounds.right)) || (clipsY && (rect.top - 4 < bounds.top || rect.bottom + 4 > bounds.bottom))) clipping.push(parent.className);
    }
    return { name: node.getAttribute('aria-label') || node.textContent, visible: node.matches(':focus-visible'), shadow: style.boxShadow, outline: style.outline, ringColor: style.getPropertyValue('--tw-ring-color'), offsetColor: style.getPropertyValue('--tw-ring-offset-color'), obscured: !hit || !node.contains(hit), clipping, x: rect.x, right: rect.right, width: rect.width, height: rect.height };
  });
  expect(evidence.visible).toBe(true);
  expect(evidence.shadow === 'none' && evidence.outline.includes(' none ')).toBe(false);
  expect(evidence.x).toBeGreaterThanOrEqual(0);
  expect(evidence.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(evidence.obscured, String(evidence.name)).toBe(false);
  expect(evidence.clipping, String(evidence.name)).toEqual([]);
  return evidence;
}

for (const width of [390, 1440]) for (const theme of ['light', 'dark'] as const) test(`Video filters and Shorts both directions ${width} ${theme}`, async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width, height: 900 });
  await context.addInitScript(theme => { if (location.hostname === 'localhost') localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language: 'en', theme, themePreference: theme }, version: 0 })); }, theme);
  await context.route('**/*', route => !['GET', 'HEAD'].includes(route.request().method()) ? route.fulfill({ json: { success: true } }) : !route.request().url().startsWith(testInfo.project.use.baseURL as string) ? route.abort() : route.continue());
  const response = await page.goto('/main/videos', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  const evidence = [];
  const options = page.getByRole('button', { name: 'Filter and sort options' });
  evidence.push(await focus(page, options));
  if (width < 640) { await options.focus(); await page.keyboard.press('Enter'); }
  for (const name of ['Feed', 'Shorts']) {
    const button = page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
    evidence.push(await focus(page, button));
  }
  const feed = await (await context.request.get('/api/v1/public/shorts?limit=2')).json();
  test.skip(!feed.items?.[0]?.slug, 'DATA-DEPENDENT: no public Shorts story');
  const storyResponse = await page.goto(`/main/shorts/${encodeURIComponent(feed.items[0].slug)}`, { waitUntil: 'networkidle' });
  expect(storyResponse?.status()).toBe(200);
  if (feed.items.length === 1) {
    await expect(page.getByRole('button', { name: 'Next story', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Previous story', exact: true })).toBeDisabled();
  } else {
    for (const name of ['Next story', 'Previous story']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeEnabled();
      evidence.push(await focus(page, button));
      await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    }
  }
  await page.goto('/signin', { waitUntil: 'networkidle' });
  for (const name of ['Newsroom Team', 'Reader & Subscriber', 'Create Account', 'Sign In']) {
    const button = page.getByRole('button', { name, exact: true });
    evidence.push(await focus(page, button));
    await page.keyboard.press('Enter');
  }
  if (evidenceRoot) { mkdirSync(evidenceRoot, { recursive: true }); writeFileSync(join(evidenceRoot, `video-shorts-focus-${width}-${theme}.json`), JSON.stringify(evidence, null, 2)); }
});

for (const [width, height] of [[320, 800], [390, 844], [844, 390], [768, 1024], [1440, 900]]) for (const theme of ['light', 'dark'] as const) {
  test(`public keyboard and reflow journeys ${width} ${theme}`, async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    await context.addInitScript(theme => { if (location.hostname === 'localhost') localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language: 'en', theme, themePreference: theme }, version: 0 })); }, theme);
    await context.route('**/*', route => !['GET', 'HEAD'].includes(route.request().method()) ? route.fulfill({ json: { success: true } }) : !route.request().url().startsWith(testInfo.project.use.baseURL as string) ? route.abort() : route.continue());
    const records: Record<string, unknown> = {};
    async function visit(path: string) {
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.status(), path).toBeLessThan(400);
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      return response!.status();
    }
    records.home = await visit('/main');
    const skip = page.locator('a[href="#main-content"]');
    await page.keyboard.press('Tab');
    await expect(skip).toHaveCount(1);
    await skip.focus(); await page.keyboard.press('Enter'); expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content');
    const menuTrigger = page.locator('header button[aria-controls="mobile-drawer"]');
    await menuTrigger.focus(); await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(drawer).toBeVisible();
    const drawerControls = drawer.locator('button:visible:not(:disabled),a[href]:visible');
    await drawerControls.last().focus(); await page.keyboard.press('Tab'); expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await drawerControls.first().focus(); await page.keyboard.press('Shift+Tab'); expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(menuTrigger).toBeFocused();
    records.mobileMenu = { trap: true, escapeRestore: true };
    const desktop = page.locator('nav button[aria-haspopup="true"]:visible').first();
    if (await desktop.count()) {
      await desktop.focus(); await page.keyboard.press('ArrowDown');
      const id = await desktop.getAttribute('aria-controls');
      await expect(page.locator(`#${id} a`).first()).toBeFocused();
      await page.keyboard.press('Escape'); await expect(desktop).toBeFocused();
      records.desktopNavigation = true;
    } else records.desktopNavigation = 'Not presented at this viewport';
    records.search = await visit('/main/search?q=news');
    const input = page.locator('main input').first();
    await input.focus(); await input.fill('G20'); await page.keyboard.press('Enter');
    await expect(page.getByRole('status').first()).toBeVisible();
    records.searchSelects = [];
    for (const select of await page.locator('main select').all()) (records.searchSelects as unknown[]).push(await focus(page, select));
    records.videos = await visit('/main/videos');
    const filterFocus = [];
    for (const button of await page.locator('main button:visible').filter({ hasText: /^(Feed|Shorts)$/ }).all()) filterFocus.push(await focus(page, button));
    records.videoFilters = filterFocus;
    const feed = await (await context.request.get('/api/v1/public/shorts?limit=1')).json();
    if (feed.items?.[0]?.slug) {
      records.shorts = await visit(`/main/shorts/${encodeURIComponent(feed.items[0].slug)}`);
      records.shortsFocus = [];
      for (const name of ['Previous story', 'Next story']) {
        const button = page.getByRole('button', { name, exact: true });
        if (await button.isEnabled()) {
          (records.shortsFocus as unknown[]).push(await focus(page, button));
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
        }
      }
      records.shortsStatus = await page.locator('[role="status"],[aria-live]').allTextContents();
    } else records.shorts = 'DATA-DEPENDENT: no published story';
    records.auth = await visit('/signin');
    const authFocus = [];
    for (const name of ['Newsroom Team', 'Reader & Subscriber', 'Create Account', 'Sign In']) {
      const button = page.getByRole('button', { name, exact: true });
      authFocus.push(await focus(page, button));
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
    records.authFocus = authFocus;
    records.publications = { epaper: await visit('/main/epaper'), emagazine: await visit('/main/e-magazine') };
    // CSS zoom is a reflow proxy. This does not claim native browser zoom QA.
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    records.reflow200Proxy = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, nativeBrowserZoom: false }));
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    if (evidenceRoot) { mkdirSync(evidenceRoot, { recursive: true }); writeFileSync(join(evidenceRoot, `journeys-${width}-${theme}.json`), JSON.stringify(records, null, 2)); }
    await testInfo.attach('keyboard-journey-evidence', { body: JSON.stringify(records, null, 2), contentType: 'application/json' });
    expect((records.reflow200Proxy as { overflow: boolean }).overflow).toBe(false);
  });
}
