import { verifyPassword } from '@/lib/auth/jwt';

type AdminCredentialsProfile = {
  userId: string;
  name: string;
  email: string;
  username: string;
  passwordHash: string;
};

let hasWarnedAboutEscapedAdminPasswordHash = false;

function normalizeIdentifier(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function unwrapQuotedValue(value: string) {
  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1).trim();
  }

  return trimmedValue;
}

function normalizePasswordHash(value: string | null | undefined) {
  const rawHash = unwrapQuotedValue(value || '');
  if (!rawHash) {
    return '';
  }

  const normalizedHash = rawHash.replace(/\\\$/g, '$');

  if (normalizedHash !== rawHash && !hasWarnedAboutEscapedAdminPasswordHash) {
    hasWarnedAboutEscapedAdminPasswordHash = true;
    console.warn(
      'ADMIN_PASSWORD_HASH contains escaped "$" characters. Normalizing it for bcrypt; update the env value to remove backslashes.'
    );
  }

  return normalizedHash;
}

function getConfiguredProfile(): AdminCredentialsProfile | null {
  const username = normalizeIdentifier(
    process.env.ADMIN_LOGIN_ID || process.env.ADMIN_USERNAME
  );
  const email = normalizeIdentifier(process.env.ADMIN_EMAIL);
  const passwordHash = normalizePasswordHash(process.env.ADMIN_PASSWORD_HASH);
  const name = (process.env.ADMIN_DISPLAY_NAME || 'Admin').trim() || 'Admin';

  if (!username || !passwordHash) {
    return null;
  }

  const safeEmail = email || `${username}@lokswami.local`;

  return {
    userId: `env-admin:${username}`,
    name,
    email: safeEmail,
    username,
    passwordHash,
  };
}

export function isAdminCredentialsAuthConfigured() {
  return Boolean(getConfiguredProfile());
}

export function isBootstrapAdminUserId(userId: unknown): boolean {
  return typeof userId === 'string' && userId.trim().startsWith('env-admin:');
}

export function getConfiguredBootstrapLoginIds(): Set<string> {
  const ids = new Set<string>();
  const loginId = normalizeIdentifier(process.env.ADMIN_LOGIN_ID);
  if (loginId) {
    ids.add(loginId);
  }
  const username = normalizeIdentifier(process.env.ADMIN_USERNAME);
  if (username) {
    ids.add(username);
  }
  return ids;
}

export function isConfiguredBootstrapLoginId(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = normalizeIdentifier(value);
  const configured = getConfiguredBootstrapLoginIds();
  return configured.has(normalized);
}

export async function authorizeAdminCredentials(input: {
  loginId?: string;
  password?: string;
}) {
  const profile = getConfiguredProfile();
  if (!profile) {
    return null;
  }

  const loginId = normalizeIdentifier(input.loginId);
  const password = input.password || '';

  if (!loginId || !password) {
    return null;
  }

  const allowedIdentifiers = new Set<string>([
    profile.username,
    profile.email,
  ]);

  if (!allowedIdentifiers.has(loginId)) {
    return null;
  }

  const isValidPassword = await verifyPassword(password, profile.passwordHash);
  if (!isValidPassword) {
    return null;
  }

  return {
    id: profile.userId,
    userId: profile.userId,
    name: profile.name,
    email: profile.email,
    role: 'super_admin' as const,
    isActive: true,
    image: null,
    savedArticles: [],
  };
}
