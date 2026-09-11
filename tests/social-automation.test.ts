import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSocialAutomationPayload,
  dispatchSocialPostToAutomation,
  getSocialAutomationConfig,
} from '@/lib/server/socialAutomation';

describe('social automation helpers', () => {
  const originalFetch = global.fetch;
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          executionId: 'exec-1',
          executionUrl: 'https://n8n.example.com/executions/1',
        })
      ),
    } as unknown as Response);
  });

  afterEach(() => {
    process.env = { ...envBackup };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('normalizes n8n config from environment variables', () => {
    process.env.SOCIAL_AUTOMATION_PROVIDER = 'n8n';
    process.env.N8N_SOCIAL_WEBHOOK_URL = 'https://n8n.example.com/webhook/social';

    const config = getSocialAutomationConfig();

    expect(config.provider).toBe('n8n');
    expect(config.enabled).toBe(true);
    expect(config.webhookUrl).toBe('https://n8n.example.com/webhook/social');
  });

  it('builds the dispatch payload for automation tools', () => {
    const payload = buildSocialAutomationPayload({
      actor: {
        id: 'admin-1',
        name: 'Desk Admin',
        email: 'desk@example.com',
        role: 'admin',
      },
      post: {
        _id: 'social-1',
        sourceStoryId: 'story-1',
        sourceArticleId: 'article-1',
        platform: 'youtube',
        status: 'approved',
        caption: 'Big headline',
        hashtags: '#Lokswami #News',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        videoUrl: 'https://cdn.example.com/final.mp4',
        scheduledAt: null,
      },
    });

    expect(payload.kind).toBe('social_post_dispatch');
    expect(payload.socialPost.platform).toBe('youtube');
    expect(payload.actor.name).toBe('Desk Admin');
  });

  it('dispatches approved posts to n8n webhooks', async () => {
    process.env.SOCIAL_AUTOMATION_PROVIDER = 'n8n';
    process.env.N8N_SOCIAL_WEBHOOK_URL = 'https://n8n.example.com/webhook/social';
    process.env.SOCIAL_AUTOMATION_SHARED_SECRET = 'shared-secret';

    const result = await dispatchSocialPostToAutomation({
      actor: {
        id: 'admin-1',
        name: 'Desk Admin',
        email: 'desk@example.com',
        role: 'admin',
      },
      post: {
        _id: 'social-1',
        sourceStoryId: 'story-1',
        sourceArticleId: 'article-1',
        platform: 'youtube',
        status: 'approved',
        caption: 'Big headline',
        hashtags: '#Lokswami #News',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        videoUrl: 'https://cdn.example.com/final.mp4',
        scheduledAt: null,
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('https://n8n.example.com/webhook/social');
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Lokswami-Provider': 'n8n',
      'X-Lokswami-Signature': 'shared-secret',
    });
    expect(result).toEqual({
      provider: 'n8n',
      executionId: 'exec-1',
      executionUrl: 'https://n8n.example.com/executions/1',
      externalUrl: '',
    });
  });

  it('redacts provider credentials from failed webhook responses', async () => {
    process.env.SOCIAL_AUTOMATION_PROVIDER = 'n8n';
    process.env.N8N_SOCIAL_WEBHOOK_URL = 'https://n8n.example.com/webhook/private-token';
    process.env.SOCIAL_AUTOMATION_SHARED_SECRET = 'shared-secret';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: vi.fn().mockResolvedValue(
        'Rejected shared-secret at https://n8n.example.com/webhook/private-token'
      ),
    } as unknown as Response);

    await expect(
      dispatchSocialPostToAutomation({
        actor: { id: 'admin-1', name: 'Desk', email: 'desk@example.com', role: 'admin' },
        post: {
          _id: 'social-1',
          sourceStoryId: 'story-1',
          platform: 'facebook',
          status: 'approved',
          caption: 'Headline',
          hashtags: '#Lokswami',
          thumbnailUrl: '',
          videoUrl: 'https://cdn.example.com/final.mp4',
        },
      })
    ).rejects.toThrow('Rejected [REDACTED] at [REDACTED]');
  });
});
