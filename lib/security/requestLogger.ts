/**
 * API Request Logger
 * Writes lightweight JSONL request logs for incident response and forensics.
 */

import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/security/ipUtils';

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

const SENSITIVE_QUERY_KEYS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'code',
  'state',
  'session',
];

const MAX_LOG_FIELD_LENGTH = 1000;

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

function truncateField(value: string) {
  if (value.length <= MAX_LOG_FIELD_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_FIELD_LENGTH)}...[truncated]`;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isSensitiveQueryKey(key: string) {
  const normalized = key.toLowerCase().replace(/[-\s]/g, '_');
  return normalized === 'q' || normalized === 'query' ||
    SENSITIVE_QUERY_KEYS.some((sensitive) => normalized.includes(sensitive));
}

export function sanitizeRequestLogPath(pathWithSearch: string) {
  const [pathname, query = ''] = pathWithSearch.split('?');
  if (!query) return pathname || '/';

  const params = new URLSearchParams(query);
  const sanitized = new URLSearchParams();

  params.forEach((value, key) => {
    sanitized.append(key, isSensitiveQueryKey(key) ? '[REDACTED]' : truncateField(value));
  });

  const nextQuery = sanitized.toString();
  return nextQuery ? `${pathname || '/'}?${nextQuery}` : pathname || '/';
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
  const userEmail = getString(session?.email);
  const userRole = getString(session?.role);
  const rawPath = `${args.request.nextUrl.pathname}${args.request.nextUrl.search}`;

  return {
    timestamp: timestamp.toISOString(),
    method: args.request.method.toUpperCase(),
    path: sanitizeRequestLogPath(rawPath),
    status: args.status,
    duration: Math.max(0, Math.round(args.duration)),
    userId,
    userEmail,
    userRole,
    ip: getClientIp(args.request),
    userAgent: truncateField(args.request.headers.get('user-agent') || 'unknown'),
  };
}

export function serializeRequestLogEntry(entry: RequestLogEntry) {
  return `${JSON.stringify(entry)}\n`;
}

export async function writeRequestLog(entry: RequestLogEntry) {
  if (isRequestLoggingDisabled()) return;

  try {
    const timestamp = new Date(entry.timestamp);
    const filePath = getLogFilePath(Number.isNaN(timestamp.getTime()) ? new Date() : timestamp);
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, serializeRequestLogEntry(entry), 'utf8');
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
