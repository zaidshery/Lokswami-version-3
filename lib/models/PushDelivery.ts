import mongoose from 'mongoose';
import { WorkflowActorRefSchema } from '@/lib/models/schemas/workflow';

const PushDeliverySchema = new mongoose.Schema({
  deliveryId: { type: String, required: true, trim: true },
  preparedMessageId: { type: String, default: '', trim: true },
  sourceStoryId: { type: String, default: '', trim: true },
  sourceArticleId: { type: String, default: '', trim: true },
  sourceRevision: { type: mongoose.Schema.Types.Mixed, default: '1' },
  recipient: {
    type: {
      type: String,
      enum: ['all_subscribers', 'test_recipients'],
      default: 'all_subscribers',
    },
    label: { type: String, default: 'All Opted-in Readers (Future Foundation)' },
    targetCountEstimate: { type: Number, default: 0 },
    filter: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  payload: {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    deepLink: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    priority: { type: String, enum: ['high', 'normal'], default: 'normal' },
    payloadFingerprint: { type: String, required: true, trim: true },
  },
  status: {
    type: String,
    enum: ['prepared', 'pending', 'dispatching', 'succeeded', 'failed', 'cancelled'],
    default: 'prepared',
  },
  provider: {
    type: String,
    enum: ['disabled', 'manual', 'mock'],
    default: 'disabled',
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 1 },
  error: {
    category: { type: String, default: '' },
    message: { type: String, default: '' },
    timestamp: { type: Date, default: null },
  },
  audit: {
    createdBy: { type: WorkflowActorRefSchema, required: true },
    preparedAt: { type: Date, default: Date.now },
    cancelledBy: { type: WorkflowActorRefSchema, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
  },
  dispatchedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

PushDeliverySchema.index({ deliveryId: 1 }, { unique: true });
PushDeliverySchema.index({ status: 1, updatedAt: -1 });
PushDeliverySchema.index({ sourceStoryId: 1, updatedAt: -1 });

export default mongoose.models.PushDelivery ||
  mongoose.model('PushDelivery', PushDeliverySchema);
