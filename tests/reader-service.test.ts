import { describe, expect, it, vi } from 'vitest';
import { ReaderService } from '@/lib/server/reader/readerService';
import type { ReaderRepository } from '@/lib/server/reader/readerRepository';

const identity = { userId: '', email: 'reader@example.com' };
const repository = (overrides: Record<string, unknown>) => ({
  isValidObjectId: vi.fn((value: string) => /^[a-f\d]{24}$/i.test(value)),
  ...overrides,
}) as unknown as ReaderRepository;

describe('ReaderService compatibility contracts', () => {
  it('preserves saved article response ordering supplied by the repository', async () => {
    const getSavedArticles = vi.fn().mockResolvedValue({
      ids: ['b'.repeat(24), 'a'.repeat(24)],
      articles: [{ id: 'b'.repeat(24) }, { id: 'a'.repeat(24) }],
    });
    const result = await new ReaderService(repository({ getSavedArticles })).listSavedArticles(identity);
    expect(result.savedArticleIds).toEqual(['b'.repeat(24), 'a'.repeat(24)]);
    expect(result.count).toBe(2);
  });

  it('preserves save toggle add/remove state and count', async () => {
    const id = 'a'.repeat(24);
    const toggleSavedArticle = vi.fn().mockResolvedValue({ kind: 'ok', saved: true, ids: [id] });
    const result = await new ReaderService(repository({ toggleSavedArticle }))
      .toggleSavedArticle(identity, id);
    expect(result).toEqual({ articleId: id, saved: true, savedArticleIds: [id], count: 1 });
  });

  it('rejects invalid bookmark and tracking article IDs before persistence', async () => {
    const service = new ReaderService(repository({}));
    await expect(service.toggleSavedArticle(identity, 'bad')).rejects.toMatchObject({
      status: 400, message: 'Valid articleId is required',
    });
    await expect(service.trackRead(identity, 'bad', 50)).rejects.toMatchObject({
      status: 400, message: 'Valid articleId is required',
    });
  });

  it.each([[150, 100], [-12, 0], [49.6, 50], ['not-a-number', 0]])(
    'clamps tracking completion %s to %s',
    async (input, expected) => {
      const id = 'a'.repeat(24);
      const trackRead = vi.fn().mockResolvedValue({
        user: { _id: 'reader-1', readCount: 2 },
        now: new Date('2026-09-10T00:00:00.000Z'),
      });
      await new ReaderService(repository({ trackRead })).trackRead(identity, id, input);
      expect(trackRead).toHaveBeenCalledWith(identity, id, expected);
    }
  );

  it('preserves reading statistics and rounded average completion', async () => {
    const getReadingStats = vi.fn().mockResolvedValue({
      _id: 'reader-1',
      readCount: 3,
      readHistory: [{ completionPercent: 20 }, { completionPercent: 81 }],
      lastActiveAt: new Date('2026-09-10T00:00:00.000Z'),
    });
    await expect(new ReaderService(repository({ getReadingStats })).getReadingStats(identity))
      .resolves.toEqual({
        userId: 'reader-1', readCount: 3, readHistoryCount: 2,
        averageCompletionPercent: 51, lastActiveAt: '2026-09-10T00:00:00.000Z',
      });
  });

  it('uses only non-secret stored profile fallback when Mongo is unavailable', async () => {
    const service = new ReaderService(repository({
      getMongoProfile: vi.fn().mockRejectedValue(new Error('Mongo unavailable')),
      getStoredProfile: vi.fn().mockResolvedValue({
        _id: 'reader-1', name: 'Reader', email: 'reader@example.com', role: 'reader',
        preferredLanguage: 'hi', preferredCategories: [], savedArticles: [],
      }),
    }));
    const profile = await service.getProfile({ email: 'reader@example.com' });
    expect(profile.hasPassword).toBe(false);
    expect(profile.email).toBe('reader@example.com');
  });
});
