import { expect, test as base } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, providePage) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await providePage(page);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  },
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
    await expect(page.locator('form')).toBeVisible();
  });
});

