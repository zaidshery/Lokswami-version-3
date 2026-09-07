import NextAuth, { CredentialsSignin, type NextAuthConfig } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { LOKSWAMI_SESSION_COOKIE } from '@/lib/auth/cookies';
import { authorizeAdminCredentials } from '@/lib/auth/adminCredentials';
import { authorizeStaffCredentials } from '@/lib/auth/staffCredentials';
import { normalizeRedirectPath } from '@/lib/auth/redirect';
import {
  isAdminRole,
  normalizeUserRole,
  type UserRole,
} from '@/lib/auth/roles';
import { getJwtSecretOrNull } from '@/lib/auth/jwtSecret';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { authorizeReaderCredentials } from '@/lib/auth/readerCredentials';
import { logAuthAuditEvent } from '@/lib/security/auditLogger';
import { getLoginLimiter } from '@/lib/security/getRateLimiter';

type SyncableUser = {
  id?: string;
  userId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: UserRole;
  isActive?: boolean;
  whatsappNumber?: string | null;
  optInDailyEpaper?: boolean;
  createdAt?: string;
  savedArticles?: string[];
};

class LoginRateLimitError extends CredentialsSignin {
  code = 'rate_limited';
}

function normalizeIpForAuthRateLimit(value: string) {
  const ip = value.trim();
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('[')) return ip.split(']')[0] + ']';
  if (ip.includes(':')) return ip.split(':')[0] || ip;
  return ip;
}

function getCredentialLoginRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip =
    request.headers.get('cf-connecting-ip')?.trim() ||
    forwardedFor ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';

  return `login:ip:${normalizeIpForAuthRateLimit(ip)}`;
}

function throwIfCredentialLoginBlocked(request: Request, loginId: string) {
  const loginLimiter = getLoginLimiter();
  const key = getCredentialLoginRateLimitKey(request);
  const status = loginLimiter.getStatus(key);

  if (status?.blocked) {
    if (loginId.trim()) {
      void logAuthAuditEvent({
        action: 'login',
        userEmail: loginId.trim().toLowerCase(),
        success: false,
        reason: 'Credential login rate limited',
      });
    }

    throw new LoginRateLimitError();
  }

  return { key, loginLimiter };
}

type DbUserRecord = {
  _id?: unknown;
  name?: string;
  email?: string;
  image?: string;
  role?: unknown;
  isActive?: boolean;
  whatsappNumber?: string;
  optInDailyEpaper?: boolean;
  createdAt?: Date | string;
  savedArticles?: unknown;
};

type SessionProfile = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  isActive: boolean;
  whatsappNumber?: string | null;
  optInDailyEpaper?: boolean;
  createdAt?: string;
  savedArticles: string[];
};

const SIGNIN_ROUTE = '/signin';
const MAIN_ROUTE = '/main';
const POST_AUTH_MARKER = '1';
const POST_AUTH_QUERY_PARAM = 'postAuth';

function normalizeOrigin(value: string | undefined) {
  return (value || '').trim().replace(/\/+$/, '');
}

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
const nextAuthSecret = getJwtSecretOrNull() || '';
const nextAuthUrl = normalizeOrigin(process.env.NEXTAUTH_URL);
const adminGoogleLoginEnabled =
  process.env.ADMIN_GOOGLE_LOGIN_ENABLED?.trim().toLowerCase() === 'true';
const bootstrapAdminEmails = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

export const isAdminGoogleAuthConfigured = Boolean(
  adminGoogleLoginEnabled &&
    googleClientId &&
    googleClientSecret &&
    nextAuthSecret &&
    nextAuthUrl
);

function normalizeEmail(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function isBootstrapAdminEmail(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(
    adminGoogleLoginEnabled && normalizedEmail && bootstrapAdminEmails.has(normalizedEmail)
  );
}

function resolveDisplayName(user: SyncableUser) {
  const normalizedName = user.name?.trim();
  if (normalizedName) {
    return normalizedName;
  }

  const emailPrefix = normalizeEmail(user.email).split('@')[0]?.trim();
  return emailPrefix || 'User';
}

function normalizeSavedArticles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((articleId) => String(articleId));
}

function normalizeRole(value: unknown): UserRole | null {
  return normalizeUserRole(value);
}

function normalizeCreatedAt(value: Date | string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getAuthErrorRedirect(errorCode: string) {
  return `${SIGNIN_ROUTE}?error=${encodeURIComponent(errorCode)}`;
}

function buildFallbackProfile(user: SyncableUser, role: UserRole): SessionProfile {
  const normalizedEmail = normalizeEmail(user.email);

  return {
    userId: user.userId?.trim() || user.id?.trim() || normalizedEmail || `${role}-user`,
    name: resolveDisplayName(user),
    email: normalizedEmail,
    image: user.image?.trim() || null,
    role,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    savedArticles: Array.isArray(user.savedArticles) ? user.savedArticles : [],
  };
}

function isRecoverableMongoAuthError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('mongodb_uri is not set') ||
    message.includes('querysrv') ||
    message.includes('server selection') ||
    message.includes('connection failed') ||
    message.includes('timed out') ||
    message.includes('etimeout') ||
    message.includes('enotfound') ||
    message.includes('econnrefused')
  );
}

function buildSessionProfileFromDbUser(dbUser: DbUserRecord): SessionProfile | null {
  const email = normalizeEmail(dbUser.email);
  const role = normalizeRole(dbUser.role);

  if (!email || !role) {
    return null;
  }

  const userId = typeof dbUser._id?.toString === 'function' ? dbUser._id.toString() : '';
  if (!userId) {
    return null;
  }

  return {
    userId,
    name: (dbUser.name || '').trim() || email.split('@')[0] || 'User',
    email,
    image: (dbUser.image || '').trim() || null,
    role,
    isActive: dbUser.isActive !== false,
    whatsappNumber: typeof dbUser.whatsappNumber === 'string' ? dbUser.whatsappNumber : undefined,
    optInDailyEpaper: dbUser.optInDailyEpaper !== false,
    createdAt: normalizeCreatedAt(dbUser.createdAt),
    savedArticles: normalizeSavedArticles(dbUser.savedArticles),
  };
}

function assignProfileToUser(user: SyncableUser, profile: SessionProfile) {
  user.id = profile.userId;
  user.userId = profile.userId;
  user.name = profile.name;
  user.email = profile.email;
  user.image = profile.image;
  user.role = profile.role;
  user.isActive = profile.isActive;
  user.whatsappNumber = profile.whatsappNumber;
  user.optInDailyEpaper = profile.optInDailyEpaper;
  user.createdAt = profile.createdAt;
  user.savedArticles = profile.savedArticles;
}

function buildProviders(): NonNullable<NextAuthConfig['providers']> {
  const providers: NonNullable<NextAuthConfig['providers']> = [
    CredentialsProvider({
      name: 'Admin Credentials',
      credentials: {
        loginId: {
          label: 'Login ID',
          type: 'text',
        },
        password: {
          label: 'Password',
          type: 'password',
        },
      },
      async authorize(credentials, request) {
        const loginId =
          typeof credentials?.loginId === 'string' ? credentials.loginId : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';
        const credentialLimit = throwIfCredentialLoginBlocked(request, loginId);
        const envAdmin = await authorizeAdminCredentials({ loginId, password });
        if (envAdmin) {
          credentialLimit.loginLimiter.reset(credentialLimit.key);
          return envAdmin;
        }

        const staffUser = await authorizeStaffCredentials({ loginId, password });
        if (staffUser) {
          credentialLimit.loginLimiter.reset(credentialLimit.key);
          return staffUser;
        }

        const readerUser = await authorizeReaderCredentials({ loginId, password });
        if (readerUser) {
          credentialLimit.loginLimiter.reset(credentialLimit.key);
          return readerUser;
        }

        const rateLimitResult = credentialLimit.loginLimiter.check(credentialLimit.key);
        if (loginId.trim()) {
          void logAuthAuditEvent({
            action: 'login',
            userEmail: loginId.trim().toLowerCase(),
            success: false,
            reason: rateLimitResult.allowed
              ? 'Invalid credentials'
              : 'Credential login rate limited',
          });
        }

        if (!rateLimitResult.allowed) {
          throw new LoginRateLimitError();
        }

        return null;
      },
    }),
  ];

  if (googleClientId && googleClientSecret) {
    providers.push(
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      })
    );
  }

  return providers;
}

async function getUserByEmail(email: string) {
  await connectDB();
  return User.findOne({ email }).lean<DbUserRecord | null>();
}

async function createReaderUser(user: SyncableUser) {
  await connectDB();

  const createdUser = await User.create({
    name: resolveDisplayName(user),
    email: normalizeEmail(user.email),
    image: user.image?.trim() || '',
    role: 'reader',
    isActive: true,
    lastLoginAt: new Date(),
    savedArticles: [],
    preferredLanguage: 'hi',
    preferredCategories: [],
    notificationsEnabled: false,
  });

  return User.findById(createdUser._id).lean<DbUserRecord | null>();
}

async function upsertBootstrapAdminUser(user: SyncableUser) {
  await connectDB();

  const email = normalizeEmail(user.email);
  if (!email) {
    return null;
  }

  const name = resolveDisplayName(user);
  const image = user.image?.trim() || '';

  const createdOrUpdatedUser = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        image,
        role: 'super_admin',
        isActive: true,
        lastLoginAt: new Date(),
      },
      $setOnInsert: {
        email,
        savedArticles: [],
        preferredLanguage: 'hi',
        preferredCategories: [],
        notificationsEnabled: false,
      },
    },
    {
      upsert: true,
      new: true,
    }
  ).lean<DbUserRecord | null>();

  return createdOrUpdatedUser;
}

async function touchUserForLogin(existingUser: DbUserRecord, user: SyncableUser) {
  await connectDB();

  const nextName = resolveDisplayName(user);
  const nextImage = user.image?.trim() || '';

  const updatedUser = await User.findByIdAndUpdate(
    existingUser._id,
    {
      $set: {
        name: nextName,
        image: nextImage,
        lastLoginAt: new Date(),
      },
    },
    { new: true }
  ).lean<DbUserRecord | null>();

  return updatedUser;
}

function isAllowedPostAuthSignInUrl(url: URL) {
  return (
    url.pathname === SIGNIN_ROUTE &&
    url.searchParams.get(POST_AUTH_QUERY_PARAM) === POST_AUTH_MARKER
  );
}

function resolveSafeRedirectPath(path: string, baseUrl: string): string | null {
  const normalizedPath = normalizeRedirectPath(path, '');
  if (!normalizedPath) {
    return null;
  }

  const parsedPath = new URL(normalizedPath, baseUrl);

  if (parsedPath.pathname === '/login') {
    parsedPath.pathname = SIGNIN_ROUTE;
  }

  if (parsedPath.pathname === SIGNIN_ROUTE) {
    if (isAllowedPostAuthSignInUrl(parsedPath) || parsedPath.searchParams.has('error')) {
      return parsedPath.toString();
    }

    return (
      resolveSafeRedirectUrl(parsedPath.searchParams.get('redirect'), baseUrl) ||
      resolveSafeRedirectUrl(parsedPath.searchParams.get('callbackUrl'), baseUrl) ||
      `${baseUrl}${MAIN_ROUTE}`
    );
  }

  return parsedPath.toString();
}

function resolveSafeRedirectUrl(
  url: string | null | undefined,
  baseUrl: string
): string | null {
  const next = (url || '').trim();
  if (!next) {
    return null;
  }

  if (next.startsWith('/')) {
    return resolveSafeRedirectPath(next, baseUrl);
  }

  try {
    const parsedUrl = new URL(next);
    if (parsedUrl.origin !== baseUrl) {
      return null;
    }

    return resolveSafeRedirectPath(
      `${parsedUrl.pathname}${parsedUrl.search}`,
      baseUrl
    );
  } catch {
    return null;
  }
}

function buildAuthOptions(): NextAuthConfig {
  return {
    session: {
      strategy: 'jwt',
    },
    cookies: {
      sessionToken: {
        name: LOKSWAMI_SESSION_COOKIE,
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: process.env.NODE_ENV === 'production',
        },
      },
    },
    pages: {
      signIn: SIGNIN_ROUTE,
      error: SIGNIN_ROUTE,
    },
    secret: nextAuthSecret || undefined,
    trustHost: true,
    providers: buildProviders(),
    callbacks: {
      async signIn({ user, account }) {
        if (account?.provider === 'credentials') {
          const allowed = Boolean(
            user.email &&
              isAdminRole(user.role) &&
              user.isActive !== false
          );
          void logAuthAuditEvent({
            action: 'login',
            userId: user.userId || user.id || user.email || 'unknown',
            userEmail: user.email || 'unknown',
            userRole: typeof user.role === 'string' ? user.role : 'unknown',
            success: allowed,
            reason: allowed ? undefined : 'Credentials user is inactive or not an admin role',
          });
          return allowed;
        }

        if (account?.provider !== 'google') {
          return false;
        }

        const normalizedEmail = normalizeEmail(user.email);
        if (!normalizedEmail) {
          return getAuthErrorRedirect('OAuthError');
        }

        try {
          const existingUser = await getUserByEmail(normalizedEmail);

          if (!existingUser) {
            if (isBootstrapAdminEmail(normalizedEmail)) {
              const bootstrapAdmin = await upsertBootstrapAdminUser(user);
              const bootstrapProfile =
                (bootstrapAdmin && buildSessionProfileFromDbUser(bootstrapAdmin)) ||
                buildFallbackProfile(user, 'super_admin');

              assignProfileToUser(user, bootstrapProfile);
              void logAuthAuditEvent({
                action: 'login',
                userId: user.userId || user.id || normalizedEmail,
                userEmail: normalizedEmail,
                userRole: 'super_admin',
                success: true,
              });
              return true;
            }

            const createdReader = await createReaderUser(user);
            const createdProfile =
              (createdReader && buildSessionProfileFromDbUser(createdReader)) ||
              buildFallbackProfile(user, 'reader');

            assignProfileToUser(user, createdProfile);
            void logAuthAuditEvent({
              action: 'login',
              userId: user.userId || user.id || normalizedEmail,
              userEmail: normalizedEmail,
              userRole: 'reader',
              success: true,
            });
            return true;
          }

          const existingRole = normalizeRole(existingUser.role);
          if (!existingRole) {
            return getAuthErrorRedirect('OAuthError');
          }

          if (isAdminRole(existingRole) && !adminGoogleLoginEnabled) {
            void logAuthAuditEvent({
              action: 'login',
              userId:
                typeof existingUser._id?.toString === 'function'
                  ? existingUser._id.toString()
                  : normalizedEmail,
              userEmail: normalizedEmail,
              userRole: existingRole,
              success: false,
              reason: 'Admin Google login disabled',
            });
            return getAuthErrorRedirect('no_admin_access');
          }

          if (existingRole === 'reader' && isBootstrapAdminEmail(normalizedEmail)) {
            const bootstrapAdmin = await upsertBootstrapAdminUser(user);
            const bootstrapProfile =
              (bootstrapAdmin && buildSessionProfileFromDbUser(bootstrapAdmin)) ||
              buildFallbackProfile(user, 'super_admin');

            assignProfileToUser(user, bootstrapProfile);
            void logAuthAuditEvent({
              action: 'login',
              userId: user.userId || user.id || normalizedEmail,
              userEmail: normalizedEmail,
              userRole: 'super_admin',
              success: true,
            });
            return true;
          }

          if (isAdminRole(existingRole) && existingUser.isActive === false) {
            void logAuthAuditEvent({
              action: 'login',
              userId:
                typeof existingUser._id?.toString === 'function'
                  ? existingUser._id.toString()
                  : normalizedEmail,
              userEmail: normalizedEmail,
              userRole: existingRole,
              success: false,
              reason: 'Inactive account',
            });
            return getAuthErrorRedirect('inactive');
          }

          const updatedUser = await touchUserForLogin(existingUser, user);
          const profile =
            (updatedUser && buildSessionProfileFromDbUser(updatedUser)) ||
            buildFallbackProfile(user, existingRole);

          assignProfileToUser(user, profile);
          void logAuthAuditEvent({
            action: 'login',
            userId: profile.userId || normalizedEmail,
            userEmail: normalizedEmail,
            userRole: profile.role,
            success: true,
          });
          return true;
        } catch (error) {
          if (isRecoverableMongoAuthError(error)) {
            const fallbackRole = isBootstrapAdminEmail(normalizedEmail)
              ? 'super_admin'
              : 'reader';

            console.warn(
              'MongoDB unavailable during Google sign-in, using fallback session profile.',
              {
                email: normalizedEmail,
                role: fallbackRole,
                error: error instanceof Error ? error.message : String(error),
              }
            );

            assignProfileToUser(user, buildFallbackProfile(user, fallbackRole));
            void logAuthAuditEvent({
              action: 'login',
              userId: user.userId || user.id || normalizedEmail,
              userEmail: normalizedEmail,
              userRole: fallbackRole,
              success: true,
              reason: 'MongoDB fallback sign-in',
            });
            return true;
          }

          console.error('NextAuth sign-in failed:', error);
          return getAuthErrorRedirect('OAuthError');
        }
      },
      async jwt({ token, user }) {
        if (user) {
          const userId =
            user.userId ||
            user.id ||
            (typeof token.sub === 'string' ? token.sub : '') ||
            '';

          token.id = userId;
          token.userId = userId;
          token.role = user.role || 'reader';
          token.isActive = user.isActive !== false;
          token.whatsappNumber = user.whatsappNumber;
          token.optInDailyEpaper = user.optInDailyEpaper;
          token.savedArticles = Array.isArray(user.savedArticles)
            ? user.savedArticles
            : [];
          token.createdAt = user.createdAt;
          token.picture =
            typeof user.image === 'string' || user.image === null
              ? user.image
              : token.picture;

          return token;
        }

        const tokenEmail = normalizeEmail(token.email);
        const hasHydratedRole = Boolean(normalizeRole(token.role));
        const hasHydratedUserId =
          typeof token.userId === 'string' && token.userId.trim().length > 0;

        if (!tokenEmail || (hasHydratedRole && hasHydratedUserId)) {
          return token;
        }

        try {
          const dbUser = await getUserByEmail(tokenEmail);
          const dbProfile = dbUser && buildSessionProfileFromDbUser(dbUser);

          if (dbProfile) {
            token.id = dbProfile.userId;
            token.userId = dbProfile.userId;
            token.role = dbProfile.role;
            token.isActive = dbProfile.isActive;
            token.createdAt = dbProfile.createdAt;
            token.savedArticles = dbProfile.savedArticles;
            token.picture = dbProfile.image;
          }
        } catch (error) {
          console.error('Failed to hydrate JWT from MongoDB:', error);
        }

        return token;
      },
      async session({ session, token }) {
        const sessionEmail = normalizeEmail(session.user?.email || token.email);
        const fallbackRole = normalizeRole(token.role) || 'reader';
        const fallbackUserId =
          (typeof token.userId === 'string' && token.userId) ||
          (typeof token.id === 'string' && token.id) ||
          '';

        session.user.id = fallbackUserId;
        session.user.userId = fallbackUserId;
        session.user.role = fallbackRole;
        session.user.isActive = token.isActive !== false;
        session.user.whatsappNumber =
          typeof token.whatsappNumber === 'string' ? token.whatsappNumber : undefined;
        session.user.optInDailyEpaper =
          typeof token.optInDailyEpaper === 'boolean' ? token.optInDailyEpaper : undefined;
        session.user.savedArticles = Array.isArray(token.savedArticles)
          ? token.savedArticles
          : [];
        session.user.createdAt =
          typeof token.createdAt === 'string' ? token.createdAt : undefined;
        session.user.image =
          typeof token.picture === 'string' || token.picture === null
            ? token.picture
            : session.user.image;

        if (sessionEmail) {
          session.user.email = sessionEmail;
        }

        if (typeof token.name === 'string' && token.name.trim()) {
          session.user.name = token.name;
        }

        if (!sessionEmail) {
          return session;
        }

        try {
          const dbUser = await getUserByEmail(sessionEmail);
          const dbProfile = dbUser && buildSessionProfileFromDbUser(dbUser);

          if (dbProfile) {
            session.user.id = dbProfile.userId;
            session.user.userId = dbProfile.userId;
            session.user.role = dbProfile.role;
            session.user.isActive = dbProfile.isActive;
            session.user.name = dbProfile.name;
            session.user.email = dbProfile.email;
            session.user.image = dbProfile.image;
            session.user.whatsappNumber = dbProfile.whatsappNumber;
            session.user.optInDailyEpaper = dbProfile.optInDailyEpaper;
            session.user.createdAt = dbProfile.createdAt;
            session.user.savedArticles = dbProfile.savedArticles;

            token.id = dbProfile.userId;
            token.userId = dbProfile.userId;
            token.role = dbProfile.role;
            token.isActive = dbProfile.isActive;
            token.whatsappNumber = dbProfile.whatsappNumber;
            token.optInDailyEpaper = dbProfile.optInDailyEpaper;
            token.createdAt = dbProfile.createdAt;
            token.savedArticles = dbProfile.savedArticles;
            token.picture = dbProfile.image;
          }
        } catch (error) {
          console.error('Failed to hydrate session from MongoDB:', error);
        }

        return session;
      },
      async redirect({ url, baseUrl }) {
        return resolveSafeRedirectUrl(url, baseUrl) || `${baseUrl}${MAIN_ROUTE}`;
      },
    },
  };
}

export const authOptions = buildAuthOptions();

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
