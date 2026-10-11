import { expect, test } from '@playwright/test';

test.describe('Lokswami critical UI surfaces', () => {
  test('public article feed shell loads', async ({ page }) => {
    await page.goto('/main');
    await expect(page).toHaveTitle(/Lokswami|लोकस्वामी/i);
  });

  test('admin sign-in page loads for protected routes', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/signin(?:\?|$)/);
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/admin');
  });
});

