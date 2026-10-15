import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  computeHmacSignature,
  redactSensitiveString,
  verifyWebhookSignature,
} from '@/lib/server/distribution/webhookSecurity';

const reconcileDeliveryMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getSocialAutomationConfigMock = vi.fn();

vi.mock('@/lib/server/distribution/socialDistributionService', () => ({
  socialDistributionService: {
    reconcileDelivery: (...args: unknown[]) => reconcileDeliveryMock(...args),
  },
}));

vi.mock('@/lib/security/getRateLimiter', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  getRateLimitHeaders: () => ({}),
}));

vi.mock('@/lib/server/socialAutomation', () => ({
  getSocialAutomationConfig: () => getSocialAutomationConfigMock(),
}));

describe('Phase 3.8C Webhook Security, HMAC & Replay Protection', () => {
  const secret = 'super-secret-automation-key-12345';
  const deliveryId = 'del-test-123';
  const rawBody = JSON.stringify({
    deliveryId: 'del-test-123',
    status: 'succeeded',
    externalUrl: 'https://youtube.com/watch?v=123',
    externalPostId: 'yt-123',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    getSocialAutomationConfigMock.mockReturnValue({
      sharedSecret: secret,
      provider: 'n8n',
      enabled: true,
      webhookUrl: 'https://n8n.example.com/webhook',
      timeoutMs: 15000,
    });
  });

  describe('HMAC Signature & Verification', () => {
    it('generates valid sha256 HMAC signature', () => {
      const now = Math.floor(Date.now() / 1000);
      const sig = computeHmacSignature(secret, now, deliveryId, rawBody);
      expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('verifies valid signature within acceptable timestamp drift window', () => {
      const now = Math.floor(Date.now() / 1000);
      const sig = computeHmacSignature(secret, now, deliveryId, rawBody);

      const result = verifyWebhookSignature({
        signatureHeader: sig,
        timestampHeader: String(now),
        rawBody,
        deliveryId,
        secret,
        maxDriftSeconds: 300,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects signature when shared secret is not configured', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = verifyWebhookSignature({
        signatureHeader: 'sha256=123',
        timestampHeader: String(now),
        rawBody,
        deliveryId,
        secret: '',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SHARED_SECRET_NOT_CONFIGURED');
    });

    it('rejects missing signature or timestamp headers', () => {
      const now = Math.floor(Date.now() / 1000);
      const noSig = verifyWebhookSignature({
        signatureHeader: null,
        timestampHeader: String(now),
        rawBody,
        deliveryId,
        secret,
      });
      expect(noSig.valid).toBe(false);
      expect(noSig.reason).toBe('MISSING_SIGNATURE_HEADER');

      const noTime = verifyWebhookSignature({
        signatureHeader: 'sha256=abc',
        timestampHeader: null,
        rawBody,
        deliveryId,
        secret,
      });
      expect(noTime.valid).toBe(false);
      expect(noTime.reason).toBe('MISSING_TIMESTAMP_HEADER');
    });

    it('rejects replay attacks where timestamp drift exceeds 300s window', () => {
      const now = Math.floor(Date.now() / 1000);
      const oldTimestamp = now - 350; // 350 seconds ago (> 300s max drift)
      const sig = computeHmacSignature(secret, oldTimestamp, deliveryId, rawBody);

      const result = verifyWebhookSignature({
        signatureHeader: sig,
        timestampHeader: String(oldTimestamp),
        rawBody,
        deliveryId,
        secret,
        maxDriftSeconds: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('TIMESTAMP_DRIFT_EXCEEDED');
    });

    it('rejects tampered payload body or modified signature', () => {
      const now = Math.floor(Date.now() / 1000);
      const sig = computeHmacSignature(secret, now, deliveryId, rawBody);

      // Tampered body
      const tamperedBody = JSON.stringify({ ...JSON.parse(rawBody), status: 'failed' });
      const resultTampered = verifyWebhookSignature({
        signatureHeader: sig,
        timestampHeader: String(now),
        rawBody: tamperedBody,
        deliveryId,
        secret,
      });
      expect(resultTampered.valid).toBe(false);
      expect(resultTampered.reason).toBe('SIGNATURE_MISMATCH');
    });

    it('redacts sensitive shared secrets and credentials in URLs', () => {
      const unsafeMessage = `Failed calling https://admin:superSecret123@n8n.internal.net/webhook with secret ${secret}`;
      const safe = redactSensitiveString(unsafeMessage, [secret]);

      expect(safe).not.toContain(secret);
      expect(safe).toContain('[REDACTED]');
      expect(safe).not.toContain('superSecret123');
    });
  });

  describe('Incoming Webhook Route /api/webhooks/social-delivery', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      checkRateLimitMock.mockResolvedValue({ allowed: false });

      const { POST } = await import('@/app/api/webhooks/social-delivery/route');
      const req = new Request('http://localhost/api/webhooks/social-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody,
      }) as unknown as NextRequest;

      const res = await POST(req);
      expect(res.status).toBe(429);
      expect(reconcileDeliveryMock).not.toHaveBeenCalled();
    });

    it('returns 401 when signature is invalid', async () => {
      const now = Math.floor(Date.now() / 1000);
      const { POST } = await import('@/app/api/webhooks/social-delivery/route');

      const req = new Request('http://localhost/api/webhooks/social-delivery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Lokswami-Delivery-Id': deliveryId,
          'X-Lokswami-Timestamp': String(now),
          'X-Lokswami-Signature': 'sha256=invalidffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        },
        body: rawBody,
      }) as unknown as NextRequest;

      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(reconcileDeliveryMock).not.toHaveBeenCalled();
    });

    it('authenticates valid HMAC webhook and reconciles delivery successfully', async () => {
      const now = Math.floor(Date.now() / 1000);
      const sig = computeHmacSignature(secret, now, deliveryId, rawBody);
      reconcileDeliveryMock.mockResolvedValue({
        _id: deliveryId,
        status: 'succeeded',
        reconciliationRequired: false,
      });

      const { POST } = await import('@/app/api/webhooks/social-delivery/route');

      const req = new Request('http://localhost/api/webhooks/social-delivery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Lokswami-Delivery-Id': deliveryId,
          'X-Lokswami-Timestamp': String(now),
          'X-Lokswami-Signature': sig,
        },
        body: rawBody,
      }) as unknown as NextRequest;

      const res = await POST(req);
      const payload = await res.json();

      expect(res.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(reconcileDeliveryMock).toHaveBeenCalledWith(
        deliveryId,
        expect.objectContaining({
          outcome: 'succeeded',
          externalUrl: 'https://youtube.com/watch?v=123',
          externalPostId: 'yt-123',
        }),
        expect.objectContaining({
          role: 'super_admin',
        })
      );
    });
  });
});
