import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), redirect: vi.fn(), missing: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({ permanentRedirect: mocks.redirect, notFound: mocks.missing }));
vi.mock('@/lib/server/publicArticles', () => ({ listPublicArticles: mocks.list }));
vi.mock('@/app/(reader)/main/category/[slug]/CategoryPageClient', () => ({ default: () => null }));
describe('category deep-link authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ items: [] });
    mocks.redirect.mockImplementation(() => { throw new Error('REDIRECT_308'); });
    mocks.missing.mockImplementation(() => { throw new Error('NOT_FOUND'); });
  });
  it.each([['Tech', '/main/category/technology'], ['MP', '/main/category/madhya-pradesh']])('redirects %s one hop', async (slug, path) => {
    const { default: page } = await import('@/app/(reader)/main/category/[slug]/page');
    await expect(page({ params: Promise.resolve({ slug }) })).rejects.toThrow('REDIRECT_308');
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(path);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('loads canonical categories without another redirect', async () => {
    const { default: page } = await import('@/app/(reader)/main/category/[slug]/page');
    await page({ params: Promise.resolve({ slug: 'madhya-pradesh' }) });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledWith({ category: 'madhya-pradesh', limit: 40 });
  });
  it('preserves existing unknown-category behavior', async () => {
    const { default: page } = await import('@/app/(reader)/main/category/[slug]/page');
    await page({ params: Promise.resolve({ slug: 'education' }) });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('returns not-found for malformed percent encoding', async () => {
    const { default: page } = await import('@/app/(reader)/main/category/[slug]/page');
    await expect(page({ params: Promise.resolve({ slug: '%' }) })).rejects.toThrow('NOT_FOUND');
    const { generateMetadata } = await import('@/app/(reader)/main/category/[slug]/layout');
    await expect(generateMetadata({ params: Promise.resolve({ slug: '%' }) })).rejects.toThrow('NOT_FOUND');
  });
});
