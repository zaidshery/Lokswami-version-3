import { describe, expect, it } from 'vitest';
import { READER_CATEGORIES } from '@/lib/constants/newsCategories';
import { buildArticleRedirectPath } from '@/lib/seo/articleSeo';
import {
  buildArticlePublicPath, buildArticlePublicUrl, getNewsCategoryHref,
  buildVideoReaderPath, buildSwipeReaderPath, buildEPaperReaderPath,
  buildEMagazineReaderPath, buildPublicationReaderUrl,
  normalizePublicOrigin, toAbsolutePublicUrl,
} from '@/lib/utils/readerContentPaths';
import { buildArticleSharePath, buildEpaperSharePath } from '@/lib/utils/articleShare';

describe('Phase 3.13A public deep-link contract', () => {
  it('uses the current article slug for UI and existing share sources', () => {
    const article = { id: '507f1f77bcf86cd799439011', slug: 'current-story' };
    expect(buildArticlePublicPath(article)).toBe('/main/article/current-story');
    expect(buildArticleSharePath(article)).toBe(buildArticlePublicPath(article));
    expect(buildArticleRedirectPath(article, { lang: 'en', utm_source: 'legacy', _rsc: 'internal' }))
      .toBe('/main/article/current-story?lang=en&utm_source=legacy');
  });
  it('keeps the legacy ID fallback for slugless articles', () => {
    expect(buildArticlePublicPath({ id: '507f1f77bcf86cd799439011' }))
      .toBe('/main/article/507f1f77bcf86cd799439011');
  });
  it('encodes supported Hindi slugs exactly once', () => {
    expect(buildArticlePublicPath({ id: 'id', slug: 'हिंदी-ख़बर' }))
      .toBe(`/main/article/${encodeURIComponent('हिंदी-ख़बर')}`);
  });
  it.each(['', ' ', '/', 'a/b', 'a\\b', '..', '\u0000', '\ud800'])('does not generate malformed article identity %j', (id) => {
    expect(buildArticlePublicPath({ id })).toBe('');
  });
  it('uses every existing taxonomy category without renaming or reordering', () => {
    for (const category of READER_CATEGORIES) {
      expect(getNewsCategoryHref(category.slug)).toBe(`/main/category/${category.slug}`);
      expect(getNewsCategoryHref(category.name)).toBe(getNewsCategoryHref(category.slug));
    }
    expect(getNewsCategoryHref('Tech')).toBe('/main/category/technology');
    expect(getNewsCategoryHref('MP')).toBe('/main/category/madhya-pradesh');
    expect(getNewsCategoryHref('not-a-category')).toBe('');
  });
  it('selects exact videos and encodes Short tokens', () => {
    expect(buildVideoReaderPath(' video-1 ')).toBe('/main/videos?video=video-1');
    expect(buildVideoReaderPath('video-1', 'हिंदी-खबर')).toBe(buildSwipeReaderPath('हिंदी-खबर'));
    expect(buildSwipeReaderPath('city update')).toBe('/main/shorts/city%20update');
    expect(buildVideoReaderPath('')).toBe('/main/videos');
    expect(buildSwipeReaderPath('/admin')).toBe('/main/videos');
  });
  it('retains E-Paper issue, city, date, page and released-story selection', () => {
    expect(buildEPaperReaderPath({ paperId: 'issue & 1', city: 'INDORE', publishDate: '2026-10-03', page: 2, storyToken: 'खबर' }))
      .toBe(`/main/epaper?paper=issue+%26+1&city=indore&date=2026-10-03&page=2&story=${encodeURIComponent('खबर')}`);
    expect(buildEPaperReaderPath({ city: 'all', publishDate: 'bad-date', page: -1 })).toBe('/main/epaper');
  });
  it('uses monthly global magazine semantics and exact issue sharing', () => {
    expect(buildEMagazineReaderPath({ paperId: 'magazine-1', publishDate: '2026-10-03', page: 3 }))
      .toBe('/main/e-magazine?paper=magazine-1&month=2026-10&page=3');
    expect(buildEpaperSharePath({ publicationType: 'emagazine', paperId: 'magazine-1', page: 3, story: 'feature' }))
      .toBe('/main/e-magazine?paper=magazine-1&page=3&story=feature');
    expect(buildEMagazineReaderPath({ month: '2026-13', page: 1.5 })).toBe('/main/e-magazine');
  });
  it.each(['https://news.example.com/', 'https://staging.example.com///', 'http://localhost:3001/'])('normalizes explicit public origin %s', (origin) => {
    const normalized = new URL(origin).origin;
    expect(normalizePublicOrigin(origin)).toBe(normalized);
    expect(buildArticlePublicUrl({ id: 'id', slug: 'story' }, origin)).toBe(`${normalized}/main/article/story`);
    expect(buildPublicationReaderUrl({ publicationType: 'emagazine', month: '2026-10' }, origin))
      .toBe(`${normalized}/main/e-magazine?month=2026-10`);
    expect(getNewsCategoryHref('crime', origin)).toBe(`${normalized}/main/category/crime`);
  });
  it.each(['javascript:alert(1)', 'https://user:secret@example.com', 'not-an-origin'])('rejects unsafe origin %s', (origin) => {
    expect(normalizePublicOrigin(origin)).toBe('');
    expect(toAbsolutePublicUrl('/main', origin)).toBe('');
  });
  it.each(['/admin', '//external.example/main', 'https://external.example/main', '/main/../admin', '/main/%2e%2e/admin', '/main\\admin', '/main\n/admin'])('rejects non-reader destination %j', (path) => {
    expect(toAbsolutePublicUrl(path, 'https://reader.example.com')).toBe('');
  });
});
