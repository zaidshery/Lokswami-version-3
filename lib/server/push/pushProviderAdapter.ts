import type {
  PushDeliveryRecord,
  PushProviderMode,
} from './pushDeliveryTypes';

export type PushDispatchResult = {
  success: boolean;
  status: 'succeeded' | 'failed' | 'disabled' | 'manual';
  provider: PushProviderMode;
  executionId?: string;
  deliveredCount?: number;
  providerResponse?: Record<string, unknown>;
  error?: {
    category: string;
    message: string;
  };
};

export interface IPushProviderAdapter {
  readonly mode: PushProviderMode;
  getStatus(): Promise<{
    provider: PushProviderMode;
    networkCallsPermitted: boolean;
    ready: boolean;
    description: string;
  }>;
  dispatch(delivery: PushDeliveryRecord): Promise<PushDispatchResult>;
}

/**
 * DisabledPushProvider is the default production provider in Phase 3.8.
 * It is GUARANTEED to NEVER make any external network requests.
 */
export class DisabledPushProvider implements IPushProviderAdapter {
  readonly mode = 'disabled' as const;

  async getStatus() {
    return {
      provider: this.mode,
      networkCallsPermitted: false,
      ready: false,
      description: 'Push delivery is disabled by architectural policy. No external network requests.',
    };
  }

  async dispatch(_delivery: PushDeliveryRecord): Promise<PushDispatchResult> {
    void _delivery;
    // Guaranteed: zero network calls.
    return {
      success: false,
      status: 'disabled',
      provider: 'disabled',
      error: {
        category: 'provider_disabled',
        message:
          'Push delivery is disabled by architectural policy. No external push network calls (Firebase, OneSignal, or APNs) are permitted.',
      },
    };
  }
}

/**
 * ManualPreparationProvider allows newsroom editors to prepare and review push copy safely
 * without external side-effects.
 */
export class ManualPreparationProvider implements IPushProviderAdapter {
  readonly mode = 'manual' as const;

  async getStatus() {
    return {
      provider: this.mode,
      networkCallsPermitted: false,
      ready: true,
      description: 'Manual preparation only. Push copy is formatted for manual newsroom broadcast.',
    };
  }

  async dispatch(delivery: PushDeliveryRecord): Promise<PushDispatchResult> {
    // Guaranteed: zero network calls.
    return {
      success: true,
      status: 'manual',
      provider: 'manual',
      executionId: `manual-${delivery.deliveryId}`,
      deliveredCount: 0,
      providerResponse: { manualCopyPrepared: true },
    };
  }
}

export type MockPushHandler = (
  delivery: PushDeliveryRecord
) => Promise<PushDispatchResult> | PushDispatchResult;

/**
 * MockPushProvider is for automated testing only.
 * It operates strictly in-memory and makes zero network calls.
 */
export class MockPushProvider implements IPushProviderAdapter {
  readonly mode = 'mock' as const;
  private handler: MockPushHandler | null = null;
  public dispatchedDeliveries: PushDeliveryRecord[] = [];

  async getStatus() {
    return {
      provider: this.mode,
      networkCallsPermitted: false,
      ready: true,
      description: 'Mock in-memory provider for automated test verification.',
    };
  }

  setHandler(handler: MockPushHandler | null) {
    this.handler = handler;
  }

  getSentRecords(): PushDeliveryRecord[] {
    return [...this.dispatchedDeliveries];
  }

  async dispatch(delivery: PushDeliveryRecord): Promise<PushDispatchResult> {
    this.dispatchedDeliveries.push(delivery);
    if (this.handler) {
      return this.handler(delivery);
    }
    return {
      success: true,
      status: 'succeeded',
      provider: 'mock',
      executionId: `mock-push-${delivery.deliveryId}`,
      deliveredCount: delivery.recipient.targetCountEstimate || 1,
      providerResponse: { mockDispatched: true },
    };
  }
}

export function getPushProviderAdapter(mode: PushProviderMode = 'disabled'): IPushProviderAdapter {
  switch (mode) {
    case 'manual':
      return new ManualPreparationProvider();
    case 'mock':
      return new MockPushProvider();
    case 'disabled':
    default:
      return new DisabledPushProvider();
  }
}
