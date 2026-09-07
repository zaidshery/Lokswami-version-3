import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connectDBMock = vi.fn();
const epaperFindByIdMock = vi.fn();
const epaperArticleFindOneMock = vi.fn();
const getStoredEPaperByIdMock = vi.fn();
const isGeminiTtsConfiguredMock = vi.fn();
// const synthesizeGeminiSpeechMock = vi.fn();
const ensureTtsAssetMock = vi.fn();
const findReadyManualTtsAssetMock = vi.fn();
const buildEpaperStoryTtsTextMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    findById: epaperFindByIdMock,
  },
}));

vi.mock('@/lib/models/EPaperArticle', () => ({
  default: {
    findOne: epaperArticleFindOneMock,
  },
}));

vi.mock('@/lib/storage/epapersFile', () => ({
  getStoredEPaperById: getStoredEPaperByIdMock,
}));

vi.mock('@/lib/ai/geminiTts', () => ({
  isGeminiTtsConfigured: isGeminiTtsConfiguredMock,
  // synthesizeGeminiSpeech: synthesizeGeminiSpeechMock,
}));

vi.mock('@/lib/server/ttsAssets', () => ({
  buildEpaperStoryTtsText: buildEpaperStoryTtsTextMock,
  ensureTtsAsset: ensureTtsAssetMock,
  findReadyManualTtsAsset: findReadyManualTtsAssetMock,
}));

function createJsonRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/epapers/paper/articles/story/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('public e-paper story TTS route', () => {
  const originalMongoUri = process.env.MONGODB_URI;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.MONGODB_URI = 'mongodb://example.test/lokswami';
    connectDBMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
  });

  it('returns ready manual audio without auto-generated TTS', async () => {
    const epaperId = '665000000000000000000001';
    const articleId = '665000000000000000000002';
    epaperFindByIdMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: epaperId,
        title: 'Indore Daily',
        cityName: 'Indore',
        publishDate: new Date('2026-05-05T00:00:00.000Z'),
        status: 'published',
      }),
    });
    epaperArticleFindOneMock.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
        _id: articleId,
        epaperId,
        title: 'Unreviewed correction',
        releasedSnapshot: {
        pageNumber: 1,
        title: 'Lead Story',
        slug: 'lead-story',
        version: 1,
        hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 },
        excerpt: 'Short intro',
        contentHtml: '<p>Full story</p>',
        audio: { model: 'manual-upload', voice: 'manual-upload', mimeType: 'audio/mpeg', chunkCount: 1, audioUrl: 'https://cdn.example.com/lokswami/tts/epaperArticle/665/manual/listen.mp3' },
        },
      }) }),
    });
    findReadyManualTtsAssetMock.mockResolvedValue({
      model: 'manual-upload',
      voice: 'manual-upload',
      mimeType: 'audio/mpeg',
      chunkCount: 1,
      audioUrl: 'https://cdn.example.com/lokswami/tts/epaperArticle/665/manual/listen.mp3',
    });

    const { POST } = await import('@/app/api/epapers/[id]/articles/[articleId]/tts/route');
    const response = await POST(createJsonRequest(), {
      params: Promise.resolve({ id: epaperId, articleId }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: {
        provider: 'manual',
        model: 'manual-upload',
        voice: 'manual-upload',
        mimeType: 'audio/mpeg',
        chunkCount: 1,
        audioUrl: 'https://cdn.example.com/lokswami/tts/epaperArticle/665/manual/listen.mp3',
      },
    });
    expect(findReadyManualTtsAssetMock).not.toHaveBeenCalled();
    expect(isGeminiTtsConfiguredMock).not.toHaveBeenCalled();
    expect(ensureTtsAssetMock).not.toHaveBeenCalled();
    // expect(synthesizeGeminiSpeechMock).not.toHaveBeenCalled();
  });
  it('does not serve audio for an unreleased story', async () => {
    epaperFindByIdMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ status: 'published' }) });
    epaperArticleFindOneMock.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ title: 'Private story' }) }) });
    const { POST } = await import('@/app/api/epapers/[id]/articles/[articleId]/tts/route');
    const response = await POST(createJsonRequest(), { params: Promise.resolve({ id: '665000000000000000000001', articleId: '665000000000000000000002' }) });
    expect(response.status).toBe(404);
    expect(findReadyManualTtsAssetMock).not.toHaveBeenCalled();
  });
});
