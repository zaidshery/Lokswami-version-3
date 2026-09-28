// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper, { EPAPER_ACTIVE_DRAFT_INDEX } from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';

afterEach(() => vi.restoreAllMocks());

describe('single active draft database constraint', () => {
  it('keeps canonical PDF blockers separate from optional OCR jobs', async () => {
    const find = vi.spyOn(EPaperProcessingJob, 'findOne').mockReturnValue({
      sort: () => ({ lean: async () => ({ kind: 'pdf_pages', status: 'completed' }) }),
    } as never);
    await new EpaperRepository().findLatestProcessingJob('edition-id');
    expect(find).toHaveBeenCalledWith({ epaperId: 'edition-id', kind: 'pdf_pages' });
  });
  it.each(['epaper', 'emagazine'])('installs the family constraint before inserting %s', async (publicationType) => {
    const index = vi.spyOn(EPaper.collection, 'createIndex').mockResolvedValue(EPAPER_ACTIVE_DRAFT_INDEX.name);
    const create = vi.spyOn(EPaper, 'create').mockResolvedValue({
      toObject: () => ({ _id: 'draft-id', publicationType }),
    } as never);
    await new EpaperRepository().createEdition({ publicationType, familyId: 'family-id', status: 'draft' });
    expect(index).toHaveBeenCalledWith({ publicationType: 1, familyId: 1 }, EPAPER_ACTIVE_DRAFT_INDEX);
    expect(EPAPER_ACTIVE_DRAFT_INDEX.unique).toBe(true);
    expect(EPAPER_ACTIVE_DRAFT_INDEX.partialFilterExpression.status).toBe('draft');
    expect(index.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
  });

  it('fails closed if legacy duplicate drafts prevent constraint creation', async () => {
    vi.spyOn(EPaper.collection, 'createIndex').mockRejectedValue(new Error('duplicate draft family'));
    const create = vi.spyOn(EPaper, 'create');
    await expect(new EpaperRepository().createEdition({
      publicationType: 'epaper', familyId: 'family-id', status: 'draft',
    })).rejects.toThrow('duplicate draft family');
    expect(create).not.toHaveBeenCalled();
  });
});
