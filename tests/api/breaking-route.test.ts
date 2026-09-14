import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectDBMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  listAllStoredArticles: listAllStoredArticlesMock,
}));

describe('/api/breaking route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
  });

  it('exposes breaking audio only when stored metadata matches the current ticker script', async () => {
    const { buildBreakingTtsExpectation } = await import('@/lib/server/breakingTts');
    const readyExpected = buildBreakingTtsExpectation({
      title: 'Heavy rain alert',
      city: 'Bhopal',
    });
    const staleExpected = buildBreakingTtsExpectation({
      title: 'Old headline',
      city: 'Indore',
    });

    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'article-ready',
        slug: 'heavy-rain-alert',
        title: 'Heavy rain alert',
        category: 'City',
        reporterMeta: { locationTag: 'Bhopal' },
        publishedAt: '2026-05-23T10:00:00.000Z',
        views: 10,
        isBreaking: true,
        breakingTts: {
          audioUrl: 'https://cdn.example.com/ready.mp3',
          textHash: readyExpected.textHash,
          languageCode: 'en-IN',
          voice: 'manual',
          model: 'manual',
          mimeType: 'audio/mpeg',
          generatedAt: '2026-05-23T10:01:00.000Z',
        },
      },
      {
        _id: 'article-stale',
        slug: 'updated-headline',
        title: 'Updated headline',
        category: 'City',
        reporterMeta: { locationTag: 'Indore' },
        publishedAt: '2026-05-23T09:00:00.000Z',
        views: 1,
        isBreaking: true,
        breakingTts: {
          audioUrl: 'https://cdn.example.com/stale.mp3',
          textHash: staleExpected.textHash,
          languageCode: 'en-IN',
          voice: 'manual',
          model: 'manual',
          mimeType: 'audio/mpeg',
          generatedAt: '2026-05-23T09:01:00.000Z',
        },
      },
    ]);

    const { GET } = await import('@/app/api/breaking/route');
    const response = await GET(
      new Request('http://localhost/api/breaking?limit=10') as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'article-ready',
          city: 'Bhopal',
          ttsAudioUrl: 'https://cdn.example.com/ready.mp3',
          ttsReady: true,
        }),
        expect.objectContaining({
          id: 'article-stale',
          city: 'Indore',
        }),
      ])
    );
    const stale = payload.items.find((item: { id: string }) => item.id === 'article-stale');
    expect(stale.ttsAudioUrl).toBeUndefined();
    expect(stale.ttsReady).toBeUndefined();
  });

  it('shows only active breaking articles and excludes ordinary or non-public workflow states', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'older-popular',
        slug: 'older-popular',
        title: 'Older popular article',
        category: 'National',
        publishedAt: '2026-07-31T09:00:00.000Z',
        views: 100000,
        isBreaking: true,
        workflow: { status: 'published' },
      },
      {
        _id: 'new-standard',
        slug: 'new-standard',
        title: 'Newest standard article',
        category: 'Indore',
        publishedAt: '2026-07-31T10:00:00.000Z',
        views: 0,
        isBreaking: false,
        workflow: { status: 'published' },
      },
      {
        _id: 'draft-article',
        slug: 'draft-article',
        title: 'Draft article',
        publishedAt: '2026-07-31T11:00:00.000Z',
        workflow: { status: 'draft' },
      },
      {
        _id: 'scheduled-article',
        slug: 'scheduled-article',
        title: 'Scheduled article',
        publishedAt: '2026-07-31T12:00:00.000Z',
        workflow: { status: 'scheduled' },
      },
    ]);

    const { GET } = await import('@/app/api/breaking/route');
    const response = await GET(
      new Request('http://localhost/api/breaking?limit=10') as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(['older-popular']);
    expect(payload.items[0]).toEqual(
      expect.objectContaining({
        title: 'Older popular article',
        href: '/main/article/older-popular',
      })
    );
    expect(payload.items[0].ttsAudioUrl).toBeUndefined();
  });
});
