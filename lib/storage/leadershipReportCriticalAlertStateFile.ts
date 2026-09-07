import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import connectDB from '@/lib/db/mongoose';
import LeadershipReportAlertState from '@/lib/models/LeadershipReportAlertState';

export type LeadershipReportCriticalAlertState = {
  key: 'critical_performance_alerts';
  activeAlertIds: string[];
  lastAlertSignature: string;
  lastNotifiedAt: string | null;
  mutedUntil: string | null;
  mutedByEmail: string | null;
  mutedReason: string | null;
  updatedAt: string;
};

const STATE_KEY: LeadershipReportCriticalAlertState['key'] = 'critical_performance_alerts';
const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'leadership-report-critical-alert-state.json');

function shouldUseFileStore() {
  return !process.env.MONGODB_URI?.trim();
}

function defaultState(): LeadershipReportCriticalAlertState {
  return {
    key: STATE_KEY,
    activeAlertIds: [],
    lastAlertSignature: '',
    lastNotifiedAt: null,
    mutedUntil: null,
    mutedByEmail: null,
    mutedReason: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeState(value: Partial<LeadershipReportCriticalAlertState> | null | undefined) {
  const fallback = defaultState();
  return {
    key: STATE_KEY,
    activeAlertIds: Array.isArray(value?.activeAlertIds)
      ? value!.activeAlertIds.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20)
      : fallback.activeAlertIds,
    lastAlertSignature: String(value?.lastAlertSignature || '').trim(),
    lastNotifiedAt:
      typeof value?.lastNotifiedAt === 'string' && value.lastNotifiedAt.trim()
        ? value.lastNotifiedAt
        : null,
    mutedUntil:
      typeof value?.mutedUntil === 'string' && value.mutedUntil.trim()
        ? value.mutedUntil
        : null,
    mutedByEmail:
      typeof value?.mutedByEmail === 'string' && value.mutedByEmail.trim()
        ? value.mutedByEmail.trim().toLowerCase()
        : null,
    mutedReason:
      typeof value?.mutedReason === 'string' && value.mutedReason.trim()
        ? value.mutedReason.trim()
        : null,
    updatedAt:
      typeof value?.updatedAt === 'string' && value.updatedAt.trim()
        ? value.updatedAt
        : fallback.updatedAt,
  } satisfies LeadershipReportCriticalAlertState;
}

async function readStateFile(): Promise<LeadershipReportCriticalAlertState> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '{}') as Partial<LeadershipReportCriticalAlertState>;
    return normalizeState(parsed);
  } catch {
    return defaultState();
  }
}

async function writeStateFile(state: LeadershipReportCriticalAlertState) {
  await writeJsonFileAtomically(dataPath, state);
}

async function readStateMongo(): Promise<LeadershipReportCriticalAlertState> {
  await connectDB();
  const record = await LeadershipReportAlertState.findOne({ key: STATE_KEY }).lean();
  if (!record) {
    return defaultState();
  }

  return normalizeState({
    key: STATE_KEY,
    activeAlertIds: record.activeAlertIds,
    lastAlertSignature: record.lastAlertSignature,
    lastNotifiedAt:
      record.lastNotifiedAt instanceof Date
        ? record.lastNotifiedAt.toISOString()
        : record.lastNotifiedAt
          ? new Date(String(record.lastNotifiedAt)).toISOString()
          : null,
    mutedUntil:
      record.mutedUntil instanceof Date
        ? record.mutedUntil.toISOString()
        : record.mutedUntil
          ? new Date(String(record.mutedUntil)).toISOString()
          : null,
    mutedByEmail: typeof record.mutedByEmail === 'string' ? record.mutedByEmail : null,
    mutedReason: typeof record.mutedReason === 'string' ? record.mutedReason : null,
    updatedAt:
      record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : record.updatedAt
          ? new Date(String(record.updatedAt)).toISOString()
          : new Date().toISOString(),
  });
}

async function writeStateMongo(state: LeadershipReportCriticalAlertState) {
  await connectDB();
  await LeadershipReportAlertState.findOneAndUpdate(
    { key: STATE_KEY },
    {
      $set: {
        key: STATE_KEY,
        activeAlertIds: state.activeAlertIds,
        lastAlertSignature: state.lastAlertSignature,
        lastNotifiedAt: state.lastNotifiedAt ? new Date(state.lastNotifiedAt) : null,
        mutedUntil: state.mutedUntil ? new Date(state.mutedUntil) : null,
        mutedByEmail: state.mutedByEmail || '',
        mutedReason: state.mutedReason || '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

export async function getLeadershipReportCriticalAlertState() {
  if (shouldUseFileStore()) {
    return readStateFile();
  }

  try {
    return await readStateMongo();
  } catch (error) {
    console.error('Leadership report critical alert state Mongo read failed, using file fallback.', error);
    return readStateFile();
  }
}

export async function saveLeadershipReportCriticalAlertState(
  input: Partial<Omit<LeadershipReportCriticalAlertState, 'key'>> & {
    activeAlertIds: string[];
    lastAlertSignature: string;
  }
) {
  const nextState = normalizeState({
    key: STATE_KEY,
    activeAlertIds: input.activeAlertIds,
    lastAlertSignature: input.lastAlertSignature,
    lastNotifiedAt: input.lastNotifiedAt ?? null,
    mutedUntil: input.mutedUntil ?? null,
    mutedByEmail: input.mutedByEmail ?? null,
    mutedReason: input.mutedReason ?? null,
    updatedAt: new Date().toISOString(),
  });

  if (!shouldUseFileStore()) {
    try {
      await writeStateMongo(nextState);
      return nextState;
    } catch (error) {
      console.error('Leadership report critical alert state Mongo write failed, using file fallback.', error);
    }
  }

  await writeStateFile(nextState);
  return nextState;
}

export function isLeadershipReportCriticalAlertsMuted(
  state: LeadershipReportCriticalAlertState,
  now = new Date()
) {
  if (!state.mutedUntil) {
    return false;
  }

  const mutedUntil = new Date(state.mutedUntil);
  if (Number.isNaN(mutedUntil.getTime())) {
    return false;
  }

  return mutedUntil.getTime() > now.getTime();
}
