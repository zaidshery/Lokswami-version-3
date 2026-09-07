import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import connectDB from '@/lib/db/mongoose';
import {
  LEADERSHIP_REPORT_PRESETS,
  buildLeadershipReportDownloadHref,
  buildLeadershipReportViewHref,
  type LeadershipReportPresetConfig,
  type LeadershipReportPresetId,
} from '@/lib/admin/leadershipReports';
import LeadershipReportSchedule from '@/lib/models/LeadershipReportSchedule';

export type LeadershipReportDeliveryMode =
  | 'dashboard_link'
  | 'markdown_export'
  | 'email_summary'
  | 'webhook_summary';
export type LeadershipReportWebhookProvider =
  | 'generic_json'
  | 'slack'
  | 'discord'
  | 'teams'
  | 'telegram';
export type LeadershipReportRunStatus = 'idle' | 'success' | 'failed';

type StoredLeadershipReportSchedule = {
  id: LeadershipReportPresetId;
  enabled: boolean;
  deliveryTime: string;
  timezone: string;
  deliveryMode: LeadershipReportDeliveryMode;
  recipientEmails: string[];
  webhookUrls: string[];
  webhookProvider: LeadershipReportWebhookProvider;
  notes: string;
  lastRunAt: string | null;
  lastRunStatus: LeadershipReportRunStatus;
  lastRunSummary: string;
  updatedAt: string;
};

export type LeadershipReportSchedule = StoredLeadershipReportSchedule & {
  label: string;
  description: string;
  cadenceLabel: string;
  nextPlannedAt: string | null;
  viewHref: string;
  downloadHref: string;
};

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'leadership-report-schedules.json');
const DEFAULT_TIMEZONE = 'Asia/Calcutta';

const DEFAULT_SCHEDULES: StoredLeadershipReportSchedule[] = [
  {
    id: 'daily_briefing',
    enabled: true,
    deliveryTime: '08:30',
    timezone: DEFAULT_TIMEZONE,
    deliveryMode: 'dashboard_link',
    recipientEmails: [],
    webhookUrls: [],
    webhookProvider: 'generic_json',
    notes: 'Daily morning desk and leadership read.',
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastRunSummary: '',
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'weekly_briefing',
    enabled: true,
    deliveryTime: '09:00',
    timezone: DEFAULT_TIMEZONE,
    deliveryMode: 'markdown_export',
    recipientEmails: [],
    webhookUrls: [],
    webhookProvider: 'generic_json',
    notes: 'Weekly leadership summary for newsroom health and risk review.',
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastRunSummary: '',
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'monthly_briefing',
    enabled: false,
    deliveryTime: '10:00',
    timezone: DEFAULT_TIMEZONE,
    deliveryMode: 'markdown_export',
    recipientEmails: [],
    webhookUrls: [],
    webhookProvider: 'generic_json',
    notes: 'Monthly management briefing for long-range review.',
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastRunSummary: '',
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'growth_briefing',
    enabled: false,
    deliveryTime: '09:15',
    timezone: DEFAULT_TIMEZONE,
    deliveryMode: 'markdown_export',
    recipientEmails: [],
    webhookUrls: [],
    webhookProvider: 'generic_json',
    notes: 'Weekly growth digest for section momentum, channel wins, and path-level conversion watch.',
    lastRunAt: null,
    lastRunStatus: 'idle',
    lastRunSummary: '',
    updatedAt: new Date(0).toISOString(),
  },
];

function isPresetId(value: string): value is LeadershipReportPresetId {
  return LEADERSHIP_REPORT_PRESETS.some((preset) => preset.id === value);
}

function isDeliveryMode(value: string): value is LeadershipReportDeliveryMode {
  return (
    value === 'dashboard_link' ||
    value === 'markdown_export' ||
    value === 'email_summary' ||
    value === 'webhook_summary'
  );
}

function isWebhookProvider(value: string): value is LeadershipReportWebhookProvider {
  return (
    value === 'generic_json' ||
    value === 'slack' ||
    value === 'discord' ||
    value === 'teams' ||
    value === 'telegram'
  );
}

function normalizeRecipientEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const cleaned = value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item, index, source) => item && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item) && source.indexOf(item) === index);

  return cleaned.slice(0, 20);
}

function normalizeWebhookUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const cleaned = value
    .map((item) => String(item || '').trim())
    .filter(
      (item, index, source) =>
        /^https?:\/\/[^\s]+$/i.test(item) && source.indexOf(item) === index
    );

  return cleaned.slice(0, 10);
}

function normalizeTime(value: string | null | undefined, fallback: string) {
  const candidate = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(candidate) ? candidate : fallback;
}

async function readSchedulesFile(): Promise<StoredLeadershipReportSchedule[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? (parsed as StoredLeadershipReportSchedule[]) : [];
  } catch {
    return [];
  }
}

async function writeSchedulesFile(schedules: StoredLeadershipReportSchedule[]) {
  await writeJsonFileAtomically(dataPath, schedules);
}

function shouldUseFileStore() {
  return !process.env.MONGODB_URI?.trim();
}

type MongoScheduleRecord = {
  presetId?: string;
  enabled?: boolean;
  deliveryTime?: string;
  timezone?: string;
  deliveryMode?: LeadershipReportDeliveryMode;
  recipientEmails?: string[];
  webhookUrls?: string[];
  webhookProvider?: LeadershipReportWebhookProvider;
  notes?: string;
  lastRunAt?: Date | string | null;
  lastRunStatus?: LeadershipReportRunStatus;
  lastRunSummary?: string;
  updatedAt?: Date | string;
};

function toIsoDate(value: unknown) {
  const parsed = value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeStoredSchedule(record: MongoScheduleRecord): StoredLeadershipReportSchedule | null {
  const id = typeof record.presetId === 'string' ? record.presetId.trim() : '';
  if (!isPresetId(id)) return null;

  const fallback = DEFAULT_SCHEDULES.find((candidate) => candidate.id === id);
  if (!fallback) return null;

  return {
    id,
    enabled: record.enabled === undefined ? fallback.enabled : Boolean(record.enabled),
    deliveryTime: normalizeTime(
      typeof record.deliveryTime === 'string' ? record.deliveryTime : null,
      fallback.deliveryTime
    ),
    timezone:
      String(record.timezone || fallback.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE,
    deliveryMode: isDeliveryMode(String(record.deliveryMode || ''))
      ? (record.deliveryMode as LeadershipReportDeliveryMode)
      : fallback.deliveryMode,
    recipientEmails: normalizeRecipientEmails(record.recipientEmails ?? fallback.recipientEmails),
    webhookUrls: normalizeWebhookUrls(record.webhookUrls ?? fallback.webhookUrls),
    webhookProvider: isWebhookProvider(String(record.webhookProvider || ''))
      ? (record.webhookProvider as LeadershipReportWebhookProvider)
      : fallback.webhookProvider,
    notes: String(record.notes || fallback.notes || '').trim(),
    lastRunAt: toIsoDate(record.lastRunAt),
    lastRunStatus:
      record.lastRunStatus === 'success' || record.lastRunStatus === 'failed' || record.lastRunStatus === 'idle'
        ? record.lastRunStatus
        : fallback.lastRunStatus,
    lastRunSummary: String(record.lastRunSummary || '').trim(),
    updatedAt: toIsoDate(record.updatedAt) || fallback.updatedAt,
  };
}

async function readSchedulesMongo(): Promise<StoredLeadershipReportSchedule[]> {
  await connectDB();
  const records = (await LeadershipReportSchedule.find({})
    .sort({ updatedAt: -1 })
    .lean()) as unknown as MongoScheduleRecord[];

  return records
    .map(normalizeStoredSchedule)
    .filter((record): record is StoredLeadershipReportSchedule => Boolean(record));
}

async function writeScheduleMongo(schedule: StoredLeadershipReportSchedule) {
  await connectDB();
  await LeadershipReportSchedule.findOneAndUpdate(
    { presetId: schedule.id },
    {
      $set: {
        presetId: schedule.id,
        enabled: schedule.enabled,
        deliveryTime: schedule.deliveryTime,
        timezone: schedule.timezone,
        deliveryMode: schedule.deliveryMode,
        recipientEmails: schedule.recipientEmails,
        webhookUrls: schedule.webhookUrls,
        webhookProvider: schedule.webhookProvider,
        notes: schedule.notes,
        lastRunAt: schedule.lastRunAt ? new Date(schedule.lastRunAt) : null,
        lastRunStatus: schedule.lastRunStatus,
        lastRunSummary: schedule.lastRunSummary,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

function buildCandidateAtTime(baseDate: Date, deliveryTime: string) {
  const [hours, minutes] = deliveryTime.split(':').map((part) => Number.parseInt(part, 10));
  const candidate = new Date(baseDate);
  candidate.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return candidate;
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || '';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: Number.parseInt(read('hour') || '0', 10),
    minute: Number.parseInt(read('minute') || '0', 10),
    weekday: read('weekday'),
    dateKey: `${read('year')}-${read('month')}-${read('day')}`,
    monthKey: `${read('year')}-${read('month')}`,
  };
}

function hasReachedDeliveryTime(parts: ReturnType<typeof getZonedParts>, deliveryTime: string) {
  const [hours, minutes] = deliveryTime.split(':').map((part) => Number.parseInt(part, 10));
  const targetHours = Number.isFinite(hours) ? hours : 0;
  const targetMinutes = Number.isFinite(minutes) ? minutes : 0;

  return parts.hour > targetHours || (parts.hour === targetHours && parts.minute >= targetMinutes);
}

function computeNextPlannedAt(config: LeadershipReportPresetConfig, deliveryTime: string, enabled: boolean) {
  if (!enabled) return null;

  const now = new Date();

  if (config.id === 'daily_briefing') {
    const candidate = buildCandidateAtTime(now, deliveryTime);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.toISOString();
  }

  if (config.id === 'weekly_briefing' || config.id === 'growth_briefing') {
    const candidate = buildCandidateAtTime(now, deliveryTime);
    const day = candidate.getDay();
    const distanceToMonday = (1 - day + 7) % 7;
    candidate.setDate(candidate.getDate() + distanceToMonday);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate.toISOString();
  }

  const candidate = buildCandidateAtTime(new Date(now.getFullYear(), now.getMonth(), 1), deliveryTime);
  candidate.setMonth(now.getMonth(), 1);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setMonth(candidate.getMonth() + 1, 1);
  }
  return candidate.toISOString();
}

function enrichSchedule(
  schedule: StoredLeadershipReportSchedule,
  config: LeadershipReportPresetConfig
): LeadershipReportSchedule {
  return {
    ...schedule,
    label: config.label,
    description: config.description,
    cadenceLabel: config.cadenceLabel,
    nextPlannedAt: computeNextPlannedAt(config, schedule.deliveryTime, schedule.enabled),
    viewHref: buildLeadershipReportViewHref(config),
    downloadHref: buildLeadershipReportDownloadHref(config),
  };
}

function mergeWithDefaults(
  storedSchedules: StoredLeadershipReportSchedule[]
): StoredLeadershipReportSchedule[] {
  return LEADERSHIP_REPORT_PRESETS.map((config) => {
    const stored = storedSchedules.find((candidate) => candidate.id === config.id);
    const fallback = DEFAULT_SCHEDULES.find((candidate) => candidate.id === config.id)!;

    return {
      ...fallback,
      ...stored,
      id: config.id,
      deliveryTime: normalizeTime(stored?.deliveryTime, fallback.deliveryTime),
      timezone: String(stored?.timezone || fallback.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE,
      deliveryMode: isDeliveryMode(String(stored?.deliveryMode || ''))
        ? (stored?.deliveryMode as LeadershipReportDeliveryMode)
        : fallback.deliveryMode,
      recipientEmails: normalizeRecipientEmails(stored?.recipientEmails ?? fallback.recipientEmails),
      webhookUrls: normalizeWebhookUrls(stored?.webhookUrls ?? fallback.webhookUrls),
      webhookProvider: isWebhookProvider(String(stored?.webhookProvider || ''))
        ? (stored?.webhookProvider as LeadershipReportWebhookProvider)
        : fallback.webhookProvider,
      notes: String(stored?.notes || fallback.notes || '').trim(),
    };
  });
}

export async function listLeadershipReportSchedules(): Promise<LeadershipReportSchedule[]> {
  let storedSchedules: StoredLeadershipReportSchedule[];

  if (shouldUseFileStore()) {
    storedSchedules = await readSchedulesFile();
  } else {
    try {
      storedSchedules = await readSchedulesMongo();
    } catch (error) {
      console.error('Leadership report schedules Mongo read failed, using file fallback.', error);
      storedSchedules = await readSchedulesFile();
    }
  }

  const merged = mergeWithDefaults(storedSchedules);
  return merged.map((schedule) =>
    enrichSchedule(
      schedule,
      LEADERSHIP_REPORT_PRESETS.find((preset) => preset.id === schedule.id) || LEADERSHIP_REPORT_PRESETS[0]
    )
  );
}

export async function updateLeadershipReportSchedule(
  id: LeadershipReportPresetId,
  updates: Partial<{
    enabled: boolean;
    deliveryTime: string;
    deliveryMode: LeadershipReportDeliveryMode;
    recipientEmails: string[];
    webhookUrls: string[];
    webhookProvider: LeadershipReportWebhookProvider;
    notes: string;
  }>
): Promise<LeadershipReportSchedule> {
  const merged = mergeWithDefaults(
    shouldUseFileStore()
      ? await readSchedulesFile()
      : await readSchedulesMongo().catch(async (error) => {
          console.error('Leadership report schedules Mongo read failed, using file fallback.', error);
          return readSchedulesFile();
        })
  );
  const targetIndex = merged.findIndex((schedule) => schedule.id === id);
  const now = new Date().toISOString();

  if (targetIndex === -1) {
    throw new Error('Leadership report schedule not found.');
  }

  const current = merged[targetIndex];
  const next: StoredLeadershipReportSchedule = {
    ...current,
    enabled: updates.enabled === undefined ? current.enabled : Boolean(updates.enabled),
    deliveryTime: normalizeTime(updates.deliveryTime, current.deliveryTime),
    deliveryMode:
      updates.deliveryMode && isDeliveryMode(updates.deliveryMode)
        ? updates.deliveryMode
        : current.deliveryMode,
    recipientEmails:
      updates.recipientEmails === undefined
        ? current.recipientEmails
        : normalizeRecipientEmails(updates.recipientEmails),
    webhookUrls:
      updates.webhookUrls === undefined
        ? current.webhookUrls
        : normalizeWebhookUrls(updates.webhookUrls),
    webhookProvider:
      updates.webhookProvider && isWebhookProvider(updates.webhookProvider)
        ? updates.webhookProvider
        : current.webhookProvider,
    notes: updates.notes === undefined ? current.notes : String(updates.notes || '').trim(),
    updatedAt: now,
  };

  merged[targetIndex] = next;

  if (shouldUseFileStore()) {
    await writeSchedulesFile(merged);
  } else {
    try {
      await writeScheduleMongo(next);
    } catch (error) {
      console.error('Leadership report schedules Mongo write failed, using file fallback.', error);
      await writeSchedulesFile(merged);
    }
  }

  const config = LEADERSHIP_REPORT_PRESETS.find((preset) => preset.id === id) || LEADERSHIP_REPORT_PRESETS[0];
  return enrichSchedule(next, config);
}

export async function recordLeadershipReportRun(args: {
  id: LeadershipReportPresetId;
  status: LeadershipReportRunStatus;
  summary: string;
}) {
  const merged = mergeWithDefaults(
    shouldUseFileStore()
      ? await readSchedulesFile()
      : await readSchedulesMongo().catch(async (error) => {
          console.error('Leadership report schedules Mongo read failed, using file fallback.', error);
          return readSchedulesFile();
        })
  );
  const targetIndex = merged.findIndex((schedule) => schedule.id === args.id);
  const now = new Date().toISOString();

  if (targetIndex === -1) {
    throw new Error('Leadership report schedule not found.');
  }

  const next: StoredLeadershipReportSchedule = {
    ...merged[targetIndex],
    lastRunAt: now,
    lastRunStatus: args.status,
    lastRunSummary: String(args.summary || '').trim(),
    updatedAt: now,
  };

  merged[targetIndex] = next;
  if (shouldUseFileStore()) {
    await writeSchedulesFile(merged);
  } else {
    try {
      await writeScheduleMongo(next);
    } catch (error) {
      console.error('Leadership report schedules Mongo write failed, using file fallback.', error);
      await writeSchedulesFile(merged);
    }
  }

  const config =
    LEADERSHIP_REPORT_PRESETS.find((preset) => preset.id === args.id) || LEADERSHIP_REPORT_PRESETS[0];
  return enrichSchedule(next, config);
}

export function parseLeadershipReportScheduleId(value: string | null | undefined) {
  return isPresetId(String(value || '')) ? (value as LeadershipReportPresetId) : null;
}

export function isLeadershipReportScheduleDue(
  schedule: LeadershipReportSchedule,
  now = new Date()
) {
  if (!schedule.enabled) return false;

  const nowParts = getZonedParts(now, schedule.timezone || DEFAULT_TIMEZONE);
  if (!hasReachedDeliveryTime(nowParts, schedule.deliveryTime)) {
    return false;
  }

  const lastRunParts = schedule.lastRunAt
    ? getZonedParts(new Date(schedule.lastRunAt), schedule.timezone || DEFAULT_TIMEZONE)
    : null;

  if (schedule.id === 'daily_briefing') {
    return !lastRunParts || lastRunParts.dateKey !== nowParts.dateKey;
  }

  if (schedule.id === 'weekly_briefing' || schedule.id === 'growth_briefing') {
    if (nowParts.weekday !== 'Mon') return false;
    return !lastRunParts || lastRunParts.dateKey !== nowParts.dateKey;
  }

  if (nowParts.day !== '01') return false;
  return !lastRunParts || lastRunParts.monthKey !== nowParts.monthKey;
}
