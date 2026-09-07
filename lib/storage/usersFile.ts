import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import { type UserRole } from '@/lib/auth/roles';

export interface StoredUser {
  _id: string;
  name: string;
  email: string;
  image: string;
  role: UserRole;
  loginId?: string;
  whatsappNumber?: string;
  passwordHash?: string;
  passwordSetAt?: string | null;
  setupTokenHash?: string;
  setupTokenExpiresAt?: string | null;
  setupTokenIssuedAt?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
  readCount: number;
  savedArticles: string[];
  preferredLanguage: 'hi' | 'en';
  preferredCategories: string[];
  state?: string;
  district?: string;
  optInDailyEpaper: boolean;
  pushEnabled: boolean;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Ignore already existing
  }
}

export async function readUsersFile(): Promise<StoredUser[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeUsersFile(users: StoredUser[]): Promise<void> {
  await writeJsonFileAtomically(USERS_FILE, users);
}

export async function findStoredUserById(id: string): Promise<StoredUser | null> {
  const users = await readUsersFile();
  return users.find((u) => u._id === id) || null;
}

export async function findStoredUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase();
  const users = await readUsersFile();
  return users.find((u) => u.email.toLowerCase() === normalized) || null;
}

export async function findStoredUserByWhatsApp(whatsappNumber: string): Promise<StoredUser | null> {
  const users = await readUsersFile();
  return users.find((u) => u.whatsappNumber === whatsappNumber) || null;
}

export async function findStoredUserByIdentifier(identifier: string): Promise<StoredUser | null> {
  const normalized = identifier.trim().toLowerCase();
  const users = await readUsersFile();
  return (
    users.find(
      (u) =>
        u.email.toLowerCase() === normalized ||
        u.loginId?.toLowerCase() === normalized ||
        u.whatsappNumber === identifier.trim()
    ) || null
  );
}

export async function upsertStoredUser(data: Partial<StoredUser> & { email: string }): Promise<StoredUser> {
  const users = await readUsersFile();
  const normalizedEmail = data.email.trim().toLowerCase();
  const existingIndex = users.findIndex((u) => u.email.toLowerCase() === normalizedEmail);

  const now = new Date().toISOString();
  if (existingIndex >= 0) {
    const existing = users[existingIndex];
    const updated: StoredUser = {
      ...existing,
      ...data,
      email: normalizedEmail,
      updatedAt: now,
    };
    users[existingIndex] = updated;
    await writeUsersFile(users);
    return updated;
  }

  const newUser: StoredUser = {
    _id: data._id || crypto.randomUUID(),
    name: data.name?.trim() || 'Reader',
    email: normalizedEmail,
    image: data.image || '',
    role: data.role || 'reader',
    loginId: data.loginId,
    whatsappNumber: data.whatsappNumber,
    passwordHash: data.passwordHash || '',
    passwordSetAt: data.passwordSetAt || null,
    isActive: data.isActive !== false,
    readCount: data.readCount || 0,
    savedArticles: data.savedArticles || [],
    preferredLanguage: data.preferredLanguage || 'hi',
    preferredCategories: data.preferredCategories || [],
    optInDailyEpaper: data.optInDailyEpaper !== false,
    pushEnabled: data.pushEnabled || false,
    notificationsEnabled: data.notificationsEnabled || false,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };

  users.push(newUser);
  await writeUsersFile(users);
  return newUser;
}
