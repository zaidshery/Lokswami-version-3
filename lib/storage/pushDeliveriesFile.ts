import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import type { WorkflowActorRef } from '@/lib/workflow/types';
import type {
  PushDeliveryFilters,
  PushDeliveryRecord,
  PushDeliveryStatus,
  PushProviderMode,
} from '@/lib/server/push/pushDeliveryTypes';

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'push-deliveries.json');

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeOptionalDateString(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeActor(value: unknown): WorkflowActorRef | null {
  const source =
    typeof value === 'object' && value ? (value as Record<string, unknown>) : null;
  if (!source) return null;
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const email = typeof source.email === 'string' ? source.email.trim() : '';
  const role = source.role;
  if (!id || !name || !email || typeof role !== 'string') return null;
  return { id, name, email, role: role as WorkflowActorRef['role'] };
}

function normalizeStatus(value: unknown): PushDeliveryStatus {
  const valid: PushDeliveryStatus[] = [
    'prepared',
    'pending',
    'dispatching',
    'succeeded',
    'failed',
    'cancelled',
  ];
  const s = String(value || '').trim() as PushDeliveryStatus;
  return valid.includes(s) ? s : 'prepared';
}

function normalizeProvider(value: unknown): PushProviderMode {
  const valid: PushProviderMode[] = ['disabled', 'manual', 'mock'];
  const s = String(value || '').trim() as PushProviderMode;
  return valid.includes(s) ? s : 'disabled';
}

function normalizePushDelivery(input: unknown): PushDeliveryRecord | null {
  const source =
    typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const id = typeof source._id === 'string' && source._id.trim() ? source._id.trim() : createId();
  const deliveryId =
    typeof source.deliveryId === 'string' && source.deliveryId.trim()
      ? source.deliveryId.trim()
      : id;

  const rawPayload =
    typeof source.payload === 'object' && source.payload
      ? (source.payload as Record<string, unknown>)
      : {};
  const rawRecipient =
    typeof source.recipient === 'object' && source.recipient
      ? (source.recipient as Record<string, unknown>)
      : {};
  const rawAudit =
    typeof source.audit === 'object' && source.audit
      ? (source.audit as Record<string, unknown>)
      : {};

  const createdBy = normalizeActor(rawAudit.createdBy);
  if (!createdBy) return null;

  return {
    _id: id,
    deliveryId,
    preparedMessageId:
      typeof source.preparedMessageId === 'string' ? source.preparedMessageId.trim() : '',
    sourceStoryId:
      typeof source.sourceStoryId === 'string' ? source.sourceStoryId.trim() : '',
    sourceArticleId:
      typeof source.sourceArticleId === 'string' ? source.sourceArticleId.trim() : '',
    sourceRevision: source.sourceRevision as string | number | undefined,
    recipient: {
      type: rawRecipient.type === 'test_recipients' ? 'test_recipients' : 'all_subscribers',
      label:
        typeof rawRecipient.label === 'string'
          ? rawRecipient.label
          : 'All Opted-in Readers (Future Foundation)',
      targetCountEstimate:
        typeof rawRecipient.targetCountEstimate === 'number'
          ? rawRecipient.targetCountEstimate
          : 0,
      filter:
        typeof rawRecipient.filter === 'object' && rawRecipient.filter
          ? (rawRecipient.filter as Record<string, unknown>)
          : undefined,
    },
    payload: {
      title: typeof rawPayload.title === 'string' ? rawPayload.title : '',
      body: typeof rawPayload.body === 'string' ? rawPayload.body : '',
      deepLink: typeof rawPayload.deepLink === 'string' ? rawPayload.deepLink : '',
      imageUrl: typeof rawPayload.imageUrl === 'string' ? rawPayload.imageUrl : '',
      priority: rawPayload.priority === 'high' ? 'high' : 'normal',
      payloadFingerprint:
        typeof rawPayload.payloadFingerprint === 'string' ? rawPayload.payloadFingerprint : '',
    },
    status: normalizeStatus(source.status),
    provider: normalizeProvider(source.provider),
    attempts: typeof source.attempts === 'number' ? Math.max(0, source.attempts) : 0,
    maxAttempts: typeof source.maxAttempts === 'number' ? Math.max(1, source.maxAttempts) : 1,
    error:
      typeof source.error === 'object' && source.error
        ? (source.error as PushDeliveryRecord['error'])
        : null,
    audit: {
      createdBy,
      preparedAt:
        normalizeOptionalDateString(rawAudit.preparedAt) || new Date().toISOString(),
      cancelledBy: normalizeActor(rawAudit.cancelledBy),
      cancelledAt: normalizeOptionalDateString(rawAudit.cancelledAt),
      cancelReason:
        typeof rawAudit.cancelReason === 'string' ? rawAudit.cancelReason.trim() : undefined,
    },
    dispatchedAt: normalizeOptionalDateString(source.dispatchedAt),
    completedAt: normalizeOptionalDateString(source.completedAt),
    createdAt: normalizeOptionalDateString(source.createdAt) || new Date().toISOString(),
    updatedAt: normalizeOptionalDateString(source.updatedAt) || new Date().toISOString(),
  };
}

async function readAllPushDeliveries(): Promise<PushDeliveryRecord[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => normalizePushDelivery(entry))
          .filter((entry): entry is PushDeliveryRecord => Boolean(entry))
      : [];
  } catch {
    return [];
  }
}

async function writeAllPushDeliveries(deliveries: PushDeliveryRecord[]) {
  await writeJsonFileAtomically(dataPath, deliveries);
}

export async function listStoredPushDeliveries(filters?: PushDeliveryFilters) {
  const all = await readAllPushDeliveries();
  return all
    .filter((d) => (filters?.sourceStoryId ? d.sourceStoryId === filters.sourceStoryId : true))
    .filter((d) => (filters?.sourceArticleId ? d.sourceArticleId === filters.sourceArticleId : true))
    .filter((d) => (filters?.status && filters.status !== 'all' ? d.status === filters.status : true))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getStoredPushDeliveryById(id: string) {
  const all = await readAllPushDeliveries();
  return all.find((entry) => entry._id === id || entry.deliveryId === id) || null;
}

export async function createStoredPushDelivery(
  input: Omit<PushDeliveryRecord, '_id' | 'deliveryId' | 'createdAt' | 'updatedAt'> & {
    _id?: string;
    deliveryId?: string;
  }
) {
  const all = await readAllPushDeliveries();
  const id = input._id || createId();
  const deliveryId = input.deliveryId || id;
  const now = new Date().toISOString();

  const record: PushDeliveryRecord = {
    ...input,
    _id: id,
    deliveryId,
    createdAt: now,
    updatedAt: now,
  };

  all.push(record);
  await writeAllPushDeliveries(all);
  return record;
}

export async function updateStoredPushDelivery(
  id: string,
  updates: Partial<PushDeliveryRecord>
) {
  const all = await readAllPushDeliveries();
  const index = all.findIndex((entry) => entry._id === id || entry.deliveryId === id);
  if (index === -1) return null;

  const current = all[index];
  const next: PushDeliveryRecord = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  all[index] = next;
  await writeAllPushDeliveries(all);
  return next;
}
