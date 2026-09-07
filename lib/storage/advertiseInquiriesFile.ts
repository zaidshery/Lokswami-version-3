import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

export interface StoredAdvertiseInquiry {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  budget: string;
  campaignType: string;
  targetLocations: string;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllItems(items: StoredAdvertiseInquiry[]) {
  await writeJsonFileAtomically(dataPath, items);
}

export async function createStoredAdvertiseInquiry(
  input: CreateAdvertiseInquiryInput
) {
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
    message: input.message,
    source: input.source,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    createdAt: now,
    updatedAt: now,
  };

  all.unshift(item);
  await writeAllItems(all);
  return item;
}
