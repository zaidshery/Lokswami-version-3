import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

export interface StoredCareerApplication {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  portfolioUrl: string;
  message: string;
  source: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCareerApplicationInput {
  name: string;
  email: string;
  phone?: string;
  role: string;
  experience?: string;
  portfolioUrl?: string;
  message: string;
  source: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'career-applications.json');

async function readAllItems(): Promise<StoredCareerApplication[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllItems(items: StoredCareerApplication[]) {
  await writeJsonFileAtomically(dataPath, items);
}

export async function createStoredCareerApplication(
  input: CreateCareerApplicationInput
) {
  const now = new Date().toISOString();
  const all = await readAllItems();

  const item: StoredCareerApplication = {
    _id:
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: input.name,
    email: input.email,
    phone: input.phone || '',
    role: input.role,
    experience: input.experience || '',
    portfolioUrl: input.portfolioUrl || '',
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
