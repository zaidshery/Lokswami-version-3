import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
test.use({ channel: 'msedge', viewport: { width: 1440, height: 900 } });
for (const language of ['en', 'hi'] as const) for (const theme of ['light', 'dark'] as const) test(`Populated card and auth states ${language} ${theme}`, async ({ page, context }, testInfo) => {
  test.setTimeout(150_000);
  const fixture = process.env.PHASE317E_FIXTURE_PATH;
  test.skip(!fixture, 'DATA-DEPENDENT: explicit safe in-memory fixture entry required');
  await context.addInitScript(({ language, theme }) => { if (location.hostname === 'localhost') localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language, theme, themePreference: theme }, version: 0 })); }, { language, theme });
  await context.route('**/*', route => !['GET','HEAD'].includes(route.request().method()) ? route.fulfill({ json: { success: true } }) : !route.request().url().startsWith(testInfo.project.use.baseURL as string) ? route.abort() : route.continue());
  const records: Array<{ state: string; violations: Result[]; incomplete: Result[]; colors: Array<{ text: string | null; fg: string; bg: string }> }> = [];
  async function scan(state: string) {
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    const colors = await page.locator('.bg-gray-900').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, fg: getComputedStyle(node).color, bg: getComputedStyle(node).backgroundColor })));
    records.push({ state, violations: results.violations, incomplete: results.incomplete, colors });
  }
  const cardResponse = await page.goto(`${fixture}?cards=1`, { waitUntil: 'networkidle' });
  expect(cardResponse?.status()).toBe(200);
  await scan('existing-populated-Trending-NewsCard');
  const authResponse = await page.goto('/signin', { waitUntil: 'networkidle' });
  expect(authResponse?.status()).toBe(200);
  for (const name of ['Newsroom Team','Reader & Subscriber','Create Account','Sign In']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.focus(); await page.keyboard.press('Enter');
    await scan(name);
  }
  const root = process.env.PHASE317E_EVIDENCE_DIR;
  if (root) { mkdirSync(root, { recursive: true }); writeFileSync(join(root, `states-${language}-${theme}.json`), JSON.stringify(records, null, 2)); }
  expect(records.flatMap(record => record.violations.map(violation => ({ state: record.state, rule: violation.id, targets: violation.nodes.map(node => node.target) })))).toEqual([]);
});
