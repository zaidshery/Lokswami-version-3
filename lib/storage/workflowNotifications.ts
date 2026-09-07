import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import connectDB from '@/lib/db/mongoose';
import WorkflowNotification from '@/lib/models/WorkflowNotification';
import type { WorkflowContentType } from '@/lib/workflow/types';
import type { EPaperPublicationType } from '@/lib/types/epaper';

export type WorkflowNotificationEvent =
  | 'assigned'
  | 'changes_requested'
  | 'ready_for_approval'
  | 'approved'
  | 'published'
  | 'overdue'
  | 'fast_published';

export type WorkflowNotificationRecord = {
  id: string;
  recipientId: string;
  recipientEmail: string;
  eventType: WorkflowNotificationEvent;
  contentType: WorkflowContentType;
  contentId: string;
  publicationType: EPaperPublicationType | null;
  title: string;
  message: string;
  messageHi: string;
  href: string;
  dedupeKey: string;
  readAt: string | null;
  createdAt: string;
};

export type CreateWorkflowNotificationInput = Omit<WorkflowNotificationRecord, 'id' | 'readAt' | 'createdAt'>;

const dataPath = path.resolve(process.cwd(), 'data', 'workflow-notifications.json');

function shouldUseFileStore() {
  return !process.env.MONGODB_URI?.trim();
}

function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function iso(value: unknown) {
  const parsed = value instanceof Date ? value : value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalize(source: Record<string, unknown>): WorkflowNotificationRecord {
  const mongoId = source._id && typeof (source._id as { toString?: () => string }).toString === 'function'
    ? (source._id as { toString: () => string }).toString()
    : '';
  return {
    id: String(source.id || mongoId || createId()),
    recipientId: String(source.recipientId || '').trim(),
    recipientEmail: String(source.recipientEmail || '').trim().toLowerCase(),
    eventType: String(source.eventType || 'assigned') as WorkflowNotificationEvent,
    contentType: String(source.contentType || 'article') as WorkflowContentType,
    contentId: String(source.contentId || '').trim(),
    publicationType: source.publicationType === 'emagazine' ? 'emagazine' : source.publicationType === 'epaper' ? 'epaper' : null,
    title: String(source.title || '').trim(),
    message: String(source.message || '').trim(),
    messageHi: String(source.messageHi || '').trim(),
    href: String(source.href || '').trim(),
    dedupeKey: String(source.dedupeKey || '').trim(),
    readAt: iso(source.readAt),
    createdAt: iso(source.createdAt) || new Date().toISOString(),
  };
}

async function readFileRecords() {
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath, 'utf8'));
    return Array.isArray(parsed) ? parsed.map((item) => normalize(item)) : [];
  } catch {
    return [];
  }
}

async function writeFileRecords(records: WorkflowNotificationRecord[]) {
  await writeJsonFileAtomically(dataPath, records.slice(0, 2000));
}

export async function createWorkflowNotification(input: CreateWorkflowNotificationInput) {
  const normalizedEmail = input.recipientEmail.trim().toLowerCase();
  if (!normalizedEmail || !input.contentId || !input.dedupeKey) return null;

  if (!shouldUseFileStore()) {
    try {
      await connectDB();
      const created = await WorkflowNotification.findOneAndUpdate(
        { dedupeKey: input.dedupeKey },
        { $setOnInsert: { ...input, recipientEmail: normalizedEmail, publicationType: input.publicationType || '' } },
        { upsert: true, new: true }
      ).lean();
      return normalize(created as unknown as Record<string, unknown>);
    } catch (error) {
      console.error('Workflow notification Mongo write failed, using file fallback.', error);
    }
  }

  const records = await readFileRecords();
  const existing = records.find((record) => record.dedupeKey === input.dedupeKey);
  if (existing) return existing;
  const created = normalize({ ...input, recipientEmail: normalizedEmail, id: createId(), readAt: null, createdAt: new Date() });
  await writeFileRecords([created, ...records]);
  return created;
}

export async function listWorkflowNotifications(input: {
  recipientId?: string;
  recipientEmail: string;
  unreadOnly?: boolean;
  limit?: number;
}) {
  const email = input.recipientEmail.trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, input.limit || 30));
  let records: WorkflowNotificationRecord[];

  if (!shouldUseFileStore()) {
    try {
      await connectDB();
      const query: Record<string, unknown> = {
        $or: [
          { recipientEmail: email },
          ...(input.recipientId ? [{ recipientId: input.recipientId }] : []),
        ],
      };
      if (input.unreadOnly) query.readAt = null;
      const found = await WorkflowNotification.find(query).sort({ createdAt: -1 }).limit(limit).lean();
      records = found.map((record) => normalize(record as unknown as Record<string, unknown>));
    } catch (error) {
      console.error('Workflow notification Mongo read failed, using file fallback.', error);
      records = await readFileRecords();
    }
  } else {
    records = await readFileRecords();
  }

  const visible = records.filter((record) =>
    (record.recipientEmail === email || Boolean(input.recipientId && record.recipientId === input.recipientId)) &&
    (!input.unreadOnly || !record.readAt)
  );
  return visible.slice(0, limit);
}

export async function markWorkflowNotificationsRead(input: {
  recipientId?: string;
  recipientEmail: string;
  ids?: string[];
  all?: boolean;
}) {
  const email = input.recipientEmail.trim().toLowerCase();
  const ids = Array.from(new Set((input.ids || []).map((id) => id.trim()).filter(Boolean))).slice(0, 100);
  const now = new Date();

  if (!shouldUseFileStore()) {
    try {
      await connectDB();
      const recipient = { $or: [{ recipientEmail: email }, ...(input.recipientId ? [{ recipientId: input.recipientId }] : [])] };
      const query = input.all ? recipient : { $and: [recipient, { _id: { $in: ids } }] };
      const result = await WorkflowNotification.updateMany(query, { $set: { readAt: now } });
      return result.modifiedCount;
    } catch (error) {
      console.error('Workflow notification Mongo update failed, using file fallback.', error);
    }
  }

  const records = await readFileRecords();
  let changed = 0;
  const updated = records.map((record) => {
    const belongs = record.recipientEmail === email || Boolean(input.recipientId && record.recipientId === input.recipientId);
    const selected = input.all || ids.includes(record.id);
    if (!belongs || !selected || record.readAt) return record;
    changed += 1;
    return { ...record, readAt: now.toISOString() };
  });
  await writeFileRecords(updated);
  return changed;
}
