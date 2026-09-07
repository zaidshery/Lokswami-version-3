import { describe, expect, it } from 'vitest';
import { generateSitemaps } from '@/app/sitemap';
import sitemap from '@/app/sitemap';
import {
  countPublicArticlesForSitemap,
  listArticlesForSitemapSlice,
} from '@/lib/content/serverArticles';

describe('Dynamic Sitemap Pagination (Sprint 1)', () => {
  it('exports generateSitemaps returning array of chunk IDs', async () => {
    const sitemaps = await generateSitemaps();
    expect(Array.isArray(sitemaps)).toBe(true);
    expect(sitemaps.length).toBeGreaterThanOrEqual(1);
    expect(sitemaps[0]).toHaveProperty('id', 0);
  });

  it('serves static routes, categories, epapers, and articles for chunk 0', async () => {
    const chunk0 = await sitemap({ id: 0 });
    expect(Array.isArray(chunk0)).toBe(true);
    expect(chunk0.length).toBeGreaterThan(0);

    const urls = chunk0.map((entry) => entry.url);
    // Chunk 0 must include primary static landing pages
    expect(urls.some((url) => url.endsWith('/main'))).toBe(true);
    expect(urls.some((url) => url.includes('/main/category/'))).toBe(true);
  });

  it('serves only article slice for chunk > 0 without repeating base routes', async () => {
    const chunk1 = await sitemap({ id: 1 });
    expect(Array.isArray(chunk1)).toBe(true);

    const urls = chunk1.map((entry) => entry.url);
    // Chunk > 0 should not repeat base routes
    expect(urls.some((url) => url.endsWith('/main'))).toBe(false);
    expect(urls.some((url) => url.endsWith('/about'))).toBe(false);
  });

  it('verifies countPublicArticlesForSitemap returns non-negative number', async () => {
    const count = await countPublicArticlesForSitemap();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('verifies listArticlesForSitemapSlice honors pagination bounds', async () => {
    const slice = await listArticlesForSitemapSlice({ skip: 0, limit: 5 });
    expect(Array.isArray(slice)).toBe(true);
    expect(slice.length).toBeLessThanOrEqual(5);
  });
});
