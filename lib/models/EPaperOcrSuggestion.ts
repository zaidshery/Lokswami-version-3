import mongoose, { type Model } from 'mongoose';
import {
  EPAPER_OCR_SUGGESTION_STATUSES,
  type EPaperOcrSuggestionStatus,
} from '@/lib/types/epaper';

export interface IEPaperOcrSuggestion {
  epaperId: mongoose.Types.ObjectId;
  pageNumber: number;
  runId: string;
  sourceKey?: string;
  fingerprint: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  hotspot: { x: number; y: number; w: number; h: number };
  confidence: number;
  warnings: Array<{ code: string; label: string; severity: string }>;
  duplicateReason: string;
  status: EPaperOcrSuggestionStatus;
  reviewedById: string;
  reviewedAt: Date | null;
  createdArticleId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const HotspotSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    w: { type: Number, required: true, min: 0.0001, max: 1 },
    h: { type: Number, required: true, min: 0.0001, max: 1 },
  },
  { _id: false }
);

const EPaperOcrSuggestionSchema = new mongoose.Schema<IEPaperOcrSuggestion>(
  {
    epaperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EPaper',
      required: true,
      index: true,
    },
    pageNumber: { type: Number, required: true, min: 1 },
    runId: { type: String, required: true, trim: true, maxlength: 120 },
    sourceKey: { type: String, trim: true },
    fingerprint: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, trim: true, maxlength: 220, default: '' },
    excerpt: { type: String, trim: true, maxlength: 1000, default: '' },
    contentHtml: { type: String, trim: true, default: '' },
    hotspot: { type: HotspotSchema, required: true },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    warnings: {
      type: [
        new mongoose.Schema(
          {
            code: { type: String, trim: true, default: '' },
            label: { type: String, trim: true, default: '' },
            severity: { type: String, trim: true, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    duplicateReason: { type: String, trim: true, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: EPAPER_OCR_SUGGESTION_STATUSES,
      default: 'pending',
    },
    reviewedById: { type: String, trim: true, maxlength: 120, default: '' },
    reviewedAt: { type: Date, default: null },
    createdArticleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EPaperArticle',
      default: null,
    },
  },
  { timestamps: true }
);

EPaperOcrSuggestionSchema.index(
  { epaperId: 1, pageNumber: 1, fingerprint: 1 },
  { unique: true }
);
EPaperOcrSuggestionSchema.index({
  epaperId: 1,
  pageNumber: 1,
  status: 1,
  createdAt: -1,
});

const EPaperOcrSuggestion: Model<IEPaperOcrSuggestion> =
  (mongoose.models.EPaperOcrSuggestion as Model<IEPaperOcrSuggestion>) ||
  mongoose.model<IEPaperOcrSuggestion>(
    'EPaperOcrSuggestion',
    EPaperOcrSuggestionSchema
  );

export default EPaperOcrSuggestion;
