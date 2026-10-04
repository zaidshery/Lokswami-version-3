import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpaperService } from '@/lib/server/epaper/epaperService';
import type { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
const find = vi.fn();
const service = new EpaperService({ findPublicEdition: find } as unknown as EpaperRepository);
const issue = { _id: 'paper', publicationType: 'epaper', status: 'published', publishDate: '2026-01-01', citySlug: 'indore', pageCount: 2, pages: [] };
const snapshot = { title: 'Released title', slug: 'released', excerpt: 'Released deck', contentHtml: '', pageNumber: 2, version: 1, hotspot: { x: .1, y: .1, w: .2, h: .2 } };
beforeEach(() => find.mockReset());
describe('public reader detail authority', () => {
  it('exposes only released snapshots and never mutable-only stories', async () => {
    find.mockResolvedValue({ store: 'mongo', edition: issue, articles: [{ _id: 'one', title: 'UNRELEASED CORRECTION', releasedSnapshot: snapshot }, { _id: 'two', title: 'UNRELEASED DRAFT', hotspot: snapshot.hotspot }] });
    const detail = await service.getPublicEditionDetail('paper', 'epaper');
    expect(detail.articles).toHaveLength(1); expect(detail.articles[0].title).toBe('Released title');
    expect(JSON.stringify(detail)).not.toContain('UNRELEASED');
  });
  it.each(['mongo','file'])('rejects future issues from %s', async store => {
    find.mockResolvedValue({ store, edition: { ...issue, publishDate: '2999-01-01' }, articles: [] });
    await expect(service.getPublicEditionDetail('paper','epaper')).rejects.toThrow('not found');
  });
  it('filters legacy hotspots by released page, keeping stable IDs', async () => {
    find.mockResolvedValue({ store:'file', edition: { ...issue, city:'Indore', pages: 2, articleHotspots: [{ id: 'one', page: 1, releasedSnapshot: snapshot }, { id:'two', page: 2, title:'UNRELEASED' }] }, articles: [] });
    const detail=await service.getPublicEditionDetail('paper','epaper',2);
    expect(detail.articles).toHaveLength(1);expect(detail.articles[0]).toMatchObject({_id:'paper-one',pageNumber:2,title:'Released title'});
  });
});
