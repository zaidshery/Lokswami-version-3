import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ManualSocialProvider,
  MockSocialProvider,
  WebhookSocialProvider,
  type SocialDispatchPayload,
} from '@/lib/server/distribution/socialProviderAdapter';

describe('Phase 3.8C Provider Contract & Adapters', () => {
  const originalFetch = global.fetch;

  const samplePayload: SocialDispatchPayload = {
    contractVersion: '2026-09.v1',
    deliveryId: 'del-contract-1',
    idempotencyKey: 'idemp-contract-1',
    source: 'lokswami',
    kind: 'social_post_dispatch',
    generatedAt: new Date().toISOString(),
    origin: 'https://lokswami.in',
    actor: {
      id: 'super-1',
      name: 'Super Admin',
      email: 'super@example.com',
      role: 'super_admin',
    },
    content: {
      storyId: 'story-1',
      articleId: 'article-1',
      revision: 1,
    },
    socialPost: {
      id: 'social-1',
      platform: 'youtube',
      caption: 'Breaking news on video',
      hashtags: '#Lokswami',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      videoUrl: 'https://cdn.example.com/video.mp4',
      scheduledAt: null,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('ManualSocialProvider', () => {
    it('returns manual status and executionId without network calls', async () => {
      global.fetch = vi.fn();
      const provider = new ManualSocialProvider();
      expect(provider.mode).toBe('manual');

      const result = await provider.dispatch(samplePayload);
      expect(result.status).toBe('succeeded');
      expect(result.executionId).toBe('manual');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('MockSocialProvider', () => {
    it('allows mocking provider responses and records dispatched payloads', async () => {
      const provider = new MockSocialProvider();
      expect(provider.mode).toBe('mock');

      provider.setHandler(async (p) => ({
        status: 'succeeded',
        executionId: `handler-${p.deliveryId}`,
        externalUrl: 'https://youtube.com/watch?v=mocked',
      }));

      const result = await provider.dispatch(samplePayload);
      expect(result.status).toBe('succeeded');
      expect(result.executionId).toBe('handler-del-contract-1');
      expect(provider.dispatchedPayloads).toHaveLength(1);
      expect(provider.dispatchedPayloads[0].deliveryId).toBe('del-contract-1');
    });
  });

  describe('WebhookSocialProvider', () => {
    it('validates destination URL and rejects invalid URLs, credentials, or fragments', () => {
      expect(() => {
        new WebhookSocialProvider({
          provider: 'n8n',
          webhookUrl: 'not-a-valid-url',
        });
      }).toThrow('INVALID_WEBHOOK_URL');

      expect(() => {
        new WebhookSocialProvider({
          provider: 'n8n',
          webhookUrl: 'https://user:password@webhook.example.com/endpoint',
        });
      }).toThrow('Credentials in webhook URL are forbidden');

      expect(() => {
        new WebhookSocialProvider({
          provider: 'n8n',
          webhookUrl: 'https://webhook.example.com/endpoint#fragment',
        });
      }).toThrow('URL fragments in webhook URL are forbidden');
    });

    it('sends versioned contract, idempotency key, delivery ID, and HMAC signature headers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ executionId: 'exec-n8n-1', externalUrl: 'https://youtube.com/v/1' }),
      } as Response);

      const provider = new WebhookSocialProvider({
        provider: 'n8n',
        webhookUrl: 'https://n8n.example.com/webhook',
        sharedSecret: 'n8n-secret-12345',
        timeoutMs: 5000,
      });

      const result = await provider.dispatch(samplePayload);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, req] = vi.mocked(global.fetch).mock.calls[0];
      expect(url).toBe('https://n8n.example.com/webhook');

      const headers = req?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Lokswami-Event']).toBe('social_post_dispatch');
      expect(headers['X-Lokswami-Provider']).toBe('n8n');
      expect(headers['X-Lokswami-Delivery-Id']).toBe('del-contract-1');
      expect(headers['Idempotency-Key']).toBe('idemp-contract-1');
      expect(headers['X-Lokswami-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(headers['X-Lokswami-Timestamp']).toBeDefined();

      expect(result.status).toBe('succeeded');
      expect(result.executionId).toBe('exec-n8n-1');
      expect(result.externalUrl).toBe('https://youtube.com/v/1');
    });

    it('handles timeout gracefully and marks outcome as timeout_unknown', async () => {
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      global.fetch = vi.fn().mockRejectedValue(timeoutError);

      const provider = new WebhookSocialProvider({
        provider: 'generic_webhook',
        webhookUrl: 'https://hooks.example.com/post',
        timeoutMs: 1000,
      });

      const result = await provider.dispatch(samplePayload);

      expect(result.status).toBe('timeout_unknown');
      expect(result.error?.category).toBe('timeout_unknown');
      expect(result.error?.message).toContain('Request timed out');
    });

    it('classifies HTTP errors (401/403 -> authorization, 429 -> throttled, 500 -> provider_rejected) and redacts secrets', async () => {
      const secret = 'super-private-token-xyz';
      const provider = new WebhookSocialProvider({
        provider: 'n8n',
        webhookUrl: 'https://n8n.example.com/webhook/endpoint',
        sharedSecret: secret,
      });

      // 401 Authorization failure
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => `Invalid shared secret ${secret} at https://n8n.example.com/webhook/endpoint`,
      } as Response);

      const res401 = await provider.dispatch(samplePayload);
      expect(res401.status).toBe('failed');
      expect(res401.error?.category).toBe('authorization');
      expect(res401.error?.message).not.toContain(secret);
      expect(res401.error?.message).toContain('[REDACTED]');

      // 429 Throttled
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded for endpoint',
      } as Response);

      const res429 = await provider.dispatch(samplePayload);
      expect(res429.status).toBe('failed');
      expect(res429.error?.category).toBe('throttled');

      // 500 Server error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Downstream service error',
      } as Response);

      const res500 = await provider.dispatch(samplePayload);
      expect(res500.status).toBe('failed');
      expect(res500.error?.category).toBe('provider_rejected');
    });
  });
});
