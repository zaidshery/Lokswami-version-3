// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '@/app/api/admin/articles/[id]/route';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/api/adminRoute', () => ({ withAdminMutation: (handler: unknown) => handler }));
vi.mock('@/lib/auth/admin', () => ({ getAdminSessionFromReq: async () => ({ id: 'qa-admin', username: 'qa', role: 'super_admin', name: 'QA', email: 'qa@example.com' }) }));
vi.mock('@/lib/server/epaperWorkflowAutomation', () => ({ applyEpaperWorkflowAutomation: vi.fn() }));
vi.mock('@/lib/server/epaperWorkflowPolicy', async (original) => ({ ...await original<typeof import('@/lib/server/epaperWorkflowPolicy')>(), invalidateEpaperQa: vi.fn() }));
vi.mock('@/lib/server/epaperActivity', () => ({ recordEpaperActivity: vi.fn(), buildEpaperActivityMessage: vi.fn() }));
const id = '507f1f77bcf86cd799439011';
const childId = '507f1f77bcf86cd799439012';
const suggestionId = '507f1f77bcf86cd799439013';
const unsupported = Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20, codeName: 'IllegalOperation' });
type Row = Record<string, unknown>;
afterEach(() => vi.restoreAllMocks());

function matches(row: Row | undefined, filter: Row): boolean {
  if (!row) return false;
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return (value as Row[]).every((entry) => matches(row, entry));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const operator = value as Row;
      if ('$exists' in operator) return (row[key] !== undefined) === operator.$exists;
      if ('$eq' in operator) return isDeepStrictEqual(row[key], operator.$eq);
      if ('$nin' in operator) return !(operator.$nin as unknown[]).includes(row[key]);
    }
    return isDeepStrictEqual(row[key], value);
  });
}

function change(row: Row, updates: Row) {
  const direct = Object.fromEntries(Object.entries(updates).filter(([key]) => !key.startsWith('$')));
  Object.assign(row, direct, updates.$set);
  for (const [key, value] of Object.entries((updates.$inc || {}) as Row)) row[key] = Number(row[key] || 0) + Number(value);
  for (const key of Object.keys((updates.$unset || {}) as Row)) delete row[key];
}

function arrange(publicationType = 'epaper') {
  const parent: Row = { _id: id, publicationType, status: 'draft', productionStatus: 'hotspot_mapping', version: 4, qaCompletedAt: null, pages: [{ pageNumber: 1, imagePath: '/before.jpg' }] };
  const articles = new Map<string, Row>();
  const suggestions = new Map<string, Row>([[suggestionId, { _id: suggestionId, epaperId: id, status: 'pending' }]]);
  vi.spyOn(EPaper.db, 'startSession').mockResolvedValue({ withTransaction: async (work: () => Promise<void>) => work(), endSession: vi.fn() } as never);
  vi.spyOn(EPaper, 'findById').mockImplementation(() => ({ select: () => ({ lean: async () => structuredClone(parent) }), session: () => ({ lean: async () => { throw unsupported; } }), lean: async () => structuredClone(parent) }) as never);
  vi.spyOn(EPaper, 'updateOne').mockImplementation((async (filter: Row, updates: Row) => {
    if (!matches(parent, filter)) return { matchedCount: 0 };
    change(parent, updates); return { matchedCount: 1 };
  }) as never);
  for (const [model, rows] of [[EPaperArticle, articles], [EPaperOcrSuggestion, suggestions]] as const) {
    vi.spyOn(model, 'findById').mockImplementation((key: unknown) => ({ lean: async () => structuredClone(rows.get(String(key)) || null) }) as never);
    vi.spyOn(model, 'findByIdAndUpdate').mockImplementation((key: unknown, updates: Row) => ({ lean: async () => {
      const row = rows.get(String(key)); if (!row) return null; change(row, updates); return structuredClone(row);
    } }) as never);
    vi.spyOn(model, 'findOneAndUpdate').mockImplementation(((filter: Row, updates: Row) => ({ lean: async () => {
      const row = rows.get(String(filter._id)); if (!matches(row, filter)) return null; change(row!, updates); return structuredClone(row);
    } })) as never);
    vi.spyOn(model.collection, 'replaceOne').mockImplementation((async (filter: Row, replacement: Row) => {
      const key = String(filter._id); if (!matches(rows.get(key), filter)) return { matchedCount: 0 };
      rows.set(key, structuredClone(replacement)); return { matchedCount: 1 };
    }) as never);
  }
  vi.spyOn(EPaperArticle, 'create').mockImplementation((async (data: Row | Row[]) => {
    const row = { _id: childId, ...(Array.isArray(data) ? data[0] : data) }; articles.set(childId, structuredClone(row));
    const document = { toObject: () => row }; return Array.isArray(data) ? [document] : document;
  }) as never);
  vi.spyOn(EPaperArticle, 'findOne').mockImplementation(((filter: Row) => ({ lean: async () => {
    const row = articles.get(String(filter._id)); return matches(row, filter) ? structuredClone(row) : null;
  } })) as never);
  vi.spyOn(EPaperArticle, 'deleteOne').mockImplementation((async (filter: Row) => {
    if (!matches(articles.get(String(filter._id)), filter)) return { deletedCount: 0 };
    articles.delete(String(filter._id)); return { deletedCount: 1 };
  }) as never);
  vi.spyOn(EPaperArticle.collection, 'insertOne').mockImplementation((async (row: Row) => {
    if (articles.has(String(row._id)) || [...articles.values()].some((entry) => entry.epaperId === row.epaperId && entry.slug === row.slug)) throw new Error('duplicate successor');
    articles.set(String(row._id), structuredClone(row)); return { acknowledged: true };
  }) as never);
  const compete = () => { parent.version = Number(parent.version) + 1; parent.pages = [{ pageNumber: 1, imagePath: '/concurrent.jpg' }]; };
  return { parent, articles, suggestions, compete };
}

describe.each(['epaper', 'emagazine'])('Standalone %s compensation after CAS acquisition', (publicationType) => {
  it.each(['create', 'update', 'delete', 'ocr'] as const)('removes all partial %s writes after a competing parent mutation', async (operation) => {
    const state = arrange(publicationType);
    const original = { _id: childId, epaperId: id, title: 'Before', slug: 'before' };
    if (operation === 'update' || operation === 'delete') state.articles.set(childId, structuredClone(original));
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      if (operation === 'create' || operation === 'ocr') await repo.createArticle({ epaperId: id, title: 'After' });
      if (operation === 'update') await repo.updateArticle(childId, { title: 'After' });
      if (operation === 'delete') await repo.deleteArticleWhere({ _id: childId, epaperId: id });
      if (operation === 'ocr') await repo.updateOcrSuggestion(suggestionId, { status: 'accepted', createdArticleId: childId });
      // Exact after-lock interleaving, without sleeps: the child write has
      // committed, then another process changes the edition before its fence.
      state.compete();
      await repo.updateEditionWhere({ _id: id }, { $set: { pages: [{ imagePath: '/stale.jpg' }] } });
    })).rejects.toThrow('Edition changed during content mutation');
    expect([...state.articles.values()]).toEqual(operation === 'update' || operation === 'delete' ? [original] : []);
    expect(state.suggestions.get(suggestionId)).toEqual({ _id: suggestionId, epaperId: id, status: 'pending' });
    expect(state.parent.pages).toEqual([{ pageNumber: 1, imagePath: '/concurrent.jpg' }]);
    expect(state.parent.version).toBe(6);
  });
});

describe('Conditional compensation safety', () => {
  it('checks the final parent fence for create callbacks with no page update', async () => {
    const state = arrange();
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await repo.createArticle({ epaperId: id, title: 'Created' }); state.compete();
    })).rejects.toThrow('Edition changed during content mutation');
    expect(state.articles.size).toBe(0);
    expect(state.parent.pages).toEqual([{ pageNumber: 1, imagePath: '/concurrent.jpg' }]);
  });

  it.each(['create', 'update'])('retains a newer concurrent %s record and surfaces incomplete compensation', async (operation) => {
    const state = arrange();
    if (operation === 'update') state.articles.set(childId, { _id: childId, epaperId: id, title: 'Before' });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      if (operation === 'create') await repo.createArticle({ epaperId: id, title: 'Written' });
      else await repo.updateArticle(childId, { title: 'Written' });
      state.articles.get(childId)!.title = 'Independent newer edit'; state.compete();
      await repo.updateEditionWhere({ _id: id }, { $set: { qaCompletedAt: null } });
    })).rejects.toThrow('compensation incomplete');
    expect(state.articles.get(childId)!.title).toBe('Independent newer edit');
    expect(logged).toHaveBeenCalledWith('[epaper] standalone compensation failed', expect.objectContaining({ epaperId: id }));
  });

  it('does not overwrite a successor when restoring a deletion', async () => {
    const state = arrange();
    state.articles.set(childId, { _id: childId, epaperId: id, slug: 'original', title: 'Before' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await repo.deleteArticleWhere({ _id: childId, epaperId: id });
      state.articles.set(childId, { _id: childId, epaperId: id, slug: 'original', title: 'Successor' }); state.compete();
      await repo.updateEditionWhere({ _id: id }, { $set: { qaCompletedAt: null } });
    })).rejects.toThrow('compensation incomplete');
    expect(state.articles.get(childId)!.title).toBe('Successor');
  });

  it('honors slug uniqueness during deleted-object restoration', async () => {
    const state = arrange();
    state.articles.set(childId, { _id: childId, epaperId: id, slug: 'original' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await repo.deleteArticleWhere({ _id: childId, epaperId: id });
      state.articles.set('successor', { _id: 'successor', epaperId: id, slug: 'original' }); state.compete();
      await repo.updateEditionWhere({ _id: id }, { $set: { qaCompletedAt: null } });
    })).rejects.toThrow('compensation incomplete');
    expect([...state.articles.keys()]).toEqual(['successor']);
  });

  it('attempts all undo steps when one OCR compensation fails', async () => {
    const state = arrange();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(EPaperOcrSuggestion.collection.replaceOne).mockRejectedValueOnce(new Error('restore unavailable'));
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await repo.createArticle({ epaperId: id });
      await repo.updateOcrSuggestion(suggestionId, { status: 'accepted', createdArticleId: childId });
      state.compete(); await repo.updateEditionWhere({ _id: id }, { $set: { qaCompletedAt: null } });
    })).rejects.toThrow('compensation incomplete');
    expect(state.articles.size).toBe(0);
    expect(EPaperOcrSuggestion.collection.replaceOne).toHaveBeenCalledOnce();
  });

  it('restores readiness and previously written pages on callback failure without another parent writer', async () => {
    const state = arrange();
    state.parent.productionStatus = 'ready_to_publish'; state.parent.qaCompletedAt = 'prior QA';
    const before = structuredClone(state.parent);
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await repo.createArticle({ epaperId: id });
      await repo.updateEditionWhere({ _id: id }, { $set: { pages: [{ pageNumber: 1, imagePath: '/written.jpg' }] } });
      throw new Error('callback failure');
    })).rejects.toThrow('callback failure');
    expect(state.articles.size).toBe(0);
    expect(state.parent).toEqual({ ...before, version: 6 });
  });

  it.each(['create', 'update', 'delete', 'ocr'] as const)('commits coherent %s state with a matching snapshot', async (operation) => {
    const state = arrange();
    if (operation === 'update' || operation === 'delete') state.articles.set(childId, { _id: childId, epaperId: id, title: 'Before' });
    await new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      if (operation === 'create' || operation === 'ocr') await repo.createArticle({ epaperId: id, title: 'After' });
      if (operation === 'update') await repo.updateArticle(childId, { title: 'After' });
      if (operation === 'delete') await repo.deleteArticleWhere({ _id: childId, epaperId: id });
      if (operation === 'ocr') await repo.updateOcrSuggestion(suggestionId, { status: 'accepted', createdArticleId: childId });
      if (operation !== 'create') await repo.updateEditionWhere({ _id: id }, { $set: { pages: [{ pageNumber: 1, reviewStatus: 'ready' }] } });
    });
    expect(state.parent.version).toBe(5);
    expect(state.articles.size).toBe(operation === 'delete' ? 0 : 1);
    expect(state.suggestions.get(suggestionId)!.status).toBe(operation === 'ocr' ? 'accepted' : 'pending');
    expect(EPaperArticle.collection.replaceOne).not.toHaveBeenCalled();
  });

  it('rejects a stale caller before any parent or child mutation', async () => {
    arrange(); const mutate = vi.fn();
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 3, mutate)).rejects.toThrow('EPAPER_VERSION_CONFLICT');
    expect(mutate).not.toHaveBeenCalled(); expect(EPaper.updateOne).not.toHaveBeenCalled();
  });

  it('does not block another edition while one mutation is paused after its CAS', async () => {
    const state = arrange(); const secondId = '507f1f77bcf86cd799439099';
    const second: Row = { ...structuredClone(state.parent), _id: secondId };
    const parents = new Map([[id, state.parent], [secondId, second]]);
    vi.mocked(EPaper.findById).mockImplementation(((key: unknown) => ({
      session: () => ({ lean: async () => { throw unsupported; } }), lean: async () => structuredClone(parents.get(String(key))),
    })) as never);
    vi.mocked(EPaper.updateOne).mockImplementation((async (filter: Row, updates: Row) => {
      const row = parents.get(String(filter._id)); if (!matches(row, filter)) return { matchedCount: 0 };
      change(row!, updates); return { matchedCount: 1 };
    }) as never);
    let resume!: () => void; let entered!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    const paused = new Promise<void>((resolve) => { entered = resolve; });
    const first = new EpaperRepository().withEditionReadinessMutation(id, 4, async () => { entered(); await gate; return 'first'; });
    await paused;
    await expect(new EpaperRepository().withEditionReadinessMutation(secondId, 4, async () => 'second')).resolves.toBe('second');
    expect(second.version).toBe(5); resume(); await expect(first).resolves.toBe('first');
  });

  it('uses the driver transaction abort contract and never invokes standalone compensation on transaction failure', async () => {
    const state = arrange(); const before = structuredClone(state.parent);
    vi.mocked(EPaper.findById).mockImplementation(() => ({ session: () => ({ lean: async () => structuredClone(state.parent) }), lean: async () => structuredClone(state.parent) }) as never);
    const session = { withTransaction: async (work: () => Promise<void>) => {
      try { await work(); } catch (error) { Object.assign(state.parent, before); state.articles.clear(); throw error; }
    }, endSession: vi.fn() };
    vi.mocked(EPaper.db.startSession).mockResolvedValue(session as never);
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      await repo.createArticle({ epaperId: id }); throw new Error('transaction callback failure');
    })).rejects.toThrow('transaction callback failure');
    expect(state.parent).toEqual(before); expect(state.articles.size).toBe(0);
    expect(EPaperArticle.create).toHaveBeenCalledWith([{ epaperId: id }], { session });
    expect(EPaperArticle.deleteOne).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    new Error('network unavailable'),
    Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 50, codeName: 'IllegalOperation' }),
    Object.assign(new Error('different code-20 failure'), { code: 20, codeName: 'IllegalOperation' }),
  ])('never enters fallback for an arbitrary transaction error: %s', async (error) => {
    arrange();
    vi.mocked(EPaper.db.startSession).mockResolvedValue({ withTransaction: async () => { throw error; }, endSession: vi.fn() } as never);
    const mutate = vi.fn();
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, mutate)).rejects.toBe(error);
    expect(mutate).not.toHaveBeenCalled(); expect(EPaper.updateOne).not.toHaveBeenCalled();
  });

  it.each(['PATCH', 'DELETE'])('returns HTTP 409 after compensating an after-lock %s conflict', async (method) => {
    const state = arrange();
    const original = { _id: childId, epaperId: id, pageNumber: 1, title: 'Before', slug: 'before' };
    state.articles.set(childId, structuredClone(original));
    const target = method === 'PATCH' ? EPaperArticle.findOneAndUpdate : EPaperArticle.deleteOne;
    const implementation = vi.mocked(target).getMockImplementation()!;
    vi.mocked(target).mockImplementation(((...args: unknown[]) => {
      const output = (implementation as (...parameters: unknown[]) => unknown)(...args);
      if (method === 'PATCH') return { lean: async () => {
        const value = await (output as { lean: () => Promise<unknown> }).lean(); state.compete(); return value;
      } };
      return Promise.resolve(output).then((value) => { state.compete(); return value; });
    }) as never);
    const request = new NextRequest(`http://localhost/api/admin/articles/${childId}?kind=epaper`, { method, ...(method === 'PATCH' ? { body: JSON.stringify({ excerpt: 'After' }) } : {}) });
    const response = await (method === 'PATCH' ? PATCH : DELETE)(request, { params: Promise.resolve({ id: childId }) });
    expect(response.status).toBe(409);
    expect(state.articles.get(childId)).toEqual(original);
    expect(state.parent.pages).toEqual([{ pageNumber: 1, imagePath: '/concurrent.jpg' }]);
  });
});
