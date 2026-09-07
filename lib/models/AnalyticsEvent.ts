import mongoose, { type Model } from 'mongoose';

export interface IAnalyticsEvent extends mongoose.Document {
  event: string;
  page: string;
  source: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AnalyticsEventSchema = new mongoose.Schema<IAnalyticsEvent>(
  {
    event: { type: String, required: true, trim: true, maxlength: 80, index: true },
    page: { type: String, required: true, trim: true, maxlength: 1024 },
    source: { type: String, required: true, trim: true, maxlength: 80, default: 'web' },
    sessionId: { type: String, required: true, trim: true, maxlength: 120, index: true },
    ipAddress: { type: String, trim: true, maxlength: 120, default: '' },
    userAgent: { type: String, trim: true, maxlength: 1024, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

AnalyticsEventSchema.index({ createdAt: -1 });
AnalyticsEventSchema.index({ event: 1, createdAt: -1 });

const AnalyticsEvent: Model<IAnalyticsEvent> =
  (mongoose.models.AnalyticsEvent as Model<IAnalyticsEvent>) ||
  mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema);

export default AnalyticsEvent;
