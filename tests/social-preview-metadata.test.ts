import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildArticlePageMetadata } from '@/lib/seo/articleMetadata';
import { defaultArticleSeo } from '@/lib/seo/articleSeo';
import { buildEpaperPageMetadata, buildSwipePageMetadata, buildVideoPageMetadata } from '@/lib/seo/readerPageMetadata';
import { metadataText, publicSocialImage } from '@/lib/seo/socialMetadata';
import { resolveCanonicalShareUrl } from '@/lib/utils/universalShare';
const article = { id: 'article-1', slug: 'current-slug', previousSlugs: ['old-slug'], title: 'भोपाल की बड़ी खबर', summary: 'खबर की जानकारी', category: 'Regional', author: 'Desk', publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', image: '/hero.jpg', seo: defaultArticleSeo() };
beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://lokswami.com'); vi.stubEnv('NODE_ENV', 'production'); });
afterEach(() => vi.unstubAllEnvs());
describe('canonical social previews', () => {
  it('uses explicit article SEO text/image, canonical identity and Hindi content locale', () => {
    const metadata = buildArticlePageMetadata({ article: { ...article, seo: { ...article.seo, metaTitle: '<b>Editorial title</b>', metaDescription: '<p>Useful &amp; plain summary</p>', ogImage: 'https://cdn.lokswami.com/social.jpg' } } });
    expect(metadata).toMatchObject({ title: 'Editorial title | Lokswami', description: 'Useful & plain summary', alternates: { canonical: 'https://lokswami.com/main/article/current-slug' }, openGraph: { type: 'article', url: 'https://lokswami.com/main/article/current-slug', locale: 'hi_IN', images: [{ url: 'https://cdn.lokswami.com/social.jpg' }] }, twitter: { card: 'summary_large_image', images: ['https://cdn.lokswami.com/social.jpg'] }, robots: { index: true } });
  });
  it.each([{ ogImage: '', image: '/hero.jpg', expected: '/hero.jpg' }, { ogImage: 'javascript:alert(1)', image: '/hero.jpg', expected: '/hero.jpg' }, { ogImage: '', image: '', expected: '/lokswami-share-preview.png' }, { ogImage: '', image: '/placeholders/news-16x9.svg', expected: '/lokswami-share-preview.png' }])('selects deterministic article fallback %j', ({ ogImage, image, expected }) => {
    expect(buildArticlePageMetadata({ article: { ...article, image, seo: { ...article.seo, ogImage } } }).twitter).toMatchObject({ images: [`https://lokswami.com${expected}`] });
  });
  it('uses English locale and headline fallback for blank editorial descriptions', () => {
    expect(buildArticlePageMetadata({ article: { ...article, title: 'English headline', summary: '', seo: { ...article.seo, metaTitle: ' ', metaDescription: '<p> </p>' } } })).toMatchObject({ title: 'English headline | Lokswami', description: 'English headline', openGraph: { locale: 'en_IN' } });
  });
  it('missing article metadata is noindex with branded fallback', () => {
    expect(buildArticlePageMetadata({ article: null })).toMatchObject({ robots: { index: false }, twitter: { images: ['https://lokswami.com/lokswami-share-preview.png'] } });
  });
  it('keeps a deliberately different Short title out of canonical identity', () => {
    const metadata = buildSwipePageMetadata({ slug: 'bhopal-major-news', title: 'भोपाल की बड़ी खबर', videoId: 'video-1', image: '/poster.jpg' });
    const canonical = 'https://lokswami.com/main/shorts/bhopal-major-news';
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.openGraph).toMatchObject({ url: canonical, locale: 'hi_IN' });
    expect(resolveCanonicalShareUrl('/main/shorts/bhopal-major-news')).toBe(canonical);
  });
  it('selects the exact standard video identity', () => {
    const metadata = buildVideoPageMetadata({ videoId: 'video-A', title: 'Video A', image: '/video-A.jpg' });
    expect(metadata.alternates?.canonical).toBe(resolveCanonicalShareUrl('/main/videos?video=video-A'));
    expect(metadata.openGraph).toMatchObject({ title: 'Video A | Lokswami Video', url: metadata.alternates?.canonical });
  });
  it.each(['epaper', 'emagazine'] as const)('preserves exact %s page/story share dimensions', (publicationType) => {
    const metadata = buildEpaperPageMetadata({ publicationType, paperId: 'issue-1', city: 'indore', publishDate: '2026-09-01', page: 2, storyToken: 'story-id', issueTitle: 'Public issue', image: '/page-2.jpg' });
    const path = publicationType === 'epaper' ? '/main/epaper?paper=issue-1&city=indore&date=2026-09-01&page=2&story=story-id' : '/main/e-magazine?paper=issue-1&month=2026-09&page=2&story=story-id';
    expect(metadata.alternates?.canonical).toBe(resolveCanonicalShareUrl(path));
    expect(metadata.openGraph).toMatchObject({ url: metadata.alternates?.canonical, images: [{ url: 'https://lokswami.com/page-2.jpg' }] });
    expect(metadata.title).toContain('Page 2');
    if (publicationType === 'emagazine') expect(JSON.stringify(metadata)).not.toMatch(/Indore|city=|date=/);
  });
  it('normalizes bounded Unicode plain text without script content', () => {
    const value = metadataText('<script>SECRET</script><p>' + '😀'.repeat(220) + '</p>');
    expect(Array.from(value)).toHaveLength(200);
    expect(value).not.toContain('SECRET');
  });
});
describe('crawler image URL safety', () => {
  it.each(['javascript:alert(1)', 'data:image/png;base64,AAA', '//evil.example/a.jpg', 'https://user:pass@cdn.example/a.jpg', 'http://localhost/a.jpg', 'http://127.0.0.1/a.jpg', 'http://10.0.0.1/a.jpg', 'http://192.168.1.2/a.jpg', 'http://[::1]/a.jpg', 'https://internal/a.jpg', 'https://cms.example.com/a.jpg', '/admin/a.jpg', '/cms/a.jpg', '/private/a.jpg', '/api/admin/a.jpg', '/foo/../a.jpg', '/foo/%2e%2e/a.jpg', '/bad%ZZ.jpg', '/bad%E0%A4.jpg'])('rejects %s', (input) => {
    expect(publicSocialImage(input)).toBe('');
  });
  it.each(['/uploads/article.jpg', 'https://cdn.example.com/image.jpg', 'https://bucket.blr1.cdn.digitaloceanspaces.com/image.jpg'])('allows public %s', (input) => {
    expect(publicSocialImage(input)).toBe(new URL(input, 'https://lokswami.com').href);
  });
  it('allows explicitly configured local images in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(publicSocialImage('/image.jpg', 'http://localhost:3001')).toBe('http://localhost:3001/image.jpg');
  });
});
