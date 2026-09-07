import { describe, expect, it } from 'vitest';
import { makeReleasedEpaperStory, resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import { getAllowedEpaperProductionTransitions } from '@/lib/workflow/transitions';

const source = { _id: 'story', epaperId: 'paper', title: 'Approved headline', slug: 'story', excerpt: 'Reviewed text', contentHtml: '', pageNumber: 2, updatedAt: '2026-09-05T10:00:00Z', hotspot: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } };
describe('progressive e-paper publication', () => {
  it('allows page publication before OCR while keeping unmapped drafts private', () => {
    expect(getAllowedEpaperProductionTransitions('pages_ready')).toContain('published');
    expect(resolveReleasedEpaperStory({ ...source, workflow: { status: 'draft' } })).toBeNull();
    expect(resolveReleasedEpaperStory({ ...source, workflow: { status: 'published' } })).toBeNull();
  });
  it('preserves the released headline and geometry during editorial corrections', () => {
    const snapshot = makeReleasedEpaperStory(source, 'admin', 1);
    const result = resolveReleasedEpaperStory({ ...source, title: 'Unreviewed correction', hotspot: { x: 0, y: 0, w: 1, h: 1 }, releasedSnapshot: snapshot });
    expect(result?.title).toBe('Approved headline');
    expect(result?.hotspot).toEqual(source.hotspot);
    expect(result?.releaseVersion).toBe(1);
    expect(result).not.toHaveProperty('releasedById');
  });
  it('rejects invalid geometry or missing readable content on release', () => {
    expect(() => makeReleasedEpaperStory({ ...source, excerpt: '' }, 'admin', 1)).toThrow();
    expect(() => makeReleasedEpaperStory({ ...source, hotspot: { x: 1, y: 0, w: 0.5, h: 0.5 } }, 'admin', 1)).toThrow();
  });
});
