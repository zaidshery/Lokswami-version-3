import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const getStoredSocialPostByIdMock = vi.fn();
const updateStoredSocialPostMock = vi.fn();
const dispatchSocialPostToAutomationMock = vi.fn();
const getSocialAutomationConfigMock = vi.fn();
const getSocialAutomationPublicConfigMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/SocialPost', () => ({ default: {} }));

vi.mock('@/lib/storage/socialPostsFile', () => ({
  getStoredSocialPostById: getStoredSocialPostByIdMock,
  updateStoredSocialPost: updateStoredSocialPostMock,
}));

vi.mock('@/lib/server/socialAutomation', () => ({
  dispatchSocialPostToAutomation: dispatchSocialPostToAutomationMock,
  getSocialAutomationConfig: getSocialAutomationConfigMock,
  getSocialAutomationPublicConfig: getSocialAutomationPublicConfigMock,
}));

function createRequest() {
  return new Request('http://localhost/api/admin/social-posts/social-1/dispatch', {
    method: 'POST',
  }) as unknown as NextRequest;
}

describe('/api/admin/social-posts/[id]/dispatch route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getSocialAutomationConfigMock.mockReturnValue({
      provider: 'n8n',
      enabled: true,
      label: 'n8n webhook automation',
      webhookUrl: 'https://n8n.example.com/webhook/social',
      sharedSecret: '',
      timeoutMs: 15000,
    });
    getSocialAutomationPublicConfigMock.mockReturnValue({
      provider: 'n8n',
      enabled: true,
      label: 'n8n webhook automation',
    });
  });

  it('blocks dispatch until the draft is approved', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredSocialPostByIdMock.mockResolvedValue({
      _id: 'social-1',
      sourceStoryId: 'story-1',
      sourceArticleId: 'article-1',
      platform: 'youtube',
      status: 'draft',
      caption: 'Caption',
      hashtags: '#Lokswami',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      videoUrl: 'https://cdn.example.com/final.mp4',
      scheduledAt: null,
    });

    const { POST } = await import('@/app/api/admin/social-posts/[id]/dispatch/route');
    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'social-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('Approve or schedule');
    expect(dispatchSocialPostToAutomationMock).not.toHaveBeenCalled();
  }, 15000);

  it('sends approved drafts to automation and marks them publishing', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredSocialPostByIdMock.mockResolvedValue({
      _id: 'social-1',
      sourceStoryId: 'story-1',
      sourceArticleId: 'article-1',
      platform: 'youtube',
      status: 'approved',
      caption: 'Caption',
      hashtags: '#Lokswami',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      videoUrl: 'https://cdn.example.com/final.mp4',
      scheduledAt: null,
    });
    dispatchSocialPostToAutomationMock.mockResolvedValue({
      provider: 'n8n',
      executionId: 'exec-1',
      executionUrl: 'https://n8n.example.com/executions/1',
      externalUrl: '',
    });
    updateStoredSocialPostMock.mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({
      _id: 'social-1',
      sourceStoryId: 'story-1',
      platform: 'youtube',
      status: updates.status,
      automationProvider: updates.automationProvider,
      automationExecutionId: updates.automationExecutionId,
      automationExecutionUrl: updates.automationExecutionUrl,
    }));

    const { POST } = await import('@/app/api/admin/social-posts/[id]/dispatch/route');
    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'social-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dispatchSocialPostToAutomationMock).toHaveBeenCalledTimes(1);
    expect(updateStoredSocialPostMock).toHaveBeenCalledWith(
      'social-1',
      expect.objectContaining({
        status: 'publishing',
        automationProvider: 'n8n',
        automationExecutionId: 'exec-1',
      })
    );
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual(
      expect.objectContaining({
        status: 'publishing',
        automationProvider: 'n8n',
      })
    );
  }, 15000);

  it('allows failed posts to retry and persists a provider failure state', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredSocialPostByIdMock.mockResolvedValue({
      _id: 'social-1',
      sourceStoryId: 'story-1',
      sourceArticleId: 'article-1',
      platform: 'facebook',
      status: 'failed',
      caption: 'Caption',
      hashtags: '#Lokswami',
      thumbnailUrl: '',
      videoUrl: 'https://cdn.example.com/final.mp4',
      scheduledAt: null,
    });
    dispatchSocialPostToAutomationMock.mockRejectedValue(new Error('Provider unavailable'));
    updateStoredSocialPostMock.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({
        _id: 'social-1',
        sourceStoryId: 'story-1',
        platform: 'facebook',
        ...updates,
      })
    );

    const { POST } = await import('@/app/api/admin/social-posts/[id]/dispatch/route');
    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'social-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(dispatchSocialPostToAutomationMock).toHaveBeenCalledTimes(1);
    expect(updateStoredSocialPostMock).toHaveBeenCalledWith(
      'social-1',
      {
        status: 'failed',
        lastError: 'Provider unavailable',
        automationProvider: 'n8n',
      }
    );
    expect(payload).toEqual({
      success: false,
      error: 'Provider unavailable',
      data: expect.objectContaining({
        status: 'failed',
        lastError: 'Provider unavailable',
      }),
    });
  }, 15000);
});
