import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), update: vi.fn(), connect: vi.fn() }));
vi.mock('fs/promises', () => ({ default: { readFile: mocks.read, writeFile: mocks.write, mkdir: vi.fn() } }));
vi.mock('@/lib/db/mongoose', () => ({ default: mocks.connect }));
vi.mock('@/lib/models/Media', () => ({ default: { findOneAndUpdate: mocks.update } }));
import { MediaRepository } from '@/lib/server/media/mediaRepository';
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllEnvs());
describe('pending receipt compare-and-set', () => {
  it('has exactly one completion/cancellation winner across file repository instances', async () => {
    vi.stubEnv('MONGODB_URI', '');
    let data = JSON.stringify([{ _id: 'receipt', status: 'pending' }]);
    mocks.read.mockImplementation(async () => data);
    mocks.write.mockImplementation(async (_path, value) => { data = value; });
    const results = await Promise.all([
      new MediaRepository().transitionStatus('receipt', 'pending', { status: 'cancelled' }),
      new MediaRepository().transitionStatus('receipt', 'pending', { status: 'verified' }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(data)[0].status).toBe('cancelled');
  });
  it('uses an atomic Mongo pending predicate', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1/qa');
    mocks.update.mockReturnValue({ lean: vi.fn(async () => null) });
    expect(await new MediaRepository().transitionStatus('receipt', 'pending', { status: 'cancelled' })).toBeNull();
    expect(mocks.update).toHaveBeenCalledWith({ _id: 'receipt', status: 'pending' }, expect.any(Object), { new: true });
  });
  it('does not lose cancellation when a different receipt is initialized concurrently', async () => {
    vi.stubEnv('MONGODB_URI', '');
    let data = JSON.stringify([{ _id: 'receipt', status: 'pending' }]);
    mocks.read.mockImplementation(async () => data);
    mocks.write.mockImplementation(async (_path, value) => { data = value; });
    await Promise.all([
      new MediaRepository().transitionStatus('receipt', 'pending', { status: 'cancelled' }),
      new MediaRepository().createMedia({ filename: 'next.mp4', url: 'https://qa/next.mp4', status: 'pending' }),
    ]);
    expect(JSON.parse(data)).toHaveLength(2);
    expect(JSON.parse(data)[0].status).toBe('cancelled');
  });
  it('fails closed on malformed or unreadable file registry', async () => {
    vi.stubEnv('MONGODB_URI', '');
    mocks.read.mockResolvedValue('{}');
    await expect(new MediaRepository().transitionStatus('receipt', 'pending', { status: 'cancelled' })).rejects.toThrow();
    mocks.read.mockRejectedValue(new Error('unreadable'));
    await expect(new MediaRepository().transitionStatus('receipt', 'pending', { status: 'cancelled' })).rejects.toThrow('unreadable');
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
