import mongoose, { type Model } from 'mongoose';
import {
  TTS_ASSET_STATUSES,
  TTS_SOURCE_TYPES,
  TTS_STORAGE_MODES,
  TTS_PROVIDERS,
  TTS_VARIANTS,
  type TtsAssetStatus,
  type TtsProvider,
  type TtsSourceType,
  type TtsStorageMode,
  type TtsVariant,
} from '@/lib/types/tts';

export interface ITtsAsset {
  sourceType: TtsSourceType;
  sourceId: string;
  sourceParentId?: string;
  revisionInitializationOwner?: string;
  variant: TtsVariant;
  title?: string;
  textHash: string;
  contentVersionHash: string;
  languageCode: string;
  voice: string;
  provider: TtsProvider;
  model: string;
  mimeType: string;
  audioUrl: string;
  storageMode: TtsStorageMode;
  status: TtsAssetStatus;
  chunkCount: number;
  charCount: number;
  generatedAt?: Date | null;
  lastVerifiedAt?: Date | null;
  lastAccessedAt?: Date | null;
  failureCount: number;
  lastError?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type TtsAssetDocument = mongoose.HydratedDocument<ITtsAsset>;

const TtsAssetSchema = new mongoose.Schema<ITtsAsset>(
  {
    sourceType: { type: String, enum: TTS_SOURCE_TYPES, required: true },
    sourceId: { type: String, required: true, trim: true, maxlength: 120 },
    sourceParentId: { type: String, trim: true, maxlength: 120, default: '' },
    revisionInitializationOwner: { type: String, trim: true, maxlength: 120 },
    variant: { type: String, enum: TTS_VARIANTS, required: true },
    title: { type: String, trim: true, maxlength: 220, default: '' },
    textHash: { type: String, required: true, trim: true, maxlength: 80 },
    contentVersionHash: { type: String, required: true, trim: true, maxlength: 80 },
    languageCode: { type: String, required: true, trim: true, maxlength: 20 },
    voice: { type: String, required: true, trim: true, maxlength: 80 },
    provider: { type: String, enum: TTS_PROVIDERS, default: 'manual', required: true },
    model: { type: String, required: true, trim: true, maxlength: 160 },
    mimeType: { type: String, required: true, trim: true, maxlength: 80 },
    audioUrl: { type: String, trim: true, maxlength: 800, default: '' },
    storageMode: { type: String, enum: TTS_STORAGE_MODES, required: true },
    status: { type: String, enum: TTS_ASSET_STATUSES, default: 'pending' },
    chunkCount: { type: Number, min: 0, default: 0 },
    charCount: { type: Number, min: 0, default: 0 },
    generatedAt: { type: Date, default: null },
    lastVerifiedAt: { type: Date, default: null },
    lastAccessedAt: { type: Date, default: null },
    failureCount: { type: Number, min: 0, default: 0 },
    lastError: { type: String, trim: true, maxlength: 1000, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

TtsAssetSchema.index(
  {
    sourceType: 1,
    sourceId: 1,
    variant: 1,
    provider: 1,
    model: 1,
    voice: 1,
    languageCode: 1,
    contentVersionHash: 1,
  },
  { unique: true, name: 'tts_asset_content_variant_unique' }
);
TtsAssetSchema.index({ status: 1, updatedAt: -1 });
TtsAssetSchema.index({ sourceType: 1, sourceId: 1, updatedAt: -1 });
TtsAssetSchema.index({ sourceParentId: 1, updatedAt: -1 });

const TtsAsset: Model<ITtsAsset> =
  (mongoose.models.TtsAsset as Model<ITtsAsset>) ||
  mongoose.model<ITtsAsset>('TtsAsset', TtsAssetSchema);

export default TtsAsset;
