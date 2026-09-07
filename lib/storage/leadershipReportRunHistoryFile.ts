import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import connectDB from '@/lib/db/mongoose';
import type {
  LeadershipReportDeliveryMode,
  LeadershipReportWebhookProvider,
  LeadershipReportRunStatus,
} from '@/lib/storage/leadershipReportSchedulesFile';
import type { LeadershipReportPresetId } from '@/lib/admin/leadershipReports';
import LeadershipReportRun from '@/lib/models/LeadershipReportRun';

export type LeadershipReportRunTrigger = 'manual' | 'cron';

export type LeadershipReportRunHistoryEntry = {
  id: string;
  scheduleId: LeadershipReportPresetId;
  label: string;
  cadenceLabel: string;
  deliveryMode: LeadershipReportDeliveryMode;
  webhookProvider?: LeadershipReportWebhookProvider | null;
  recipientEmails: string[];
  trigger: LeadershipReportRunTrigger;
  actorEmail: string | null;
  status: LeadershipReportRunStatus;
  summary: string;
  createdAt: string;
};

type CreateLeadershipReportRunHistoryInput = Omit<
  LeadershipReportRunHistoryEntry,
  'id' | 'createdAt'
>;

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'leadership-report-runs.json');

async function readAllRuns(): Promise<LeadershipReportRunHistoryEntry[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? (parsed as LeadershipReportRunHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeAllRuns(runs: LeadershipReportRunHistoryEntry[]) {
  await writeJsonFileAtomically(dataPath, runs);
}

function shouldUseFileStore() {
  return !process.env.MONGODB_URI?.trim();
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type MongoRunRecord = {
  _id?: unknown;
  scheduleId?: string;
  label?: string;
  cadenceLabel?: string;
  deliveryMode?: LeadershipReportDeliveryMode;
  webhookProvider?: LeadershipReportWebhookProvider | string | null;
  recipientEmails?: string[];
  trigger?: LeadershipReportRunTrigger;
  actorEmail?: string | null;
  status?: LeadershipReportRunStatus;
  summary?: string;
  createdAt?: Date | string;
};

function toIsoDate(value: unknown) {
  const parsed = value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeWebhookProvider(
  value: unknown
): LeadershipReportWebhookProvider | null {
  return value === 'generic_json' ||
    value === 'slack' ||
    value === 'discord' ||
    value === 'teams' ||
    value === 'telegram'
    ? value
    : null;
}

function normalizeRunRecord(record: MongoRunRecord): LeadershipReportRunHistoryEntry | null {
  const scheduleId = typeof record.scheduleId === 'string' ? record.scheduleId.trim() : '';
  if (!scheduleId) return null;

  return {
    id:
      typeof record._id === 'object' && record._id && typeof (record._id as { toString?: () => string }).toString === 'function'
        ? (record._id as { toString: () => string }).toString()
        : createId(),
    scheduleId: scheduleId as LeadershipReportPresetId,
    label: String(record.label || '').trim(),
    cadenceLabel: String(record.cadenceLabel || '').trim(),
    deliveryMode:
      record.deliveryMode === 'email_summary' ||
      record.deliveryMode === 'webhook_summary' ||
      record.deliveryMode === 'markdown_export' ||
      record.deliveryMode === 'dashboard_link'
        ? record.deliveryMode
        : 'dashboard_link',
    webhookProvider: normalizeWebhookProvider(record.webhookProvider),
    recipientEmails: Array.isArray(record.recipientEmails)
      ? record.recipientEmails.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 20)
      : [],
    trigger: record.trigger === 'cron' ? 'cron' : 'manual',
    actorEmail: typeof record.actorEmail === 'string' && record.actorEmail.trim() ? record.actorEmail.trim() : null,
    status:
      record.status === 'success' || record.status === 'failed' || record.status === 'idle'
        ? record.status
        : 'idle',
    summary: String(record.summary || '').trim(),
    createdAt: toIsoDate(record.createdAt) || new Date().toISOString(),
  };
}

async function readRunsMongo(limit: number) {
  await connectDB();
  const records = (await LeadershipReportRun.find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, limit))
    .lean()) as unknown as MongoRunRecord[];

  return records
    .map(normalizeRunRecord)
    .filter((record): record is LeadershipReportRunHistoryEntry => Boolean(record));
}

async function writeRunMongo(entry: CreateLeadershipReportRunHistoryInput) {
  await connectDB();
  const created = await LeadershipReportRun.create({
    scheduleId: entry.scheduleId,
    label: entry.label,
    cadenceLabel: entry.cadenceLabel,
    deliveryMode: entry.deliveryMode,
    webhookProvider: entry.webhookProvider || '',
    recipientEmails: entry.recipientEmails,
    trigger: entry.trigger,
    actorEmail: entry.actorEmail || '',
    status: entry.status,
    summary: entry.summary,
  });

  return normalizeRunRecord({
    _id: created._id,
    scheduleId: created.scheduleId,
    label: created.label,
    cadenceLabel: created.cadenceLabel,
    deliveryMode: created.deliveryMode,
    webhookProvider: created.webhookProvider,
    recipientEmails: created.recipientEmails,
    trigger: created.trigger,
    actorEmail: created.actorEmail,
    status: created.status,
    summary: created.summary,
    createdAt: created.createdAt,
  });
}

export async function listLeadershipReportRunHistory(limit = 25) {
  const runs = shouldUseFileStore()
    ? await readAllRuns()
    : await readRunsMongo(limit).catch(async (error) => {
        console.error('Leadership report run history Mongo read failed, using file fallback.', error);
        return readAllRuns();
      });
  return runs.slice(0, Math.max(1, limit));
}

export async function createLeadershipReportRunHistory(
  input: CreateLeadershipReportRunHistoryInput
) {
  if (!shouldUseFileStore()) {
    try {
      const mongoEntry = await writeRunMongo(input);
      if (mongoEntry) {
        return mongoEntry;
      }
    } catch (error) {
      console.error('Leadership report run history Mongo write failed, using file fallback.', error);
    }
  }

  const all = await readAllRuns();
  const entry: LeadershipReportRunHistoryEntry = {
    id: createId(),
    scheduleId: input.scheduleId,
    label: input.label,
    cadenceLabel: input.cadenceLabel,
    deliveryMode: input.deliveryMode,
    webhookProvider: input.webhookProvider || null,
    recipientEmails: Array.isArray(input.recipientEmails) ? input.recipientEmails.slice(0, 20) : [],
    trigger: input.trigger,
    actorEmail: input.actorEmail || null,
    status: input.status,
    summary: String(input.summary || '').trim(),
    createdAt: new Date().toISOString(),
  };

  all.unshift(entry);
  await writeAllRuns(all.slice(0, 100));
  return entry;
}
