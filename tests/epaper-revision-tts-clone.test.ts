import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(() => 'Draft revision created.'),
  recordEpaperActivity: vi.fn(),
}));

import { EpaperRevisionService } from '@/lib/server/epaper/epaperRevisionService';
import type { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import type { CreateEpaperTtsAssetInput } from '@/lib/server/epaper/epaperTypes';
import TtsAsset from '@/lib/models/TtsAsset';

const actor = {
  id: 'admin-1',
  username: 'admin',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin' as const,
};
const sourceId = '665000000000000000000001';
const sourceArticleId = '665000000000000000000002';
const sourceAssetId = '665000000000000000000003';
const revisionId = '665000000000000000000004';
const clonedArticleId = '665000000000000000000005';

describe('EpaperRevisionService manual TTS clone compatibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clones every baseline persisted TTS field and only remaps revision relationships', async () => {
    const generatedAt = new Date('2026-08-30T10:00:00.000Z');
    const lastVerifiedAt = new Date('2026-09-01T11:00:00.000Z');
    const sourceAsset = {
      _id: sourceAssetId,
      sourceType: 'epaperArticle' as const,
      sourceId: sourceArticleId,
      sourceParentId: sourceId,
      variant: 'epaper_story' as const,
      title: 'Preserved story title',
      textHash: 'text-hash-v1',
      contentVersionHash: 'content-hash-v1',
      languageCode: 'hi-IN',
      voice: 'manual-reader',
      provider: 'manual' as const,
      model: 'manual-upload',
      mimeType: 'audio/mpeg',
      audioUrl: 'https://cdn.example.com/audio/story.mp3',
      storageMode: 'spaces' as const,
      status: 'ready' as const,
      chunkCount: 3,
      charCount: 840,
      generatedAt,
      lastVerifiedAt,
      failureCount: 1,
      lastError: 'Previously recovered verification warning',
      metadata: { editorialLabel: 'Sunday edition', nested: { retained: true } },
    };
    const originalAsset = structuredClone(sourceAsset);
    const createdTtsAssets: CreateEpaperTtsAssetInput[] = [];
    const createTtsAsset = vi.fn(async (input: CreateEpaperTtsAssetInput) => {
      for (const field of ['textHash', 'contentVersionHash', 'languageCode', 'voice', 'provider', 'model', 'mimeType', 'audioUrl', 'storageMode']) {
        if (!input[field as keyof CreateEpaperTtsAssetInput]) throw new Error(`Missing required TtsAsset field: ${field}`);
      }
      createdTtsAssets.push(structuredClone(input));
      return { _id: 'cloned-tts-asset', ...input };
    });
    const createEdition = vi.fn(async () => ({ _id: revisionId }));
    const createArticle = vi.fn(async () => ({ _id: clonedArticleId }));
    const repo = {
      isValidId: vi.fn(() => true),
      connect: vi.fn(),
      findEditionById: vi.fn(async () => ({
        _id: sourceId,
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Published edition',
        publishDate: new Date('2026-09-01T00:00:00.000Z'),
        status: 'published',
        productionStatus: 'published',
        familyId: 'family-1',
        revisionNumber: 1,
        pages: [{ pageNumber: 1, imagePath: '/page-1.jpg' }],
      })),
      updateEditionWhere: vi.fn(),
      findEdition: vi.fn(async () => null),
      findLatestRevision: vi.fn(async () => ({ revisionNumber: 1 })),
      createEdition,
      listArticles: vi.fn(async () => [{
        _id: sourceArticleId,
        pageNumber: 1,
        title: 'Story',
        slug: 'story',
        excerpt: 'Excerpt',
        contentHtml: '<p>Body</p>',
        hotspot: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      }]),
      createArticle,
      listReadyTtsAssets: vi.fn(async () => [sourceAsset]),
      createTtsAsset,
    } as unknown as EpaperRepository;

    await expect(new EpaperRevisionService(repo).create(actor, sourceId)).resolves.toEqual({
      message: 'Draft revision 2 created.',
      data: { revisionId, familyId: 'family-1', revisionNumber: 2 },
    });

    expect(createEdition).toHaveBeenCalledOnce();
    expect(createArticle).toHaveBeenCalledWith(expect.objectContaining({ epaperId: revisionId }));
    expect(createTtsAsset).toHaveBeenCalledOnce();
    expect(createdTtsAssets).toEqual([{
      sourceType: 'epaperArticle',
      sourceId: clonedArticleId,
      sourceParentId: revisionId,
      variant: 'epaper_story',
      title: 'Preserved story title',
      textHash: 'text-hash-v1',
      contentVersionHash: 'content-hash-v1',
      languageCode: 'hi-IN',
      voice: 'manual-reader',
      provider: 'manual',
      model: 'manual-upload',
      mimeType: 'audio/mpeg',
      audioUrl: 'https://cdn.example.com/audio/story.mp3',
      storageMode: 'spaces',
      status: 'ready',
      chunkCount: 3,
      charCount: 840,
      generatedAt,
      lastVerifiedAt,
      failureCount: 1,
      lastError: 'Previously recovered verification warning',
      metadata: {
        editorialLabel: 'Sunday edition',
        nested: { retained: true },
        clonedFromEpaperId: sourceId,
        clonedFromAssetId: sourceAssetId,
      },
    }]);
    await expect(new TtsAsset(createdTtsAssets[0]).validate()).resolves.toBeUndefined();
    expect(sourceAsset).toEqual(originalAsset);
  });
});
