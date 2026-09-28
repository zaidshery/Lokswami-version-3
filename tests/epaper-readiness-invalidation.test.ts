// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import { invalidateEpaperQa } from '@/lib/server/epaperWorkflowPolicy';

vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(), recordEpaperActivity: vi.fn(),
}));
vi.mock('@/lib/server/epaperObservability', () => ({ logEpaperMetric: vi.fn() }));

const input = {
  epaperId: '507f1f77bcf86cd799439011',
  actor: { id: 'admin', name: 'Admin', email: '', role: 'super_admin' as const },
  reason: 'Story content changed.', pageNumbers: [1],
};
afterEach(() => vi.restoreAllMocks());

describe('canonical readiness invalidation CAS', () => {
  function load(paper: Record<string, unknown>) {
    vi.spyOn(EPaper, 'findById').mockReturnValue({
      select: () => ({ lean: async () => paper }),
    } as never);
  }

  it('returns a ready draft to mapping and increments its version', async () => {
    load({ _id: input.epaperId, status: 'draft', productionStatus: 'ready_to_publish', version: 4 });
    const update = vi.spyOn(EPaper, 'findOneAndUpdate').mockResolvedValue({ version: 5 } as never);
    await expect(invalidateEpaperQa(input)).resolves.toMatchObject({ changed: true, toStatus: 'hotspot_mapping' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', productionStatus: 'ready_to_publish', version: 4 }),
      { $set: { productionStatus: 'hotspot_mapping', qaCompletedAt: null }, $inc: { version: 1 } },
      expect.any(Object),
    );
  });

  it('rejects a concurrent stage/version change instead of overwriting it', async () => {
    load({ _id: input.epaperId, status: 'draft', productionStatus: 'ready_to_publish', version: 4 });
    vi.spyOn(EPaper, 'findOneAndUpdate').mockResolvedValue(null);
    await expect(invalidateEpaperQa(input)).rejects.toThrow('changed during readiness invalidation');
  });

  it('never writes a published or protected edition', async () => {
    const update = vi.spyOn(EPaper, 'findOneAndUpdate');
    load({ _id: input.epaperId, status: 'published', productionStatus: 'published' });
    await expect(invalidateEpaperQa(input)).rejects.toThrow('immutable');
    load({ _id: '6ab0da70c6aab6a2a6cab44e', status: 'draft', productionStatus: 'ready_to_publish' });
    await expect(invalidateEpaperQa({ ...input, epaperId: '6ab0da70c6aab6a2a6cab44e' })).rejects.toThrow('preserved QA');
    expect(update).not.toHaveBeenCalled();
  });
});
