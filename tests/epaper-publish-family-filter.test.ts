// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';

afterEach(() => vi.restoreAllMocks());

describe('publication family query casting', () => {
  const id = '665000000000000000000001';
  const uuid = '91db0408-cf7a-442f-9696-5c2ea9f9963c';
  const legacyId = '665000000000000000000002';

  it.each([
    ['transaction', uuid], ['standalone', uuid],
    ['transaction', legacyId], ['standalone', legacyId],
    ['transaction', 'family-legacy'], ['standalone', 'family-legacy'],
  ])('publishes with a castable family filter on %s Mongo for %s', async (mode, familyId) => {
    const session = {
      withTransaction: vi.fn(async (work: () => Promise<void>) => {
        if (mode === 'standalone') {
          throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), {
            code: 20, codeName: 'IllegalOperation',
          });
        }
        await work();
      }),
      endSession: vi.fn(async () => {}),
    };
    vi.spyOn(EPaper, 'startSession').mockResolvedValue(session as never);
    vi.spyOn(EPaper, 'findOneAndUpdate').mockReturnValue({
      lean: async () => ({ _id: id, familyId, status: 'published', version: 8 }),
    } as never);
    const demote = vi.spyOn(EPaper, 'updateMany').mockImplementation((filter) => {
      // Use the real model caster: mocks alone previously missed the UUID CastError.
      EPaper.find(filter).cast(EPaper);
      return Promise.resolve({ matchedCount: 1, modifiedCount: 1 }) as never;
    });

    await expect(new EpaperRepository().publishEdition(id, familyId, {}, 7)).resolves.toMatchObject({ status: 'published' });
    const filter = demote.mock.calls[0][0];
    expect(filter).toEqual({
      $or: familyId === legacyId ? [{ familyId }, { _id: familyId }] : [{ familyId }],
      _id: { $ne: id }, isCurrentRevision: { $ne: false }, status: 'published',
    });
    expect(demote.mock.calls[0][2]).toEqual(mode === 'transaction' ? { session } : undefined);
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});
