import { beforeEach, describe, expect, it, vi } from 'vitest';
const getDetail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/epaper/epaperService', () => ({ epaperService: { getPublicEditionDetail: getDetail } }));
import { loadPublicationArticleReader } from '@/lib/server/epaper/epaperArticleReader';
import { EpaperNotFoundError } from '@/lib/server/epaper/epaperTypes';
beforeEach(() => { getDetail.mockReset(); getDetail.mockResolvedValue({ _id: 'paper', citySlug: 'indore', publishDate: '2026-01-01', title: 'Released issue', articles: [{ _id: 'story', slug: 'headline', title: 'Released headline', pageNumber: 2, excerpt: 'Released deck', contentHtml: '<p>Released copy</p>' }] }); });
describe('publication stories in the existing Article Reader', () => {
  it('builds an exact return link and uses released copy without inventing an author', async () => {
    const result = await loadPublicationArticleReader('story', { paper: 'paper', story: 'story', page: '99' });
    expect(result?.article).toMatchObject({ title: 'Released headline', author: { name: '' }, content: '<p>Released copy</p>' });
    expect(result?.returnPath).toBe('/main/epaper?paper=paper&city=indore&date=2026-01-01&page=2&story=story');
    expect(result?.articlePath).toBe('/main/article/story?paper=paper&city=indore&date=2026-01-01&page=2&story=story');
  });
  it('canonicalizes a released slug to its story ID', async () => {
    expect((await loadPublicationArticleReader('headline', { paper: 'paper' }))?.articlePath).toContain('/main/article/story?');
  });
  it('preserves the monthly publication seam', async () => {
    const result = await loadPublicationArticleReader('story', { paper: 'paper', publicationType: 'emagazine' });
    expect(getDetail).toHaveBeenCalledWith('paper', 'emagazine');
    expect(result?.returnPath).toContain('/main/e-magazine?');
    expect(result?.articlePath).toContain('publicationType=emagazine');
  });
  it.each([{ story: 'other', paper: 'paper' }, {}])('denies missing or conflicting context %j', async query => {
    expect(await loadPublicationArticleReader('story', query)).toBeNull(); expect(getDetail).not.toHaveBeenCalled();
  });
  it('denies a story absent from the public issue', async () => { expect(await loadPublicationArticleReader('unreleased', { paper: 'paper' })).toBeNull(); });
  it('denies hidden issues without falling back to mutable content', async () => {
    getDetail.mockRejectedValue(new EpaperNotFoundError('Hidden')); expect(await loadPublicationArticleReader('story', { paper: 'paper' })).toBeNull();
  });
});
