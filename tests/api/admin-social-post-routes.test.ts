import type { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const listStoredSocialPostsMock = vi.fn();
const updateStoredSocialPostMock = vi.fn();
const getSocialAutomationPublicConfigMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/SocialPost', () => ({ default: {} }));
vi.mock('@/lib/storage/socialPostsFile', () => ({
  listStoredSocialPosts: listStoredSocialPostsMock,
  updateStoredSocialPost: updateStoredSocialPostMock,
}));
vi.mock('@/lib/server/socialAutomation', () => ({
  getSocialAutomationPublicConfig: getSocialAutomationPublicConfigMock,
  getSocialAutomationConfig: vi.fn(),
  dispatchSocialPostToAutomation: vi.fn(),
}));

const originalMongoUri = process.env.MONGODB_URI;

function request(path: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: body ? 'PATCH' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('admin social post route compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getSocialAutomationPublicConfigMock.mockReturnValue({
      provider: 'manual',
      enabled: false,
      label: 'Manual review only',
    });
  });

  afterAll(() => {
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  it('allows copy editors to list filtered posts with public automation metadata', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-1',
      name: 'Copy Editor',
      email: 'copy@example.com',
      role: 'copy_editor',
    });
    listStoredSocialPostsMock.mockResolvedValue([
      { _id: 'social-1', platform: 'facebook', status: 'approved' },
    ]);

    const { GET } = await import('@/app/api/admin/social-posts/route');
    const response = await GET(
      request(
        '/api/admin/social-posts?storyId=story-1&articleId=article-1&platform=facebook&status=approved'
      )
    );

    expect(response.status).toBe(200);
    expect(listStoredSocialPostsMock).toHaveBeenCalledWith({
      storyId: 'story-1',
      articleId: 'article-1',
      platform: 'facebook',
      status: 'approved',
    });
    expect(await response.json()).toEqual({
      success: true,
      data: [{ _id: 'social-1', platform: 'facebook', status: 'approved' }],
      meta: {
        automation: { provider: 'manual', enabled: false, label: 'Manual review only' },
      },
    });
  }, 15000);

  it('does not increase Reporter social-post visibility', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      name: 'Reporter',
      email: 'reporter@example.com',
      role: 'reporter',
    });
    const { GET } = await import('@/app/api/admin/social-posts/route');
    const response = await GET(request('/api/admin/social-posts'));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'Forbidden' });
    expect(listStoredSocialPostsMock).not.toHaveBeenCalled();
  });

  it('preserves PATCH normalization and file-store IDs', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
    });
    updateStoredSocialPostMock.mockImplementation(
      async (id: string, updates: Record<string, unknown>) => ({ _id: id, ...updates })
    );

    const { PATCH } = await import('@/app/api/admin/social-posts/[id]/route');
    const response = await PATCH(
      request('/api/admin/social-posts/file-social-id', {
        caption: ' Updated caption ',
        status: 'approved',
        scheduledAt: 'not-a-date',
      }),
      { params: Promise.resolve({ id: 'file-social-id' }) }
    );

    expect(response.status).toBe(200);
    expect(updateStoredSocialPostMock).toHaveBeenCalledWith('file-social-id', {
      caption: 'Updated caption',
      status: 'approved',
      scheduledAt: null,
    });
    expect(await response.json()).toEqual({
      success: true,
      data: {
        _id: 'file-social-id',
        caption: 'Updated caption',
        status: 'approved',
        scheduledAt: null,
      },
    });
  });

  it('preserves the empty PATCH validation response', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
    });
    const { PATCH } = await import('@/app/api/admin/social-posts/[id]/route');
    const response = await PATCH(request('/api/admin/social-posts/social-1', { unknown: true }), {
      params: Promise.resolve({ id: 'social-1' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'No valid updates provided',
    });
  });
});
