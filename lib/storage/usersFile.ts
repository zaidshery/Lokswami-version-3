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

async function ensureDataDir(dirPath: string = DATA_DIR) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {
    // Ignore already existing
  }
}

/**
 * Role-aware credential sanitization for file storage.
 * Security Invariant: Readers must NEVER have passwordHash, passwordSetAt, or credential
 * verifiers persisted in the file fallback. MongoDB is the sole reader credential authority.
 * Non-reader roles preserve existing attributes so staff/admin mechanisms are not disrupted.
 */
export function sanitizeStoredUserCredentials<T extends Partial<StoredUser>>(user: T): T {
  const role = user.role || 'reader';
  if (role === 'reader') {
    const sanitized = { ...user };
    delete sanitized.passwordHash;
    delete sanitized.passwordSetAt;
    return sanitized;
  }
  return user;
}

export async function readUsersFile(customFilePath?: string): Promise<StoredUser[]> {
  const targetFile = customFilePath || USERS_FILE;
  await ensureDataDir(path.dirname(targetFile));
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let hasLegacyReaderCredentials = false;
    const sanitized = parsed.map((user: StoredUser) => {
      const role = user.role || 'reader';
      if (role === 'reader') {
        if (user.passwordHash !== undefined || user.passwordSetAt !== undefined) {
          hasLegacyReaderCredentials = true;
          const clean = { ...user };
          delete clean.passwordHash;
          delete clean.passwordSetAt;
          return clean;
        }
      }
      return user;
    });

    // Durable on-disk cleanup: if legacy reader credentials existed in physical storage,
    // atomically rewrite the file to permanently remove them from disk.
    if (hasLegacyReaderCredentials) {
      try {
        await writeJsonFileAtomically(targetFile, sanitized);
      } catch (writeErr) {
        console.error(
          '[Security] Failed to durably scrub legacy reader credentials from disk:',
          writeErr
        );
      }
    }

    return sanitized;
  } catch {
    return [];
  }
}

export async function writeUsersFile(users: StoredUser[], customFilePath?: string): Promise<void> {
  const targetFile = customFilePath || USERS_FILE;
  const sanitized = users.map((user) => sanitizeStoredUserCredentials(user));
  await writeJsonFileAtomically(targetFile, sanitized);
}

export async function findStoredUserById(id: string, customFilePath?: string): Promise<StoredUser | null> {
  const users = await readUsersFile(customFilePath);
  return users.find((u) => u._id === id) || null;
}

export async function findStoredUserByEmail(email: string, customFilePath?: string): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase();
  const users = await readUsersFile(customFilePath);
  return users.find((u) => u.email.toLowerCase() === normalized) || null;
}

export async function findStoredUserByWhatsApp(whatsappNumber: string, customFilePath?: string): Promise<StoredUser | null> {
  const users = await readUsersFile(customFilePath);
  return users.find((u) => u.whatsappNumber === whatsappNumber) || null;
}

export async function findStoredUserByIdentifier(identifier: string, customFilePath?: string): Promise<StoredUser | null> {
  const normalized = identifier.trim().toLowerCase();
  const users = await readUsersFile(customFilePath);
  return (
    users.find(
      (u) =>
        u.email.toLowerCase() === normalized ||
        u.loginId?.toLowerCase() === normalized ||
        u.whatsappNumber === identifier.trim()
    ) || null
  );
}

export async function upsertStoredUser(
  data: Partial<StoredUser> & { email: string },
  customFilePath?: string
): Promise<StoredUser> {
  const targetFile = customFilePath || USERS_FILE;
  const users = await readUsersFile(targetFile);
  const normalizedEmail = data.email.trim().toLowerCase();
  const existingIndex = users.findIndex((u) => u.email.toLowerCase() === normalizedEmail);

  const now = new Date().toISOString();
  if (existingIndex >= 0) {
    const existing = users[existingIndex];
    const updatedRaw: StoredUser = {
      ...existing,
      ...data,
      email: normalizedEmail,
      updatedAt: now,
    };
    const updated = sanitizeStoredUserCredentials(updatedRaw);
    users[existingIndex] = updated;
    await writeUsersFile(users, targetFile);
    return updated;
  }

  const role = data.role || 'reader';
  const isReader = role === 'reader';

  const newUserRaw: StoredUser = {
    _id: data._id || crypto.randomUUID(),
    name: data.name?.trim() || 'Reader',
    email: normalizedEmail,
    image: data.image || '',
    role,
    loginId: data.loginId,
    whatsappNumber: data.whatsappNumber,
    ...(isReader
      ? {}
      : {
          passwordHash: data.passwordHash || '',
          passwordSetAt: data.passwordSetAt || null,
        }),
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

  const newUser = sanitizeStoredUserCredentials(newUserRaw);
  users.push(newUser);
  await writeUsersFile(users, targetFile);
  return newUser;
}

export async function scrubLegacyReaderCredentialsFromFile(customFilePath?: string): Promise<number> {
  const targetFile = customFilePath || USERS_FILE;
  await ensureDataDir(path.dirname(targetFile));
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    let scrubbedCount = 0;
    const cleaned = parsed.map((user: StoredUser) => {
      if ((user.role || 'reader') === 'reader') {
        if (user.passwordHash !== undefined || user.passwordSetAt !== undefined) {
          scrubbedCount++;
          const copy = { ...user };
          delete copy.passwordHash;
          delete copy.passwordSetAt;
          return copy;
        }
      }
      return user;
    });
    if (scrubbedCount > 0) {
      await writeJsonFileAtomically(targetFile, cleaned);
    }
    return scrubbedCount;
  } catch {
    return 0;
  }
}
