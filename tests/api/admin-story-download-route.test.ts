import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSession = vi.fn();
const getStoredStoryById = vi.fn();
const getMediaById = vi.fn();

vi.mock('@/lib/auth/admin', () => ({ getAdminSession }));
vi.mock('@/lib/storage/storiesFile', () => ({ getStoredStoryById }));
vi.mock('@/lib/server/media/mediaRepository', () => ({ mediaRepository: { getMediaById } }));
vi.mock('@/lib/security/getRateLimiter', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, reset: 1 })),
  getRateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/Story', () => ({ default: { findById: vi.fn() } }));

const user = {
  id: 'reporter-1', email: 'reporter@example.com', name: 'Reporter', username: 'reporter', role: 'reporter',
};
const workflow = {
  status: 'draft', createdBy: { id: user.id, email: user.email, name: user.name, role: user.role },
};
function request(asset = 'media') {
  return new Request(`http://localhost/api/admin/stories/story-1/download?asset=${asset}`) as NextRequest;
}

describe('Story download storage boundary', () => {
  const fetchMock = vi.fn();
  const original = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONGODB_URI = '';
    process.env.DIGITALOCEAN_SPACES_ACCESS_KEY = 'test-access';
    process.env.DIGITALOCEAN_SPACES_SECRET_KEY = 'test-secret';
    process.env.DIGITALOCEAN_SPACES_BUCKET = 'test-bucket';
    process.env.DIGITALOCEAN_SPACES_REGION = 'test-region';
    vi.stubGlobal('fetch', fetchMock);
    getAdminSession.mockResolvedValue(user);
  });

  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
  });

  it('rejects unauthenticated requests before storage access', async () => {
    getAdminSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/admin/stories/[id]/download/route');
    const response = await GET(request(), { params: Promise.resolve({ id: 'story-1' }) });
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads an explicit legacy key only through a signed origin request', async () => {
    getStoredStoryById.mockResolvedValue({
      _id: 'story-1', title: 'Safe Story', author: 'Reporter', workflow,
      mediaType: 'video', mediaUrl: 'https://evil.example/ignored.mp4',
      mediaKey: 'stories/videos/2026/09/safe.mp4', mediaMimeType: 'video/mp4', mediaSizeBytes: 3,
    });
    fetchMock.mockResolvedValue(new Response('mp4', { status: 200, headers: { 'Content-Length': '3' } }));
    const { GET } = await import('@/app/api/admin/stories/[id]/download/route');
    const response = await GET(request(), { params: Promise.resolve({ id: 'story-1' }) });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/test-bucket\.test-region\.digitaloceanspaces\.com\/stories\/videos\//),
      expect.objectContaining({ method: 'GET', redirect: 'error' })
    );
    expect(await response.text()).toBe('mp4');
  });

  it('rejects arbitrary remote URLs without fetching them', async () => {
    getStoredStoryById.mockResolvedValue({
      _id: 'story-1', title: 'Unsafe', author: 'Reporter', workflow,
      thumbnail: 'https://attacker.invalid/internal', mediaAssets: [],
    });
    const { GET } = await import('@/app/api/admin/stories/[id]/download/route');
    const response = await GET(request('thumbnail'), { params: Promise.resolve({ id: 'story-1' }) });
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.code).toBe('MEDIA_MIGRATION_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses canonical object metadata instead of asset-supplied provider fields', async () => {
    getStoredStoryById.mockResolvedValue({
      _id: 'story-1', title: 'Canonical', author: 'Reporter', workflow,
      mediaAssets: [{
        id: 'local-1', assetId: 'asset-1', kind: 'image', url: 'https://attacker.invalid/x',
        key: 'attacker/key', mimeType: 'text/html', sizeBytes: 1, storageProvider: 'fake',
        originalFileName: 'x', order: 0, createdAt: new Date().toISOString(),
      }], mediaUrl: 'https://attacker.invalid/x',
    });
    getMediaById.mockResolvedValue({
      _id: 'asset-1', provider: 'do-spaces', objectKey: 'lokswami/images/safe.jpg',
      url: 'https://cdn/safe.jpg', type: 'image/jpeg', size: 3, mediaKind: 'image', status: 'attached',
      ownerType: 'story', ownerId: 'story-1', references: [],
    });
    fetchMock.mockResolvedValue(new Response('jpg', { status: 200, headers: { 'Content-Length': '3' } }));
    const { GET } = await import('@/app/api/admin/stories/[id]/download/route');
    const response = await GET(request(), { params: Promise.resolve({ id: 'story-1' }) });
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toContain('/lokswami/images/safe.jpg');
    expect(fetchMock.mock.calls[0][0]).not.toContain('attacker');
  });
});
