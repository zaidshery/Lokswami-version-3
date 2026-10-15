import mongoose from 'mongoose';
import { WorkflowActorRefSchema } from '@/lib/models/schemas/workflow';

const SocialDeliverySchema = new mongoose.Schema({
  deliveryId: { type: String, required: true, trim: true },
  socialPostId: { type: String, required: true, trim: true },
  contentId: { type: String, required: true, trim: true },
  contentType: {
    type: String,
    enum: ['story', 'article'],
    default: 'story',
  },
  sourceStoryId: { type: String, required: true, trim: true },
  sourceArticleId: { type: String, default: '', trim: true },
  sourceRevision: { type: mongoose.Schema.Types.Mixed, default: '1' },
  platform: {
    type: String,
    enum: ['youtube', 'facebook', 'instagram'],
    required: true,
  },
  providerMode: {
    type: String,
    enum: ['manual', 'n8n', 'generic_webhook', 'mock'],
    default: 'manual',
  },
  status: {
    type: String,
    enum: [
      'pending',
      'dispatching',
      'succeeded',
      'retryable_failed',
      'failed',
      'blocked',
      'cancelled',
    ],
    default: 'pending',
  },
  payloadSnapshot: {
    caption: { type: String, default: '' },
    hashtags: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    scheduledAt: { type: Date, default: null },
  },
  payloadFingerprint: { type: String, required: true, trim: true },
  idempotencyKey: { type: String, required: true, trim: true, unique: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  claimLease: {
    claimId: { type: String, default: '' },
    claimedAt: { type: Date, default: null },
    leaseExpiresAt: { type: Date, default: null },
    claimant: { type: String, default: '' },
  },
  providerResponse: {
    executionId: { type: String, default: '', trim: true },
    executionUrl: { type: String, default: '', trim: true },
    externalUrl: { type: String, default: '', trim: true },
    externalPostId: { type: String, default: '', trim: true },
    rawSummary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  lastError: {
    category: {
      type: String,
      enum: [
        'configuration',
        'authorization',
        'timeout_unknown',
        'throttled',
        'provider_rejected',
        'malformed_response',
        'persistence_reconciliation',
        'source_ineligible',
        'internal',
      ],
      default: 'internal',
    },
    message: { type: String, default: '' },
    timestamp: { type: Date, default: null },
  },
  reconciliationRequired: { type: Boolean, default: false },
  requestedBy: { type: WorkflowActorRefSchema, default: null },
  dispatchedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SocialDeliverySchema.index(
  { sourceStoryId: 1, platform: 1, payloadFingerprint: 1 },
  { unique: true }
);
SocialDeliverySchema.index({ status: 1, updatedAt: -1 });
SocialDeliverySchema.index({ socialPostId: 1, updatedAt: -1 });

export default mongoose.models.SocialDelivery ||
  mongoose.model('SocialDelivery', SocialDeliverySchema);
