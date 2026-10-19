import { expect, test as base } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, providePage) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/analytics/track', (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/api/analytics/web-vitals', (route) => route.fulfill({ json: { success: true } }));
    await providePage(page);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  },
});

test('advertised sitemap resolves to an index and a working chunk in the built app', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/);

  const redirect = await request.get('/sitemap.xml', { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe('/sitemap-index.xml');
  const index = await request.get('/sitemap.xml');
  expect(index.status()).toBe(200);
  expect(new URL(index.url()).pathname).toBe('/sitemap-index.xml');
  expect(index.headers()['content-type']).toContain('application/xml');
  const xml = await index.text();
  expect(xml).toContain('<sitemapindex');
  const chunks = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks[0]).toBe('/sitemap/0.xml');
  const chunk = await request.get(chunks[0]);
  expect(chunk.status()).toBe(200);
  expect(chunk.headers()['content-type']).toContain('xml');
  expect(await chunk.text()).toContain('<urlset');
});

base.describe('Shared stale-asset recovery', () => {
  async function openHydratedSignIn(page) {
    await page.goto('/signin?redirect=/admin');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(
      (button) => button.textContent.includes('Reader & Subscriber')
        && Object.keys(button).some((key) => key.startsWith('__reactProps'))
    ));
  }

  for (const [name, message, constructor] of [
    ['ordinary runtime errors', 'Controlled isolated QA runtime error', 'TypeError'],
    ['hydration errors', 'Minified React error #418; controlled isolated QA runtime check', 'Error'],
  ]) {
    base(`does not reload healthy assets for ${name}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await openHydratedSignIn(page);
      expect(errors).toEqual([]);
      const originalUrl = page.url();
      const sourcePath = '/_next/static/chunks/controlled-qa-runtime-error.js';
      await page.route(`**${sourcePath}`, (route) => route.fulfill({
        contentType: 'application/javascript',
        body: `setTimeout(function () { throw new ${constructor}(${JSON.stringify(message)}); }, 0);`,
      }));
      const errorDelivered = page.waitForEvent('pageerror', { predicate: (error) => error.message === message });
      await page.evaluate((src) => {
        const script = document.createElement('script'); script.src = src; document.head.append(script);
      }, sourcePath);
      await errorDelivered;
      await page.waitForTimeout(500);
      expect(page.url()).toBe(originalUrl);
      expect(errors).toEqual([message]);
      expect(await page.evaluate(() => sessionStorage.getItem('lokswami-asset-recovery'))).toBeNull();
    });
  }

  base('recovers an actual failed application script without dropping the redirect query', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openHydratedSignIn(page);
    await page.route('**/_next/static/chunks/controlled-qa-missing.js', (route) => route.abort('failed'));
    const recovered = page.waitForURL((url) => url.searchParams.has('__asset_recovery'));
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = '/_next/static/chunks/controlled-qa-missing.js'; document.head.append(script);
    });
    await recovered;
    const url = new URL(page.url());
    expect(url.pathname).toBe('/signin');
    expect(url.searchParams.get('redirect')).toBe('/admin');
    expect(errors).toEqual([]);
  });
});

test.describe('Lokswami critical UI surfaces', () => {
  test('public article feed shell loads', async ({ page }) => {
    await page.goto('/main');
    await expect(page).toHaveTitle(/Lokswami|लोकस्वामी/i);
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('admin sign-in page loads for protected routes', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/signin(?:\?|$)/);
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/admin');
    await expect(page.getByRole('textbox', { name: 'Staff Login ID or Email', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to Newsroom', exact: true })).toBeVisible();
  });
});

