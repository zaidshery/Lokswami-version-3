import mongoose from 'mongoose';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import { WorkflowMetaSchema } from '@/lib/models/schemas/workflow';
import type { WorkflowMeta } from '@/lib/workflow/types';
import type {
  VideoAspectRatio,
  VideoMediaProvider,
  VideoProcessingStatus,
} from '@/lib/content/videoPublication';

const VIDEO_CATEGORY_ENUM = NEWS_CATEGORIES.map((category) => category.nameEn);

export interface IVideo {
  _id?: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  category: string;
  isShort: boolean;
  isPublished: boolean;
  shortsRank: number;
  views: number;
  createdAt: Date;
  publishedAt: Date;
  updatedAt: Date;
  workflow: WorkflowMeta;
  embedding: number[];
  embeddingGeneratedAt: Date | null;
  aiSummary: string;
  slug?: string;
  articleId?: string;
  posterUrl?: string;
  mediaProvider?: VideoMediaProvider;
  playbackUrl?: string;
  hlsUrl?: string;
  aspectRatio?: VideoAspectRatio;
  captionUrl?: string;
  transcript?: string;
  processingStatus?: VideoProcessingStatus;
  instagramUrl?: string;
  youtubeUrl?: string;
}

const VideoSchema = new mongoose.Schema<IVideo>({
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 1000 },
  thumbnail: { type: String, required: true },
  videoUrl: { type: String, required: true },
  duration: { type: Number, required: true },
  category: { type: String, required: true, enum: VIDEO_CATEGORY_ENUM },
  isShort: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: true },
  shortsRank: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  publishedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  workflow: { type: WorkflowMetaSchema, default: () => ({}) },
  embedding: { type: [Number], default: [], select: false },
  embeddingGeneratedAt: { type: Date, default: null },
  aiSummary: { type: String, default: '' },
  slug: { type: String, trim: true, lowercase: true, maxlength: 180 },
  articleId: { type: String, default: '', trim: true },
  posterUrl: { type: String, default: '', trim: true },
  mediaProvider: { type: String, enum: ['youtube', 'spaces-mp4'], default: 'youtube' },
  playbackUrl: { type: String, default: '', trim: true },
  hlsUrl: { type: String, default: '', trim: true },
  aspectRatio: { type: String, enum: ['9:16', '16:9', '1:1', 'unknown'], default: 'unknown' },
  captionUrl: { type: String, default: '', trim: true },
  transcript: { type: String, default: '', maxlength: 20000 },
  processingStatus: { type: String, enum: ['ready', 'processing', 'failed'], default: 'ready' },
  instagramUrl: { type: String, default: '', trim: true },
  youtubeUrl: { type: String, default: '', trim: true },
});

VideoSchema.index({ publishedAt: -1, _id: -1 });
VideoSchema.index({ createdAt: -1, _id: -1 });
VideoSchema.index({ 'workflow.status': 1, publishedAt: -1, _id: -1 });
VideoSchema.index({ 'workflow.createdBy.id': 1, 'workflow.status': 1, updatedAt: -1 });
VideoSchema.index({ 'workflow.assignedTo.id': 1, 'workflow.status': 1, updatedAt: -1 });
// Performance And Scaling Plan — recommended additions:
VideoSchema.index({ isPublished: 1, isShort: 1, publishedAt: -1 });
VideoSchema.index({ isPublished: 1, isShort: 1, createdAt: -1 });
VideoSchema.index({ isPublished: 1, category: 1, publishedAt: -1 });
VideoSchema.index({ category: 1, updatedAt: -1, publishedAt: -1 });
VideoSchema.index({ updatedAt: -1, publishedAt: -1, _id: -1 });
VideoSchema.index({ slug: 1 }, { unique: true, sparse: true });
VideoSchema.index({ articleId: 1, isPublished: 1, publishedAt: -1 });

export default mongoose.models.Video || mongoose.model('Video', VideoSchema);
