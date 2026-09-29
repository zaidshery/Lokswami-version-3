// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import TtsAsset from '@/lib/models/TtsAsset';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';

vi.mock('server-only', () => ({}));

const id = '507f1f77bcf86cd799439011';
const standaloneError = Object.assign(
  new Error('Transaction numbers are only allowed on a replica set member or mongos'),
  { code: 20, codeName: 'IllegalOperation' },
);
const draft = {
  _id: id, status: 'draft', productionStatus: 'hotspot_mapping', version: 4,
  revisionInitializationStatus: 'ready', pages: [],
};

afterEach(() => vi.restoreAllMocks());

function query(value: unknown, sessionError = false) {
  return {
    session: vi.fn(() => ({ lean: vi.fn(async () => {
      if (sessionError) throw standaloneError;
      return value;
    }) })),
    lean: vi.fn(async () => value),
  };
}

describe('E-Paper repository standalone transaction fallback', () => {
  it('keeps story creation inside the transaction when transactions are supported', async () => {
    const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => work()), endSession: vi.fn() };
    vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
    vi.spyOn(EPaper, 'findById').mockReturnValue(query(draft) as never);
    vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    const created = { _id: 'story', toObject: () => ({ _id: 'story' }) };
    const create = vi.spyOn(EPaperArticle, 'create').mockResolvedValue([created] as never);

    await new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => repo.createArticle({ epaperId: id, title: 'Story' }));

    expect(create).toHaveBeenCalledWith([{ epaperId: id, title: 'Story' }], { session });
    expect(EPaper.updateOne).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), { session });
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('falls back narrowly on standalone Mongo and still applies the readiness CAS before a story write', async () => {
    const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => work()), endSession: vi.fn() };
    vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
    vi.spyOn(EPaper, 'findById').mockReturnValueOnce(query(null, true) as never).mockReturnValue(query(draft) as never);
    const update = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    const created = { _id: 'story', toObject: () => ({ _id: 'story' }) };
    const create = vi.spyOn(EPaperArticle, 'create').mockResolvedValue(created as never);

    const result = await new EpaperRepository().withEditionReadinessMutation(
      id,
      4,
      (repo) => repo.createArticle({ epaperId: id, title: 'OCR accepted story' }),
    );

    expect(result).toMatchObject({ _id: 'story' });
    expect(update).toHaveBeenCalledTimes(2);
    const [filter, change, options] = (update.mock.calls as unknown as unknown[][])[0];
    expect(filter).toMatchObject({ _id: id, status: 'draft', version: 4 });
    expect(change).toEqual({ $inc: { version: 1 } });
    expect((update.mock.calls as unknown as unknown[][])[1][1]).toMatchObject({ $set: { qaCompletedAt: null } });
    expect(options).toBeUndefined();
    expect(update.mock.calls[1][0]).toMatchObject({ _id: id, version: 5 });
    expect(create).toHaveBeenCalledWith({ epaperId: id, title: 'OCR accepted story' });
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('applies OCR acceptance story, suggestion, and page-readiness writes through the standalone fallback', async () => {
    const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => work()), endSession: vi.fn() };
    vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
    vi.spyOn(EPaper, 'findById').mockReturnValueOnce(query(null, true) as never).mockReturnValue(query(draft) as never);
    const update = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    const article = { _id: '507f1f77bcf86cd799439012', toObject: () => ({ _id: '507f1f77bcf86cd799439012' }) };
    const createArticle = vi.spyOn(EPaperArticle, 'create').mockResolvedValue(article as never);
    vi.spyOn(EPaperOcrSuggestion, 'findById').mockReturnValue({ lean: async () => ({ _id: 'suggestion', status: 'pending' }) } as never);
    const suggestionUpdate = vi.spyOn(EPaperOcrSuggestion, 'findOneAndUpdate').mockReturnValue({
      lean: async () => ({ _id: 'suggestion', status: 'accepted' }),
    } as never);

    await new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      const created = await repo.createArticle({ epaperId: id, title: 'Accepted OCR story' });
      const reviewed = await repo.updateOcrSuggestion('suggestion', {
        status: 'accepted', createdArticleId: repo.toObjectId(String(created._id)),
      });
      await repo.updateEditionWhere({ _id: id }, {
        $set: { pages: [{ pageNumber: 1, reviewStatus: 'ready' }], qaCompletedAt: null },
      });
      return { created, reviewed };
    });

    expect(createArticle).toHaveBeenCalledWith({ epaperId: id, title: 'Accepted OCR story' });
    expect(suggestionUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: 'suggestion', $and: expect.any(Array) }), expect.objectContaining({ status: 'accepted' }), expect.objectContaining({ new: true, runValidators: true }));
    expect(update).toHaveBeenCalledTimes(2);
    expect((update.mock.calls as unknown as unknown[][])[1][1]).toMatchObject({
      $set: { pages: [{ pageNumber: 1, reviewStatus: 'ready' }], qaCompletedAt: null },
    });
  });

  it('does not fall back for an unrelated transaction error', async () => {
    const session = {
      withTransaction: vi.fn(async () => { throw Object.assign(new Error('replica set option invalid'), { code: 20, codeName: 'IllegalOperation' }); }),
      endSession: vi.fn(),
    };
    vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
    const update = vi.spyOn(EPaper, 'updateOne');

    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async () => 'never'))
      .rejects.toThrow('replica set option invalid');
    expect(update).not.toHaveBeenCalled();
  });

  it('runs revision initialization without a session, refreshes owner fencing, and tags cloned children', async () => {
    const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => work()), endSession: vi.fn() };
    vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
    const update = vi.spyOn(EPaper, 'updateOne').mockImplementation((async (...args: unknown[]) => {
      const options = args[2] as { session?: unknown } | undefined;
      if (options?.session) throw standaloneError;
      return { matchedCount: 1 } as never;
    }) as never);
    const article = { _id: 'cloned-story', toObject: () => ({ _id: 'cloned-story' }) };
    const asset = { _id: 'cloned-audio', toObject: () => ({ _id: 'cloned-audio' }) };
    const createArticle = vi.spyOn(EPaperArticle, 'create').mockResolvedValue(article as never);
    const createTts = vi.spyOn(TtsAsset, 'create').mockResolvedValue(asset as never);

    await new EpaperRepository().withRevisionInitialization(id, 'owner-1', async (repo) => {
      await repo.createArticle({ epaperId: id, title: 'Cloned story' });
      await repo.createTtsAsset({ sourceType: 'epaperArticle', sourceId: 'cloned-story', sourceParentId: id, variant: 'epaper_story',
        textHash: 'h', contentVersionHash: 'v', languageCode: 'hi', voice: 'voice', provider: 'manual', model: 'm',
        mimeType: 'audio/mpeg', audioUrl: '/audio.mp3', storageMode: 'spaces', status: 'ready', chunkCount: 1,
        charCount: 1, failureCount: 0 });
      await repo.updateEditionWhere({ _id: id, revisionInitializationOwner: 'owner-1' }, { $set: { revisionInitializationStatus: 'ready' } });
    });

    expect((update.mock.calls as unknown as unknown[][]).filter((call) => !(call[2] as { session?: unknown } | undefined)?.session).length).toBeGreaterThanOrEqual(4);
    expect(createArticle).toHaveBeenCalledWith(expect.objectContaining({ revisionInitializationOwner: 'owner-1' }));
    expect(createTts).toHaveBeenCalledWith(expect.objectContaining({ revisionInitializationOwner: 'owner-1' }));
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('cannot let an initialization owner publish after takeover and cleans only its own partial clone', async () => {
    const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => work()), endSession: vi.fn() };
    vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
    let ownerChecks = 0;
    vi.spyOn(EPaper, 'updateOne').mockImplementation((async (...args: unknown[]) => {
      const [filter, _change, options] = args as [Record<string, unknown>, unknown, { session?: unknown }?];
      if (options?.session) throw standaloneError;
      if (filter.revisionInitializationOwner === 'owner-old' && ++ownerChecks === 3) return { matchedCount: 0 } as never;
      return { matchedCount: 1 } as never;
    }) as never);
    const created = { _id: 'partial-story', toObject: () => ({ _id: 'partial-story' }) };
    vi.spyOn(EPaperArticle, 'create').mockResolvedValue(created as never);
    const deleteArticles = vi.spyOn(EPaperArticle, 'deleteMany').mockResolvedValue({ deletedCount: 1 } as never);
    const deleteTts = vi.spyOn(TtsAsset, 'deleteMany').mockResolvedValue({ deletedCount: 0 } as never);
    const initialize = vi.fn(async (repo: EpaperRepository) => {
      await repo.createArticle({ epaperId: id, title: 'Partial' });
      await repo.updateEditionWhere({ _id: id, revisionInitializationOwner: 'owner-old' }, {
        $set: { revisionInitializationStatus: 'ready', revisionInitializationOwner: '' },
      });
    });

    await expect(new EpaperRepository().withRevisionInitialization(id, 'owner-old', initialize))
      .rejects.toThrow('ownership changed');
    expect(initialize).toHaveBeenCalledOnce();
    expect(deleteArticles).toHaveBeenCalledWith({ epaperId: id, revisionInitializationOwner: 'owner-old' });
    expect(deleteTts).toHaveBeenCalledWith({ sourceParentId: id, revisionInitializationOwner: 'owner-old' });
  });
});
