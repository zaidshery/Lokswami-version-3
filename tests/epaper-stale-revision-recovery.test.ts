// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import { EpaperRevisionService } from '@/lib/server/epaper/epaperRevisionService';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { type EpaperRecord, type AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';
import { assertEpaperDraftEditable, isRevisionInitializationStale, REVISION_INITIALIZATION_STALE_MS } from '@/lib/server/epaperWorkflowPolicy';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/epaperActivity', () => ({ buildEpaperActivityMessage: vi.fn(), recordEpaperActivity: vi.fn() }));
const actor: AdminSessionIdentity = { id: 'admin', username: 'admin', name: 'Admin', email: '', role: 'super_admin' };
const now = new Date('2026-09-28T06:00:00Z');
const copy = <T,>(value: T): T => structuredClone(value);
function matches(record: EpaperRecord, filter: EpaperRecord): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return (value as EpaperRecord[]).some((branch) => matches(record, branch));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const op = value as EpaperRecord;
      if ('$lte' in op) return record[key] != null && new Date(String(record[key])).getTime() <= new Date(String(op.$lte)).getTime();
      if ('$ne' in op) return record[key] !== op.$ne;
    }
    return value === null ? record[key] == null : record[key] === value;
  });
}
function setup(state: string | null, age = 600_001, publicationType = 'epaper') {
  const source: EpaperRecord = { _id: 'source', familyId: 'family', publicationType, revisionNumber: 1, version: 7,
    status: 'published', productionStatus: 'published', isCurrentRevision: true, title: 'Issue', citySlug: 'indore',
    pageCount: 1, pages: [{ pageNumber: 1, imagePath: '/uploads/page.jpg', processingStatus: 'ready' }] };
  const store = new Map<string, EpaperRecord>([['source', source]]);
  if (state) store.set('draft', { ...copy(source), _id: 'draft', status: 'draft', productionStatus: 'hotspot_mapping',
    isCurrentRevision: false, revisionNumber: 2, version: 1, revisionInitializationStatus: state,
    revisionInitializationOwner: 'dead', revisionInitializationStartedAt: new Date(now.getTime() - age), createdAt: new Date(now.getTime() - age) });
  const articles: EpaperRecord[] = [{ _id: 'story', epaperId: 'source', title: 'Story', pageNumber: 1 }];
  if (state) articles.push({ _id: 'partial', epaperId: 'draft', title: 'Incomplete' });
  const repo = {
    connect: vi.fn(), isValidId: vi.fn(() => true),
    findEditionById: vi.fn(async (id: string) => store.has(id) ? copy(store.get(id)!) : null),
    findEdition: vi.fn(async (filter: EpaperRecord) => {
      const result = [...store.values()].find((record) => matches(record, filter));
      return result ? copy(result) : null;
    }),
    findLatestRevision: vi.fn(async () => ({ revisionNumber: 1 })),
    createEdition: vi.fn(async (data: EpaperRecord) => {
      if (store.has('draft')) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      const record = { ...copy(data), _id: 'draft' }; store.set('draft', record); return copy(record);
    }),
    updateEditionWhere: vi.fn(async (filter: EpaperRecord, update: EpaperRecord) => {
      const record = store.get(String(filter._id));
      if (!record || !matches(record, filter)) return { matchedCount: 0 };
      Object.assign(record, update.$set);
      record.version = Number(record.version) + Number((update.$inc as EpaperRecord)?.version || 0);
      return { matchedCount: 1 };
    }),
    listArticles: vi.fn(async (id: string) => copy(articles.filter((article) => article.epaperId === id))),
    createArticle: vi.fn(async (data: EpaperRecord) => { const record = { ...copy(data), _id: 'clone' }; articles.push(record); return record; }),
    deleteArticles: vi.fn(async ({ epaperId }: { epaperId: string }) => {
      for (let i = articles.length - 1; i >= 0; i--) if (articles[i].epaperId === epaperId) articles.splice(i, 1);
    }),
    deleteTtsAssets: vi.fn(), listReadyTtsAssets: vi.fn(async () => []), createTtsAsset: vi.fn(),
    withRevisionInitialization: vi.fn(async (_id: string, _owner: string, work: (repo: EpaperRepository) => Promise<void>) => work(repo as never)),
  };
  return { source, store, articles, repo, service: new EpaperRevisionService(repo as never) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('stale revision recovery', () => {
  it('protects and reuses a recent initializer without creating or replacing a draft', async () => {
    const { store, repo, service } = setup('initializing', 60_000);
    for (let i = 0; i < 2; i++) await expect(service.create(actor, 'source')).resolves.toMatchObject({ data: { revisionId: 'draft', initializationPending: true } });
    expect(repo.createEdition).not.toHaveBeenCalled();
    expect(repo.updateEditionWhere).not.toHaveBeenCalled();
    expect(repo.deleteArticles).not.toHaveBeenCalled();
    expect(() => assertEpaperDraftEditable(store.get('draft')!, { allowFailedInitialization: true })).toThrow();
  });
  it('uses a bounded ten minute timeout and rejects invalid or missing timestamps', () => {
    expect(REVISION_INITIALIZATION_STALE_MS).toBe(600_000);
    const stale = (age: number) => isRevisionInitializationStale({ revisionInitializationStatus: 'initializing', revisionInitializationStartedAt: new Date(now.getTime() - age) });
    expect(stale(599_999)).toBe(false); expect(stale(600_000)).toBe(true);
    expect(isRevisionInitializationStale({ revisionInitializationStatus: 'initializing', revisionInitializationStartedAt: 'invalid' })).toBe(false);
    expect(isRevisionInitializationStale({ revisionInitializationStatus: 'initializing' })).toBe(false);
  });
  it('never treats a ready initializer as stale even when its old lease timestamp remains', () => {
    expect(isRevisionInitializationStale({ revisionInitializationStatus: 'ready', revisionInitializationStartedAt: new Date(now.getTime() - 86_400_000) })).toBe(false);
  });
  it('reuses a ready draft and never claims or replaces it', async () => {
    const { store, repo, service } = setup('ready', 86_400_000);
    await expect(service.create(actor, 'source')).resolves.toMatchObject({ data: { revisionId: 'draft', reused: true, recovered: false } });
    expect(store.get('draft')).toMatchObject({ revisionInitializationStatus: 'ready' });
    expect(repo.updateEditionWhere).not.toHaveBeenCalled();
    expect(repo.deleteArticles).not.toHaveBeenCalled();
    expect(repo.createEdition).not.toHaveBeenCalled();
  });
  it('never revises the protected QA edition', async () => {
    const { repo, service } = setup(null);
    await expect(service.create(actor, '6ab0da70c6aab6a2a6cab44e')).rejects.toThrow('preserved QA edition');
    expect(repo.findEditionById).not.toHaveBeenCalled();
    expect(repo.createEdition).not.toHaveBeenCalled();
  });
  it.each(['epaper', 'emagazine'])('recovers process-death partial content for %s without changing the published source', async (type) => {
    const { source, store, articles, repo, service } = setup('initializing', undefined, type);
    const before = copy(source);
    await expect(service.create(actor, 'source')).resolves.toMatchObject({ data: { recovered: true, revisionId: 'draft' } });
    expect(store.get('source')).toEqual(before);
    expect(store.get('draft')).toMatchObject({ revisionInitializationStatus: 'ready', revisionInitializationStartedAt: null, revisionInitializationOwner: '', version: 3 });
    expect(articles.filter((article) => article.epaperId === 'draft')).toEqual([expect.objectContaining({ title: 'Story', pageNumber: 1 })]);
    expect(repo.createEdition).not.toHaveBeenCalled();
  });
  it('recovers legacy initialization using createdAt', async () => {
    const { store, service } = setup('initializing'); delete store.get('draft')!.revisionInitializationStartedAt;
    await expect(service.create(actor, 'source')).resolves.toMatchObject({ data: { recovered: true } });
  });
  it('recovers failed initialization only through canonical logic', async () => {
    const { store, service } = setup('failed', 1);
    expect(() => assertEpaperDraftEditable(store.get('draft')!)).toThrow();
    await expect(service.create(actor, 'source')).resolves.toMatchObject({ data: { recovered: true } });
  });
  it('only one simultaneous recovery wins and one active usable draft remains', async () => {
    const { store, articles, repo, service } = setup('initializing');
    const results = await Promise.allSettled([service.create(actor, 'source'), service.create(actor, 'source')]);
    expect(results.filter((r) => r.status === 'fulfilled' && r.value.data.recovered)).toHaveLength(1);
    expect(repo.deleteArticles).toHaveBeenCalledTimes(1); expect(repo.createArticle).toHaveBeenCalledTimes(1);
    expect([...store.values()].filter((r) => r.status === 'draft')).toHaveLength(1);
    expect(articles.filter((r) => r.epaperId === 'draft')).toHaveLength(1);
    expect(store.get('draft')!.revisionInitializationStatus).toBe('ready');
  });
  it('never exposes ready until cloning finishes', async () => {
    const { store, repo, service } = setup('initializing');
    const create = repo.createArticle.getMockImplementation()!;
    repo.createArticle.mockImplementation(async (data) => {
      expect(store.get('draft')!.revisionInitializationStatus).toBe('initializing');
      expect(() => assertEpaperDraftEditable(store.get('draft')!)).toThrow();
      return create(data);
    });
    await service.create(actor, 'source');
    expect(store.get('draft')!.revisionInitializationStatus).toBe('ready');
  });
  it('fresh initialization ends ready and later calls reuse the same draft', async () => {
    const { store, repo, service } = setup(null);
    await service.create(actor, 'source'); await service.create(actor, 'source');
    expect(repo.createEdition).toHaveBeenCalledTimes(1);
    expect(store.get('draft')).toMatchObject({ revisionInitializationStatus: 'ready', version: 2 });
    expect(repo.updateEditionWhere).toHaveBeenCalledWith(expect.objectContaining({ revisionInitializationOwner: repo.createEdition.mock.calls[0][0].revisionInitializationOwner }), expect.any(Object));
  });
  it('losing ownership cannot mark another initializer ready or failed', async () => {
    const { store, repo, service } = setup(null);
    repo.createArticle.mockImplementation(async () => { store.get('draft')!.revisionInitializationOwner = 'new-owner'; return { _id: 'clone' }; });
    await expect(service.create(actor, 'source')).rejects.toThrow('changed while cloning');
    expect(store.get('draft')).toMatchObject({ revisionInitializationOwner: 'new-owner', revisionInitializationStatus: 'initializing' });
  });
  it('a clone failure remains recoverable by a later request', async () => {
    const { store, repo, service } = setup('initializing');
    repo.createArticle.mockRejectedValueOnce(new Error('Interrupted'));
    await expect(service.create(actor, 'source')).rejects.toThrow('Interrupted');
    expect(store.get('draft')!.revisionInitializationStatus).toBe('failed');
    await expect(service.create(actor, 'source')).resolves.toMatchObject({ data: { recovered: true } });
  });
});
describe('transaction ownership fence', () => {
  it.each([0, 1])('fences clone writes and closes the session (matched=%s)', async (matchedCount) => {
    const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => work()), endSession: vi.fn() };
    vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
    const update = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount } as never);
    const clone = vi.fn(async (repo: EpaperRepository) => { await repo.updateEditionWhere({ _id: 'draft' }, { $set: { revisionInitializationStatus: 'ready' } }); });
    const result = new EpaperRepository().withRevisionInitialization('draft', 'owner', clone);
    if (matchedCount) { await result; expect((update.mock.calls as unknown as unknown[][])[1][2]).toEqual({ session }); }
    else { await expect(result).rejects.toThrow('ownership changed'); expect(clone).not.toHaveBeenCalled(); }
    expect(update.mock.calls[0][0]).toMatchObject({ revisionInitializationOwner: 'owner', revisionInitializationStatus: 'initializing' });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
