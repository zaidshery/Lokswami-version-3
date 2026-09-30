// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
vi.mock('server-only', () => ({}));
const id = new Types.ObjectId('507f1f77bcf86cd799439011');
afterEach(() => vi.restoreAllMocks());

describe('Database-visible mutation query fences', () => {
  it('adds the parent owner guard to ordinary versioned writes', async () => {
    const write = vi.spyOn(EPaper.collection, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await EPaper.updateOne({ _id: id, version: 4 }, { $set: { title: 'Edited' } });
    expect(write.mock.calls[0][0]).toMatchObject({ _id: id, version: 4, 'contentMutation.id': { $exists: false } });
  });
  it('allows an explicit owner to update its durable journal', async () => {
    const write = vi.spyOn(EPaper.collection, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await EPaper.updateOne({ _id: id, 'contentMutation.id': 'owner' }, { $set: { 'contentMutation.phase': 'rollback' } });
    expect(write.mock.calls[0][0]).toMatchObject({ 'contentMutation.id': 'owner' });
  });
  it.each(['update', 'delete'])('surfaces blocked parent %s as a domain conflict', async (operation) => {
    vi.spyOn(EPaper.collection, 'updateOne').mockResolvedValue({ matchedCount: 0 } as never);
    vi.spyOn(EPaper.collection, 'deleteOne').mockResolvedValue({ deletedCount: 0 } as never);
    vi.spyOn(EPaper.collection, 'findOne').mockResolvedValue({ _id: id, contentMutation: { id: 'owner' } } as never);
    await expect(operation === 'update' ? EPaper.updateOne({ _id: id }, { $set: { status: 'published' } }) : EPaper.deleteOne({ _id: id })).rejects.toMatchObject({ status: 409 });
  });
  it.each([EPaperArticle, EPaperOcrSuggestion])('guards ordinary child writes from an active owner', async (model) => {
    const write = vi.spyOn(model.collection, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await (model === EPaperArticle ? EPaperArticle.updateOne({ _id: id }, { $set: { title: 'Edited' } }) : EPaperOcrSuggestion.updateOne({ _id: id }, { $set: { title: 'Edited' } }));
    expect(write.mock.calls[0][0]).toMatchObject({ readinessMutationToken: { $in: [null, ''] }, readinessMutationHidden: { $ne: true } });
  });
  it.each([EPaperArticle, EPaperOcrSuggestion])('hides uncommitted reservations from ordinary child reads', async (model) => {
    const read = vi.spyOn(model.collection, 'findOne').mockResolvedValue(null);
    await (model === EPaperArticle ? EPaperArticle.findById(id).lean() : EPaperOcrSuggestion.findById(id).lean()); expect(read.mock.calls[0][0]).toMatchObject({ readinessMutationHidden: { $ne: true } });
  });
  it('hides reservations from readiness counts and aggregation', async () => {
    const count = vi.spyOn(EPaperArticle.collection, 'countDocuments').mockResolvedValue(0);
    const aggregate = vi.spyOn(EPaperArticle.collection, 'aggregate').mockReturnValue({ toArray: async () => [] } as never);
    await EPaperArticle.countDocuments({ epaperId: id }); await EPaperArticle.aggregate([{ $match: { epaperId: id } }]);
    expect(count.mock.calls[0][0]).toMatchObject({ readinessMutationHidden: { $ne: true } });
    expect(aggregate.mock.calls[0][0]?.[0]).toEqual({ $match: { readinessMutationHidden: { $ne: true } } });
  });
  it('blocks editing and publishing while durable recovery is pending', () => {
    expect(() => assertEpaperDraftEditable({ _id: id, status: 'draft', productionStatus: 'ready_to_publish', contentMutation: { id: 'owner', phase: 'rollback' } })).toThrow('being saved or recovered');
  });
});
