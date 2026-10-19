import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('lokswami-storage')) localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language: 'en', theme: 'light' }, version: 0 }));
  });
  // Isolated QA: neither telemetry nor form submissions leave the browser.
  await page.route('**/api/analytics/track', (route) => route.fulfill({ json: { success: true } }));
  await page.route('**/api/analytics/web-vitals', (route) => route.fulfill({ json: { success: true } }));
});

test('Google tags require consent and stop loading after withdrawal and reload', async ({ page }) => {
  const tagRequests = [];
  await page.route('https://www.googletagmanager.com/**', (route) => {
    tagRequests.push(route.request().url());
    return route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto('/main/advertise');
  await expect(page.getByRole('button', { name: 'Decline analytics' })).toBeVisible();
  expect(tagRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Decline analytics' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Analytics settings' })).toBeVisible();
  expect(tagRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Analytics settings' }).click();
  await page.getByRole('button', { name: 'Allow analytics' }).click();
  await expect.poll(() => tagRequests.length).toBe(1);
  await expect.poll(() => page.evaluate(() => window.dataLayer.filter((entry) => entry.event === 'page_view').length)).toBe(1);
  await page.getByRole('button', { name: 'Analytics settings' }).click();
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Decline analytics' }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Analytics settings' })).toBeVisible();
  expect(tagRequests).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('lokswami_google_analytics_consent_v1'))).toBe('denied');
});

for (const width of [390, 820]) {
  test(`campaign form submits a brief at ${width}px without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let payload;
    await page.route('**/api/advertise/inquiry', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { success: true } });
    });
    await page.goto('/main/advertise');
    await page.getByRole('button', { name: 'Decline analytics' }).click();
    await page.getByRole('button', { name: 'Analytics settings' }).click();
    await expect(page.getByRole('button', { name: 'Allow analytics' })).toBeVisible();
    await page.getByRole('button', { name: 'Close preferences' }).click();
    await page.getByLabel('Name *', { exact: true }).fill('Isolated QA Buyer');
    await page.getByLabel('Company / business *').fill('QA Example');
    await page.getByLabel('Work email *').fill('qa@example.test');
    await page.getByLabel('Preferred dates / duration').fill('Next month');
    await page.getByLabel('Campaign goals and details *').fill('Test enquiry only; no delivery required.');
    await page.getByRole('checkbox', { name: /agree to be contacted/ }).check();
    await page.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Your enquiry has been received' })).toBeVisible();
    expect(payload).toMatchObject({ consent: true, timeline: 'Next month', campaignType: 'display' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
