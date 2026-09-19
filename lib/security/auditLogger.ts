/**
 * Audit Logger Utility
 * Core functions for logging admin actions and security events
 */

import connectDB from '@/lib/db/mongoose';
import AuditLog, { type IAuditLog } from '@/lib/models/AuditLog';
import { getClientIp } from '@/lib/security/ipUtils';
import type { NextRequest } from 'next/server';

export interface AuditLogInput {
  // Action details
  action: IAuditLog['action'];
  resourceType: IAuditLog['resourceType'];
  resourceId?: string;
  resourceName?: string;

  // User information
  userId: string;
  userEmail: string;
  userRole: string;

  // Request details
  method: IAuditLog['method'];
  endpoint: string;
  statusCode: number;
  duration: number;

  // Optional data
  requestData?: Record<string, unknown>;
  responseStatus?: IAuditLog['responseStatus'];
  errorMessage?: string;
  changesBefore?: Record<string, unknown>;
  changesAfter?: Record<string, unknown>;
  changedFields?: string[];

  // Network details
  ipAddress: string;
  userAgent: string;
  country?: string;
}

type AuditAction = IAuditLog['action'];
type AuditResourceType = IAuditLog['resourceType'];

const MAX_AUDIT_STRING_LENGTH = 2000;
const MAX_AUDIT_ARRAY_LENGTH = 25;
const MAX_AUDIT_OBJECT_KEYS = 50;
const SENSITIVE_AUDIT_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'secret',
  'apiKey',
  'accessKey',
  'authorization',
  'cookie',
  'credential',
  'privateKey',
  'sessionId',
  'setupUrl',
  'creditCard',
  'ssn',
  'pin',
];

function isSensitiveAuditField(key: string) {
  const normalized = key.toLowerCase();
  return SENSITIVE_AUDIT_FIELDS.some((field) =>
    normalized.includes(field.toLowerCase())
  );
}

function sanitizeAuditMessage(value: string) {
  return value
    .slice(0, MAX_AUDIT_STRING_LENGTH)
    .replace(
      /(password|token|secret|api[-_]?key|authorization|cookie|credential|private[-_]?key|session[-_]?id)(\s*[:=]\s*)([^\r\n,;]+)/gi,
      '$1$2[REDACTED]'
    );
}

function isAuditLoggingDisabled() {
  return (
    process.env.DISABLE_AUDIT_LOG === 'true' ||
    process.env.DISABLE_AUDIT_LOG === '1' ||
    (process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_AUDIT_LOG_IN_TESTS !== 'true')
  );
}

/**
 * Log an admin action to the audit log
 * @param input Audit log entry data
 * @returns Created audit log document or null if error
 */
export async function logAuditAction(input: AuditLogInput): Promise<IAuditLog | null> {
  if (isAuditLoggingDisabled()) {
    return null;
  }

  if (!process.env.MONGODB_URI?.trim()) {
    return null;
  }

  try {
    await connectDB();

    const entry = new AuditLog({
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      userId: input.userId,
      userEmail: input.userEmail,
      userRole: input.userRole,
      method: input.method,
      endpoint: input.endpoint,
      statusCode: input.statusCode,
      duration: input.duration,
      requestData: input.requestData ? sanitizeRequestData(input.requestData) : undefined,
      responseStatus: input.responseStatus,
      errorMessage: input.errorMessage
        ? sanitizeAuditMessage(input.errorMessage)
        : undefined,
      changesBefore: input.changesBefore
        ? sanitizeRequestData(input.changesBefore)
        : undefined,
      changesAfter: input.changesAfter
        ? sanitizeRequestData(input.changesAfter)
        : undefined,
      changedFields: input.changedFields,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      country: input.country,
      timestamp: new Date(),
    });

    await entry.save();
    return entry;
  } catch (error) {
    console.error('Failed to log audit action:', error);
    return null;
  }
}

/**
 * Remove sensitive fields from request data before logging
 * @param data Request data object
 * @returns Sanitized data
 */
function sanitizeRequestData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const entries = Object.entries(data).slice(0, MAX_AUDIT_OBJECT_KEYS);

  for (const [key, value] of entries) {
    // Check if field is sensitive
    if (isSensitiveAuditField(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeRequestData(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Sanitize arrays of objects
      sanitized[key] = value.slice(0, MAX_AUDIT_ARRAY_LENGTH).map((item) => {
        if (typeof item === 'object' && item !== null) {
          return sanitizeRequestData(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof value === 'string' && value.length > MAX_AUDIT_STRING_LENGTH) {
      sanitized[key] = `${value.slice(0, MAX_AUDIT_STRING_LENGTH)}...[truncated]`;
    } else {
      sanitized[key] = value;
    }
  }

  if (Object.keys(data).length > MAX_AUDIT_OBJECT_KEYS) {
    sanitized.__truncatedKeys = Object.keys(data).length - MAX_AUDIT_OBJECT_KEYS;
  }

  return sanitized;
}

export function sanitizeAuditPayload(data: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRequestData(data);
}

function inferActionFromMethod(method: string, pathname: string): AuditAction {
  if (pathname.includes('/publish')) return 'publish';
  if (pathname.includes('/archive')) return 'archive';
  if (pathname.includes('/approve')) return 'approve';
  if (pathname.includes('/reject')) return 'reject';
  if (pathname.includes('/assign') || pathname.includes('/reassign')) return 'assign';
  if (pathname.includes('/review') || pathname.includes('/workflow')) return 'review';

  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'read';
  }
}

function inferResourceTypeFromPath(pathname: string): AuditResourceType {
  if (pathname.includes('/articles')) return 'article';
  if (pathname.includes('/videos')) return 'video';
  if (pathname.includes('/stories')) return 'story';
  if (pathname.includes('/epapers')) return 'epaper';
  if (pathname.includes('/team') || pathname.includes('/users')) return 'user';
  if (pathname.includes('/settings')) return 'settings';
  if (pathname.includes('/polls')) return 'poll';
  if (pathname.includes('/categories')) return 'category';
  return 'other';
}

export function buildAuditRequestContext(request: NextRequest) {
  const requestUrl =
    request.nextUrl ||
    (() => {
      try {
        return new URL(request.url);
      } catch {
        return new URL('http://localhost');
      }
    })();

  const safeSearchParams = new URLSearchParams(requestUrl.searchParams);
  for (const key of safeSearchParams.keys()) {
    if (isSensitiveAuditField(key)) {
      safeSearchParams.set(key, '[REDACTED]');
    }
  }
  const safeSearch = safeSearchParams.toString();

  return {
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || 'unknown',
    endpoint: `${requestUrl.pathname}${safeSearch ? `?${safeSearch}` : ''}`,
  };
}

export async function logAdminMutationRequest(args: {
  request: NextRequest;
  userId: string;
  userEmail: string;
  userRole: string;
  statusCode?: number;
  duration?: number;
  resourceId?: string;
  resourceName?: string;
  requestData?: Record<string, unknown>;
  responseStatus?: IAuditLog['responseStatus'];
  errorMessage?: string;
}) {
  const context = buildAuditRequestContext(args.request);
  const pathname = context.endpoint.split('?')[0] || '/';

  return logAuditAction({
    action: inferActionFromMethod(args.request.method, pathname),
    resourceType: inferResourceTypeFromPath(pathname),
    resourceId: args.resourceId,
    resourceName: args.resourceName,
    userId: args.userId,
    userEmail: args.userEmail,
    userRole: args.userRole,
    method: args.request.method.toUpperCase() as IAuditLog['method'],
    endpoint: context.endpoint,
    statusCode: args.statusCode ?? 202,
    duration: args.duration ?? 0,
    requestData: args.requestData,
    responseStatus: args.responseStatus ?? 'success',
    errorMessage: args.errorMessage,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

export async function logAuthAuditEvent(args: {
  action: 'login' | 'logout';
  userId?: string;
  userEmail: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  reason?: string;
}) {
  return logAuditAction({
    action: args.action,
    resourceType: 'auth_session',
    resourceId: args.userId || args.userEmail,
    resourceName: args.userEmail,
    userId: args.userId || 'unknown',
    userEmail: args.userEmail || 'unknown',
    userRole: args.userRole || 'unknown',
    method: 'POST',
    endpoint: args.action === 'logout' ? '/api/auth/signout' : '/api/auth/signin',
    statusCode: args.success ? 200 : 401,
    duration: 0,
    responseStatus: args.success ? 'success' : 'rejected',
    errorMessage: args.success ? undefined : args.reason || 'Authentication failed',
    ipAddress: args.ipAddress || 'unknown',
    userAgent: args.userAgent || 'unknown',
  });
}

/**
 * Log article creation
 */
export async function logArticleCreated(
  userId: string,
  userEmail: string,
  userRole: string,
  articleId: string,
  articleTitle: string,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  return logAuditAction({
    action: 'create',
    resourceType: 'article',
    resourceId: articleId,
    resourceName: articleTitle,
    userId,
    userEmail,
    userRole,
    method: 'POST',
    endpoint: '/api/admin/articles',
    statusCode: 201,
    duration: 0,
    responseStatus: 'success',
    ipAddress,
    userAgent,
  });
}

/**
 * Log article update
 */
export async function logArticleUpdated(
  userId: string,
  userEmail: string,
  userRole: string,
  articleId: string,
  articleTitle: string,
  changesBefore: Record<string, unknown>,
  changesAfter: Record<string, unknown>,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  const changedFields = Object.keys(changesAfter).filter(
    (key) => JSON.stringify(changesBefore[key]) !== JSON.stringify(changesAfter[key])
  );

  return logAuditAction({
    action: 'update',
    resourceType: 'article',
    resourceId: articleId,
    resourceName: articleTitle,
    userId,
    userEmail,
    userRole,
    method: 'PUT',
    endpoint: `/api/admin/articles/${articleId}`,
    statusCode: 200,
    duration: 0,
    responseStatus: 'success',
    changesBefore,
    changesAfter,
    changedFields,
    ipAddress,
    userAgent,
  });
}

/**
 * Log article deletion
 */
export async function logArticleDeleted(
  userId: string,
  userEmail: string,
  userRole: string,
  articleId: string,
  articleTitle: string,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  return logAuditAction({
    action: 'delete',
    resourceType: 'article',
    resourceId: articleId,
    resourceName: articleTitle,
    userId,
    userEmail,
    userRole,
    method: 'DELETE',
    endpoint: `/api/admin/articles/${articleId}`,
    statusCode: 200,
    duration: 0,
    responseStatus: 'success',
    ipAddress,
    userAgent,
  });
}

/**
 * Log article publish
 */
export async function logArticlePublished(
  userId: string,
  userEmail: string,
  userRole: string,
  articleId: string,
  articleTitle: string,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  return logAuditAction({
    action: 'publish',
    resourceType: 'article',
    resourceId: articleId,
    resourceName: articleTitle,
    userId,
    userEmail,
    userRole,
    method: 'POST',
    endpoint: `/api/admin/articles/${articleId}/publish`,
    statusCode: 200,
    duration: 0,
    responseStatus: 'success',
    ipAddress,
    userAgent,
  });
}

/**
 * Log user authentication
 */
export async function logUserLogin(
  userId: string,
  userEmail: string,
  userRole: string,
  ipAddress: string,
  userAgent: string,
  success: boolean
): Promise<IAuditLog | null> {
  return logAuditAction({
    action: 'login',
    resourceType: 'auth_session',
    resourceId: userId,
    resourceName: userEmail,
    userId,
    userEmail,
    userRole,
    method: 'POST',
    endpoint: '/api/auth/signin',
    statusCode: success ? 200 : 401,
    duration: 0,
    responseStatus: success ? 'success' : 'rejected',
    errorMessage: success ? undefined : 'Authentication failed',
    ipAddress,
    userAgent,
  });
}

/**
 * Log user logout
 */
export async function logUserLogout(
  userId: string,
  userEmail: string,
  userRole: string,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  return logAuditAction({
    action: 'logout',
    resourceType: 'auth_session',
    resourceId: userId,
    resourceName: userEmail,
    userId,
    userEmail,
    userRole,
    method: 'POST',
    endpoint: '/api/auth/signout',
    statusCode: 200,
    duration: 0,
    responseStatus: 'success',
    ipAddress,
    userAgent,
  });
}

/**
 * Log settings change
 */
export async function logSettingsChanged(
  userId: string,
  userEmail: string,
  userRole: string,
  settingName: string,
  changesBefore: Record<string, unknown>,
  changesAfter: Record<string, unknown>,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  const changedFields = Object.keys(changesAfter).filter(
    (key) => JSON.stringify(changesBefore[key]) !== JSON.stringify(changesAfter[key])
  );

  return logAuditAction({
    action: 'settings_change',
    resourceType: 'settings',
    resourceName: settingName,
    userId,
    userEmail,
    userRole,
    method: 'PUT',
    endpoint: '/api/admin/settings',
    statusCode: 200,
    duration: 0,
    responseStatus: 'success',
    changesBefore,
    changesAfter,
    changedFields,
    ipAddress,
    userAgent,
  });
}

/**
 * Log user role change
 */
export async function logUserRoleChanged(
  userId: string,
  userEmail: string,
  userRole: string,
  targetUserId: string,
  targetUserEmail: string,
  roleBefore: string,
  roleAfter: string,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  return logAuditAction({
    action: 'update',
    resourceType: 'user',
    resourceId: targetUserId,
    resourceName: targetUserEmail,
    userId,
    userEmail,
    userRole,
    method: 'PUT',
    endpoint: `/api/admin/users/${targetUserId}`,
    statusCode: 200,
    duration: 0,
    responseStatus: 'success',
    changesBefore: { role: roleBefore },
    changesAfter: { role: roleAfter },
    changedFields: ['role'],
    ipAddress,
    userAgent,
  });
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
  userId: string,
  userEmail: string,
  userRole: string,
  description: string,
  ipAddress: string,
  userAgent: string
): Promise<IAuditLog | null> {
  return logAuditAction({
    action: 'read', // Placeholder action
    resourceType: 'other',
    userId,
    userEmail,
    userRole,
    method: 'GET',
    endpoint: '/suspicious-activity',
    statusCode: 200,
    duration: 0,
    responseStatus: 'rejected',
    errorMessage: description,
    ipAddress,
    userAgent,
  });
}

/**
 * Retrieve audit logs with filtering
 */
export async function getAuditLogs(filter: {
  userId?: string;
  action?: IAuditLog['action'];
  resourceType?: IAuditLog['resourceType'];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<IAuditLog[]> {
  try {
    await connectDB();

    const query: Record<string, unknown> = {};

    if (filter.userId) query.userId = filter.userId;
    if (filter.action) query.action = filter.action;
    if (filter.resourceType) query.resourceType = filter.resourceType;

    if (filter.startDate || filter.endDate) {
      query.timestamp = {};
      if (filter.startDate) (query.timestamp as Record<string, unknown>).$gte = filter.startDate;
      if (filter.endDate) (query.timestamp as Record<string, unknown>).$lte = filter.endDate;
    }

    const limit = Math.min(filter.limit || 50, 1000);
    const offset = filter.offset || 0;

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(offset)
      .lean()
      .exec();

    return logs as unknown as IAuditLog[];
  } catch (error) {
    console.error('Failed to retrieve audit logs:', error);
    return [];
  }
}

/**
 * Count audit logs by action (for statistics)
 */
export async function getAuditLogStats(
  startDate?: Date,
  endDate?: Date
): Promise<Record<string, number>> {
  try {
    await connectDB();

    const match: Record<string, unknown> = {};
    if (startDate || endDate) {
      match.timestamp = {};
      if (startDate) (match.timestamp as Record<string, unknown>).$gte = startDate;
      if (endDate) (match.timestamp as Record<string, unknown>).$lte = endDate;
    }

    const stats = await AuditLog.aggregate([
      { $match: match },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const result: Record<string, number> = {};
    stats.forEach((stat) => {
      result[stat._id] = stat.count;
    });

    return result;
  } catch (error) {
    console.error('Failed to get audit log stats:', error);
    return {};
  }
}
