import mongoose from 'mongoose';
import {
  WorkflowActorRefSchema,
  WorkflowMetaSchema,
} from '@/lib/models/schemas/workflow';
import {
  CopyEditorMetaSchema,
  ReporterMetaSchema,
} from '@/lib/models/schemas/newsroom';
import type { CopyEditorMeta, ReporterMeta } from '@/lib/content/newsroomMetadata';
import {
  createEmptyStoryVideoProduction,
  type LinkedArticleStatus,
  type StoryVideoProduction,
} from '@/lib/content/newsroomPublishing';
import type { StoryMediaAsset } from '@/lib/content/storyMedia';
import type { WorkflowMeta } from '@/lib/workflow/types';

export interface IStory {
  _id?: string;
  version: number;
  title: string;
  caption: string;
  thumbnail: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: string;
  mediaAssets: StoryMediaAsset[];
  linkUrl: string;
  linkLabel: string;
  category: string;
  author: string;
  durationSeconds: number;
  priority: number;
  views: number;
  isPublished: boolean;
  publishedAt: Date;
  updatedAt: Date;
  workflow: WorkflowMeta;
  reporterMeta: ReporterMeta;
  copyEditorMeta: CopyEditorMeta;
  linkedArticleId: string;
  linkedArticleStatus: LinkedArticleStatus;
  videoProduction: StoryVideoProduction;
  embedding: number[];
  embeddingGeneratedAt: Date | null;
  aiSummary: string;
}

const StoryMediaAssetSchema = new mongoose.Schema<StoryMediaAsset>(
  {
    id: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    url: { type: String, required: true, trim: true },
    key: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    sizeBytes: { type: Number, default: 0, min: 0 },
    storageProvider: { type: String, default: '', trim: true },
    originalFileName: { type: String, default: '', trim: true },
    order: { type: Number, default: 0, min: 0 },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const StoryVideoProductionSchema = new mongoose.Schema<StoryVideoProduction>(
  {
    status: {
      type: String,
      enum: ['not_started', 'editing', 'qa_review', 'ready_to_publish', 'published'],
      default: 'not_started',
    },
    assignedTo: { type: WorkflowActorRefSchema, default: null },
    editorNotes: { type: String, default: '' },
    masterExportUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    updatedAt: { type: String, default: null },
  },
  { _id: false }
);

const StorySchema = new mongoose.Schema<IStory>({
  version: { type: Number, default: 1, min: 1 },
  title: { type: String, required: true, maxlength: 140 },
  caption: { type: String, default: '' },
  thumbnail: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
  mediaUrl: { type: String, default: '' },
  mediaKey: { type: String, default: '' },
  mediaSizeBytes: { type: Number, default: 0, min: 0 },
  mediaMimeType: { type: String, default: '' },
  storageProvider: { type: String, default: '' },
  mediaAssets: { type: [StoryMediaAssetSchema], default: [] },
  linkUrl: { type: String, default: '' },
  linkLabel: { type: String, default: '' },
  category: { type: String, default: 'General' },
  author: { type: String, default: 'Desk' },
  durationSeconds: { type: Number, default: 6, min: 2, max: 180 },
  priority: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: true },
  publishedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  workflow: { type: WorkflowMetaSchema, default: () => ({}) },
  reporterMeta: { type: ReporterMetaSchema, default: () => ({}) },
  copyEditorMeta: { type: CopyEditorMetaSchema, default: () => ({}) },
  linkedArticleId: { type: String, default: '' },
  linkedArticleStatus: {
    type: String,
    enum: ['not_created', 'draft', 'submitted', 'published'],
    default: 'not_created',
  },
  videoProduction: {
    type: StoryVideoProductionSchema,
    default: () => createEmptyStoryVideoProduction(),
  },
  embedding: { type: [Number], default: [], select: false },
  embeddingGeneratedAt: { type: Date, default: null },
  aiSummary: { type: String, default: '' },
});

StorySchema.index({ publishedAt: -1, _id: -1 });
StorySchema.index({ 'workflow.status': 1, publishedAt: -1, _id: -1 });
StorySchema.index({ 'workflow.createdBy.id': 1, 'workflow.status': 1, updatedAt: -1 });
StorySchema.index({ 'workflow.assignedTo.id': 1, 'workflow.status': 1, updatedAt: -1 });
// Performance And Scaling Plan — recommended additions:
StorySchema.index({ isPublished: 1, priority: -1, publishedAt: -1 });
StorySchema.index({ isPublished: 1, category: 1, publishedAt: -1 });
StorySchema.index({ category: 1, updatedAt: -1, publishedAt: -1 });
StorySchema.index({ updatedAt: -1, publishedAt: -1, _id: -1 });

export default mongoose.models.Story || mongoose.model('Story', StorySchema);
