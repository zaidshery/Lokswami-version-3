// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { NextRequest } from 'next/server';
import { updateEpaperArticleById, deleteEpaperArticleById } from '@/lib/server/epaper/adminArticleCompat';
import { EpaperArticleService } from '@/lib/server/epaper/epaperArticleService';
import { EpaperOcrService } from '@/lib/server/epaper/epaperOcrService';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { PATCH, DELETE } from '@/app/api/admin/articles/[id]/route';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/api/adminRoute', () => ({ withAdminMutation: (handler: unknown) => handler }));
vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: async () => actor,
}));
vi.mock('@/lib/server/epaperWorkflowAutomation', () => ({ applyEpaperWorkflowAutomation: vi.fn() }));
vi.mock('@/lib/server/epaperWorkflowPolicy', async (original) => ({
  ...await original<typeof import('@/lib/server/epaperWorkflowPolicy')>(),
  invalidateEpaperQa: vi.fn(),
}));
vi.mock('@/lib/server/epaperActivity', () => ({ recordEpaperActivity: vi.fn(), buildEpaperActivityMessage: vi.fn() }));

const id = '507f1f77bcf86cd799439011';
const articleId = '507f1f77bcf86cd799439012';
const actor = { id: 'qa-admin', username: 'qa', role: 'super_admin' as const, name: 'QA', email: 'qa@example.com' };
const standaloneError = Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), {
  code: 20, codeName: 'IllegalOperation',
});

afterEach(() => vi.restoreAllMocks());

function arrange(mode: 'transaction' | 'standalone', concurrentUpload = true) {
  const snapshot = {
    _id: id, version: 4, status: 'draft', productionStatus: 'hotspot_mapping',
    revisionInitializationStatus: 'ready', pageCount: 1,
    pages: [{ pageNumber: 1, imagePath: '/old-page.jpg', reviewStatus: 'pending' }],
  };
  // A page upload commits after the service loads its snapshot, before the
  // readiness wrapper starts. Its newer image must survive the stale request.
  const current = concurrentUpload
    ? { ...snapshot, version: 5, pages: [{ pageNumber: 1, imagePath: '/new-page.jpg', reviewStatus: 'needs_attention' }] }
    : structuredClone(snapshot);
  let reads = 0;
  const select = vi.fn((projection: string) => ({ lean: async () => {
    reads += 1;
    return Object.fromEntries(projection.split(' ').map((key) => [key, snapshot[key as keyof typeof snapshot]]));
  } }));
  vi.spyOn(EPaper, 'findById').mockImplementation(() => ({
    select,
    session: () => ({ lean: async () => {
      if (mode === 'standalone') throw standaloneError;
      return current;
    } }),
    lean: async () => ++reads === 1 ? snapshot : current,
  }) as never);
  vi.spyOn(EPaper.db, 'startSession').mockResolvedValue({
    withTransaction: async (work: () => Promise<void>) => work(), endSession: vi.fn(),
  } as never);
  const editionWrite = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
  const article = { _id: articleId, epaperId: id, pageNumber: 1, title: 'Story' };
  vi.spyOn(EPaperArticle, 'findById').mockReturnValue({ lean: async () => article } as never);
  vi.spyOn(EPaperArticle, 'findOne').mockReturnValue({ select: () => ({ lean: async () => null }), lean: async () => null } as never);
  vi.spyOn(EPaperArticle, 'exists').mockResolvedValue(null);
  const storyUpdate = vi.spyOn(EPaperArticle, 'findByIdAndUpdate').mockReturnValue({ lean: async () => article } as never);
  const storyDelete = vi.spyOn(EPaperArticle, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as never);
  const storyCreate = vi.spyOn(EPaperArticle, 'create').mockImplementation((async (data: unknown) => {
    const created = { toObject: () => article };
    return Array.isArray(data) ? [created] : created;
  }) as never);
  vi.spyOn(EPaperOcrSuggestion, 'findOne').mockReturnValue({ lean: async () => ({ _id: articleId, epaperId: id, pageNumber: 1, title: 'OCR story' }) } as never);
  const suggestionWrite = vi.spyOn(EPaperOcrSuggestion, 'findByIdAndUpdate').mockReturnValue({ lean: async () => ({ status: 'accepted' }) } as never);
  return { current, editionWrite, storyUpdate, storyDelete, storyCreate, suggestionWrite, select };
}

function request(operation: 'update' | 'delete' | 'ocr' | 'create') {
  return operation === 'update'
    ? updateEpaperArticleById(articleId, { excerpt: 'Edited' }, false, actor)
    : operation === 'delete'
      ? deleteEpaperArticleById(articleId, actor)
      : operation === 'ocr'
        ? new EpaperOcrService().review(actor, id, articleId, { action: 'accept' })
        : new EpaperArticleService().create(actor, id, { pageNumber: 1, title: 'New story', hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 } });
}

describe.each(['transaction', 'standalone'] as const)('Content snapshot CAS on %s Mongo', (mode) => {
  it.each(['update', 'delete', 'ocr', 'create'] as const)('rejects stale %s before any content write and preserves the concurrent upload', async (operation) => {
    const state = arrange(mode);
    await expect(request(operation)).rejects.toThrow('EPAPER_VERSION_CONFLICT');
    expect(state.editionWrite).not.toHaveBeenCalled();
    expect(state.storyUpdate).not.toHaveBeenCalled();
    expect(state.storyDelete).not.toHaveBeenCalled();
    expect(state.storyCreate).not.toHaveBeenCalled();
    expect(state.suggestionWrite).not.toHaveBeenCalled();
    expect(state.current.pages).toEqual([{ pageNumber: 1, imagePath: '/new-page.jpg', reviewStatus: 'needs_attention' }]);
    if (operation !== 'ocr') expect(state.select).toHaveBeenCalledWith(expect.stringContaining('version'));
  });

  it.each(['update', 'delete', 'ocr', 'create'] as const)('allows %s when the caller snapshot still matches', async (operation) => {
    const state = arrange(mode, false);
    await expect(request(operation)).resolves.toBeDefined();
    const calls = state.editionWrite.mock.calls as unknown as unknown[][];
    expect(calls[0][0]).toMatchObject({ _id: id, version: 4 });
    expect(calls[0][1]).toMatchObject({ $inc: { version: 1 }, $set: { qaCompletedAt: null } });
    if (operation !== 'create') {
      expect(calls[1][0]).toMatchObject({ _id: id, version: 5 });
    }
  });

  it('materializes legacy missing version as 2 so a second version-1 snapshot loses CAS', async () => {
    arrange(mode, false);
    let version: number | undefined;
    vi.mocked(EPaper.findById).mockImplementation(() => ({
      session: () => ({ lean: async () => {
        if (mode === 'standalone') throw standaloneError;
        return { status: 'draft', productionStatus: 'hotspot_mapping', version };
      } }),
      lean: async () => ({ status: 'draft', productionStatus: 'hotspot_mapping', version }),
    }) as never);
    vi.mocked(EPaper.updateOne).mockImplementation((async (_filter: unknown, updates: { $set: { version: number } }) => {
      version = updates.$set.version;
      return { matchedCount: 1 };
    }) as never);
    const mutate = vi.fn(async () => 'saved');
    const repo = new EpaperRepository();
    await expect(repo.withEditionReadinessMutation(id, 1, mutate)).resolves.toBe('saved');
    expect(version).toBe(2);
    await expect(repo.withEditionReadinessMutation(id, 1, mutate)).rejects.toThrow('EPAPER_VERSION_CONFLICT');
    expect(mutate).toHaveBeenCalledOnce();
  });
});

describe('Content snapshot API conflicts', () => {
  it.each(['PATCH', 'DELETE'])('returns HTTP 409 for stale %s requests', async (method) => {
    arrange('transaction');
    const req = new NextRequest(`http://localhost/api/admin/articles/${articleId}?kind=epaper`, {
      method, ...(method === 'PATCH' ? { body: JSON.stringify({ excerpt: 'Edited' }) } : {}),
    });
    const handler = method === 'PATCH' ? PATCH : DELETE;
    const response = await handler(req, { params: Promise.resolve({ id: articleId }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, error: expect.stringContaining('EPAPER_VERSION_CONFLICT') });
  });
});

describe('Standalone writes after the readiness lock', () => {
  it('does not replace pages if another writer advances the version after the lock', async () => {
    const state = arrange('standalone', false);
    vi.mocked(EPaper.updateOne).mockImplementation((async (filter: { version: number }, change: { $inc?: { version: number }; $set?: { pages?: unknown } }) => {
      if (filter.version !== state.current.version) return { matchedCount: 0 };
      if (change.$inc?.version) {
        state.current.version += change.$inc.version;
        return { matchedCount: 1 };
      }
      state.current.pages = change.$set?.pages as typeof state.current.pages;
      return { matchedCount: 1 };
    }) as never);
    await expect(new EpaperRepository().withEditionReadinessMutation(id, 4, async (repo) => {
      // Another upload commits while this standalone mutation is running.
      state.current.version += 1;
      state.current.pages[0].imagePath = '/latest-page.jpg';
      await repo.updateEditionWhere({ _id: id }, { $set: { pages: [{ pageNumber: 1, imagePath: '/old-page.jpg' }] } });
    })).rejects.toThrow('Edition changed during content mutation');
    expect(state.current.pages[0].imagePath).toBe('/latest-page.jpg');
  });
});
