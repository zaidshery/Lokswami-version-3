import mongoose, { type Model } from 'mongoose';

export interface ILeadershipReportSchedule extends mongoose.Document {
  presetId: string;
  enabled: boolean;
  deliveryTime: string;
  timezone: string;
  deliveryMode: 'dashboard_link' | 'markdown_export' | 'email_summary' | 'webhook_summary';
  recipientEmails: string[];
  webhookUrls: string[];
  webhookProvider: 'generic_json' | 'slack' | 'discord' | 'teams' | 'telegram';
  notes: string;
  lastRunAt?: Date | null;
  lastRunStatus: 'idle' | 'success' | 'failed';
  lastRunSummary: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const LeadershipReportScheduleSchema = new mongoose.Schema<ILeadershipReportSchedule>(
  {
    presetId: { type: String, required: true, trim: true, maxlength: 80, unique: true, index: true },
    version: { type: Number, default: 1 },
    enabled: { type: Boolean, default: false },
    deliveryTime: { type: String, trim: true, maxlength: 5, default: '09:00' },
    timezone: { type: String, trim: true, maxlength: 120, default: 'Asia/Calcutta' },
    deliveryMode: {
      type: String,
      enum: ['dashboard_link', 'markdown_export', 'email_summary', 'webhook_summary'],
      default: 'dashboard_link',
    },
    recipientEmails: {
      type: [String],
      default: [],
      set: (value: string[]) => (Array.isArray(value) ? value.slice(0, 20) : []),
    },
    webhookUrls: {
      type: [String],
      default: [],
      set: (value: string[]) => (Array.isArray(value) ? value.slice(0, 10) : []),
    },
    webhookProvider: {
      type: String,
      enum: ['generic_json', 'slack', 'discord', 'teams', 'telegram'],
      default: 'generic_json',
    },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    lastRunAt: { type: Date, default: null },
    lastRunStatus: {
      type: String,
      enum: ['idle', 'success', 'failed'],
      default: 'idle',
    },
    lastRunSummary: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { timestamps: true }
);

LeadershipReportScheduleSchema.index({ updatedAt: -1 });

const LeadershipReportSchedule: Model<ILeadershipReportSchedule> =
  (mongoose.models.LeadershipReportSchedule as Model<ILeadershipReportSchedule>) ||
  mongoose.model<ILeadershipReportSchedule>(
    'LeadershipReportSchedule',
    LeadershipReportScheduleSchema
  );

export default LeadershipReportSchedule;
