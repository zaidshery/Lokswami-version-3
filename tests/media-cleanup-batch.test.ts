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
});
