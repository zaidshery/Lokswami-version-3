/**
 * API Request Logger
 * Writes lightweight JSONL request logs for incident response and forensics.
 */

import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export type RequestLogEntry = {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  ip: string;
  userAgent: string;
};

type SessionLike = {
  userId?: unknown;
  id?: unknown;
  sub?: unknown;
  email?: unknown;
  role?: unknown;
};

function isRequestLoggingDisabled() {
  return process.env.DISABLE_REQUEST_LOG === 'true' || process.env.DISABLE_REQUEST_LOG === '1';
}

function getLogDir() {
  return path.resolve(
    process.cwd(),
    process.env.REQUEST_LOG_DIR?.trim() || 'storage/logs/security'
  );
}

function getLogFilePath(timestamp: Date) {
  const date = timestamp.toISOString().slice(0, 10);
  return path.join(getLogDir(), `${date}-api-requests.jsonl`);
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function sanitizeRequestLogPath(pathWithSearch: string) {
  return pathWithSearch.split(/[?#]/, 1)[0] || '/';
}

export function buildRequestLogEntry(args: {
  request: NextRequest;
  status: number;
  duration: number;
  session?: SessionLike | null;
  timestamp?: Date;
}): RequestLogEntry {
  const timestamp = args.timestamp || new Date();
  const session = args.session || null;
  const userId = getString(session?.userId) || getString(session?.id) || getString(session?.sub);
  const userRole = getString(session?.role);
  const rawPath = `${args.request.nextUrl.pathname}${args.request.nextUrl.search}`;

  return {
    timestamp: timestamp.toISOString(),
    method: args.request.method.toUpperCase(),
    path: sanitizeRequestLogPath(rawPath),
    status: args.status,
    duration: Math.max(0, Math.round(args.duration)),
    userId,
    userEmail: null,
    userRole,
    ip: '',
    userAgent: '',
  };
}

export function serializeRequestLogEntry(entry: RequestLogEntry) {
  // Enforce minimization at the final persistence boundary, including callers
  // that construct an entry themselves instead of using buildRequestLogEntry.
  return `${JSON.stringify({ ...entry, path: sanitizeRequestLogPath(entry.path), userEmail: null, ip: '', userAgent: '' })}\n`;
}

export async function writeRequestLog(entry: RequestLogEntry) {
  if (isRequestLoggingDisabled()) return;

  try {
    const timestamp = new Date(entry.timestamp);
    const filePath = getLogFilePath(Number.isNaN(timestamp.getTime()) ? new Date() : timestamp);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await appendFile(filePath, serializeRequestLogEntry(entry), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.error('Failed to write request log:', error);
  }
}

export async function logApiRequestFromMiddleware(args: {
  request: NextRequest;
  responseStatus: number;
  startedAt: number;
  session?: SessionLike | null;
}) {
  if (!args.request.nextUrl.pathname.startsWith('/api/')) return;

  const entry = buildRequestLogEntry({
    request: args.request,
    status: args.responseStatus,
    duration: Date.now() - args.startedAt,
    session: args.session,
  });

  await writeRequestLog(entry);
}
