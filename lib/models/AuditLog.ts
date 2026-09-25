/**
 * AuditLog Model
 * Tracks all admin actions for compliance and forensics
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  // Action details
  action:
    | 'create'
    | 'read'
    | 'update'
    | 'delete'
    | 'publish'
    | 'archive'
    | 'assign'
    | 'review'
    | 'approve'
    | 'reject'
    | 'login'
    | 'logout'
    | 'settings_change'
    | 'dispatch'
    | 'retry'
    | 'reconcile'
    | 'prepare'
    | 'cancel';
  resourceType:
    | 'article'
    | 'video'
    | 'story'
    | 'epaper'
    | 'user'
    | 'settings'
    | 'role'
    | 'poll'
    | 'category'
    | 'auth_session'
    | 'media'
    | 'social'
    | 'push'
    | 'other';
  resourceId?: string;
  resourceName?: string;

  // User information
  userId: string;
  userEmail: string;
  userRole: string;

  // Request details
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  statusCode: number;
  duration: number; // milliseconds

  // Request/Response data
  requestData?: Record<string, unknown>;
  responseStatus?: 'success' | 'error' | 'rejected';
  errorMessage?: string;

  // Change tracking (for update/delete actions)
  changesBefore?: Record<string, unknown>;
  changesAfter?: Record<string, unknown>;
  changedFields?: string[];

  // Network details
  ipAddress: string;
  userAgent: string;
  country?: string;

  // Metadata
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'create',
        'read',
        'update',
        'delete',
        'publish',
        'archive',
        'assign',
        'review',
        'approve',
        'reject',
        'login',
        'logout',
        'settings_change',
        'dispatch',
        'retry',
        'reconcile',
        'prepare',
        'cancel',
      ],
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      enum: [
        'article',
        'video',
        'story',
        'epaper',
        'user',
        'settings',
        'role',
        'poll',
        'category',
        'auth_session',
        'media',
        'social',
        'push',
        'other',
      ],
      index: true,
    },
    resourceId: {
      type: String,
      sparse: true,
      index: true,
    },
    resourceName: {
      type: String,
      sparse: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
      index: true,
    },
    userRole: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    },
    endpoint: {
      type: String,
      required: true,
      index: true,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    requestData: {
      type: Schema.Types.Mixed,
      sparse: true,
      // Exclude sensitive fields in middleware
    },
    responseStatus: {
      type: String,
      enum: ['success', 'error', 'rejected'],
      sparse: true,
    },
    errorMessage: {
      type: String,
      sparse: true,
    },
    changesBefore: {
      type: Schema.Types.Mixed,
      sparse: true,
    },
    changesAfter: {
      type: Schema.Types.Mixed,
      sparse: true,
    },
    changedFields: {
      type: [String],
      sparse: true,
    },
    ipAddress: {
      type: String,
      required: true,
      index: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      sparse: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'auditLogs',
  }
);

// Compound indexes for common queries
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
AuditLogSchema.index({ endpoint: 1, timestamp: -1 });

// TTL index: auto-delete logs after 1 year (31536000 seconds)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
