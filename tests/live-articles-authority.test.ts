import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMergedLiveArticles } from '@/lib/content/liveArticles';
import { articles as repositoryMocks } from '@/lib/mock/data';

const live = {
  _id: '507f1f77bcf86cd799439011',
  slug: 'authoritative-story',
  title: 'Authoritative Story',
  summary: 'A real API summary',
  image: '/story.jpg',
  category: 'Politics',
  author: 'Desk',
  publishedAt: '2026-10-01T10:00:00.000Z',
};
const fetchMock = vi.fn();

function respond(payload: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
}

describe('R01 live article authority', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(['items', 'data'])('returns only normalized API articles from %s, without mock backfill', async (key) => {
    respond({ [key]: [live] });
    const result = await fetchMergedLiveArticles(30);
    expect(fetchMock).toHaveBeenCalledWith('/api/articles/latest?limit=30');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: live._id, slug: live.slug, title: live.title,
      author: { name: 'Desk' },
    });
    expect(result.some((item) => repositoryMocks.some((mock) => mock.id === item.id))).toBe(false);
  });

  it('preserves lowercase-title and timestamp deduplication, retaining the first live row', async () => {
    respond({ items: [live, { ...live, _id: 'duplicate', title: 'AUTHORITATIVE STORY' },
      { ...live, _id: 'different-date', publishedAt: '2026-10-02T10:00:00.000Z' }] });
    expect((await fetchMergedLiveArticles()).map((item) => item.id))
      .toEqual([live._id, 'different-date']);
  });

  it.each([{ items: [] }, {}, { items: 'unexpected' }, null, { items: [{}] }])(
    'returns empty for empty, unexpected, or entirely unmappable payload %j', async (payload) => {
      respond(payload);
      expect(await fetchMergedLiveArticles()).toEqual([]);
    }
  );

  it('returns only valid rows in a mixed valid/unmappable response', async () => {
    respond({ items: [{}, live, { ...live, title: '' }, { ...live, summary: '' },
      { ...live, image: '' }] });
    expect((await fetchMergedLiveArticles()).map((item) => item.id)).toEqual([live._id]);
  });

  it('returns empty on an HTTP failure without reading JSON', async () => {
    const json = vi.fn();
    fetchMock.mockResolvedValue({ ok: false, json });
    expect(await fetchMergedLiveArticles()).toEqual([]);
    expect(json).not.toHaveBeenCalled();
  });

  it('returns empty on rejected fetch', async () => {
    fetchMock.mockRejectedValue(new Error('synthetic failure'));
    expect(await fetchMergedLiveArticles()).toEqual([]);
  });

  it('returns empty on malformed JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('JSON'); } });
    expect(await fetchMergedLiveArticles()).toEqual([]);
  });

  it('returns empty on normalization exception', async () => {
    respond({ items: [null] });
    expect(await fetchMergedLiveArticles()).toEqual([]);
  });

  it.each(['production', 'development', 'test'])('never activates reader mocks in %s mode', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('LOKSWAMI_DEMO_DATA', 'true');
    vi.stubEnv('NEXT_PUBLIC_USE_REMOTE_DEMO_MEDIA', 'true');
    respond({ items: [] });
    expect(await fetchMergedLiveArticles()).toEqual([]);
    respond({ items: [live] });
    expect((await fetchMergedLiveArticles()).map((item) => item.id)).toEqual([live._id]);
  });
});
