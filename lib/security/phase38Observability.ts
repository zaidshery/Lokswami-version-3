/**
 * Phase 3.8 Observability & Audit Logger
 * Standardized audit events for:
 * - Media: upload, completion, failure, deletion
 * - Video: production start, export, failure
 * - Social: dispatch, retry, reconcile
 * - Push: prepare, cancel, failure
 *
 * Ensures:
 * - Strict credential, URL secret, and token scrubbing
 * - Standardized resourceType and action categorization
 * - Non-blocking execution (never crashes calling flow on persistence failure)
 */

import { logAuditAction } from '@/lib/security/auditLogger';
import type { WorkflowActorRef } from '@/lib/workflow/types';

export type Phase38AuditEventParams = {
  actor: WorkflowActorRef;
  resourceId: string;
  resourceName?: string;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  statusCode?: number;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
};

// -------------------------------------------------------------
// MEDIA AUDIT EVENTS
// -------------------------------------------------------------

export async function auditMediaUploadInitiated(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'create',
    resourceType: 'media',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Media Upload Initiated',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || '/api/admin/media/upload-sessions/init',
    statusCode: params.statusCode || 201,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditMediaUploadCompleted(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'update',
    resourceType: 'media',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Media Upload Completed',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || '/api/admin/media/upload-sessions/complete',
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditMediaUploadFailed(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'create',
    resourceType: 'media',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Media Upload Failed',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || '/api/admin/media/upload-sessions/complete',
    statusCode: params.statusCode || 400,
    duration: 0,
    responseStatus: 'error',
    errorMessage: params.errorMessage || 'Media upload verification failed',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditMediaDeleted(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'delete',
    resourceType: 'media',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Media Deleted',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'DELETE',
    endpoint: params.endpoint || `/api/admin/media/${params.resourceId}`,
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

// -------------------------------------------------------------
// VIDEO AUDIT EVENTS
// -------------------------------------------------------------

export async function auditVideoProductionStarted(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'update',
    resourceType: 'video',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Video Production Started',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'PATCH',
    endpoint: params.endpoint || `/api/admin/videos/${params.resourceId}`,
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditVideoExportCompleted(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'publish',
    resourceType: 'video',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Video Master Export Verified',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || `/api/admin/videos/${params.resourceId}/export`,
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditVideoProductionFailed(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'update',
    resourceType: 'video',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Video Production Failed',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'PATCH',
    endpoint: params.endpoint || `/api/admin/videos/${params.resourceId}`,
    statusCode: params.statusCode || 400,
    duration: 0,
    responseStatus: 'error',
    errorMessage: params.errorMessage || 'Video production pipeline failed',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

// -------------------------------------------------------------
// SOCIAL AUDIT EVENTS
// -------------------------------------------------------------

export async function auditSocialDispatched(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'dispatch',
    resourceType: 'social',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Social Delivery Dispatched',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || `/api/admin/social-deliveries/${params.resourceId}/dispatch`,
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditSocialRetry(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'retry',
    resourceType: 'social',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Social Delivery Retried',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || `/api/admin/social-deliveries/${params.resourceId}/retry`,
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditSocialReconcile(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'reconcile',
    resourceType: 'social',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Social Delivery Reconciled',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || `/api/admin/social-deliveries/${params.resourceId}/reconcile`,
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

// -------------------------------------------------------------
// PUSH AUDIT EVENTS
// -------------------------------------------------------------

export async function auditPushPrepared(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'prepare',
    resourceType: 'push',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Push Alert Prepared',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || '/api/admin/push-alerts/prepare',
    statusCode: params.statusCode || 201,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditPushCancelled(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'cancel',
    resourceType: 'push',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Push Alert Cancelled',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || `/api/admin/push-alerts/${params.resourceId}/cancel`,
    statusCode: params.statusCode || 200,
    duration: 0,
    responseStatus: 'success',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}

export async function auditPushFailed(params: Phase38AuditEventParams): Promise<void> {
  await logAuditAction({
    action: 'update',
    resourceType: 'push',
    resourceId: params.resourceId,
    resourceName: params.resourceName || 'Push Alert Attempt Failed',
    userId: params.actor.id,
    userEmail: params.actor.email,
    userRole: params.actor.role,
    method: params.method || 'POST',
    endpoint: params.endpoint || `/api/admin/push-alerts/${params.resourceId}/dispatch`,
    statusCode: params.statusCode || 400,
    duration: 0,
    responseStatus: 'error',
    errorMessage: params.errorMessage || 'Push alert dispatch failed',
    requestData: params.metadata,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'newsroom-system',
  }).catch(() => null);
}
