import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

export interface StoredAnalyticsEvent {
  _id: string;
  event: string;
  page: string;
  source: string;
  sessionId: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnalyticsEventInput {
  event: string;
  page: string;
  source: string;
  sessionId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'analytics-events.json');
const mutationQueues = new Map<string, Promise<void>>();

async function withMutationLock<T>(targetPath: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(targetPath);
  const previous = mutationQueues.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  mutationQueues.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (mutationQueues.get(key) === current) mutationQueues.delete(key);
  }
}

async function readAllEvents(targetPath = dataPath): Promise<StoredAnalyticsEvent[]> {
  try {
    const raw = await fs.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listStoredAnalyticsEvents(targetPath = dataPath) {
  return readAllEvents(targetPath);
}

async function writeAllEvents(events: StoredAnalyticsEvent[], targetPath = dataPath) {
  await writeJsonFileAtomically(targetPath, events);
}

function makeStoredEvent(input: CreateAnalyticsEventInput, now: string): StoredAnalyticsEvent {
  return {
    _id: typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    event: input.event,
    page: input.page,
    source: input.source,
    sessionId: input.sessionId,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function createStoredAnalyticsEvent(input: CreateAnalyticsEventInput, targetPath = dataPath) {
  return withMutationLock(targetPath, async () => {
    const now = new Date().toISOString();
    const all = await readAllEvents(targetPath);
    const item = makeStoredEvent(input, now);

    all.unshift(item);

    // Keep file size bounded for local fallback mode.
    const bounded = all.slice(0, 2000);
    await writeAllEvents(bounded, targetPath);

    return item;
  });
}

export async function upsertStoredWebVital(input: CreateAnalyticsEventInput, targetPath = dataPath) {
  if (input.source !== 'web_vitals_beacon' || !input.event.startsWith('web_vital_')) {
    throw new Error('Web Vital upsert requires a Web Vital event');
  }

  return withMutationLock(targetPath, async () => {
    const all = await readAllEvents(targetPath);
    const existing = all.find((item) =>
      item.source === input.source &&
      item.event === input.event &&
      item.sessionId === input.sessionId
    );
    if (existing) {
      if (
        existing.metadata.value === input.metadata?.value &&
        existing.metadata.rating === input.metadata?.rating
      ) return existing;
      existing.metadata = input.metadata || {};
      existing.updatedAt = new Date().toISOString();
      await writeAllEvents(all, targetPath);
      return existing;
    }

    const item = makeStoredEvent(input, new Date().toISOString());
    all.unshift(item);
    await writeAllEvents(all.slice(0, 2000), targetPath);
    return item;
  });
}
