import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import connectDB from '@/lib/db/mongoose';
import LeadershipReportAlertNotification from '@/lib/models/LeadershipReportAlertNotification';

export type LeadershipReportAlertNotificationHistoryEntry = {
  id: string;
  status: 'sent' | 'failed';
  alertCount: number;
  alertIds: string[];
  reason: string;
  emailRecipients: string[];
  webhookTargets: number;
  acknowledgedAt: string | null;
  acknowledgedByEmail: string | null;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  createdAt: string;
};

type CreateLeadershipReportAlertNotificationInput = Omit<
  LeadershipReportAlertNotificationHistoryEntry,
  'id' | 'createdAt' | 'acknowledgedAt' | 'acknowledgedByEmail' | 'resolvedAt' | 'resolvedByEmail'
>;

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'leadership-report-alert-notifications.json');

function shouldUseFileStore() {
  return !process.env.MONGODB_URI?.trim();
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, limit);
}

function toIsoDate(value: unknown) {
  const parsed = value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

type MongoNotificationRecord = {
  _id?: unknown;
  id?: string;
  status?: 'sent' | 'failed' | string;
  alertCount?: number;
  alertIds?: string[];
  reason?: string;
  emailRecipients?: string[];
  webhookTargets?: number;
  acknowledgedAt?: Date | string | null;
  acknowledgedByEmail?: string | null;
  resolvedAt?: Date | string | null;
  resolvedByEmail?: string | null;
  createdAt?: Date | string;
};

function normalizeRecord(
  record: Partial<LeadershipReportAlertNotificationHistoryEntry> | MongoNotificationRecord
): LeadershipReportAlertNotificationHistoryEntry {
  const directId =
    'id' in record && typeof record.id === 'string' && record.id.trim() ? record.id : '';
  const mongoId =
    '_id' in record &&
    typeof record._id === 'object' &&
    record._id &&
    typeof (record._id as { toString?: () => string }).toString === 'function'
      ? (record._id as { toString: () => string }).toString()
      : '';

  return {
    id: directId || mongoId || createId(),
    status: record.status === 'failed' ? 'failed' : 'sent',
    alertCount:
      typeof record.alertCount === 'number' && Number.isFinite(record.alertCount)
        ? Math.max(0, Math.min(50, Math.round(record.alertCount)))
        : 0,
    alertIds: normalizeStringArray(record.alertIds, 20),
    reason: String(record.reason || '').trim(),
    emailRecipients: normalizeStringArray(record.emailRecipients, 20),
    webhookTargets:
      typeof record.webhookTargets === 'number' && Number.isFinite(record.webhookTargets)
        ? Math.max(0, Math.min(100, Math.round(record.webhookTargets)))
        : 0,
    acknowledgedAt: toIsoDate(record.acknowledgedAt) || null,
    acknowledgedByEmail:
      typeof record.acknowledgedByEmail === 'string' && record.acknowledgedByEmail.trim()
        ? record.acknowledgedByEmail.trim().toLowerCase()
        : null,
    resolvedAt: toIsoDate(record.resolvedAt) || null,
    resolvedByEmail:
      typeof record.resolvedByEmail === 'string' && record.resolvedByEmail.trim()
        ? record.resolvedByEmail.trim().toLowerCase()
        : null,
    createdAt: toIsoDate(record.createdAt) || new Date().toISOString(),
  };
}

async function readAllNotifications(): Promise<LeadershipReportAlertNotificationHistoryEntry[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeRecord(item as Partial<LeadershipReportAlertNotificationHistoryEntry>))
      : [];
  } catch {
    return [];
  }
}

async function writeAllNotifications(entries: LeadershipReportAlertNotificationHistoryEntry[]) {
  await writeJsonFileAtomically(dataPath, entries);
}

async function readNotificationsMongo(limit: number) {
  await connectDB();
  const records = (await LeadershipReportAlertNotification.find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, limit))
    .lean()) as unknown as MongoNotificationRecord[];

  return records.map(normalizeRecord);
}

async function writeNotificationMongo(entry: CreateLeadershipReportAlertNotificationInput) {
  await connectDB();
  const created = await LeadershipReportAlertNotification.create({
    status: entry.status,
    alertCount: entry.alertCount,
    alertIds: entry.alertIds,
    reason: entry.reason,
    emailRecipients: entry.emailRecipients,
    webhookTargets: entry.webhookTargets,
    acknowledgedAt: null,
    acknowledgedByEmail: '',
    resolvedAt: null,
    resolvedByEmail: '',
  });

  return normalizeRecord({
    _id: created._id,
    status: created.status,
    alertCount: created.alertCount,
    alertIds: created.alertIds,
    reason: created.reason,
    emailRecipients: created.emailRecipients,
    webhookTargets: created.webhookTargets,
    acknowledgedAt: created.acknowledgedAt,
    acknowledgedByEmail: created.acknowledgedByEmail,
    resolvedAt: created.resolvedAt,
    resolvedByEmail: created.resolvedByEmail,
    createdAt: created.createdAt,
  });
}

export async function listLeadershipReportAlertNotificationHistory(limit = 20) {
  const records = shouldUseFileStore()
    ? await readAllNotifications()
    : await readNotificationsMongo(limit).catch(async (error) => {
        console.error(
          'Leadership report alert notification history Mongo read failed, using file fallback.',
          error
        );
        return readAllNotifications();
      });

  return records.slice(0, Math.max(1, limit));
}

export async function createLeadershipReportAlertNotificationHistory(
  input: CreateLeadershipReportAlertNotificationInput
) {
  if (!shouldUseFileStore()) {
    try {
      return await writeNotificationMongo(input);
    } catch (error) {
      console.error(
        'Leadership report alert notification history Mongo write failed, using file fallback.',
        error
      );
    }
  }

  const all = await readAllNotifications();
  const entry = normalizeRecord({
    status: input.status,
    alertCount: input.alertCount,
    alertIds: input.alertIds,
    reason: input.reason,
    emailRecipients: input.emailRecipients,
    webhookTargets: input.webhookTargets,
    acknowledgedAt: null,
    acknowledgedByEmail: null,
    resolvedAt: null,
    resolvedByEmail: null,
    createdAt: new Date().toISOString(),
  });
  all.unshift(entry);
  await writeAllNotifications(all.slice(0, 60));
  return entry;
}

async function acknowledgeNotificationMongo(id: string, actorEmail: string) {
  await connectDB();
  const updated = await LeadershipReportAlertNotification.findByIdAndUpdate(
    id,
    {
      $set: {
        acknowledgedAt: new Date(),
        acknowledgedByEmail: actorEmail,
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return null;
  }

  return normalizeRecord(updated as unknown as MongoNotificationRecord);
}

async function resolveNotificationMongo(id: string, actorEmail: string) {
  await connectDB();
  const now = new Date();
  const updated = await LeadershipReportAlertNotification.findByIdAndUpdate(
    id,
    {
      $set: {
        resolvedAt: now,
        resolvedByEmail: actorEmail,
        acknowledgedAt: now,
        acknowledgedByEmail: actorEmail,
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return null;
  }

  return normalizeRecord(updated as unknown as MongoNotificationRecord);
}

export async function acknowledgeLeadershipReportAlertNotification(
  id: string,
  actorEmail: string
) {
  const normalizedId = String(id || '').trim();
  const normalizedActorEmail = String(actorEmail || '').trim().toLowerCase();
  if (!normalizedId || !normalizedActorEmail) {
    return null;
  }

  if (!shouldUseFileStore()) {
    try {
      return await acknowledgeNotificationMongo(normalizedId, normalizedActorEmail);
    } catch (error) {
      console.error(
        'Leadership report alert notification acknowledge Mongo write failed, using file fallback.',
        error
      );
    }
  }

  const all = await readAllNotifications();
  const index = all.findIndex((entry) => entry.id === normalizedId);
  if (index === -1) {
    return null;
  }

  const updated: LeadershipReportAlertNotificationHistoryEntry = {
    ...all[index],
    acknowledgedAt: new Date().toISOString(),
    acknowledgedByEmail: normalizedActorEmail,
  };
  all[index] = updated;
  await writeAllNotifications(all.slice(0, 60));
  return updated;
}

export async function resolveLeadershipReportAlertNotification(
  id: string,
  actorEmail: string
) {
  const normalizedId = String(id || '').trim();
  const normalizedActorEmail = String(actorEmail || '').trim().toLowerCase();
  if (!normalizedId || !normalizedActorEmail) {
    return null;
  }

  if (!shouldUseFileStore()) {
    try {
      return await resolveNotificationMongo(normalizedId, normalizedActorEmail);
    } catch (error) {
      console.error(
        'Leadership report alert notification resolve Mongo write failed, using file fallback.',
        error
      );
    }
  }

  const all = await readAllNotifications();
  const index = all.findIndex((entry) => entry.id === normalizedId);
  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: LeadershipReportAlertNotificationHistoryEntry = {
    ...all[index],
    acknowledgedAt: all[index].acknowledgedAt || now,
    acknowledgedByEmail: all[index].acknowledgedByEmail || normalizedActorEmail,
    resolvedAt: now,
    resolvedByEmail: normalizedActorEmail,
  };
  all[index] = updated;
  await writeAllNotifications(all.slice(0, 60));
  return updated;
}
