import { beforeEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { deleteEpaperArticleById, updateEpaperArticleById } from '@/lib/server/epaper/adminArticleCompat';
import { EpaperArticleService } from '@/lib/server/epaper/epaperArticleService';
import { EpaperCropService } from '@/lib/server/epaper/epaperCropService';
import { EpaperProcessingService } from '@/lib/server/epaper/epaperProcessingService';
import { EpaperPageService } from '@/lib/server/epaper/epaperPageService';
import { EpaperOcrService } from '@/lib/server/epaper/epaperOcrService';
import { EpaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperConflictError, type AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';

const actor: AdminSessionIdentity = {
  id: 'qa-admin', role: 'super_admin', name: 'QA', email: 'qa@example.com', username: 'qa',
};
const id = '665000000000000000000001';
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

describe('Revision initialization mutation boundary', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each(['initializing', 'failed'])('blocks legacy story updates and deletes while %s', async (revisionInitializationStatus) => {
    vi.spyOn(EPaperArticle, 'findById').mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: id, epaperId: id }),
    } as never);
    const select = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: id, status: 'draft', productionStatus: 'hotspot_mapping', revisionInitializationStatus,
      }),
    });
    vi.spyOn(EPaper, 'findById').mockReturnValue({ select } as never);
    const update = vi.spyOn(EPaperArticle, 'findOneAndUpdate');
    const remove = vi.spyOn(EPaperArticle, 'findByIdAndDelete');
    expect((await updateEpaperArticleById(id, { title: 'Changed' }, false, actor)).status).toBe(409);
    expect((await deleteEpaperArticleById(id, actor)).status).toBe(409);
    expect(select).toHaveBeenCalledWith(expect.stringContaining('revisionInitializationStatus'));
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['initializing', 'failed'])('blocks all editorial services before writes while %s', async (revisionInitializationStatus) => {
    const edition: Record<string, unknown> = {
      _id: id, status: 'draft', productionStatus: 'hotspot_mapping',
      revisionInitializationStatus, pageCount: 1, pages: [],
    };
    // Honor real Mongo projections: a missing guard field must fail this test.
    const repo = {
      connect: vi.fn().mockResolvedValue(undefined),
      isValidId: vi.fn().mockReturnValue(true),
      findEditionById: vi.fn(async (_id: string, projection?: string) => projection
        ? Object.fromEntries(projection.split(' ').map((key) => [key, edition[key]]))
        : edition),
      findOcrSuggestion: vi.fn().mockResolvedValue({ pageNumber: 1 }),
    };
    const calls = [
      () => new EpaperArticleService(repo as never).create(actor, id, { pageNumber: 1 }),
      () => new EpaperCropService(repo as never).crop(actor, id, { pageNumber: 1 }),
      () => new EpaperProcessingService(repo as never).retry(actor, id, {}),
      () => new EpaperPageService(repo as never).update(actor, id, { pages: [{}] }, 'application/json'),
      () => new EpaperOcrService(repo as never).review(actor, id, id, { action: 'accept' }),
      () => new EpaperEditorialService(repo as never).updateMetadata(actor, id, { title: 'Changed' }),
    ];
    for (const mutate of calls) {
      await expect(mutate()).rejects.toThrow(EpaperConflictError);
    }
    expect(repo.findEditionById).toHaveBeenCalledTimes(calls.length);
  });
});
