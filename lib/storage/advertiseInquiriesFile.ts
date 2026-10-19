import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import { ADVERTISING_OWNER, type AdvertisingWorkflow } from '@/lib/advertising/inquiryWorkflow';

export interface StoredAdvertiseInquiry extends Partial<AdvertisingWorkflow> {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  budget: string;
  campaignType: string;
  targetLocations: string;
  timeline?: string;
  consent?: boolean;
  consentAt?: string;
  consentVersion?: string;
  message: string;
  source: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdvertiseInquiryInput {
  name: string;
  company: string;
  email: string;
  phone?: string;
  budget?: string;
  campaignType: string;
  targetLocations?: string;
  timeline?: string;
  consent?: boolean;
  consentAt?: string;
  consentVersion?: string;
  message: string;
  source: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'advertise-inquiries.json');

async function readAllItems(): Promise<StoredAdvertiseInquiry[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) throw new Error('Invalid advertising recovery file');
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAllItems(items: StoredAdvertiseInquiry[]) {
  await writeJsonFileAtomically(dataPath, items);
}

let pending: Promise<unknown> = Promise.resolve();
function mutate<T>(action: () => Promise<T>): Promise<T> {
  const next = pending.then(action, action);
  pending = next.catch(() => undefined);
  return next;
}

export async function listStoredAdvertiseInquiries(page: number, limit: number) {
  const all = await readAllItems();
  const ordered = [...all].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { rows: ordered.slice((page - 1) * limit, page * limit), total: all.length };
}

export async function updateStoredAdvertiseInquiry(id: string, expectedUpdatedAt: string, patch: AdvertisingWorkflow) {
  return mutate(async () => {
    const all = await readAllItems();
    const index = all.findIndex((row) => row._id === id && row.updatedAt === expectedUpdatedAt);
    if (index < 0) return null;
    all[index] = { ...all[index], ...patch, updatedAt: new Date().toISOString() };
    await writeAllItems(all);
    return all[index];
  });
}

export async function createStoredAdvertiseInquiry(
  input: CreateAdvertiseInquiryInput
) {
  return mutate(async () => {
  const now = new Date().toISOString();
  const all = await readAllItems();

  const item: StoredAdvertiseInquiry = {
    _id:
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: input.name,
    company: input.company,
    email: input.email,
    phone: input.phone || '',
    budget: input.budget || '',
    campaignType: input.campaignType,
    targetLocations: input.targetLocations || '',
    timeline: input.timeline || '',
    consent: input.consent === true,
    consentAt: input.consentAt || '',
    consentVersion: input.consentVersion || '',
    message: input.message,
    source: input.source,
    status: 'new',
    assignee: ADVERTISING_OWNER,
    followUpAt: '',
    followUpNote: '',
    updatedBy: '',
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    createdAt: now,
    updatedAt: now,
  };

  all.unshift(item);
  await writeAllItems(all);
  return item;
  });
}
