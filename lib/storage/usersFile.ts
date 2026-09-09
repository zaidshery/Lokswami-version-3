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

// Async mutation mutex queue ensuring serialized read-modify-write operations per physical file
const fileMutationQueues = new Map<string, Promise<unknown>>();

export function withUsersFileMutationLock<T>(
  targetPath: string,
  operation: () => Promise<T>
): Promise<T> {
  const canonicalPath = path.resolve(targetPath);
  const previousQueue = fileMutationQueues.get(canonicalPath) || Promise.resolve();

  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  const queuePromise = previousQueue
    .catch(() => undefined)
    .then(() => currentLock);

  fileMutationQueues.set(canonicalPath, queuePromise);

  return previousQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        return await operation();
      } finally {
        releaseLock();
        if (fileMutationQueues.get(canonicalPath) === queuePromise) {
          fileMutationQueues.delete(canonicalPath);
        }
      }
    });
}

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

export function sanitizeStoredUsers(users: StoredUser[]): {
  sanitized: StoredUser[];
  hadLegacyReaderCredentials: boolean;
} {
  let hadLegacyReaderCredentials = false;
  const sanitized = users.map((user) => {
    const role = user.role || 'reader';
    if (role === 'reader') {
      if (user.passwordHash !== undefined || user.passwordSetAt !== undefined) {
        hadLegacyReaderCredentials = true;
        const clean = { ...user };
        delete clean.passwordHash;
        delete clean.passwordSetAt;
        return clean;
      }
    }
    return user;
  });
  return { sanitized, hadLegacyReaderCredentials };
}

async function readUsersFileRaw(targetFile: string): Promise<StoredUser[]> {
  await ensureDataDir(path.dirname(targetFile));
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsersFileUnlocked(targetFile: string, users: StoredUser[]): Promise<void> {
  const sanitized = users.map((user) => sanitizeStoredUserCredentials(user));
  await writeJsonFileAtomically(targetFile, sanitized);
}

/**
 * Reads users from file and returns sanitized records.
 * If legacy reader credentials exist on disk, a serialized background mutation re-reads
 * the latest physical state inside the lock and durably scrubs them, preventing lost-update races.
 */
export async function readUsersFile(customFilePath?: string): Promise<StoredUser[]> {
  const targetFile = customFilePath || USERS_FILE;
  const raw = await readUsersFileRaw(targetFile);
  const { sanitized, hadLegacyReaderCredentials } = sanitizeStoredUsers(raw);

  if (hadLegacyReaderCredentials) {
    // Durable on-disk cleanup: serialize mutation with a lock.
    // Inside the lock, re-read the latest physical file so no concurrent update is lost.
    await withUsersFileMutationLock(targetFile, async () => {
      const latestRaw = await readUsersFileRaw(targetFile);
      const { sanitized: latestSanitized, hadLegacyReaderCredentials: stillNeedsScrub } =
        sanitizeStoredUsers(latestRaw);
      if (stillNeedsScrub) {
        await writeUsersFileUnlocked(targetFile, latestSanitized);
      }
    }).catch((writeErr) => {
      console.error(
        '[Security] Failed to durably scrub legacy reader credentials from disk:',
        writeErr
      );
    });
  }

  return sanitized;
}

export async function writeUsersFile(users: StoredUser[], customFilePath?: string): Promise<void> {
  const targetFile = customFilePath || USERS_FILE;
  return withUsersFileMutationLock(targetFile, async () => {
    await writeUsersFileUnlocked(targetFile, users);
  });
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
  return withUsersFileMutationLock(targetFile, async () => {
    const rawUsers = await readUsersFileRaw(targetFile);
    const { sanitized: users } = sanitizeStoredUsers(rawUsers);
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
      await writeUsersFileUnlocked(targetFile, users);
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
    await writeUsersFileUnlocked(targetFile, users);
    return newUser;
  });
}

export async function scrubLegacyReaderCredentialsFromFile(customFilePath?: string): Promise<number> {
  const targetFile = customFilePath || USERS_FILE;
  return withUsersFileMutationLock(targetFile, async () => {
    const raw = await readUsersFileRaw(targetFile);
    let scrubbedCount = 0;
    const cleaned = raw.map((user: StoredUser) => {
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
      await writeUsersFileUnlocked(targetFile, cleaned);
    }
    return scrubbedCount;
  });
}
