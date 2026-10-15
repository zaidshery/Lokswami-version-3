// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildEpaperReadiness } from '@/lib/utils/epaperAdminReadiness';
import { EpaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import type { EpaperRepository } from '@/lib/server/epaper/epaperRepository';

const id = '665000000000000000000001';
const sourceId = '665000000000000000000002';
const actor = { id: 'qa-admin', username: 'qa-admin', role: 'super_admin' as const, name: 'QA Admin', email: 'qa@example.com' };
const articles = [{ pageNumber: 1, contentHtml: '<p>New mapping</p>', excerpt: '', coverImagePath: '' }];

function paper(publicationType: string, reviewStatus: string) {
  return { _id: id, publicationType, supersedesId: sourceId, familyId: 'qa-family', revisionNumber: 2,
    status: 'draft', productionStatus: 'hotspot_mapping', version: 4, pageCount: 2,
    pdfPath: '/uploads/qa.pdf', thumbnailPath: '/uploads/qa.jpg',
    pages: [
      { pageNumber: 1, imagePath: '/uploads/qa.jpg', processingStatus: 'ready', reviewStatus },
      { pageNumber: 2, imagePath: '/uploads/qa-2.jpg', processingStatus: 'ready', reviewStatus: 'ready' },
    ] };
}

describe('draft revision page QA requirement', () => {
  it.each(['epaper', 'emagazine'])('blocks a changed %s revision until its page is reviewed', (type) => {
    const pending = buildEpaperReadiness({ epaper: paper(type, 'pending'), articles });
    expect(pending.status).toBe('not-ready');
    expect(pending.blockers.join(' ')).toContain('Draft revision page QA');
    expect(pending.pagesPendingQa).toBe(1);
    expect(pending.pendingQaPages).toEqual([1]);
    expect(pending.pagesReadyForPublish).toBe(1);
    const reviewed = buildEpaperReadiness({ epaper: paper(type, 'ready'), articles });
    expect(reviewed.blockers).toEqual([]);
    expect(reviewed.pagesPendingQa).toBe(0);
    expect(reviewed.pagesReadyForPublish).toBe(2);
  });

  it('counts pages needing attention and blocks a missing page review', () => {
    const p = paper('emagazine', 'needs_attention');
    const attention = buildEpaperReadiness({ epaper: p, articles });
    expect(attention.pagesNeedingAttention).toBe(1);
    expect(attention.blockers.join(' ')).toContain('Draft revision page QA');
    p.pages = p.pages.slice(0, 1);
    expect(buildEpaperReadiness({ epaper: p, articles }).pendingQaPages).toEqual([2]);
  });

  it('preserves the legacy initial-publication readiness policy', () => {
    const p = { ...paper('epaper', 'pending'), supersedesId: '' };
    expect(buildEpaperReadiness({ epaper: p, articles }).blockers).toEqual([]);
  });

  it('does not revalidate page QA on immutable published revisions', () => {
    const p = { ...paper('epaper', 'pending'), status: 'published' };
    expect(buildEpaperReadiness({ epaper: p, articles }).pagesPendingQa).toBe(0);
  });

  it.each(['epaper', 'emagazine'])('rejects explicit ready and publish transitions for a pending %s revision', async (type) => {
    const p = paper(type, 'pending');
    const update = vi.fn(), publish = vi.fn();
    const repo = { connect: vi.fn(), isValidId: vi.fn(() => true), findEditionById: vi.fn(async () => p),
      listArticles: vi.fn(async () => articles), updateEdition: update, publishEdition: publish } as unknown as EpaperRepository;
    const service = new EpaperEditorialService(repo);
    for (const productionStatus of ['ready_to_publish', 'published']) {
      await expect(service.updateWorkflow(actor, id, { productionStatus, expectedVersion: 4 })).rejects.toThrow('Draft revision page QA');
    }
    expect(update).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
