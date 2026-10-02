import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaRecord } from '@/lib/server/media/mediaTypes';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), read: vi.fn(),
  article: vi.fn(), story: vi.fn(), video: vi.fn(), paper: vi.fn(), author: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/db/mongoose', () => ({ default: mocks.connect }));
vi.mock('fs/promises', () => ({ default: { readFile: mocks.read } }));
vi.mock('@/lib/models/Article', () => ({ default: { exists: mocks.article } }));
vi.mock('@/lib/models/Story', () => ({ default: { exists: mocks.story } }));
vi.mock('@/lib/models/Video', () => ({ default: { exists: mocks.video } }));
vi.mock('@/lib/models/EPaper', () => ({ default: { exists: mocks.paper } }));
vi.mock('@/lib/models/Author', () => ({ default: { exists: mocks.author } }));
vi.mock('@/lib/models/User', () => ({ default: { exists: mocks.user } }));
import { MediaRepository } from '@/lib/server/media/mediaRepository';

const record: MediaRecord = { _id: 'receipt-1', filename: 'photo.webp', type: 'image/webp', size: 100,
  url: 'https://cdn.example/lokswami/images/photo.webp', objectKey: 'lokswami/images/photo.webp',
  variants: { square1x1: 'https://cdn.example/lokswami/images/photo-square.webp' } };

describe('persisted media reference validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/isolated-test');
    for (const model of [mocks.article, mocks.story, mocks.video, mocks.paper, mocks.author, mocks.user]) {
      model.mockResolvedValue(null);
    }
  });
  afterEach(() => vi.unstubAllEnvs());

  it('includes private articles and restorable revisions without a publication filter', async () => {
    mocks.article.mockResolvedValue({ _id: 'private-revision-owner' });
    expect(await new MediaRepository().hasPersistedArticleImageReference(record)).toBe(true);
    const query = mocks.article.mock.calls[0][0];
    expect(query.$or).toContainEqual({ 'revisions.media.sourceMediaId': { $regex: expect.any(String) } });
    expect(query).not.toHaveProperty('workflow.status');
    const expression = new RegExp(query.$or[0].image.$regex);
    expect(expression.test('https://origin.example/lokswami/images/photo-square.webp')).toBe(true);
  });

  it.each(['story', 'video', 'paper', 'author', 'user'] as const)('protects an image used by a persisted %s', async (kind) => {
    mocks[kind].mockResolvedValue({ _id: 'owner' });
    expect(await new MediaRepository().hasPersistedArticleImageReference(record)).toBe(true);
  });

  it('returns unused only when every Mongo reference check succeeds', async () => {
    expect(await new MediaRepository().hasPersistedArticleImageReference(record)).toBe(false);
    expect(mocks.user).toHaveBeenCalledOnce();
    mocks.paper.mockRejectedValue(new Error('Database unavailable'));
    await expect(new MediaRepository().hasPersistedArticleImageReference(record)).rejects.toThrow('Database unavailable');
  });

  it('protects file-store draft and revision URLs across alternate delivery origins', async () => {
    vi.stubEnv('MONGODB_URI', '');
    mocks.read.mockResolvedValue(JSON.stringify([{ workflow: { status: 'draft' },
      revisions: [{ image: 'https://origin.example/lokswami/images/photo-square.webp' }] }]));
    expect(await new MediaRepository().hasPersistedArticleImageReference(record)).toBe(true);
  });

  it('fails closed on unreadable or malformed file-store content', async () => {
    vi.stubEnv('MONGODB_URI', '');
    mocks.read.mockResolvedValue('{broken');
    await expect(new MediaRepository().hasPersistedArticleImageReference(record)).rejects.toThrow();
    mocks.read.mockRejectedValue(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));
    await expect(new MediaRepository().hasPersistedArticleImageReference(record)).rejects.toThrow('Permission denied');
  });
});
