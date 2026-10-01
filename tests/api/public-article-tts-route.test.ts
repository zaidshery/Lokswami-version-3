import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), find: vi.fn(), select: vi.fn(), asset: vi.fn(), file: vi.fn() }));
vi.mock('@/lib/db/mongoose', () => ({ default: mocks.connect }));
vi.mock('@/lib/models/Article', () => ({ default: { findById: mocks.find } }));
vi.mock('@/lib/storage/articlesFile', () => ({ getStoredArticleById: mocks.file }));
vi.mock('@/lib/server/ttsAssets', () => ({ buildArticleFullTtsText: () => 'Readable article text', findReadyManualTtsAsset: mocks.asset }));
import { POST } from '@/app/api/articles/[id]/tts/route';

const id = '507f1f77bcf86cd799439011';
const request = () => POST(new NextRequest(`http://localhost/api/articles/${id}/tts`, { method: 'POST' }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MONGODB_URI', 'mongodb://offline-test.invalid');
  mocks.connect.mockResolvedValue(undefined);
  mocks.find.mockReturnValue({ select: mocks.select });
  mocks.select.mockResolvedValue({ _id: id, title: 'Offline title', summary: 'Offline summary', content: 'Offline content' });
});
afterEach(() => vi.unstubAllEnvs());
describe('public article uploaded audio endpoint contract (offline mocks)', () => {
  it('returns the ready uploaded URL and provider fields without remote storage or generation', async () => {
    const asset = { audioUrl: 'https://cdn.example.com/article/manual.mp3?signature=fixture', model: 'manual-upload', voice: 'manual-upload', mimeType: 'audio/mpeg', chunkCount: 1 };
    mocks.asset.mockResolvedValue(asset);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { ...asset, status: 'ready', provider: 'manual' } });
    expect(mocks.asset).toHaveBeenCalledWith({ sourceType: 'article', sourceId: id, variant: 'article_full' });
    expect(mocks.file).not.toHaveBeenCalled();
  });
  it('reports unavailable manual audio for browser fallback', async () => {
    mocks.asset.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false });
  });
  it('uses file fallback without connecting or generating audio', async () => {
    vi.stubEnv('MONGODB_URI', '');
    mocks.file.mockResolvedValue({ _id: id, title: 'Offline', summary: 'Offline', content: 'Offline' });
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.asset).not.toHaveBeenCalled();
  });
});
