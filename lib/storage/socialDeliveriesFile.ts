import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import {
  normalizeSocialAutomationProvider,
  normalizeSocialPlatform,
} from '@/lib/content/newsroomPublishing';
import type { WorkflowActorRef } from '@/lib/workflow/types';
import type {
  SocialDeliveryFilters,
  SocialDeliveryRecord,
  SocialDeliveryStatus,
} from '@/lib/server/distribution/socialDeliveryTypes';

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'social-deliveries.json');

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

function normalizeStatus(value: unknown): SocialDeliveryStatus {
  const valid: SocialDeliveryStatus[] = [
    'pending',
    'dispatching',
    'succeeded',
    'retryable_failed',
    'failed',
    'blocked',
    'cancelled',
  ];
  const s = String(value || '').trim() as SocialDeliveryStatus;
  return valid.includes(s) ? s : 'pending';
}

function normalizeSocialDelivery(input: unknown): SocialDeliveryRecord | null {
  const source =
    typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const id = typeof source._id === 'string' && source._id.trim() ? source._id.trim() : createId();
  const deliveryId = typeof source.deliveryId === 'string' && source.deliveryId.trim() ? source.deliveryId.trim() : id;
  const socialPostId = typeof source.socialPostId === 'string' ? source.socialPostId.trim() : '';
  const sourceStoryId = typeof source.sourceStoryId === 'string' ? source.sourceStoryId.trim() : '';
  const contentId = typeof source.contentId === 'string' ? source.contentId.trim() : sourceStoryId;
  const platform = normalizeSocialPlatform(source.platform);

  if (!sourceStoryId || !platform) return null;

  const rawSnapshot =
    typeof source.payloadSnapshot === 'object' && source.payloadSnapshot
      ? (source.payloadSnapshot as Record<string, unknown>)
      : {};

  return {
    _id: id,
    deliveryId,
    socialPostId,
    contentId,
    contentType: source.contentType === 'article' ? 'article' : 'story',
    sourceStoryId,
    sourceArticleId: typeof source.sourceArticleId === 'string' ? source.sourceArticleId.trim() : '',
    sourceRevision: source.sourceRevision as string | number | undefined,
    platform,
    providerMode: source.providerMode === 'mock' ? 'mock' : normalizeSocialAutomationProvider(source.providerMode),
    status: normalizeStatus(source.status),
    payloadSnapshot: {
      caption: typeof rawSnapshot.caption === 'string' ? rawSnapshot.caption : '',
      hashtags: typeof rawSnapshot.hashtags === 'string' ? rawSnapshot.hashtags : '',
      thumbnailUrl: typeof rawSnapshot.thumbnailUrl === 'string' ? rawSnapshot.thumbnailUrl : '',
      videoUrl: typeof rawSnapshot.videoUrl === 'string' ? rawSnapshot.videoUrl : '',
      scheduledAt: normalizeOptionalDateString(rawSnapshot.scheduledAt),
    },
    payloadFingerprint: typeof source.payloadFingerprint === 'string' ? source.payloadFingerprint : '',
    idempotencyKey: typeof source.idempotencyKey === 'string' ? source.idempotencyKey : `del-${id}`,
    attempts: typeof source.attempts === 'number' ? Math.max(0, source.attempts) : 0,
    maxAttempts: typeof source.maxAttempts === 'number' ? Math.max(1, source.maxAttempts) : 3,
    claimLease:
      typeof source.claimLease === 'object' && source.claimLease
        ? {
            claimId: String((source.claimLease as Record<string, unknown>).claimId || ''),
            claimedAt: normalizeOptionalDateString((source.claimLease as Record<string, unknown>).claimedAt),
            leaseExpiresAt: normalizeOptionalDateString((source.claimLease as Record<string, unknown>).leaseExpiresAt),
            claimant: String((source.claimLease as Record<string, unknown>).claimant || ''),
          }
        : undefined,
    providerResponse:
      typeof source.providerResponse === 'object' && source.providerResponse
        ? (source.providerResponse as SocialDeliveryRecord['providerResponse'])
        : undefined,
    lastError:
      typeof source.lastError === 'object' && source.lastError
        ? (source.lastError as SocialDeliveryRecord['lastError'])
        : null,
    reconciliationRequired: Boolean(source.reconciliationRequired),
    requestedBy: normalizeActor(source.requestedBy),
    dispatchedAt: normalizeOptionalDateString(source.dispatchedAt),
    completedAt: normalizeOptionalDateString(source.completedAt),
    createdAt: normalizeOptionalDateString(source.createdAt) || new Date().toISOString(),
    updatedAt: normalizeOptionalDateString(source.updatedAt) || new Date().toISOString(),
  };
}

async function readAllSocialDeliveries(): Promise<SocialDeliveryRecord[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => normalizeSocialDelivery(entry))
          .filter((entry): entry is SocialDeliveryRecord => Boolean(entry))
      : [];
  } catch {
    return [];
  }
}

async function writeAllSocialDeliveries(deliveries: SocialDeliveryRecord[]) {
  await writeJsonFileAtomically(dataPath, deliveries);
}

export async function listStoredSocialDeliveries(filters?: SocialDeliveryFilters) {
  const all = await readAllSocialDeliveries();
  return all
    .filter((d) => (filters?.socialPostId ? d.socialPostId === filters.socialPostId : true))
    .filter((d) => (filters?.storyId ? d.sourceStoryId === filters.storyId : true))
    .filter((d) => (filters?.articleId ? d.sourceArticleId === filters.articleId : true))
    .filter((d) => (filters?.platform && filters.platform !== 'all' ? d.platform === filters.platform : true))
    .filter((d) => (filters?.status && filters.status !== 'all' ? d.status === filters.status : true))
    .filter((d) =>
      filters?.reconciliationRequired !== undefined
        ? d.reconciliationRequired === filters.reconciliationRequired
        : true
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getStoredSocialDeliveryById(id: string) {
  const all = await readAllSocialDeliveries();
  return all.find((entry) => entry._id === id || entry.deliveryId === id) || null;
}

export async function getStoredSocialDeliveryByIdempotencyKey(key: string) {
  const all = await readAllSocialDeliveries();
  return all.find((entry) => entry.idempotencyKey === key) || null;
}

export async function getStoredSocialDeliveryByFingerprint(
  sourceStoryId: string,
  platform: string,
  payloadFingerprint: string
) {
  const all = await readAllSocialDeliveries();
  return (
    all.find(
      (entry) =>
        entry.sourceStoryId === sourceStoryId &&
        entry.platform === platform &&
        entry.payloadFingerprint === payloadFingerprint
    ) || null
  );
}

export async function createStoredSocialDelivery(
  input: Omit<SocialDeliveryRecord, '_id' | 'deliveryId' | 'createdAt' | 'updatedAt'> & {
    _id?: string;
    deliveryId?: string;
  }
) {
  const all = await readAllSocialDeliveries();
  const id = input._id || createId();
  const deliveryId = input.deliveryId || id;
  const now = new Date().toISOString();

  const record: SocialDeliveryRecord = {
    ...input,
    _id: id,
    deliveryId,
    createdAt: now,
    updatedAt: now,
  };

  all.push(record);
  await writeAllSocialDeliveries(all);
  return record;
}

export async function updateStoredSocialDelivery(
  id: string,
  updates: Partial<SocialDeliveryRecord>
) {
  const all = await readAllSocialDeliveries();
  const index = all.findIndex((entry) => entry._id === id || entry.deliveryId === id);
  if (index === -1) return null;

  const current = all[index];
  const next: SocialDeliveryRecord = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  all[index] = next;
  await writeAllSocialDeliveries(all);
  return next;
}
