import mongoose from 'mongoose';
import { WorkflowMetaSchema } from '@/lib/models/schemas/workflow';
import type { WorkflowMeta } from '@/lib/workflow/types';
import type { ReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';

export interface IEPaperArticleHotspot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IEPaperArticle {
  _id?: string;
  epaperId: mongoose.Types.ObjectId;
  pageNumber: number;
  title: string;
  slug: string;
  excerpt?: string;
  contentHtml?: string;
  coverImagePath?: string;
  videoUrl?: string;
  hotspot: IEPaperArticleHotspot;
  workflow: WorkflowMeta;
  releasedSnapshot?: ReleasedEpaperStory | null;
  createdAt: Date;
  updatedAt: Date;
}

const HotspotSchema = new mongoose.Schema<IEPaperArticleHotspot>(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    w: { type: Number, required: true, min: 0.0001, max: 1 },
    h: { type: Number, required: true, min: 0.0001, max: 1 },
  },
  { _id: false }
);

const EPaperArticleSchema = new mongoose.Schema<IEPaperArticle>(
  {
    epaperId: { type: mongoose.Schema.Types.ObjectId, ref: 'EPaper', required: true, index: true },
    pageNumber: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 220 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 220 },
    excerpt: { type: String, trim: true, maxlength: 1000, default: '' },
    contentHtml: { type: String, trim: true, default: '' },
    coverImagePath: { type: String, trim: true, maxlength: 500, default: '' },
    videoUrl: { type: String, trim: true, default: '' },
    hotspot: { type: HotspotSchema, required: true },
    workflow: { type: WorkflowMetaSchema, default: () => ({}) },
    releasedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

EPaperArticleSchema.index({ epaperId: 1, slug: 1 }, { unique: true });
EPaperArticleSchema.index({ epaperId: 1, pageNumber: 1 });
EPaperArticleSchema.index({ epaperId: 1, pageNumber: 1, createdAt: 1 });
EPaperArticleSchema.index({ 'workflow.status': 1, updatedAt: -1 });

const EPaperArticle =
  (mongoose.models.EPaperArticle as mongoose.Model<IEPaperArticle> | undefined) ||
  mongoose.model<IEPaperArticle>('EPaperArticle', EPaperArticleSchema);

export default EPaperArticle;
