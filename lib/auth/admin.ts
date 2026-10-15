import { auth } from '@/lib/auth';
import {
  isAdminRole,
  isSuperAdminRole,
  normalizeAdminRole,
  type AdminRole,
} from '@/lib/auth/roles';
import { isBootstrapAdminUserId } from '@/lib/auth/adminCredentials';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { getJwtSecretOrNull } from '@/lib/auth/jwtSecret';
import { LOKSWAMI_SESSION_COOKIE } from '@/lib/auth/cookies';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { Types } from 'mongoose';
import { registerAdminMutationActor } from '@/lib/security/adminMutationContext';

export type AdminSessionIdentity = {
  id: string;
  email: string;
  name: string;
  username: string;
  role: AdminRole;
};

export type AdminIdentityClaims = {
  userId: string;
  email: string;
  name?: string | null;
  isActive?: boolean;
};

export async function rehydrateAdminIdentity(
  claims: AdminIdentityClaims
): Promise<AdminSessionIdentity | null> {
  const email = (claims.email || '').trim().toLowerCase();
  const userId = String(claims.userId || '').trim();

  if (!email || !userId || claims.isActive === false) {
    return null;
  }

  // 1. Bootstrap super_admin identity bypasses MongoDB lookups entirely
  if (isBootstrapAdminUserId(userId)) {
    const identity: AdminSessionIdentity = {
      id: userId,
      email,
      name: String(claims.name || email.split('@')[0] || 'Admin').trim() || 'Admin',
      username: email,
      role: 'super_admin',
    };

    return registerAdminMutationActor(identity) ? identity : null;
  }

  // 2. DB-backed staff identity: re-hydrate fresh role and active status from MongoDB
  if (!Types.ObjectId.isValid(userId)) {
    return null;
  }

  try {
    await connectDB();
    const dbUser = await User.findById(userId)
      .select('role isActive name email loginId')
      .lean<{
        _id?: unknown;
        role?: unknown;
        isActive?: boolean;
        name?: string;
        email?: string;
        loginId?: string;
      } | null>();

    if (!dbUser || dbUser.isActive === false) {
      return null;
    }

    const freshRole = normalizeAdminRole(dbUser.role);
    if (!freshRole || !isAdminRole(freshRole)) {
      return null;
    }

    const freshEmail = (dbUser.email || email).trim().toLowerCase();
    const freshName =
      (dbUser.name || '').trim() ||
      (claims.name ? String(claims.name).trim() : '') ||
      freshEmail.split('@')[0] ||
      'Admin';
    const username = (dbUser.loginId || '').trim() || freshEmail;

    const identity: AdminSessionIdentity = {
      id: userId,
      email: freshEmail,
      name: freshName,
      username,
      role: freshRole,
    };

    return registerAdminMutationActor(identity) ? identity : null;
  } catch (error) {
    console.error('Failed to rehydrate admin session from database:', error);
    return null;
  }
}

export async function getAdminSession(): Promise<AdminSessionIdentity | null> {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser) {
    return null;
  }

  const email = (sessionUser.email || '').trim().toLowerCase();
  const userId = String(sessionUser.userId || sessionUser.id || '').trim();

  return rehydrateAdminIdentity({
    userId,
    email,
    name: sessionUser.name,
    isActive: sessionUser.isActive,
  });
}

export async function getSuperAdminSession(): Promise<AdminSessionIdentity | null> {
  const session = await getAdminSession();

  if (!session || !isSuperAdminRole(session.role)) {
    return null;
  }

  return session;
}

export async function getAdminSessionFromReq(req: NextRequest): Promise<AdminSessionIdentity | null> {
  const secret = getJwtSecretOrNull();
  if (!secret) return null;

  // Next.js 15 fix: construct a minimal request object for getToken
  // to avoid disturbing the actual request body stream.
  const minimalReq = {
    headers: Object.fromEntries(req.headers.entries()),
    cookies: Object.fromEntries(
      req.cookies.getAll().map((c) => [c.name, c.value])
    ),
  } as unknown as Parameters<typeof getToken>[0]['req'];

  const token = await getToken({
    req: minimalReq,
    secret,
    cookieName: LOKSWAMI_SESSION_COOKIE,
  });

  if (!token) return null;

  const email = (token.email || '').trim().toLowerCase();
  const tokenUserId = String(token.userId || token.id || token.sub || '').trim();

  return rehydrateAdminIdentity({
    userId: tokenUserId,
    email,
    name: typeof token.name === 'string' ? token.name : null,
    isActive: token.isActive as boolean | undefined,
  });
}

export async function getSuperAdminSessionFromReq(req: NextRequest): Promise<AdminSessionIdentity | null> {
  const session = await getAdminSessionFromReq(req);

  if (!session || !isSuperAdminRole(session.role)) {
    return null;
  }

  return session;
}
