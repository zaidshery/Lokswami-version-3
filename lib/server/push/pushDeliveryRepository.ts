import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import PushDelivery from '@/lib/models/PushDelivery';
import {
  createStoredPushDelivery,
  getStoredPushDeliveryById,
  listStoredPushDeliveries,
  updateStoredPushDelivery,
} from '@/lib/storage/pushDeliveriesFile';
import type { WorkflowActorRef } from '@/lib/workflow/types';
import type {
  PushAudience,
  PushDeliveryError,
  PushDeliveryFilters,
  PushDeliveryRecord,
  PushDeliveryStatus,
  PushPayload,
  PushProviderMode,
} from './pushDeliveryTypes';

export type PushDeliveryStore = 'mongo' | 'file';

export class PushDeliveryRepository {
  async resolveStore(): Promise<PushDeliveryStore> {
    if (!process.env.MONGODB_URI) return 'file';
    try {
      await connectDB();
      return 'mongo';
    } catch {
      return 'file';
    }
  }

  async createPreparedDelivery(
    params: {
      deliveryId?: string;
      preparedMessageId?: string;
      sourceStoryId?: string;
      sourceArticleId?: string;
      sourceRevision?: string | number;
      recipient: PushAudience;
      payload: PushPayload;
      provider?: PushProviderMode;
      actor: WorkflowActorRef;
    },
    store?: PushDeliveryStore
  ): Promise<PushDeliveryRecord> {
    const effectiveStore = store ?? (await this.resolveStore());
    const deliveryId = params.deliveryId || `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const inputData = {
      deliveryId,
      preparedMessageId: params.preparedMessageId || '',
      sourceStoryId: params.sourceStoryId || '',
      sourceArticleId: params.sourceArticleId || '',
      sourceRevision: params.sourceRevision || '1',
      recipient: params.recipient,
      payload: params.payload,
      status: 'prepared' as const,
      provider: params.provider || ('disabled' as const),
      attempts: 0,
      maxAttempts: 1,
      audit: {
        createdBy: params.actor,
        preparedAt: now,
      },
    };

    if (effectiveStore === 'file') {
      return createStoredPushDelivery(inputData);
    }

    const created = await PushDelivery.create(inputData);
    return created.toObject() as unknown as PushDeliveryRecord;
  }

  async getById(id: string, store?: PushDeliveryStore): Promise<PushDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    if (effectiveStore === 'file') {
      return getStoredPushDeliveryById(id);
    }

    const query = Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { deliveryId: id }] }
      : { deliveryId: id };

    const doc = await PushDelivery.findOne(query).lean();
    return doc as unknown as PushDeliveryRecord | null;
  }

  async list(filters?: PushDeliveryFilters, store?: PushDeliveryStore): Promise<PushDeliveryRecord[]> {
    const effectiveStore = store ?? (await this.resolveStore());
    if (effectiveStore === 'file') {
      return listStoredPushDeliveries(filters);
    }

    const query: Record<string, unknown> = {};
    if (filters?.sourceStoryId) query.sourceStoryId = filters.sourceStoryId;
    if (filters?.sourceArticleId) query.sourceArticleId = filters.sourceArticleId;
    if (filters?.status && filters.status !== 'all') query.status = filters.status;

    const docs = await PushDelivery.find(query).sort({ updatedAt: -1, _id: -1 }).lean();
    return docs as unknown as PushDeliveryRecord[];
  }

  async cancelDelivery(
    id: string,
    actor: WorkflowActorRef,
    reason: string = 'Cancelled by desk',
    store?: PushDeliveryStore
  ): Promise<PushDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());
    const now = new Date().toISOString();

    if (effectiveStore === 'file') {
      const existing = await getStoredPushDeliveryById(id);
      if (!existing) return null;
      if (existing.status === 'succeeded' || existing.status === 'cancelled') {
        return existing;
      }

      return updateStoredPushDelivery(id, {
        status: 'cancelled',
        audit: {
          ...existing.audit,
          cancelledBy: actor,
          cancelledAt: now,
          cancelReason: reason,
        },
      });
    }

    const query = Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { deliveryId: id }] }
      : { deliveryId: id };

    const updated = await PushDelivery.findOneAndUpdate(
      { ...query, status: { $ne: 'succeeded' } },
      {
        $set: {
          status: 'cancelled',
          'audit.cancelledBy': actor,
          'audit.cancelledAt': new Date(),
          'audit.cancelReason': reason,
          updatedAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as PushDeliveryRecord | null;
  }

  async updateDeliveryStatus(
    id: string,
    updates: {
      status: PushDeliveryStatus;
      error?: PushDeliveryError | null;
      dispatchedAt?: string | null;
      completedAt?: string | null;
    },
    store?: PushDeliveryStore
  ): Promise<PushDeliveryRecord | null> {
    const effectiveStore = store ?? (await this.resolveStore());

    if (effectiveStore === 'file') {
      return updateStoredPushDelivery(id, updates);
    }

    const query = Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { deliveryId: id }] }
      : { deliveryId: id };

    const updated = await PushDelivery.findOneAndUpdate(
      query,
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    return updated as unknown as PushDeliveryRecord | null;
  }
}

export const pushDeliveryRepository = new PushDeliveryRepository();
