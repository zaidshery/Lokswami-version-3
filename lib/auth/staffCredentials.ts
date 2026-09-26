import crypto from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { hashPassword, verifyPassword } from '@/lib/auth/jwt';
import { isAdminRole, type AdminRole } from '@/lib/auth/roles';
import { isConfiguredBootstrapLoginId } from '@/lib/auth/adminCredentials';

const DEFAULT_SETUP_TOKEN_HOURS = 48;

type StaffUserRecord = {
  _id?: unknown;
  name?: string;
  email?: string;
  image?: string;
  role?: unknown;
  isActive?: boolean;
  loginId?: string;
  passwordHash?: string;
  passwordSetAt?: Date | string | null;
  setupTokenHash?: string;
  setupTokenExpiresAt?: Date | string | null;
  setupTokenIssuedAt?: Date | string | null;
  createdAt?: Date | string | null;
  savedArticles?: unknown;
};

export type StaffCredentialStatus =
  | 'password_ready'
  | 'setup_pending'
  | 'setup_expired'
  | 'credentials_not_set';

export function isStaffCredentialsAuthEnabled() {
  return true;
}

function normalizeIdentifier(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function normalizeCreatedAt(value: Date | string | undefined | null) {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeSavedArticles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((articleId) => String(articleId));
}

function normalizeLoginIdValue(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return normalized.slice(0, 32);
}

function buildLoginIdBase(input: { preferredLoginId?: string; email?: string; name?: string }) {
  const preferred = normalizeLoginIdValue(input.preferredLoginId || '');
  if (preferred) {
    return preferred;
  }

  const emailLocalPart = normalizeIdentifier(input.email).split('@')[0] || '';
  const normalizedEmailBase = normalizeLoginIdValue(emailLocalPart);
  if (normalizedEmailBase) {
    return normalizedEmailBase;
  }

  const normalizedNameBase = normalizeLoginIdValue(input.name || '');
  if (normalizedNameBase) {
    return normalizedNameBase;
  }

  return 'staff';
}

function hashSetupToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getSetupTokenHours() {
  const raw = Number.parseInt(process.env.ADMIN_STAFF_SETUP_TOKEN_HOURS || '', 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }

  return DEFAULT_SETUP_TOKEN_HOURS;
}

function getFutureDate(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function isObjectId(value: string) {
  return Types.ObjectId.isValid(value);
}

export function formatStaffCredentialStatusLabel(status: StaffCredentialStatus) {
  switch (status) {
    case 'password_ready':
      return 'Password Ready';
    case 'setup_pending':
      return 'Setup Pending';
    case 'setup_expired':
      return 'Setup Expired';
    case 'credentials_not_set':
    default:
      return 'Not Set';
  }
}

export function getStaffCredentialStatus(record: {
  passwordHash?: string | null;
  setupTokenExpiresAt?: Date | string | null;
}): StaffCredentialStatus {
  const passwordHash = String(record.passwordHash || '').trim();
  if (passwordHash) {
    return 'password_ready';
  }

  if (!record.setupTokenExpiresAt) {
    return 'credentials_not_set';
  }

  const expiresAt = new Date(record.setupTokenExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return 'credentials_not_set';
  }

  return expiresAt.getTime() > Date.now() ? 'setup_pending' : 'setup_expired';
}

export async function reserveUniqueStaffLoginId(input: {
  preferredLoginId?: string;
  email?: string;
  name?: string;
  excludeUserId?: string;
}) {
  await connectDB();

  const base = buildLoginIdBase(input);
  let suffix = 0;

  while (suffix < 1000) {
    const candidate =
      suffix === 0
        ? base
        : `${base.slice(0, Math.max(1, 32 - String(suffix + 1).length - 1))}-${suffix + 1}`;

    if (isConfiguredBootstrapLoginId(candidate)) {
      suffix += 1;
      continue;
    }

    const query: Record<string, unknown> = { loginId: candidate };
    if (input.excludeUserId && isObjectId(input.excludeUserId)) {
      query._id = { $ne: input.excludeUserId };
    }

    const existing = await User.exists(query);
    if (!existing) {
      return candidate;
    }

    suffix += 1;
  }

  throw new Error('Unable to generate a unique staff login ID');
}

export function buildStaffSetupLink(origin: string, token: string) {
  const normalizedOrigin = origin.replace(/\/+$/, '');
  return `${normalizedOrigin}/setup-admin-account?token=${encodeURIComponent(token)}`;
}

export async function issueStaffSetupToken(input: {
  userId: string;
  origin: string;
}) {
  await connectDB();

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = getFutureDate(getSetupTokenHours());
  const issuedAt = new Date();

  await User.findByIdAndUpdate(input.userId, {
    $set: {
      setupTokenHash: hashSetupToken(token),
      setupTokenExpiresAt: expiresAt,
      setupTokenIssuedAt: issuedAt,
    },
  });

  return {
    setupToken: token,
    setupLink: buildStaffSetupLink(input.origin, token),
    setupExpiresAt: expiresAt.toISOString(),
  };
}

export async function clearStaffSetupToken(userId: string) {
  await connectDB();
  await User.findByIdAndUpdate(userId, {
    $set: {
      setupTokenHash: '',
    },
    $unset: {
      setupTokenExpiresAt: 1,
      setupTokenIssuedAt: 1,
    },
  });
}

export async function findStaffUserBySetupToken(token: string) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return null;
  }

  await connectDB();
  const user = (await User.findOne({
    setupTokenHash: hashSetupToken(normalizedToken),
  }).lean()) as StaffUserRecord | null;

  if (!user) {
    return null;
  }

  return user;
}

export async function setStaffPasswordWithToken(input: {
  token: string;
  password: string;
}) {
  const normalizedToken = String(input.token || '').trim();
  if (!normalizedToken) {
    return { success: false as const, error: 'Invalid setup link' };
  }

  const hashedToken = hashSetupToken(normalizedToken);
  const now = new Date();
  const passwordHash = await hashPassword(input.password);
  await connectDB();

  // Atomically claim the token and verify expiration in one query to prevent double-redemption races
  const updatedUser = (await User.findOneAndUpdate(
    {
      setupTokenHash: hashedToken,
      setupTokenExpiresAt: { $gt: now },
    },
    {
      $set: {
        passwordHash,
        passwordSetAt: now,
        setupTokenHash: '',
      },
      $unset: {
        setupTokenExpiresAt: 1,
        setupTokenIssuedAt: 1,
      },
    },
    { new: true }
  ).lean()) as StaffUserRecord | null;

  if (!updatedUser) {
    const existing = (await User.findOne({ setupTokenHash: hashedToken }).lean()) as StaffUserRecord | null;
    if (existing) {
      return { success: false as const, error: 'This setup link has expired' };
    }
    return { success: false as const, error: 'Invalid setup link' };
  }

  const role = updatedUser.role;
  if (!isAdminRole(role)) {
    return { success: false as const, error: 'This setup link is not valid for staff access' };
  }

  return {
    success: true as const,
    loginId: typeof updatedUser.loginId === 'string' ? updatedUser.loginId.trim() : '',
    email: typeof updatedUser.email === 'string' ? updatedUser.email.trim() : '',
    role: role as AdminRole,
  };
}

export async function authorizeStaffCredentials(input: {
  loginId?: string;
  password?: string;
}) {
  const identifier = normalizeIdentifier(input.loginId);
  const password = String(input.password || '');

  if (!identifier || !password) {
    return null;
  }

  await connectDB();
  const user = (await User.findOne({
    $or: [{ email: identifier }, { loginId: identifier }],
  })) as StaffUserRecord | null;

  if (!user || !isAdminRole(user.role) || user.isActive === false) {
    return null;
  }

  const passwordHash = String(user.passwordHash || '').trim();
  if (!passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, passwordHash);
  if (!isValid) {
    return null;
  }

  await User.findByIdAndUpdate(user._id, {
    $set: {
      lastLoginAt: new Date(),
    },
  });

  const email = normalizeIdentifier(user.email);
  const userId = typeof user._id?.toString === 'function' ? user._id.toString() : '';

  return {
    id: userId,
    userId,
    name: String(user.name || '').trim() || email.split('@')[0] || 'Staff',
    email,
    role: user.role as AdminRole,
    isActive: typeof user.isActive === 'boolean' ? user.isActive : true,
    image: typeof user.image === 'string' && user.image.trim() ? user.image.trim() : null,
    createdAt: normalizeCreatedAt(user.createdAt),
    savedArticles: normalizeSavedArticles(user.savedArticles),
  };
}
