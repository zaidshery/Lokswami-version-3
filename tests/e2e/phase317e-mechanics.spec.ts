import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

test.use({ channel: 'msedge' });
const fixturePath = process.env.PHASE317E_FIXTURE_PATH;
const evidenceRoot = process.env.PHASE317E_EVIDENCE_DIR;
function save(name: string, value: unknown) {
  if (evidenceRoot) { mkdirSync(evidenceRoot, { recursive: true }); writeFileSync(join(evidenceRoot, `${name}.json`), JSON.stringify(value, null, 2)); }
}

async function focusEvidence(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  if (await target.getAttribute('role') !== 'menuitem') await page.keyboard.press('Tab');
  await target.focus();
  return target.evaluate(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    const clipping: string[] = [];
    const inset = style.boxShadow.includes('inset');
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (!inset && /(hidden|clip|auto|scroll)/.test(parentStyle.overflowX + parentStyle.overflowY) && (rect.left - 4 < bounds.left || rect.right + 4 > bounds.right || rect.top - 4 < bounds.top || rect.bottom + 4 > bounds.bottom)) clipping.push(parent.className);
    }
    return { name: element.getAttribute('aria-label') || element.textContent, visible: element.matches(':focus-visible'), outline: style.outline, shadow: style.boxShadow, ringColor: style.getPropertyValue('--tw-ring-color'), offsetColor: style.getPropertyValue('--tw-ring-offset-color'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, clipping };
  });
}

async function shareJourney(page: Page, trigger: Locator) {
  await trigger.focus(); await page.keyboard.press('Enter');
  const menu = page.getByRole('menu'), items = menu.getByRole('menuitem');
  await expect(menu).toBeVisible(); await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(items.first()).toBeFocused();
  await page.keyboard.press('End'); await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home'); await expect(items.first()).toBeFocused();
  const focus = await focusEvidence(page, items.first());
  expect(focus.visible).toBe(true); expect(focus.shadow === 'none' && focus.outline.includes(' none ')).toBe(false);
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
  const adjacent = await trigger.evaluate(element => {
    const tabbable = [...document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')].filter(node => node.tabIndex >= 0 && !node.hasAttribute('disabled') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
    const index = tabbable.indexOf(element as HTMLElement);
    return { next: index + 1 < tabbable.length ? tabbable[index + 1].outerHTML : null, previous: index > 0 ? tabbable[index - 1].outerHTML : null };
  });
  for (const [key, expected] of [['Tab', adjacent.next], ['Shift+Tab', adjacent.previous]] as const) {
    await trigger.focus(); await page.keyboard.press('Enter'); await expect(menu).toBeVisible();
    await page.keyboard.press(key); await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(expected || await trigger.evaluate(element => element.outerHTML));
  }
  return { arrows: true, homeEnd: true, escapeRestore: true, tab: true, shiftTab: true, focus };
}

for (const [width, height] of [[320, 800], [390, 844], [844, 390], [768, 1024], [1440, 900]]) for (const theme of ['light', 'dark'] as const) {
  test(`component focus and non-modal ShareMenu ${width} ${theme}`, async ({ page, context }) => {
    test.skip(!fixturePath, 'DATA-DEPENDENT: temporary local component entry point must be explicitly provided');
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await context.addInitScript(theme => { if (location.hostname === 'localhost') localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language: 'en', theme, themePreference: theme }, version: 0 })); }, theme);
    await context.route('**/*', route => route.request().method() === 'POST' ? route.fulfill({ json: { success: true } }) : !route.request().url().startsWith('http://localhost:3017') ? route.abort() : route.continue());
    await page.goto(fixturePath!, { waitUntil: 'networkidle' });
    const targets = page.locator('[data-fixture="toolbar"] button:visible:not(:disabled),[data-fixture="toolbar"] select:visible,[data-fixture="hero"] button[aria-label="Back to list"],[data-fixture="image"] button:visible:not(:disabled)');
    const focus = [];
    for (let index = 0; index < await targets.count(); index++) focus.push(await focusEvidence(page, targets.nth(index)));
    save(`focus-${width}-${theme}`, focus);
    for (const result of focus) { expect(result.visible, String(result.name)).toBe(true); expect(result.shadow === 'none' && result.outline.includes(' none '), String(result.name)).toBe(false); expect(result.clipping, String(result.name)).toEqual([]); }
    const shares = [];
    for (const selector of ['[data-fixture="article-share"] button[aria-haspopup="menu"]', '[data-fixture="video-share"] button[aria-haspopup="menu"]', '[data-fixture="toolbar"] button[aria-haspopup="menu"]:visible']) shares.push(await shareJourney(page, page.locator(selector).first()));
    save(`share-${width}-${theme}`, shares);
    await page.getByRole('button', { name: 'Open story fixture' }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    const previewFocus = [];
    for (const target of [dialog.getByRole('button', { name: 'Close story', exact: true }), dialog.getByRole('button', { name: 'Share story', exact: true }), dialog.getByRole('button', { name: 'Fit story image' })]) previewFocus.push(await focusEvidence(page, target));
    save(`preview-focus-${width}-${theme}`, previewFocus);
    for (const result of previewFocus) { expect(result.visible).toBe(true); expect(result.clipping, String(result.name)).toEqual([]); }
    const buttons = dialog.locator('button:visible:not(:disabled),a[href]:visible,[tabindex="0"]:visible');
    await buttons.last().focus(); await page.keyboard.press('Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    for (const name of ['Open quick article fixture', 'Open settings fixture']) {
      const trigger = page.getByRole('button', { name });
      await trigger.focus(); await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
      const controls = dialog.locator('button:visible:not(:disabled),a[href]:visible,input:visible:not(:disabled)');
      await controls.last().focus(); await page.keyboard.press('Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      await controls.first().focus(); await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    }
    save(`overlay-${width}-${theme}`, { storyPreview: true, quickArticle: true, swipeSettings: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: join(evidenceRoot!, `mechanics-${width}-${theme}.png`), fullPage: true });
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) test(`MotionConfig and CSS rendered behavior ${reducedMotion}`, async ({ page }) => {
  test.skip(!fixturePath, 'DATA-DEPENDENT: explicit component fixture required');
  await page.route('**/*', route => route.request().method() === 'POST' ? route.fulfill({ json: { success: true } }) : !route.request().url().startsWith('http://localhost:3017') ? route.abort() : route.continue());
  await page.emulateMedia({ reducedMotion });
  await page.goto(fixturePath!, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Toggle motion fixture' }).click();
  await page.waitForTimeout(100);
  const transform = await page.locator('[data-motion-probe]').evaluate(element => getComputedStyle(element).transform);
  const x = Number(transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+)/)?.[1] || 0);
  const cssDuration = await page.locator('[data-fixture="toolbar"] button:visible').first().evaluate(element => getComputedStyle(element).transitionDuration);
  save(`motion-${reducedMotion}`, { transform, x, reducedMotion, cssDuration });
  if (reducedMotion === 'reduce') expect(x).toBe(100); else expect(x).toBeLessThan(100);
  if (reducedMotion === 'reduce') expect(parseFloat(cssDuration)).toBeLessThanOrEqual(0.00001); else expect(parseFloat(cssDuration)).toBeGreaterThan(0.00001);
  await expect(page.getByRole('button', { name: 'Toggle motion fixture' })).toBeEnabled();
});

for (const language of ['en', 'hi'] as const) test(`ShareMenu boundary fallback ${language}`, async ({ page, context }) => {
  test.skip(!fixturePath, 'DATA-DEPENDENT: explicit component fixture required');
  await context.addInitScript(language => { if (location.hostname === 'localhost') localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language }, version: 0 })); }, language);
  await page.goto(`${fixturePath}?boundary=1`, { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: 'Boundary share' });
  for (const key of ['Tab', 'Shift+Tab']) {
    await trigger.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press(key); await expect(page.getByRole('menu')).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  save(`boundary-${language}`, { tabFallback: true, shiftTabFallback: true, language });
});

for (const language of ['en', 'hi'] as const) for (const theme of ['light', 'dark'] as const) test(`Article author modal and copy feedback ${language} ${theme}`, async ({ page, context }) => {
  test.skip(!fixturePath, 'DATA-DEPENDENT: explicit in-memory article fixture required');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.addInitScript(({ language, theme }) => { if (location.hostname === 'localhost') localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language, theme, themePreference: theme }, version: 0 })); }, { language, theme });
  await context.route('**/*', route => !['GET', 'HEAD'].includes(route.request().method()) ? route.fulfill({ json: { success: true } }) : !route.request().url().startsWith('http://localhost:3017') ? route.abort() : route.continue());
  await page.goto(`${fixturePath}?article=1`, { waitUntil: 'networkidle' });
  const trigger = page.locator('button[aria-label*="profile picture"],button[aria-label*="प्रोफाइल फोटो"]').first();
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  const share = page.locator('main button[aria-haspopup="menu"]').first();
  await share.focus(); await page.keyboard.press('Enter');
  const copyLabel = language === 'en' ? 'Copy link' : 'लिंक कॉपी करें';
  const successLabel = language === 'en' ? 'Link copied' : 'लिंक कॉपी हो गया';
  const copy = page.getByRole('menuitem', { name: copyLabel, exact: true });
  await copy.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[role="menu"] [aria-live="polite"]')).toHaveText(successLabel);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('/main/article/');
  save(`article-modal-copy-${language}-${theme}`, { fixture: 'existing lib/mock/data article rendered through ArticleDetailClient; no route/publication authority assertion', authorTrap: true, escapeRestore: true, copySuccess: true, liveRegion: successLabel, clipboard });
});
