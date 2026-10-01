// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperMutationReceipt from '@/lib/models/EPaperMutationReceipt';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { EpaperOcrService } from '@/lib/server/epaper/epaperOcrService';
import { recoverEditionContentMutation, recoverPendingEditionContentMutations } from '@/lib/server/epaper/epaperStandaloneMutation';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '@/app/api/admin/articles/[id]/route';
import { updateEpaperArticleById } from '@/lib/server/epaper/adminArticleCompat';
import { arrangeMutationMongo, editionId as id, articleId, suggestionId, clone, get, type Row, type WriteEvent } from './helpers/epaperMutationMongoFixture';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/api/adminRoute', () => ({ withAdminMutation: (handler: unknown) => handler }));
vi.mock('@/lib/auth/admin', () => ({ getAdminSessionFromReq: async () => ({ id: 'qa-admin', username: 'qa', role: 'super_admin', name: 'QA', email: 'qa@example.com' }) }));
vi.mock('@/lib/server/epaperWorkflowAutomation', () => ({ applyEpaperWorkflowAutomation: vi.fn() }));
vi.mock('@/lib/server/epaperWorkflowPolicy', async (original) => ({ ...await original<typeof import('@/lib/server/epaperWorkflowPolicy')>(), invalidateEpaperQa: vi.fn() }));
vi.mock('@/lib/server/epaperActivity', () => ({ recordEpaperActivity: vi.fn(), buildEpaperActivityMessage: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const story = { epaperId: id, pageNumber: 1, title: 'After', slug: 'after', contentHtml: '<p>After</p>', hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 } };
const operations = ['create', 'update', 'delete', 'ocr'] as const;
type Operation = typeof operations[number];
function logical(row: Row) { const result = clone(row); for (const key of ['readinessMutationToken', 'readinessContentVersion', 'readinessDiscardAfter']) delete result[key]; return result; }
async function child(repo: EpaperRepository, operation: Operation) {
  if (operation === 'create') return repo.createArticle(story);
  if (operation === 'update') return repo.updateArticle(articleId, { title: 'After' });
  if (operation === 'delete') return repo.deleteArticleWhere({ _id: articleId, epaperId: id });
  const created = await repo.createArticle(story); await repo.updateOcrSuggestion(suggestionId, { status: 'accepted', createdArticleId: created._id }); return created;
}
function prepare(operation: Operation, publicationType = 'epaper') {
  const state = arrangeMutationMongo('standalone', publicationType);
  const before = operation === 'update' || operation === 'delete' ? state.seed() : undefined;
  return { ...state, before, suggestionBefore: clone(state.suggestions.get(suggestionId)!) };
}
function restored(state: ReturnType<typeof prepare>) {
  expect(state.visible().map(logical)).toEqual(state.before ? [logical(state.before)] : []);
  expect(logical(state.suggestions.get(suggestionId)!)).toEqual(logical(state.suggestionBefore));
}
function dataWrite(operation: Operation, event: WriteEvent) {
  return operation === 'create' ? event.operation === 'findOneAndReplace'
    : operation === 'update' ? event.collection === 'article' && event.operation === 'findOneAndUpdate'
    : operation === 'delete' ? event.collection === 'article' && get(event.payload, '$set.readinessMutationHidden') === true
    : event.collection === 'suggestion' && event.operation === 'findOneAndUpdate';
}

describe.each(['epaper', 'emagazine'])('Durable standalone %s content recovery', (publicationType) => {
  it.each(operations)('undoes partial %s writes after a forced after-lock parent fence loss', async (operation) => {
    const state = prepare(operation, publicationType);
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await child(repo, operation); state.compete(); await repo.updateEditionWhere({ _id: id }, { $set: { pages: [{ imagePath: '/stale.jpg' }] } });
    })).rejects.toThrow('Edition changed during content mutation');
    restored(state); expect(state.parent.pages).toEqual([{ pageNumber: 1, imagePath: '/concurrent.jpg' }]);
    expect(state.parent.version).toBe(7); expect(state.parent.contentMutation).toBeUndefined();
  });
});

describe('Write-ahead intent and indeterminate acknowledgements', () => {
  it.each(['standalone', 'transaction'] as const)('OCR acceptance preserves explicit revision page QA in %s mode', async (mode) => {
    for (const publicationType of ['epaper','emagazine']) {
      for (const revision of [false,true]) {
        const state=arrangeMutationMongo(mode,publicationType);
        state.parent.productionStatus='ready_to_publish';state.parent.qaCompletedAt=new Date();
        if(revision)state.parent.supersedesId='507f1f77bcf86cd799439099';
        await new EpaperOcrService().review({id:'editor',username:'editor',role:'super_admin',name:'Editor',email:'qa@example.com'},id,suggestionId,{action:'accept'});
        const page=(state.parent.pages as Row[])[0];
        expect(page.reviewStatus).toBe(revision?'pending':'ready');
        if(revision){expect(page.reviewedAt).toBeNull();expect(page.reviewedBy).toBeNull();}
        expect(state.visible()).toHaveLength(1);
        expect(state.parent.productionStatus).toBe('hotspot_mapping');expect(state.parent.qaCompletedAt).toBeNull();
        vi.restoreAllMocks();
      }
    }
  });
  it.each(['standalone', 'transaction'] as const)('story edits leave both affected revision pages pending in %s mode', async (mode) => {
    for (const publicationType of ['epaper','emagazine']) {
      const state = arrangeMutationMongo(mode, publicationType); state.seed();
      state.parent.supersedesId = '507f1f77bcf86cd799439099'; state.parent.pageCount = 2;
      state.parent.pages = [1,2].map(pageNumber => ({pageNumber,imagePath:'/qa.jpg',reviewStatus:'ready',reviewedAt:new Date(),reviewedBy:{id:'reviewer'}}));
      const result = await updateEpaperArticleById(articleId,{excerpt:'Edited mapping',pageNumber:2},false,{id:'editor',username:'editor',role:'super_admin',name:'Editor',email:'qa@example.com'});
      expect(result.ok).toBe(true);
      expect(state.parent.pages).toEqual([1,2].map(pageNumber => ({pageNumber,imagePath:'/qa.jpg',reviewStatus:'pending',reviewedAt:null,reviewedBy:null})));
      vi.restoreAllMocks();
    }
  });
  it.each(operations)('persists %s intent before its first child command', async (operation) => {
    const state = prepare(operation); let observed = false;
    state.onWrite((event) => {
      if (event.collection !== 'edition' && event.phase === 'before') {
        expect((get(state.parent, 'contentMutation.undo') as Row[]).some((undo) => String(undo.childId) === String(event.filter._id))).toBe(true); observed = true;
      }
    });
    await new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, operation));
    expect(observed).toBe(true); expect(state.parent.contentMutation).toBeUndefined();
  });
  it.each(operations)('undoes applied %s data with a lost acknowledgement', async (operation) => {
    const state = prepare(operation); let failed = false;
    state.onWrite((event) => { if (dataWrite(operation, event) && event.phase === 'after' && !failed) { failed = true; throw Object.assign(new Error('lost acknowledgement'), { code: 64 }); } });
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, operation))).rejects.toThrow('lost acknowledgement');
    expect(failed).toBe(true); restored(state); expect(state.parent.contentMutation).toBeUndefined(); expect(state.parent.version).toBe(6);
  });
  it.each(operations)('undoes an indeterminate %s reservation', async (operation) => {
    const state = prepare(operation); let failed = false;
    state.onWrite((event) => {
      const reservation = operation === 'create' || operation === 'ocr' ? event.operation === 'insertOne' : event.operation === 'updateOne' && get(event.payload, '$set.readinessMutationToken');
      if (event.collection !== 'edition' && reservation && event.phase === 'after' && !failed) { failed = true; throw new Error('reservation acknowledgement lost'); }
    });
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, operation))).rejects.toThrow('reservation acknowledgement lost');
    restored(state); expect(state.parent.contentMutation).toBeUndefined();
  });
  it('returns success when the parent commit applied but its acknowledgement was lost', async () => {
    const state = prepare('create'); let failed = false;
    state.onWrite((event) => { if (event.collection === 'edition' && (event.payload.$set as Row)?.['contentMutation.phase'] === 'committed' && event.phase === 'after' && !failed) { failed = true; throw new Error('commit acknowledgement lost'); } });
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, 'create'))).resolves.toMatchObject({ title: 'After' });
    expect(state.visible()).toHaveLength(1); expect(state.parent.contentMutation).toBeUndefined();
    expect(failed).toBe(true);
  });
  it.each(operations)('retains the committed %s result after another process cleans the journal', async (operation) => {
    const state = prepare(operation); let failed = false;
    state.onWrite(async (event) => {
      if (event.collection === 'edition' && (event.payload.$set as Row)?.['contentMutation.phase'] === 'committed' && event.phase === 'after' && !failed) {
        failed = true;
        await recoverEditionContentMutation(id);
        expect(state.parent.contentMutation).toBeUndefined();
        // A subsequent mutation can advance the version before the original
        // caller handles the lost acknowledgement. Version alone is no proof.
        state.parent.version = Number(state.parent.version) + 1;
        throw new Error('commit acknowledgement lost after cleanup');
      }
    });
    const result = new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, operation));
    if (operation === 'delete') await expect(result).resolves.toEqual({ deletedCount: 1 });
    else await expect(result).resolves.toMatchObject({ title: 'After' });
    expect(failed).toBe(true);
  });
});

describe('Durable repair across processes', () => {
  it.each(['before', 'after'])('retains committed intent when receipt acknowledgement fails %s persistence', async (phase) => {
    const state = prepare('update'); vi.spyOn(console, 'error').mockImplementation(() => {});
    const saveReceipt = vi.mocked(EPaperMutationReceipt.updateOne).getMockImplementation()!;
    vi.spyOn(EPaperMutationReceipt, 'updateOne').mockImplementation((async (...args: unknown[]) => {
      if (phase === 'after') await (saveReceipt as (...values: unknown[]) => Promise<unknown>)(...args);
      throw new Error('receipt acknowledgement unavailable');
    }) as never);
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, 'update'))).resolves.toMatchObject({ title: 'After' });
    expect(state.parent.contentMutation).toMatchObject({ phase: 'committed' });
    expect(state.visible()[0].readinessMutationToken).toBeTruthy();
    vi.spyOn(EPaperMutationReceipt, 'updateOne').mockImplementation(saveReceipt as never);
    await recoverEditionContentMutation(id);
    expect(state.receipts.size).toBe(1);
    expect(state.parent.contentMutation).toBeUndefined();
    expect(state.visible()[0].title).toBe('After');
  });
  it('expires result receipts independently without expiring live content', () => {
    expect(EPaperMutationReceipt.schema.indexes()).toEqual(expect.arrayContaining([
      [{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })],
    ]));
  });
  it.each(operations)('recovers a durable %s journal after Mongo is unavailable during undo', async (operation) => {
    const state = prepare(operation); const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.onWrite((event) => { if (get(state.parent, 'contentMutation.phase') === 'rollback' && event.collection !== 'edition' && event.phase === 'before') throw new Error('Mongo unavailable during undo'); });
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => { await child(repo, operation); throw new Error('callback failure'); })).rejects.toThrow('compensation incomplete');
    expect(state.parent.contentMutation).toMatchObject({ phase: 'rollback', undo: expect.any(Array) }); expect(logged).toHaveBeenCalled(); state.onWrite();
    await expect(recoverPendingEditionContentMutations()).resolves.toEqual({ inspected: 1, recovered: 1 }); restored(state); expect(state.parent.contentMutation).toBeUndefined();
    await expect(recoverEditionContentMutation(id)).resolves.toBe(true); restored(state);
  });
  it('retries an acknowledged-lost undo idempotently', async () => {
    const state = prepare('update'); let failed = false; vi.spyOn(console, 'error').mockImplementation(() => {});
    state.onWrite((event) => { if (event.collection === 'article' && event.operation === 'replaceOne' && event.phase === 'after' && !failed) { failed = true; throw new Error('undo acknowledgement lost'); } });
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => { await child(repo, 'update'); throw new Error('callback failure'); })).rejects.toThrow('compensation incomplete');
    const beforeRetry = clone(state.articles.get(articleId)); state.onWrite(); await recoverEditionContentMutation(id);
    expect(state.articles.get(articleId)).toEqual(beforeRetry); expect(state.parent.contentMutation).toBeUndefined();
  });
  it('retains committed cleanup intent without reporting the content save as failed', async () => {
    const state = prepare('update'); vi.spyOn(console, 'error').mockImplementation(() => {});
    state.onWrite((event) => { if (event.collection === 'article' && get(event.payload, '$unset.readinessMutationToken') === '' && event.phase === 'before') throw new Error('cleanup unavailable'); });
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, 'update'))).resolves.toMatchObject({ title: 'After' });
    expect(state.parent.contentMutation).toMatchObject({ phase: 'committed' }); state.onWrite(); await recoverPendingEditionContentMutations();
    expect(state.visible()[0].title).toBe('After'); expect(state.visible()[0].readinessMutationToken).toBeUndefined(); expect(state.parent.contentMutation).toBeUndefined();
  });
  it.each(operations)('recovers an expired %s owner and fences its late child command', async (operation) => {
    vi.useFakeTimers({ toFake: ['Date'] }); const state = prepare(operation); let resume!: () => void; let entered!: () => void; let held = false;
    const gate = new Promise<void>((resolve) => { resume = resolve; }); const paused = new Promise<void>((resolve) => { entered = resolve; });
    state.onWrite(async (event) => { if (dataWrite(operation, event) && event.phase === 'before' && !held) { held = true; entered(); await gate; } });
    const pending = new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, operation)); const rejection = expect(pending).rejects.toThrow();
    await paused; vi.setSystemTime(Date.now() + 11 * 60_000); await recoverEditionContentMutation(id); restored(state); resume(); await rejection; restored(state);
    expect(state.parent.contentMutation).toBeUndefined();
  });
  it('fences a late reservation that had not applied before stale-owner recovery', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); const state = prepare('update'); let resume!: () => void; let entered!: () => void; let held = false;
    const gate = new Promise<void>((resolve) => { resume = resolve; }); const paused = new Promise<void>((resolve) => { entered = resolve; });
    state.onWrite(async (event) => { if (event.collection === 'article' && get(event.payload, '$set.readinessMutationToken') && event.phase === 'before' && !held) { held = true; entered(); await gate; } });
    const pending = new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, 'update')); const rejection = expect(pending).rejects.toThrow();
    await paused; vi.setSystemTime(Date.now() + 11 * 60_000); await recoverEditionContentMutation(id); resume(); await rejection; restored(state);
    expect(state.articles.get(articleId)!.readinessContentVersion).toBe(2);
  });
  it('retains repair intent rather than overwriting a valid successor with a conflicting slug', async () => {
    const state = prepare('delete'); vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await child(repo, 'delete'); state.articles.delete(articleId); state.seed({ _id: '507f1f77bcf86cd799439099', title: 'Successor' }); throw new Error('failed delete');
    })).rejects.toThrow('compensation incomplete');
    expect(state.visible()[0].title).toBe('Successor'); expect(state.parent.contentMutation).toMatchObject({ phase: 'rollback' });
  });
});

describe('Serialization and API contracts', () => {
  it('retains a committed journal when cleanup acknowledges zero without releasing the child', async () => {
    const state = prepare('update'); vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = vi.mocked(EPaperArticle.collection.updateOne).getMockImplementation()!;
    vi.spyOn(EPaperArticle.collection, 'updateOne').mockImplementation(((filter: Row, updates: Row, options: unknown) =>
      updates.$unset ? Promise.resolve({ matchedCount: 0 }) : original(filter as never, updates as never, options as never)) as never);
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, 'update'))).resolves.toMatchObject({ title: 'After' });
    expect(state.parent.contentMutation).toMatchObject({ phase: 'committed' });
    expect(state.visible()[0].readinessMutationToken).toBeDefined();
  });
  it('allows concurrent repair workers to finish without overwriting restored content', async () => {
    const state = prepare('update'); vi.spyOn(console, 'error').mockImplementation(() => {});
    state.onWrite((event) => { if (event.collection === 'article' && event.operation === 'replaceOne' && event.phase === 'before') throw new Error('repair unavailable'); });
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => { await child(repo, 'update'); throw new Error('abort'); })).rejects.toThrow('compensation incomplete');
    state.onWrite(); await Promise.all([recoverEditionContentMutation(id), recoverEditionContentMutation(id)]);
    restored(state); expect(state.parent.contentMutation).toBeUndefined(); expect(state.parent.version).toBe(6);
  });
  it('prevents a delayed initial create reservation from resurrecting an expired operation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); const state = prepare('create'); let resume!: () => void; let entered!: () => void; let held = false;
    const gate = new Promise<void>((resolve) => { resume = resolve; }); const paused = new Promise<void>((resolve) => { entered = resolve; });
    state.onWrite(async (event) => { if (event.collection === 'article' && event.operation === 'insertOne' && event.phase === 'before' && !held) { held = true; entered(); await gate; } });
    const pending = new EpaperRepository().withEditionReadinessMutation(id, 4, (repo) => child(repo, 'create')); const rejection = expect(pending).rejects.toThrow();
    await paused; vi.setSystemTime(Date.now() + 11 * 60_000); await recoverEditionContentMutation(id); resume(); await rejection;
    expect(state.visible()).toEqual([]); expect(state.parent.contentMutation).toBeUndefined();
  });
  it.each(operations)('commits coherent %s state with a matching snapshot', async (operation) => {
    const state = prepare(operation);
    await new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => { await child(repo, operation); await repo.updateEditionWhere({ _id: id }, { $set: { pages: [{ pageNumber: 1, imagePath: '/final.jpg', reviewStatus: 'pending' }] } }); });
    expect(state.visible()).toHaveLength(operation === 'delete' ? 0 : 1); expect(state.parent.version).toBe(5); expect(state.parent.contentMutation).toBeUndefined();
    expect(state.parent.pages).toEqual([{ pageNumber: 1, imagePath: '/final.jpg', reviewStatus: 'pending' }]);
  });
  it('rejects stale callers before any database mutation', async () => {
    const state = prepare('create'); const mutate = vi.fn(); await expect(new EpaperRepository().withEditionReadinessMutation(id, 3, mutate)).rejects.toThrow('EPAPER_VERSION_CONFLICT');
    expect(mutate).not.toHaveBeenCalled(); expect(state.events).toEqual([]);
  });
  it('blocks same-edition competition while another edition can finish', async () => {
    const state = prepare('create'); const secondId = '507f1f77bcf86cd799439099'; state.parents.set(secondId, { ...clone(state.parent), _id: secondId });
    let resume!: () => void; let entered!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; }); const paused = new Promise<void>((resolve) => { entered = resolve; });
    const pending = new EpaperRepository().withEditionReadinessMutation(id, 4, async () => { entered(); await gate; return 'first'; }); await paused;
    const competing = vi.fn(); await expect(new EpaperRepository().withEditionReadinessMutation(id, 5, competing)).rejects.toThrow('still in progress'); expect(competing).not.toHaveBeenCalled();
    await expect(new EpaperRepository().withEditionReadinessMutation(secondId, 4, async () => 'second')).resolves.toBe('second'); resume(); await expect(pending).resolves.toBe('first');
  });
  it('keeps real transactions without a standalone journal on abort', async () => {
    const state = arrangeMutationMongo('transaction'); const before = clone(state.parent);
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => { await repo.createArticle(story); throw new Error('transaction failure'); })).rejects.toThrow('transaction failure');
    expect(state.parent).toEqual(before); expect(state.visible()).toEqual([]); expect(EPaperArticle.create).toHaveBeenCalledWith([story], { session: state.session });
  });
  it.each([new Error('network unavailable'), Object.assign(new Error('different code 20 message'), { code: 20, codeName: 'IllegalOperation' }),
    Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 50, codeName: 'IllegalOperation' })])('does not fall back for an arbitrary Mongo error: %s', async (error) => {
    const state = prepare('create'); state.session.withTransaction.mockRejectedValueOnce(error); const mutate = vi.fn();
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, mutate)).rejects.toBe(error); expect(mutate).not.toHaveBeenCalled(); expect(state.events).toEqual([]);
  });
  it.each(['PATCH', 'DELETE'])('returns HTTP 409 with restored content after an after-lock %s fence loss', async (method) => {
    const state = prepare(method === 'PATCH' ? 'update' : 'delete'); let competed = false;
    state.onWrite((event) => { const target = method === 'PATCH' ? event.operation === 'findOneAndUpdate' : get(event.payload, '$set.readinessMutationHidden') === true;
      if (event.collection === 'article' && target && event.phase === 'after' && !competed) { competed = true; state.compete(); } });
    const req = new NextRequest(`http://localhost/api/admin/articles/${articleId}?kind=epaper`, { method, ...(method === 'PATCH' ? { body: JSON.stringify({ excerpt: 'After' }) } : {}) });
    const response = await (method === 'PATCH' ? PATCH : DELETE)(req, { params: Promise.resolve({ id: articleId }) });
    expect(response.status).toBe(409); restored(state); expect(state.parent.pages).toEqual([{ pageNumber: 1, imagePath: '/concurrent.jpg' }]);
  });
});
