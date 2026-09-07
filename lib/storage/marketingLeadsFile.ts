import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

export interface StoredMarketingLead {
  _id: string;
  email: string;
  name: string;
  interests: string[];
  source: string;
  campaign: string;
  wantsDailyAlerts: boolean;
  consent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMarketingLeadInput {
  email: string;
  name?: string;
  interests?: string[];
  source: string;
  campaign: string;
  wantsDailyAlerts: boolean;
  consent: boolean;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'marketing-leads.json');

function clean(value: unknown, max: number) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function normalizeInterests(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => clean(value, 50).toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

async function readAllLeads(): Promise<StoredMarketingLead[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllLeads(leads: StoredMarketingLead[]) {
  await writeJsonFileAtomically(dataPath, leads);
}

export async function upsertStoredMarketingLead(input: CreateMarketingLeadInput) {
  const all = await readAllLeads();
  const now = new Date().toISOString();
  const normalizedEmail = clean(input.email, 180).toLowerCase();

  const existingIndex = all.findIndex(
    (lead) => lead.email === normalizedEmail && lead.source === input.source
  );

  const next: StoredMarketingLead = {
    _id:
      existingIndex >= 0
        ? all[existingIndex]._id
        : typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    email: normalizedEmail,
    name: clean(input.name, 120),
    interests: normalizeInterests(input.interests),
    source: clean(input.source, 80),
    campaign: clean(input.campaign, 80),
    wantsDailyAlerts: Boolean(input.wantsDailyAlerts),
    consent: Boolean(input.consent),
    createdAt: existingIndex >= 0 ? all[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    all[existingIndex] = next;
  } else {
    all.unshift(next);
  }

  await writeAllLeads(all.slice(0, 5000));
  return next;
}
