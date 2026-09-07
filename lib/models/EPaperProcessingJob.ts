import mongoose, { type Model } from 'mongoose';
import {
  EPAPER_PROCESSING_JOB_STATUSES,
  type EPaperProcessingJobStatus,
} from '@/lib/types/epaper';

export type EPaperProcessingJobKind = 'pdf_pages' | 'ocr';

export interface IEPaperProcessingJob {
  epaperId: mongoose.Types.ObjectId;
  kind: EPaperProcessingJobKind;
  sourceKey: string;
  sourceImagePath: string;
  checkpoint: unknown[];
  status: EPaperProcessingJobStatus;
  pageNumbers: number[];
  totalItems: number;
  processedItems: number;
  failedItems: number;
  failedPageNumbers: number[];
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseOwner: string;
  leaseExpiresAt: Date | null;
  lastError: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EPaperProcessingJobSchema = new mongoose.Schema<IEPaperProcessingJob>(
  {
    epaperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EPaper',
      required: true,
      index: true,
    },
    kind: { type: String, enum: ['pdf_pages', 'ocr'], default: 'pdf_pages' },
    sourceKey: { type: String },
    sourceImagePath: { type: String, default: '' },
    checkpoint: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: {
      type: String,
      enum: EPAPER_PROCESSING_JOB_STATUSES,
      default: 'queued',
      index: true,
    },
    pageNumbers: { type: [Number], default: [] },
    totalItems: { type: Number, min: 0, default: 0 },
    processedItems: { type: Number, min: 0, default: 0 },
    failedItems: { type: Number, min: 0, default: 0 },
    failedPageNumbers: { type: [Number], default: [] },
    attemptCount: { type: Number, min: 0, default: 0 },
    maxAttempts: { type: Number, min: 1, default: 3 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    leaseOwner: { type: String, trim: true, maxlength: 160, default: '' },
    leaseExpiresAt: { type: Date, default: null },
    lastError: { type: String, trim: true, maxlength: 4000, default: '' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

EPaperProcessingJobSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
EPaperProcessingJobSchema.index({ epaperId: 1, createdAt: -1 });
EPaperProcessingJobSchema.index({ sourceKey: 1 }, { unique: true, partialFilterExpression: { kind: 'ocr' } });

const EPaperProcessingJob: Model<IEPaperProcessingJob> =
  (mongoose.models.EPaperProcessingJob as Model<IEPaperProcessingJob>) ||
  mongoose.model<IEPaperProcessingJob>(
    'EPaperProcessingJob',
    EPaperProcessingJobSchema
  );

export default EPaperProcessingJob;
