// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import TtsAsset from '@/lib/models/TtsAsset';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { arrangeMutationMongo, suggestionId } from './helpers/epaperMutationMongoFixture';

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

  it('falls back narrowly and durably records intent before a story write', async () => {
    const state = arrangeMutationMongo();
    const result = await new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => repo.createArticle({
      epaperId: id, pageNumber: 1, title: 'OCR accepted story', slug: 'accepted',
      contentHtml: '<p>Story</p>', hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 },
    }));
    expect(result).toMatchObject({ title: 'OCR accepted story' });
    expect(result._id).toBeDefined();
    const first = state.events[0];
    expect(first.filter).toMatchObject({ _id: id, status: 'draft', version: 4 });
    expect(first.payload).toMatchObject({ $set: { version: 5, contentMutation: { phase: 'running', undo: [] } } });
    const intentIndex = state.events.findIndex((event) => event.phase === 'after' && event.payload.$push);
    const childIndex = state.events.findIndex((event) => event.collection === 'article');
    expect(intentIndex).toBeGreaterThan(0);
    expect(intentIndex).toBeLessThan(childIndex);
    expect(state.parent).toMatchObject({ version: 5, qaCompletedAt: null });
    expect(state.parent.contentMutation).toBeUndefined();
    expect(state.visible()[0].readinessMutationToken).toBeUndefined();
    expect(state.visible()[0].readinessDiscardAfter).toBeUndefined();
    expect(state.session.endSession).toHaveBeenCalledOnce();
  });

  it('commits OCR article, suggestion and page readiness through the standalone journal', async () => {
    const state = arrangeMutationMongo();
    const result = await new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      const created = await repo.createArticle({ epaperId: id, pageNumber: 1, title: 'Accepted OCR story',
        slug: 'accepted', contentHtml: '<p>Story</p>', hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 } });
      const reviewed = await repo.updateOcrSuggestion(suggestionId, {
        status: 'accepted', createdArticleId: repo.toObjectId(String(created._id)),
      });
      await repo.updateEditionWhere({ _id: id }, {
        $set: { pages: [{ pageNumber: 1, reviewStatus: 'ready' }], qaCompletedAt: null },
      });
      return { created, reviewed };
    });
    expect(result.reviewed).not.toBeNull();
    expect(String(result.reviewed?.createdArticleId)).toBe(String(result.created._id));
    expect(state.suggestions.get(suggestionId)).toMatchObject({ status: 'accepted' });
    expect(state.parent).toMatchObject({ version: 5, qaCompletedAt: null, pages: [{ pageNumber: 1, reviewStatus: 'ready' }] });
    expect(state.parent.contentMutation).toBeUndefined();
    expect(EPaperOcrSuggestion.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ readinessMutationToken: expect.any(String), readinessContentVersion: 1, $expr: expect.any(Object) }),
      expect.objectContaining({ status: 'accepted' }), expect.objectContaining({ new: true, runValidators: true }));
    expect(state.events.filter((event) => event.phase === 'after' && event.payload.$push)).toHaveLength(2);
    expect(state.events.some((event) => event.filter.version === 5 &&
      (event.payload.$set as Record<string, unknown>)?.['contentMutation.phase'] === 'committed')).toBe(true);
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
