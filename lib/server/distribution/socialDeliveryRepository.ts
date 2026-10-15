import crypto from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import SocialDelivery from '@/lib/models/SocialDelivery';
import {
  createStoredSocialDelivery,
  getStoredSocialDeliveryByFingerprint,
  getStoredSocialDeliveryById,
  listStoredSocialDeliveries,
  updateStoredSocialDelivery,
} from '@/lib/storage/socialDeliveriesFile';
import type { WorkflowActorRef } from '@/lib/workflow/types';
import type {
  SocialDeliveryError,
  SocialDeliveryFilters,
  SocialDeliveryPayloadSnapshot,
  SocialDeliveryProviderResponse,
  SocialDeliveryRecord,
  SocialDeliveryStatus,
} from './socialDeliveryTypes';
import type { SocialAutomationProvider, SocialPlatform } from '@/lib/content/newsroomPublishing';

export type SocialDeliveryStore = 'mongo' | 'file';

export function computePayloadFingerprint(snapshot: SocialDeliveryPayloadSnapshot): string {
  const normalized = {
    caption: (snapshot.caption || '').trim(),
    hashtags: (snapshot.hashtags || '').trim(),
    thumbnailUrl: (snapshot.thumbnailUrl || '').trim(),
    videoUrl: (snapshot.videoUrl || '').trim(),
    scheduledAt: snapshot.scheduledAt || null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function buildIdempotencyKey(
  sourceStoryId: string,
  platform: string,
  fingerprint: string
): string {
  return `del-${sourceStoryId}-${platform}-${fingerprint.slice(0, 16)}`;
}

export class SocialDeliveryRepository {
  async resolveStore(): Promise<SocialDeliveryStore> {
    if (!process.env.MONGODB_URI) return 'file';
    try {
      await connectDB();
      return 'mongo';
    } catch {
      return 'file';
    }
  }

  async findOrCreateDelivery(
    params: {
      socialPostId: string;
      sourceStoryId: string;
      sourceArticleId?: string;
      sourceRevision?: string | number;
      platform: SocialPlatform;
      providerMode: SocialAutomationProvider | 'mock';
      payloadSnapshot: SocialDeliveryPayloadSnapshot;
      requestedBy?: WorkflowActorRef | null;
    },
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord> {
    const effectiveStore = store ?? (await this.resolveStore());
    const fingerprint = computePayloadFingerprint(params.payloadSnapshot);
    const idempotencyKey = buildIdempotencyKey(
      params.sourceStoryId,
      params.platform,
      fingerprint
    );

    if (effectiveStore === 'file') {
      const existing = await getStoredSocialDeliveryByFingerprint(
        params.sourceStoryId,
        params.platform,
        fingerprint
      );
      if (existing) return existing;

      return createStoredSocialDelivery({
        socialPostId: params.socialPostId,
        contentId: params.sourceStoryId,
        contentType: 'story',
        sourceStoryId: params.sourceStoryId,
        sourceArticleId: params.sourceArticleId || '',
        sourceRevision: params.sourceRevision,
        platform: params.platform,
        providerMode: params.providerMode,
        status: 'pending',
        payloadSnapshot: params.payloadSnapshot,
        payloadFingerprint: fingerprint,
        idempotencyKey,
        attempts: 0,
        maxAttempts: 3,
        reconciliationRequired: false,
        requestedBy: params.requestedBy,
      });
    }

    // Mongo
    const existing = await SocialDelivery.findOne({
      sourceStoryId: params.sourceStoryId,
      platform: params.platform,
      payloadFingerprint: fingerprint,
    }).lean();

    if (existing) {
      return existing as unknown as SocialDeliveryRecord;
    }

    try {
      const deliveryId = new Types.ObjectId().toString();
      const created = await SocialDelivery.create({
        deliveryId,
        socialPostId: params.socialPostId,
        contentId: params.sourceStoryId,
        contentType: 'story',
        sourceStoryId: params.sourceStoryId,
        sourceArticleId: params.sourceArticleId || '',
        sourceRevision: params.sourceRevision,
        platform: params.platform,
        providerMode: params.providerMode,
        status: 'pending',
        payloadSnapshot: params.payloadSnapshot,
        payloadFingerprint: fingerprint,
        idempotencyKey,
        attempts: 0,
        maxAttempts: 3,
        reconciliationRequired: false,
        requestedBy: params.requestedBy,
      });
      return created.toObject() as unknown as SocialDeliveryRecord;
    } catch (err: unknown) {
      // If duplicate key error due to concurrent creation
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
        const found = await SocialDelivery.findOne({
          sourceStoryId: params.sourceStoryId,
          platform: params.platform,
          payloadFingerprint: fingerprint,
        }).lean();
        if (found) return found as unknown as SocialDeliveryRecord;
      }
      throw err;
    }
  }

  async atomicClaim(
    deliveryId: string,
    actorId: string,
    store?: SocialDeliveryStore
  ): Promise<{
    claimed: boolean;
    delivery: SocialDeliveryRecord | null;
    claimId: string;
  }> {
    const effectiveStore = store ?? (await this.resolveStore());
    const claimId = crypto.randomUUID();
    const now = new Date();
    const leaseExpires = new Date(now.getTime() + 60_000); // 60s lease

    if (effectiveStore === 'file') {
      const existing = await getStoredSocialDeliveryById(deliveryId);
      if (!existing) {
        return { claimed: false, delivery: null, claimId: '' };
      }

      // Architecture Principle 6.4/6.7: Fail closed for live external webhooks without Mongo distributed locks
      if (
        process.env.NODE_ENV !== 'test' &&
        (existing.providerMode === 'n8n' || existing.providerMode === 'generic_webhook')
      ) {
        throw new Error(
          'FILE_STORE_LIVE_DISPATCH_UNSUPPORTED: Distributed outbound claims require MongoDB. Live webhooks are disabled in file-store mode.'
        );
      }

      // Allow for mock and manual in file mode
      if (
        (existing.status === 'pending' || existing.status === 'retryable_failed') &&
        existing.attempts < existing.maxAttempts
      ) {
        const updated = await updateStoredSocialDelivery(deliveryId, {
          status: 'dispatching',
          attempts: existing.attempts + 1,
          dispatchedAt: now.toISOString(),
          claimLease: {
            claimId,
            claimedAt: now.toISOString(),
            leaseExpiresAt: leaseExpires.toISOString(),
            claimant: actorId,
          },
        });
        return { claimed: true, delivery: updated, claimId };
      }

      return { claimed: false, delivery: existing, claimId: '' };
    }

    // Mongo atomic findOneAndUpdate
    const claimedDoc = await SocialDelivery.findOneAndUpdate(
      {
        $or: [{ _id: Types.ObjectId.isValid(deliveryId) ? deliveryId : undefined }, { deliveryId }].filter(Boolean),
        status: { $in: ['pending', 'retryable_failed'] },
        attempts: { $lt: 3 },
      },
      {
        $set: {
          status: 'dispatching',
          dispatchedAt: now,
          'claimLease.claimId': claimId,
          'claimLease.claimedAt': now,
          'claimLease.leaseExpiresAt': leaseExpires,
          'claimLease.claimant': actorId,
        },
        $inc: { attempts: 1 },
      },
      { new: true }
    ).lean();

    if (claimedDoc) {
      return {
        claimed: true,
        delivery: claimedDoc as unknown as SocialDeliveryRecord,
        claimId,
      };
    }

    // If claim failed, load current state
    const current = await this.getById(deliveryId, effectiveStore);
    return { claimed: false, delivery: current, claimId: '' };
  }

  async recordSuccess(
    deliveryId: string,
    claimId: string,
    response: SocialDeliveryProviderResponse,
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    const now = new Date();

    if (effectiveStore === 'file') {
      return updateStoredSocialDelivery(deliveryId, {
        status: 'succeeded',
        completedAt: now.toISOString(),
        providerResponse: response,
        reconciliationRequired: false,
        lastError: null,
      });
    }

    const updated = await SocialDelivery.findOneAndUpdate(
      {
        $or: [{ _id: Types.ObjectId.isValid(deliveryId) ? deliveryId : undefined }, { deliveryId }].filter(Boolean),
        'claimLease.claimId': claimId,
      },
      {
        $set: {
          status: 'succeeded',
          completedAt: now,
          providerResponse: response,
          reconciliationRequired: false,
          lastError: null,
          updatedAt: now,
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as SocialDeliveryRecord | null;
  }

  async recordFailure(
    deliveryId: string,
    claimId: string,
    error: SocialDeliveryError,
    shouldRetry: boolean,
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    const nextStatus: SocialDeliveryStatus = shouldRetry ? 'retryable_failed' : 'failed';
    const now = new Date();

    if (effectiveStore === 'file') {
      return updateStoredSocialDelivery(deliveryId, {
        status: nextStatus,
        lastError: { ...error, timestamp: now.toISOString() },
      });
    }

    const updated = await SocialDelivery.findOneAndUpdate(
      {
        $or: [{ _id: Types.ObjectId.isValid(deliveryId) ? deliveryId : undefined }, { deliveryId }].filter(Boolean),
        'claimLease.claimId': claimId,
      },
      {
        $set: {
          status: nextStatus,
          lastError: { ...error, timestamp: now },
          updatedAt: now,
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as SocialDeliveryRecord | null;
  }

  async recordReconciliationRequired(
    deliveryId: string,
    claimId: string,
    error: SocialDeliveryError,
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    const now = new Date();

    if (effectiveStore === 'file') {
      return updateStoredSocialDelivery(deliveryId, {
        status: 'retryable_failed',
        reconciliationRequired: true,
        lastError: { ...error, timestamp: now.toISOString() },
      });
    }

    const updated = await SocialDelivery.findOneAndUpdate(
      {
        $or: [{ _id: Types.ObjectId.isValid(deliveryId) ? deliveryId : undefined }, { deliveryId }].filter(Boolean),
        'claimLease.claimId': claimId,
      },
      {
        $set: {
          status: 'retryable_failed',
          reconciliationRequired: true,
          lastError: { ...error, timestamp: now },
          updatedAt: now,
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as SocialDeliveryRecord | null;
  }

  async recordBlocked(
    deliveryId: string,
    reason: string,
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    const now = new Date();

    if (effectiveStore === 'file') {
      return updateStoredSocialDelivery(deliveryId, {
        status: 'blocked',
        lastError: {
          category: 'source_ineligible',
          message: reason,
          timestamp: now.toISOString(),
        },
      });
    }

    const updated = await SocialDelivery.findOneAndUpdate(
      {
        $or: [{ _id: Types.ObjectId.isValid(deliveryId) ? deliveryId : undefined }, { deliveryId }].filter(Boolean),
      },
      {
        $set: {
          status: 'blocked',
          lastError: {
            category: 'source_ineligible',
            message: reason,
            timestamp: now,
          },
          updatedAt: now,
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as SocialDeliveryRecord | null;
  }

  async reconcile(
    deliveryId: string,
    resolution: {
      outcome: 'succeeded' | 'failed';
      externalUrl?: string;
      externalPostId?: string;
      note?: string;
    },
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    const now = new Date();
    const nextStatus: SocialDeliveryStatus = resolution.outcome === 'succeeded' ? 'succeeded' : 'failed';

    if (effectiveStore === 'file') {
      return updateStoredSocialDelivery(deliveryId, {
        status: nextStatus,
        reconciliationRequired: false,
        ...(resolution.outcome === 'succeeded'
          ? {
              completedAt: now.toISOString(),
              providerResponse: {
                externalUrl: resolution.externalUrl || '',
                externalPostId: resolution.externalPostId || '',
              },
            }
          : {
              lastError: {
                category: 'persistence_reconciliation',
                message: resolution.note || 'Manually reconciled as failed',
                timestamp: now.toISOString(),
              },
            }),
      });
    }

    const updated = await SocialDelivery.findOneAndUpdate(
      {
        $or: [{ _id: Types.ObjectId.isValid(deliveryId) ? deliveryId : undefined }, { deliveryId }].filter(Boolean),
      },
      {
        $set: {
          status: nextStatus,
          reconciliationRequired: false,
          updatedAt: now,
          ...(resolution.outcome === 'succeeded'
            ? {
                completedAt: now,
                'providerResponse.externalUrl': resolution.externalUrl || '',
                'providerResponse.externalPostId': resolution.externalPostId || '',
              }
            : {
                lastError: {
                  category: 'persistence_reconciliation',
                  message: resolution.note || 'Manually reconciled as failed',
                  timestamp: now,
                },
              }),
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as SocialDeliveryRecord | null;
  }

  async retry(
    deliveryId: string,
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    const existing = await this.getById(deliveryId, effectiveStore);
    if (!existing) return null;

    if (existing.status === 'dispatching') {
      throw new Error('DELIVERY_IN_FLIGHT: Cannot retry a delivery currently in flight.');
    }

    if (existing.attempts >= existing.maxAttempts) {
      throw new Error(
        `MAX_ATTEMPTS_REACHED: Delivery has reached maximum attempts (${existing.maxAttempts}).`
      );
    }

    if (effectiveStore === 'file') {
      return updateStoredSocialDelivery(deliveryId, {
        status: 'retryable_failed',
      });
    }

    const updated = await SocialDelivery.findOneAndUpdate(
      {
        $or: [{ _id: Types.ObjectId.isValid(deliveryId) ? deliveryId : undefined }, { deliveryId }].filter(Boolean),
        status: { $in: ['failed', 'retryable_failed'] },
      },
      {
        $set: {
          status: 'retryable_failed',
          updatedAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as SocialDeliveryRecord | null;
  }

  async getById(id: string, store?: SocialDeliveryStore): Promise<SocialDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    if (effectiveStore === 'file') return getStoredSocialDeliveryById(id);
    if (!Types.ObjectId.isValid(id)) {
      const byDeliveryId = await SocialDelivery.findOne({ deliveryId: id }).lean();
      return byDeliveryId as unknown as SocialDeliveryRecord | null;
    }
    const doc = await SocialDelivery.findOne({
      $or: [{ _id: id }, { deliveryId: id }],
    }).lean();
    return doc as unknown as SocialDeliveryRecord | null;
  }

  async list(
    filters?: SocialDeliveryFilters,
    store?: SocialDeliveryStore
  ): Promise<SocialDeliveryRecord[]> {
    const effectiveStore = store ?? (await this.resolveStore());
    if (effectiveStore === 'file') return listStoredSocialDeliveries(filters);

    const query: Record<string, unknown> = {};
    if (filters?.socialPostId) query.socialPostId = filters.socialPostId;
    if (filters?.storyId) query.sourceStoryId = filters.storyId;
    if (filters?.articleId) query.sourceArticleId = filters.articleId;
    if (filters?.platform && filters.platform !== 'all') query.platform = filters.platform;
    if (filters?.status && filters.status !== 'all') query.status = filters.status;
    if (filters?.reconciliationRequired !== undefined) {
      query.reconciliationRequired = filters.reconciliationRequired;
    }

    const docs = await SocialDelivery.find(query).sort({ updatedAt: -1, _id: -1 }).lean();
    return docs as unknown as SocialDeliveryRecord[];
  }
}

export const socialDeliveryRepository = new SocialDeliveryRepository();
