import { describe, expect, it } from 'vitest';
import { HOMEPAGE_CATEGORY_MODULES, selectHomepageCategories, selectHomepageMedia } from '@/lib/content/homepageDiscovery';
import type { Article } from '@/lib/mock/data';

const story = (id: string, category = 'Madhya Pradesh', day = 1): Article => ({
  id, category, title: id, summary: 'Summary', image: '/image.jpg', views: 0,
  publishedAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`,
  author: { id: 'desk', name: 'Desk', avatar: '' },
});
const video = (id: string, isShort = false) => ({
  _id: id, title: id, category: 'National', thumbnail: '/poster.jpg', videoUrl: '/video.mp4',
  isShort, isPublished: true, aspectRatio: isShort ? '9:16' : '16:9', duration: 42,
  workflow: { status: 'published' }, processingStatus: 'ready', publishedAt: '2026-01-01T00:00:00Z',
});

describe('homepage category selection', () => {
  it('omits zero-content categories', () => expect(selectHomepageCategories([])).toEqual([]));
  it.each([0, 1, 2, 3, 4, 5, 13])('retains all %i supplied National candidates for progressive reveal without backfill', (count) => {
    const rows = Array.from({ length: count }, (_, i) => story(`national-${i}`, 'National', i + 1));
    const result = selectHomepageCategories([], { national: rows });
    expect(result[0]?.articles.map((a) => a.id) || []).toEqual(rows.slice().reverse().map((a) => a.id));
  });
  it('deduplicates category candidates while retaining supplied progressive-reveal stories', () => {
    const rows = Array.from({ length: 5 }, (_, i) => story(`national-${i}`, 'National', i + 1));
    const result = selectHomepageCategories([], { national: [...rows, rows[4], story('foreign')], business: rows.map((a) => ({ ...a, id: `business-${a.id}`, category: 'Business' })) });
    expect(result.find((s) => s.category.slug === 'national')?.articles.map((a) => a.id)).toEqual(['national-4', 'national-3', 'national-2', 'national-1', 'national-0']);
    expect(result.find((s) => s.category.slug === 'business')?.articles).toHaveLength(5);
  });
  it.each([1, 2, 3, 4, 5, 20])('bounds Madhya Pradesh public candidates at thirteen for %i candidates', (count) => {
    const result = selectHomepageCategories([], { 'madhya-pradesh': Array.from({ length: count }, (_, i) => story(String(i))) });
    expect(result[0].articles).toHaveLength(Math.min(count, 13));
  });
  it('keeps aliases category-correct and compact sections bounded', () => {
    const rows = [story('wrong'), ...Array.from({ length: 5 }, (_, i) => story(String(i), i % 2 ? 'tech' : 'Technology'))];
    const result = selectHomepageCategories([], { technology: rows, national: rows });
    expect(result.map((s) => s.category.slug)).toEqual(['technology']);
    expect(result[0].articles.map((a) => a.id)).toEqual(['4', '3', '2', '1', '0']);
  });
  it('prefers unused stories over newer top-package stories without unrelated substitution', () => {
    const used = Array.from({ length: 9 }, (_, i) => story(`top${i}`, 'Madhya Pradesh', i + 10));
    const unused = Array.from({ length: 4 }, (_, i) => story(`other${i}`, 'Madhya Pradesh', i + 1));
    const result = selectHomepageCategories(used, { 'madhya-pradesh': [...used, ...unused, story('foreign', 'National')], politics: used });
    expect(result.map((s) => s.category.slug)).toEqual(['madhya-pradesh']);
    expect(result[0].articles.slice(0, 4).map((a) => a.id)).toEqual(['other3', 'other2', 'other1', 'other0']);
    expect(result[0].articles).toHaveLength(13);
  });
  it('sparse backfill uses actual category stories and unique IDs', () => {
    const item = story('only');
    expect(selectHomepageCategories([item], { 'madhya-pradesh': [item, item] })[0].articles).toEqual([item]);
  });
  it('uses only configured canonical category sources in the approved order', () => {
    const rows = HOMEPAGE_CATEGORY_MODULES.map((slug) => story(slug, slug));
    expect(selectHomepageCategories(rows).map((s) => s.category.slug)).toEqual([...HOMEPAGE_CATEGORY_MODULES]);
  });
});

describe('homepage media selection', () => {
  it.each([0, 1, 2, 3, 4])('bounds %i real standard and Short records at three', (count) => {
    const rows = Array.from({ length: count }, (_, i) => video(String(i)));
    expect(selectHomepageMedia(rows, 'videos')).toHaveLength(Math.min(count, 3));
    expect(selectHomepageMedia(rows.map((v) => ({ ...v, isShort: true, aspectRatio: '9:16' })), 'shorts')).toHaveLength(Math.min(count, 3));
  });
  it('excludes Shorts from standard videos and enforces publication/Swipe rules', () => {
    const rows = [video('standard'), video('short', true),
      { ...video('draft'), workflow: { status: 'draft' } },
      { ...video('future'), publishedAt: '2099-01-01T00:00:00Z' },
      { ...video('processing', true), processingStatus: 'processing' },
      { ...video('landscape', true), aspectRatio: '16:9' },
      { ...video('scheduled', true), workflow: { status: 'scheduled', scheduledFor: '2099-01-01' } },
    ];
    expect(selectHomepageMedia(rows, 'videos').map((v) => v.id)).toEqual(['standard']);
    expect(selectHomepageMedia(rows, 'shorts').map((v) => v.id)).toEqual(['short']);
  });
  it('never invents missing Short posters, titles or duration and deduplicates IDs', () => {
    const item = video('only', true);
    const result = selectHomepageMedia([item, item, { ...video('no-title', true), title: '' }, { ...video('no-poster', true), thumbnail: '' }], 'shorts');
    expect(result.map((v) => v.id)).toEqual(['only']);
    expect(selectHomepageMedia([{ ...item, duration: undefined, publishedAt: undefined }], 'shorts')[0]).toMatchObject({ duration: 0, publishedAt: '' });
    expect(selectHomepageMedia([{ ...video('no-thumbnail'), thumbnail: '' }], 'videos')[0].thumbnail).toBe('');
  });
});
