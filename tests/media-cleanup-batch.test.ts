import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaRepository } from '@/lib/server/media/mediaRepository';
import Media from '@/lib/models/Media';

vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn(async () => undefined) }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('bounded cleanup selection', () => {
  it('selects oldest eligible file receipts before applying the batch limit', async () => {
    vi.stubEnv('MONGODB_URI', '');
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify([
      { _id: 'new', status: 'cleanup_pending', updatedAt: '2026-10-12' },
      { _id: 'protected', status: 'attached', updatedAt: '2026-01-01' },
      { _id: 'old', status: 'cancelled', updatedAt: '2026-10-01' },
      { _id: 'future', status: 'cancelled', updatedAt: '2026-10-14' },
    ]));
    const repository = new MediaRepository();
    expect(await repository.listCleanupCandidates(new Date('2026-10-13'), 1))
      .toEqual([expect.objectContaining({ _id: 'old' })]);
    expect(await repository.listCleanupCandidates(new Date('2026-10-13')))
      .toEqual([expect.objectContaining({ _id: 'new' }), expect.objectContaining({ _id: 'old' })]);
  });

  it('limits the Mongo query before materializing candidates', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://test-only');
    const query = { sort: vi.fn(), limit: vi.fn(), lean: vi.fn(async () => []) };
    query.sort.mockReturnValue(query); query.limit.mockReturnValue(query);
    const find = vi.spyOn(Media, 'find').mockReturnValue(query as unknown as ReturnType<typeof Media.find>);
    const cutoff = new Date('2026-10-13');
    await new MediaRepository().listCleanupCandidates(cutoff, 2);
    expect(find).toHaveBeenCalledWith({ status: { $in: ['cleanup_pending', 'cancelled'] }, updatedAt: { $lte: cutoff } });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: 1, _id: 1 });
    expect(query.limit).toHaveBeenCalledWith(2);
    expect(query.lean).toHaveBeenCalledOnce();
  });

  it('uses a deterministic file identity tie-breaker and resumes after that exact tuple', async () => {
    vi.stubEnv('MONGODB_URI', '');
    const updatedAt = '2026-10-01T00:00:00.000Z';
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(['c', 'a', 'b'].map(_id => ({
      _id, status: 'cleanup_pending', createdAt: updatedAt,
    }))));
    const repository = new MediaRepository(), before = new Date('2026-10-13');
    expect((await repository.listCleanupCandidates(before, 2)).map(record => record._id)).toEqual(['a', 'b']);
    expect((await repository.listCleanupCandidates(new Date('2026-10-14'), 2, {
      cutoff: before.toISOString(), updatedAt, id: 'b',
    })).map(record => record._id)).toEqual(['c']);
  });

  it('uses the same fixed cutoff and compound continuation ordering in Mongo', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://test-only');
    const query = { sort: vi.fn(), limit: vi.fn(), lean: vi.fn(async () => []) };
    query.sort.mockReturnValue(query); query.limit.mockReturnValue(query);
    const find = vi.spyOn(Media, 'find').mockReturnValue(query as unknown as ReturnType<typeof Media.find>);
    const cursor = { cutoff: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', id: '000000000000000000000002' };
    await new MediaRepository().listCleanupCandidates(new Date('2026-10-14'), 2, cursor);
    expect(find).toHaveBeenCalledWith({ status: { $in: ['cleanup_pending', 'cancelled'] },
      updatedAt: { $lte: new Date(cursor.cutoff) }, $or: [
        { updatedAt: { $gt: new Date(cursor.updatedAt) } },
        { updatedAt: new Date(cursor.updatedAt), _id: { $gt: cursor.id } },
      ] });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: 1, _id: 1 });
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  it.each([
    { cutoff: 'bad', updatedAt: '2026-10-01T00:00:00.000Z', id: 'a' },
    { cutoff: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', id: 'a' },
    { cutoff: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', id: '' },
  ])('rejects malformed continuation before any file read %j', async cursor => {
    vi.stubEnv('MONGODB_URI', '');
    const read = vi.spyOn(fs, 'readFile');
    await expect(new MediaRepository().listCleanupCandidates(new Date(), 2, cursor)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
