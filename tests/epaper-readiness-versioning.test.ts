// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';

vi.mock('server-only', () => ({}));

const epaperId = '507f1f77bcf86cd799439011';
const actor = { id: 'admin', name: 'Admin', email: '', role: 'super_admin' };

afterEach(() => vi.restoreAllMocks());

describe('e-paper readiness version concurrency', () => {
  it('increments the edition CAS version atomically with markPageReady', async () => {
    const update = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    const reviewedAt = new Date('2026-09-28T06:00:00.000Z');

    await new EpaperRepository().markPageReady(epaperId, 2, actor, reviewedAt);

    expect(update).toHaveBeenCalledWith(
      { _id: epaperId, 'pages.pageNumber': 2 },
      {
        $set: {
          'pages.$.reviewStatus': 'ready',
          'pages.$.reviewedAt': reviewedAt,
          'pages.$.reviewedBy': actor,
        },
        $inc: { version: 1 },
      },
    );
  });

  it('prevents a reconciler snapshot from advancing after markPageReady changes the version', async () => {
    let currentVersion = 4;
    const update = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    const transition = vi.spyOn(EPaper, 'findOneAndUpdate').mockImplementation(((filter: Record<string, unknown>) => ({
      lean: async () => filter.version === currentVersion ? { version: currentVersion + 1 } : null,
    })) as never);
    vi.spyOn(EPaper, 'findById').mockReturnValue({
      select: () => ({ lean: async () => ({ _id: epaperId, version: currentVersion, status: 'draft', productionStatus: 'hotspot_mapping' }) }),
    } as never);

    const repo = new EpaperRepository();
    await repo.markPageReady(epaperId, 1, actor, new Date());
    expect(update).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ $inc: { version: 1 } }));
    currentVersion += 1;
    await expect(repo.advanceEditionAutomation({
      id: epaperId,
      fromStatus: 'hotspot_mapping',
      expectedVersion: 4,
      expectedGeneration: 'generation-1',
      expectedRevisionNumber: 2,
      updates: { productionStatus: 'ready_to_publish' },
    })).rejects.toThrow();

    expect(currentVersion).toBe(5);
    expect(update).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(expect.objectContaining({
      _id: epaperId,
      status: 'draft',
      productionStatus: 'hotspot_mapping',
      version: 4,
      processingGeneration: 'generation-1',
      revisionNumber: 2,
    }), expect.any(Object), expect.any(Object));
  });

  it('advances an uncontended snapshot and never auto-publishes', async () => {
    const transition = vi.spyOn(EPaper, 'findOneAndUpdate').mockReturnValue({
      lean: async () => ({ _id: epaperId, version: 6, productionStatus: 'ready_to_publish' }),
    } as never);

    await expect(new EpaperRepository().advanceEditionAutomation({
      id: epaperId,
      fromStatus: 'hotspot_mapping',
      expectedVersion: 5,
      expectedGeneration: 'generation-1',
      expectedRevisionNumber: 2,
      updates: { productionStatus: 'ready_to_publish' },
    })).resolves.toMatchObject({ version: 6, productionStatus: 'ready_to_publish' });
    expect(transition).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      $set: { productionStatus: 'ready_to_publish' },
      $inc: { version: 1 },
    }), expect.any(Object));

    await expect(new EpaperRepository().advanceEditionAutomation({
      id: epaperId,
      fromStatus: 'ready_to_publish',
      expectedVersion: 6,
      expectedGeneration: 'generation-1',
      expectedRevisionNumber: 2,
      updates: { status: 'published', productionStatus: 'published' },
    })).rejects.toThrow('never publish');
  });
});
