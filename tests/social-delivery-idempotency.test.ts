import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SocialDeliveryRepository,
  buildIdempotencyKey,
  computePayloadFingerprint,
} from '@/lib/server/distribution/socialDeliveryRepository';
import {
  createStoredSocialDelivery,
} from '@/lib/storage/socialDeliveriesFile';
import type { SocialDeliveryPayloadSnapshot } from '@/lib/server/distribution/socialDeliveryTypes';

const dataPath = path.resolve(process.cwd(), 'data', 'social-deliveries.json');

describe('Phase 3.8C Social Delivery Idempotency & Concurrency', () => {
  const sampleSnapshot: SocialDeliveryPayloadSnapshot = {
    caption: 'Breaking news video coverage',
    hashtags: '#Lokswami #News',
    thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
    videoUrl: 'https://cdn.example.com/video.mp4',
    scheduledAt: null,
  };

  afterAll(async () => {
    try {
      await fs.unlink(dataPath);
    } catch {
      // ignore
    }
  });

  it('computes deterministic payload fingerprints and idempotency keys', () => {
    const fp1 = computePayloadFingerprint(sampleSnapshot);
    const fp2 = computePayloadFingerprint({ ...sampleSnapshot });
    expect(fp1).toBe(fp2);

    const key1 = buildIdempotencyKey('story-1', 'youtube', fp1);
    const key2 = buildIdempotencyKey('story-1', 'youtube', fp2);
    expect(key1).toBe(key2);

    const fpDifferent = computePayloadFingerprint({
      ...sampleSnapshot,
      caption: 'Updated breaking news video coverage',
    });
    expect(fpDifferent).not.toBe(fp1);

    const keyDifferent = buildIdempotencyKey('story-1', 'youtube', fpDifferent);
    expect(keyDifferent).not.toBe(key1);
  });

  it('deduplicates deliveries: finding or creating the same snapshot returns the same delivery ID', async () => {
    const repo = new SocialDeliveryRepository();
    const testStoryId = `story-dedup-${crypto.randomUUID()}`;
    const created1 = await repo.findOrCreateDelivery(
      {
        socialPostId: 'social-1',
        sourceStoryId: testStoryId,
        platform: 'youtube',
        providerMode: 'mock',
        payloadSnapshot: sampleSnapshot,
      },
      'file'
    );

    const created2 = await repo.findOrCreateDelivery(
      {
        socialPostId: 'social-1',
        sourceStoryId: testStoryId,
        platform: 'youtube',
        providerMode: 'mock',
        payloadSnapshot: sampleSnapshot,
      },
      'file'
    );

    expect(created1._id).toBe(created2._id);
    expect(created1.idempotencyKey).toBe(created2.idempotencyKey);
  });

  it('ensures atomic claim: only the first claimant succeeds, subsequent claimants are denied', async () => {
    const repo = new SocialDeliveryRepository();
    const testStoryId = `story-concur-${crypto.randomUUID()}`;
    const delivery = await repo.findOrCreateDelivery(
      {
        socialPostId: 'social-concurrency-1',
        sourceStoryId: testStoryId,
        platform: 'facebook',
        providerMode: 'mock',
        payloadSnapshot: sampleSnapshot,
      },
      'file'
    );

    // First claim
    const claim1 = await repo.atomicClaim(delivery._id, 'worker-1', 'file');
    expect(claim1.claimed).toBe(true);
    expect(claim1.delivery?.status).toBe('dispatching');
    expect(claim1.delivery?.attempts).toBe(1);

    // Second claim concurrent attempt
    const claim2 = await repo.atomicClaim(delivery._id, 'worker-2', 'file');
    expect(claim2.claimed).toBe(false);
    expect(claim2.delivery?.status).toBe('dispatching');
    expect(claim2.claimId).toBe('');
  });

  it('enforces bounded retries: cannot claim beyond maxAttempts (3)', async () => {
    const repo = new SocialDeliveryRepository();
    const testStoryId = `story-retries-${crypto.randomUUID()}`;
    const delivery = await repo.findOrCreateDelivery(
      {
        socialPostId: 'social-retry-limit-1',
        sourceStoryId: testStoryId,
        platform: 'instagram',
        providerMode: 'mock',
        payloadSnapshot: sampleSnapshot,
      },
      'file'
    );

    // Attempt 1
    const claim1 = await repo.atomicClaim(delivery._id, 'worker-1', 'file');
    expect(claim1.claimed).toBe(true);
    await repo.recordFailure(delivery._id, claim1.claimId, { category: 'provider_rejected', message: 'Fail 1' }, true, 'file');

    // Attempt 2
    const claim2 = await repo.atomicClaim(delivery._id, 'worker-2', 'file');
    expect(claim2.claimed).toBe(true);
    await repo.recordFailure(delivery._id, claim2.claimId, { category: 'provider_rejected', message: 'Fail 2' }, true, 'file');

    // Attempt 3
    const claim3 = await repo.atomicClaim(delivery._id, 'worker-3', 'file');
    expect(claim3.claimed).toBe(true);
    await repo.recordFailure(delivery._id, claim3.claimId, { category: 'provider_rejected', message: 'Fail 3' }, false, 'file');

    // Attempt 4 should be denied because max attempts reached
    const claim4 = await repo.atomicClaim(delivery._id, 'worker-4', 'file');
    expect(claim4.claimed).toBe(false);

    // Retrying directly throws max attempts error
    await expect(repo.retry(delivery._id, 'file')).rejects.toThrow('MAX_ATTEMPTS_REACHED');
  });

  it('fails closed in file mode outside tests for live webhooks without Mongo distributed locks', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      // Simulate staging/production runtime
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const repo = new SocialDeliveryRepository();
      const delivery = await createStoredSocialDelivery({
        socialPostId: 'social-failclosed-1',
        contentId: 'story-fc-1',
        contentType: 'story',
        sourceStoryId: `story-fc-${crypto.randomUUID()}`,
        platform: 'youtube',
        providerMode: 'n8n',
        status: 'pending',
        payloadSnapshot: sampleSnapshot,
        payloadFingerprint: 'dummy',
        idempotencyKey: `idemp-fc-${crypto.randomUUID()}`,
        attempts: 0,
        maxAttempts: 3,
        reconciliationRequired: false,
      });

      await expect(repo.atomicClaim(delivery._id, 'worker-live', 'file')).rejects.toThrow(
        'FILE_STORE_LIVE_DISPATCH_UNSUPPORTED'
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    }
  });
});
