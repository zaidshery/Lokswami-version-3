import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisabledPushProvider, ManualPreparationProvider, MockPushProvider } from '@/lib/server/push/pushProviderAdapter';
import type { PushDeliveryRecord } from '@/lib/server/push/pushDeliveryTypes';

describe('Phase 3.8D - Push Provider Safety (Zero External Network Calls)', () => {
  const fetchSpy = vi.spyOn(global, 'fetch');

  beforeEach(() => {
    fetchSpy.mockClear();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  const sampleRecord: PushDeliveryRecord = {
    _id: 'push-test-1',
    deliveryId: 'push-test-1',
    sourceStoryId: 'story-1',
    recipient: {
      type: 'all_subscribers',
      label: 'All Subscribers',
    },
    payload: {
      title: 'Breaking News Header',
      body: 'Full report on the latest news from the Lokswami desk.',
      deepLink: '/main/article/breaking-1',
      priority: 'high',
      payloadFingerprint: 'test-fingerprint',
    },
    status: 'prepared',
    provider: 'disabled',
    attempts: 0,
    maxAttempts: 1,
    audit: {
      createdBy: {
        id: 'admin-1',
        name: 'Admin Desk',
        email: 'admin@lokswami.com',
        role: 'admin',
      },
      preparedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('DisabledPushProvider refuses delivery and NEVER performs network calls', async () => {
    const provider = new DisabledPushProvider();
    expect(provider.mode).toBe('disabled');

    const status = await provider.getStatus();
    expect(status.provider).toBe('disabled');
    expect(status.networkCallsPermitted).toBe(false);
    expect(status.ready).toBe(false);

    const result = await provider.dispatch(sampleRecord);
    expect(result.success).toBe(false);
    expect(result.status).toBe('disabled');
    expect(result.error?.category).toBe('provider_disabled');
    expect(result.error?.message).toContain('No external push network calls');

    // CRITICAL: verify zero network calls
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ManualPreparationProvider marks record as prepared for manual distribution and NEVER performs network calls', async () => {
    const provider = new ManualPreparationProvider();
    expect(provider.mode).toBe('manual');

    const status = await provider.getStatus();
    expect(status.provider).toBe('manual');
    expect(status.networkCallsPermitted).toBe(false);
    expect(status.ready).toBe(true);

    const result = await provider.dispatch(sampleRecord);
    expect(result.success).toBe(true);
    expect(result.status).toBe('manual');
    expect(result.providerResponse?.manualCopyPrepared).toBe(true);

    // CRITICAL: verify zero network calls
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('MockPushProvider simulates dispatch locally in memory with zero external requests', async () => {
    const provider = new MockPushProvider();
    expect(provider.mode).toBe('mock');

    const status = await provider.getStatus();
    expect(status.provider).toBe('mock');
    expect(status.networkCallsPermitted).toBe(false);

    const result = await provider.dispatch(sampleRecord);
    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(result.providerResponse?.mockDispatched).toBe(true);

    const sent = provider.getSentRecords();
    expect(sent.length).toBe(1);
    expect(sent[0].deliveryId).toBe(sampleRecord.deliveryId);

    // CRITICAL: verify zero network calls
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
