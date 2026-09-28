import { describe, expect, it } from 'vitest';
import { selectHomepageCategories, selectHomepageMedia } from '@/lib/content/homepageDiscovery';
import type { Article } from '@/lib/mock/data';

const story = (id: string, category = 'Regional', day = 1): Article => ({
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
  it.each([1, 2, 3, 4, 5])('bounds Regional at four for %i candidates', (count) => {
    const result = selectHomepageCategories([], { regional: Array.from({ length: count }, (_, i) => story(String(i))) });
    expect(result[0].articles).toHaveLength(Math.min(count, 4));
  });
  it('keeps aliases category-correct and compact sections bounded', () => {
    const rows = [story('wrong'), ...Array.from({ length: 5 }, (_, i) => story(String(i), i % 2 ? 'tech' : 'Technology'))];
    const result = selectHomepageCategories([], { technology: rows, national: rows });
    expect(result.map((s) => s.category.slug)).toEqual(['technology']);
    expect(result[0].articles.map((a) => a.id)).toEqual(['4', '3', '2']);
  });
  it('prefers unused stories over newer top-package stories without unrelated substitution', () => {
    const used = Array.from({ length: 9 }, (_, i) => story(`top${i}`, 'Regional', i + 10));
    const unused = Array.from({ length: 4 }, (_, i) => story(`other${i}`, 'Regional', i + 1));
    const result = selectHomepageCategories(used, { regional: [...used, ...unused, story('foreign', 'National')], politics: used });
    expect(result.map((s) => s.category.slug)).toEqual(['regional']);
    expect(result[0].articles.map((a) => a.id)).toEqual(['other3', 'other2', 'other1', 'other0']);
  });
  it('sparse backfill uses actual category stories and unique IDs', () => {
    const item = story('only');
    expect(selectHomepageCategories([item], { regional: [item, item] })[0].articles).toEqual([item]);
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
