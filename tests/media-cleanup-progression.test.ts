import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaRepository } from '@/lib/server/media/mediaRepository';
import { MediaService } from '@/lib/server/media/mediaService';
import type { MediaRecord, MediaCleanupCursor } from '@/lib/server/media/mediaTypes';
import type { SpacesAdapter } from '@/lib/server/media/spacesAdapter';

vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn(async () => undefined) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('bounded cleanup continuation', () => {
  it.each(['retained', 'blocked', 'lookup-failure'])('eventually considers a cancellation behind a full %s batch', async (kind) => {
    vi.stubEnv('MONGODB_URI', '');
    const records: MediaRecord[] = ['a', 'b', 'c'].map((id, index) => ({
      _id: id, filename: id + '.mp4', url: 'https://cdn/' + id,
      status: index < 2 ? 'cleanup_pending' : 'cancelled', ownerType: 'story', mediaKind: 'video',
      provider: 'do-spaces', objectKey: 'stories/videos/' + id + '.mp4',
      updatedAt: new Date('2026-10-01T00:00:0' + index + 'Z'),
      cancelledAt: new Date('2026-10-01'), uploadExpiresAt: new Date('2026-10-01'),
      referenceTrackingComplete: index === 2, references: [],
    }));
    if (kind === 'retained') for (const record of records.slice(0, 2)) {
      record.references = [{ ownerType: 'story', ownerId: 'protected', attachedAt: new Date('2026-10-01') }];
    }
    vi.spyOn(fs, 'readFile').mockImplementation(async () => JSON.stringify(records));
    const repository = new MediaRepository();
    vi.spyOn(repository, 'hasPersistedReference').mockImplementation(async record => {
      if (kind === 'lookup-failure' && record._id !== 'c') throw new Error('lookup unavailable');
      return false;
    });
    vi.spyOn(repository, 'updateMediaById').mockImplementation(async (id, updates) => {
      const record = records.find(item => item._id === id)!;
      Object.assign(record, updates, { updatedAt: new Date() }); return record;
    });
    const spaces = { deleteAssetByPublicId: vi.fn(async () => undefined) } as unknown as SpacesAdapter;
    const service = new MediaService(repository, spaces);
    let cursor: MediaCleanupCursor | null = null;
    const results = [];
    for (let pass = 0; pass < 3; pass += 1) {
      const result = await service.reconcileCleanupDetailed(new Date(), { limit: 2, cursor });
      results.push(result); cursor = result.progress!.nextCursor;
    }
    expect(spaces.deleteAssetByPublicId).toHaveBeenCalledWith('stories/videos/c.mp4');
    expect(spaces.deleteAssetByPublicId).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject(kind === 'retained' ? { retained: 2 } : kind === 'blocked' ? { blocked: 2 } : { lookupFailed: 2 });
    expect(results[1]).toMatchObject({ deleted: 1, progress: { considered: 1, nextCursor: null } });
    expect(records[2].status).toBe('cancelled');
    expect(records.slice(0, 2).every(record => !record.deletedAt && !record.cleanupError)).toBe(true);
  });

  it.each(['provider', 'persistence'])('advances past %s failures and retries them on a later sweep', async failure => {
    vi.stubEnv('MONGODB_URI', '');
    const records: MediaRecord[] = ['a', 'b', 'c'].map((id, index) => ({
      _id: id, filename: id + '.png', url: 'https://cdn/' + id,
      status: 'cleanup_pending', ownerType: 'library', mediaKind: 'image', provider: 'do-spaces',
      objectKey: 'lokswami/images/' + id + '.png', referenceTrackingComplete: true,
      updatedAt: new Date('2026-10-01T00:00:0' + index + 'Z'), references: [],
    }));
    vi.spyOn(fs, 'readFile').mockImplementation(async () => JSON.stringify(records));
    const repository = new MediaRepository();
    let failing = true;
    vi.spyOn(repository, 'updateMediaById').mockImplementation(async (id, updates) => {
      if (failure === 'persistence' && failing && id !== 'c') throw new Error('write unavailable');
      const record = records.find(item => item._id === id)!;
      Object.assign(record, updates, { updatedAt: new Date() }); return record;
    });
    const spaces = { deleteAssetByPublicId: vi.fn(async (key: string) => {
      if (failure === 'provider' && failing && !key.endsWith('/c.png')) throw new Error('provider unavailable');
    }) } as unknown as SpacesAdapter;
    const service = new MediaService(repository, spaces), cutoff = new Date();
    const first = await service.reconcileCleanupDetailed(cutoff, { limit: 2 });
    expect(first).toMatchObject(failure === 'provider' ? { providerFailed: 2 } : { persistenceFailed: 2 });
    expect(first.progress!.nextCursor).toMatchObject({ id: 'b', updatedAt: '2026-10-01T00:00:01.000Z' });
    const next = await service.reconcileCleanupDetailed(new Date(), { limit: 2, cursor: first.progress!.nextCursor });
    expect(next).toMatchObject({ deleted: 1, progress: { considered: 1, nextCursor: null } });
    expect(records[2].status).toBe('deleted');
    failing = false;
    expect(await service.reconcileCleanupDetailed(new Date(), { limit: 2 })).toMatchObject({ deleted: 2 });
    expect(records.every(record => record.status === 'deleted')).toBe(true);
  });

  it('wraps an exhausted full-page cursor in a new service instance without exceeding the bound', async () => {
    vi.stubEnv('MONGODB_URI', '');
    const protectedRecord: MediaRecord = { _id: 'a', filename: 'a', url: 'https://cdn/a',
      updatedAt: '2026-10-01T00:00:00.000Z', status: 'cleanup_pending', objectKey: 'lokswami/images/a.png',
      references: [{ ownerType: 'story', ownerId: 'protected', attachedAt: new Date('2026-10-01') }] };
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify([protectedRecord]));
    const repository = new MediaRepository(), selection = vi.spyOn(repository, 'listCleanupCandidates');
    const spaces = { deleteAssetByPublicId: vi.fn() } as unknown as SpacesAdapter;
    const first = await new MediaService(repository, spaces).reconcileCleanupDetailed(new Date(), { limit: 1 });
    const serializedCursor = JSON.parse(JSON.stringify(first.progress!.nextCursor));
    const restarted = await new MediaService(repository, spaces).reconcileCleanupDetailed(new Date(), { limit: 1, cursor: serializedCursor });
    expect(restarted).toMatchObject({ retained: 1, progress: { considered: 1, wrapped: true } });
    expect(selection).toHaveBeenCalledTimes(3);
    expect(spaces.deleteAssetByPublicId).not.toHaveBeenCalled();
  });
});
