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

async function readAllEvents(): Promise<StoredAnalyticsEvent[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listStoredAnalyticsEvents() {
  return readAllEvents();
}

async function writeAllEvents(events: StoredAnalyticsEvent[]) {
  await writeJsonFileAtomically(dataPath, events);
}

export async function createStoredAnalyticsEvent(input: CreateAnalyticsEventInput) {
  const now = new Date().toISOString();
  const all = await readAllEvents();

  const item: StoredAnalyticsEvent = {
    _id:
      typeof crypto.randomUUID === 'function'
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

  all.unshift(item);

  // Keep file size bounded for local fallback mode.
  const bounded = all.slice(0, 2000);
  await writeAllEvents(bounded);

  return item;
}
