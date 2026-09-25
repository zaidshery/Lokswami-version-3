import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSession = vi.fn();
const initialize = vi.fn();
const complete = vi.fn();

vi.mock('@/lib/auth/admin', () => ({ getAdminSessionFromReq: getAdminSession }));
vi.mock('@/lib/server/media/storyVideoAssetService', () => ({
  storyVideoAssetService: { initialize, complete },
}));
vi.mock('@/lib/security/getRateLimiter', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, reset: 1 })),
  getRateLimitHeaders: vi.fn(() => ({})),
}));

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/uploads/story-video', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as NextRequest;
}
const user = { id: 'reporter-1', email: 'r@example.com', name: 'R', username: 'r', role: 'reporter' };

describe('actor-bound Story video upload receipts', () => {
  beforeEach(() => { vi.clearAllMocks(); getAdminSession.mockResolvedValue(user); });

  it('rejects unauthenticated init requests', async () => {
    getAdminSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/uploads/story-video/init/route');
    const response = await POST(request({ fileName: 'clip.mp4', fileType: 'video/mp4', fileSize: 25 }));
    expect(response.status).toBe(401);
    expect(initialize).not.toHaveBeenCalled();
  });

  it('creates a server-side receipt with the upload target', async () => {
    initialize.mockResolvedValue({
      assetId: 'asset-1', mediaKey: 'stories/videos/safe.mp4', mediaUrl: 'https://cdn/safe.mp4',
      uploadUrl: 'https://origin/signed', uploadHeaders: { 'Content-Type': 'video/mp4' }, expiresAt: 'soon',
    });
    const { POST } = await import('@/app/api/admin/uploads/story-video/init/route');
    const response = await POST(request({
      storyId: 'story-1', fileName: 'clip.mp4', fileType: 'video/mp4', fileSize: 25,
    }));
    expect(response.status).toBe(201);
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ storyId: 'story-1' }), user);
    expect(await response.json()).toMatchObject({ success: true, data: { assetId: 'asset-1' } });
  });

  it('requires the opaque receipt rather than accepting a client object key', async () => {
    const { POST } = await import('@/app/api/admin/uploads/story-video/complete/route');
    const response = await POST(request({
      mediaKey: 'stories/videos/attacker.mp4', expectedSize: 25,
      expectedFileType: 'video/mp4', expectedFileName: 'clip.mp4',
    }));
    expect(response.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it('completes against the receipt and returns canonical metadata', async () => {
    complete.mockResolvedValue({
      assetId: 'asset-1', mediaUrl: 'https://cdn/safe.mp4', mediaKey: 'stories/videos/safe.mp4',
      mediaSizeBytes: 25, mediaMimeType: 'video/mp4', storageProvider: 'do-spaces',
    });
    const { POST } = await import('@/app/api/admin/uploads/story-video/complete/route');
    const response = await POST(request({
      assetId: 'asset-1', expectedSize: 25, expectedFileType: 'video/mp4', expectedFileName: 'clip.mp4',
    }));
    expect(response.status).toBe(200);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'asset-1' }), user);
    expect(await response.json()).toMatchObject({ data: { assetId: 'asset-1', storageProvider: 'do-spaces' } });
  });
});
