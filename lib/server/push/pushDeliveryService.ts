import type { WorkflowActorRef } from '@/lib/workflow/types';
import {
  pushDeliveryRepository,
  type PushDeliveryRepository,
} from './pushDeliveryRepository';
import {
  pushSafetyService,
  type PushSafetyService,
} from './pushSafetyService';
import {
  getPushProviderAdapter,
  type IPushProviderAdapter,
} from './pushProviderAdapter';
import type {
  PushDeliveryFilters,
  PushDeliveryRecord,
  PushProviderMode,
} from './pushDeliveryTypes';

export type PushPublicProviderStatus = {
  provider: PushProviderMode;
  enabled: boolean;
  label: string;
  networkAllowed: boolean;
};

export class PushDeliveryService {
  constructor(
    private readonly repo: PushDeliveryRepository = pushDeliveryRepository,
    private readonly safety: PushSafetyService = pushSafetyService,
    private readonly providerMode: PushProviderMode = 'disabled'
  ) {}

  getPublicProviderStatus(): PushPublicProviderStatus {
    return {
      provider: this.providerMode,
      enabled: false,
      label:
        this.providerMode === 'mock'
          ? 'Mock Provider (Test Only)'
          : this.providerMode === 'manual'
            ? 'Manual Preparation Only'
            : 'Push delivery disabled / Manual preparation only',
      networkAllowed: false,
    };
  }

  async prepareAlert(
    input: {
      title: string;
      body: string;
      deepLink: string;
      imageUrl?: string;
      priority?: 'high' | 'normal';
      audienceType?: 'all_subscribers' | 'test_recipients';
      sourceStoryId?: string;
      sourceArticleId?: string;
    },
    actor: WorkflowActorRef
  ): Promise<PushDeliveryRecord> {
    const validation = await this.safety.validatePushPreparation({
      ...input,
      actor,
      provider: this.providerMode,
    });

    if (!validation.valid) {
      throw new Error(`PUSH_PREPARATION_FAILED: ${validation.reason}`);
    }

    return this.repo.createPreparedDelivery({
      sourceStoryId: input.sourceStoryId,
      sourceArticleId: input.sourceArticleId,
      sourceRevision: validation.sourceRevision,
      recipient: validation.sanitizedRecipient,
      payload: validation.sanitizedPayload,
      provider: this.providerMode,
      actor,
    });
  }

  async cancelAlert(
    deliveryId: string,
    reason: string,
    actor: WorkflowActorRef
  ): Promise<PushDeliveryRecord | null> {
    const existing = await this.repo.getById(deliveryId);
    if (!existing) {
      throw new Error('PUSH_DELIVERY_NOT_FOUND: Alert was not found.');
    }

    if (existing.status === 'cancelled') {
      throw new Error(`Cannot cancel push alert in cancelled status.`);
    }

    return this.repo.cancelDelivery(deliveryId, actor, reason);
  }

  async attemptDelivery(
    deliveryId: string,
    adapter?: IPushProviderAdapter
  ): Promise<{
    delivery: PushDeliveryRecord | null;
    result: { status: string; message: string; provider: string };
  }> {
    const delivery = await this.repo.getById(deliveryId);
    if (!delivery) {
      throw new Error('PUSH_DELIVERY_NOT_FOUND: Alert was not found.');
    }

    if (delivery.status === 'cancelled') {
      throw new Error('PUSH_DELIVERY_CANCELLED: Cannot deliver a cancelled alert.');
    }

    const effectiveAdapter = adapter ?? getPushProviderAdapter(this.providerMode);
    const dispatchResult = await effectiveAdapter.dispatch(delivery);

    if (dispatchResult.status === 'disabled') {
      const updated = await this.repo.updateDeliveryStatus(deliveryId, {
        status: 'failed',
        error: {
          category: 'provider_disabled',
          message: dispatchResult.error?.message || 'Push provider disabled by policy.',
        },
      });

      return {
        delivery: updated,
        result: {
          status: 'disabled',
          message: dispatchResult.error?.message || 'Push provider is disabled.',
          provider: dispatchResult.provider,
        },
      };
    }

    if (dispatchResult.status === 'manual') {
      const updated = await this.repo.updateDeliveryStatus(deliveryId, {
        status: 'prepared',
      });
      return {
        delivery: updated,
        result: {
          status: 'manual',
          message: 'Alert prepared for manual delivery review. No network request made.',
          provider: 'manual',
        },
      };
    }

    if (dispatchResult.status === 'succeeded') {
      const updated = await this.repo.updateDeliveryStatus(deliveryId, {
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });
      return {
        delivery: updated,
        result: {
          status: 'succeeded',
          message: 'Push alert mock delivery succeeded.',
          provider: 'mock',
        },
      };
    }

    const updated = await this.repo.updateDeliveryStatus(deliveryId, {
      status: 'failed',
      error: {
        category: 'internal',
        message: dispatchResult.error?.message || 'Delivery failed',
      },
    });

    return {
      delivery: updated,
      result: {
        status: 'failed',
        message: dispatchResult.error?.message || 'Delivery failed',
        provider: dispatchResult.provider,
      },
    };
  }

  async listAlerts(filters?: PushDeliveryFilters): Promise<PushDeliveryRecord[]> {
    return this.repo.list(filters);
  }

  async getAlertById(deliveryId: string): Promise<PushDeliveryRecord | null> {
    return this.repo.getById(deliveryId);
  }
}

export const pushDeliveryService = new PushDeliveryService();

export async function prepareAlert(params: {
  actor: WorkflowActorRef;
  payload: {
    title: string;
    body: string;
    deepLink: string;
    imageUrl?: string;
    priority?: 'high' | 'normal';
  };
  recipient?: {
    audience?: 'all_subscribers' | 'test_recipients';
  };
  sourceStoryId?: string;
  sourceArticleId?: string;
}): Promise<{
  success: boolean;
  alert?: PushDeliveryRecord;
  error?: string;
}> {
  try {
    const alert = await pushDeliveryService.prepareAlert(
      {
        ...params.payload,
        audienceType: params.recipient?.audience,
        sourceStoryId: params.sourceStoryId,
        sourceArticleId: params.sourceArticleId,
      },
      params.actor
    );
    return { success: true, alert };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown preparation failure',
    };
  }
}

export async function cancelAlert(params: {
  actor: WorkflowActorRef;
  deliveryId: string;
  reason?: string;
}): Promise<{
  success: boolean;
  alert?: PushDeliveryRecord | null;
  error?: string;
}> {
  try {
    const alert = await pushDeliveryService.cancelAlert(
      params.deliveryId,
      params.reason || 'Cancelled by newsroom actor',
      params.actor
    );
    return { success: true, alert };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown cancellation failure',
    };
  }
}

export async function listAlerts(filters?: PushDeliveryFilters): Promise<PushDeliveryRecord[]> {
  return pushDeliveryService.listAlerts(filters);
}

export async function getAlertById(deliveryId: string): Promise<PushDeliveryRecord | null> {
  return pushDeliveryService.getAlertById(deliveryId);
}
