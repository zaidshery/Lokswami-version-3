import 'server-only';

import crypto from 'crypto';
import connectDB from '@/lib/db/mongoose';
import TtsAsset, { type TtsAssetDocument } from '@/lib/models/TtsAsset';
import TtsAuditEvent from '@/lib/models/TtsAuditEvent';
import TtsConfig from '@/lib/models/TtsConfig';
import { buildSpokenBreakingHeadline } from '@/lib/types/breaking';
import {
  type TtsAuditAction,
  type TtsAuditResult,
  type TtsSourceType,
  type TtsVariant,
} from '@/lib/types/tts';
import {
  deleteStoredTtsAsset,
  hasStoredTtsAsset,
} from '@/lib/utils/ttsStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TtsActorContext = {
  id?: string;
  email?: string;
  role?: string;
};

type ArticleListenSource = {
  title?: string;
  summary?: string;
  content?: string;
};

type EpaperStoryListenSource = {
  title?: string;
  excerpt?: string;
  contentHtml?: string;
};

type EnsureTtsAssetOptions = {
  sourceType: TtsSourceType;
  sourceId: string;
  sourceParentId?: string;
  variant: TtsVariant;
  title?: string;
  text: string;
  forceRegenerate?: boolean;
  actor?: TtsActorContext;
  metadata?: Record<string, unknown>;
};

type EnsureTtsAssetResult = {
  asset: { status?: string; audioUrl?: string } | null;
  reused: boolean;
  error: string;
};

// ---------------------------------------------------------------------------
// Text utilities (exported — used by routes and other server modules)
// ---------------------------------------------------------------------------

function sanitizeText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
}

function normalizeParagraphs(value: string) {
  return sanitizeText(value)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function stripHtmlToTtsText(value: string) {
  const withoutScripts = value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withParagraphs = withoutScripts
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|section|article|h[1-6])\s*>/gi, '\n');
  const withoutTags = withParagraphs.replace(/<[^>]+>/g, ' ');
  return normalizeParagraphs(decodeBasicHtmlEntities(withoutTags));
}

export function buildArticleFullTtsText(source: ArticleListenSource) {
  const parts = [
    normalizeParagraphs(source.title || ''),
    normalizeParagraphs(source.summary || ''),
    stripHtmlToTtsText(source.content || ''),
  ].filter(Boolean);

  return parts.join('\n\n').trim();
}

export function buildEpaperStoryTtsText(source: EpaperStoryListenSource) {
  const bodyText = source.contentHtml
    ? stripHtmlToTtsText(source.contentHtml)
    : normalizeParagraphs(source.excerpt || '');
  const parts = [normalizeParagraphs(source.title || ''), bodyText].filter(Boolean);
  return parts.join('\n\n').trim();
}

export function buildBreakingHeadlineTtsText(input: { title?: string; city?: string }) {
  const title = String(input.title || '').trim();
  if (!title) return '';

  return buildSpokenBreakingHeadline({
    id: 'breaking',
    title,
    ...(input.city?.trim() ? { city: input.city.trim() } : {}),
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hashValue(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function normalizeSourceId(value: string) {
  return String(value || '').trim();
}

function isLikelyHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildMetadataWithDefaults(input: Record<string, unknown> | undefined) {
  return input && typeof input === 'object' ? input : {};
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function recordTtsAuditEvent(input: {
  action: TtsAuditAction;
  result: TtsAuditResult;
  actor?: TtsActorContext;
  assetId?: string;
  sourceType?: TtsSourceType;
  sourceId?: string;
  variant?: TtsVariant;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await TtsAuditEvent.create({
      action: input.action,
      result: input.result,
      actorId: String(input.actor?.id || '').trim(),
      actorEmail: String(input.actor?.email || '').trim().toLowerCase(),
      actorRole: String(input.actor?.role || '').trim(),
      assetId: String(input.assetId || '').trim(),
      sourceType: input.sourceType,
      sourceId: String(input.sourceId || '').trim(),
      variant: input.variant,
      message: String(input.message || '').trim(),
      metadata: buildMetadataWithDefaults(input.metadata),
    });
  } catch (error) {
    console.error('Failed to write TTS audit event:', error);
  }
}

// ---------------------------------------------------------------------------
// Asset staleness management
// ---------------------------------------------------------------------------

async function markAssetStale(
  asset: TtsAssetDocument,
  reason: string,
  actor?: TtsActorContext
) {
  asset.status = 'stale';
  asset.lastError = reason;
  asset.lastVerifiedAt = new Date();
  asset.failureCount = Math.max(0, asset.failureCount || 0);
  await asset.save();

  await recordTtsAuditEvent({
    action: 'mark_stale',
    result: 'success',
    actor,
    assetId: asset._id?.toString(),
    sourceType: asset.sourceType,
    sourceId: asset.sourceId,
    variant: asset.variant,
    message: reason,
  });
}

// ---------------------------------------------------------------------------
// Manual TTS asset management (public exports used by upload routes & routes)
// ---------------------------------------------------------------------------

export async function findReadyManualTtsAsset(input: {
  sourceType: TtsSourceType;
  sourceId: string;
  variant: TtsVariant;
  expectedText?: string;
  actor?: TtsActorContext;
}) {
  await connectDB();
  const sourceId = normalizeSourceId(input.sourceId);
  if (!sourceId) return null;

  const asset = await TtsAsset.findOne({
    sourceType: input.sourceType,
    sourceId,
    variant: input.variant,
    provider: 'manual',
    status: 'ready',
    audioUrl: { $ne: '' },
    ...(input.expectedText !== undefined ? { textHash: hashValue(sanitizeText(input.expectedText)) } : {}),
  }).sort({ updatedAt: -1, _id: -1 });

  if (!asset?.audioUrl) return null;

  if (!isLikelyHttpUrl(asset.audioUrl) && !hasStoredTtsAsset(asset.audioUrl)) {
    await markAssetStale(asset, 'Stored manual TTS asset file is missing.', input.actor);
    return null;
  }

  asset.lastVerifiedAt = new Date();
  asset.lastAccessedAt = new Date();
  await asset.save();
  return asset;
}

export async function saveManualTtsAsset(input: {
  sourceType: TtsSourceType;
  sourceId: string;
  sourceParentId?: string;
  variant: TtsVariant;
  title?: string;
  text?: string;
  audioUrl: string;
  mimeType: string;
  mediaKey: string;
  actor?: TtsActorContext;
  metadata?: Record<string, unknown>;
}) {
  await connectDB();
  const sourceId = normalizeSourceId(input.sourceId);
  const audioUrl = String(input.audioUrl || '').trim();
  const mediaKey = String(input.mediaKey || '').trim();
  if (!sourceId || !audioUrl || !mediaKey) {
    throw new Error('Source id, audio URL, and media key are required for manual audio.');
  }

  const normalizedText = sanitizeText(input.text || '');
  const title = String(input.title || '').trim();
  const sourceParentId = String(input.sourceParentId || '').trim();
  const textHash = hashValue(normalizedText || `${sourceId}:${mediaKey}`);
  const contentVersionHash = hashValue(
    JSON.stringify({
      variant: input.variant,
      mediaKey,
      audioUrl,
      provider: 'manual',
    })
  );
  const metadata = {
    ...buildMetadataWithDefaults(input.metadata),
    manualUpload: true,
    mediaKey,
  };
  const query = {
    sourceType: input.sourceType,
    sourceId,
    variant: input.variant,
    provider: 'manual' as const,
    model: 'manual-upload',
    voice: 'manual-upload',
    languageCode: 'manual',
    contentVersionHash,
  };

  // Mark any previous manual assets as stale
  await TtsAsset.updateMany(
    {
      sourceType: input.sourceType,
      sourceId,
      variant: input.variant,
      provider: 'manual',
      status: 'ready',
      contentVersionHash: { $ne: contentVersionHash },
    },
    {
      $set: {
        status: 'stale',
        lastError: 'Superseded by a newer manually uploaded audio file.',
        lastVerifiedAt: new Date(),
      },
    }
  );

  const ready = await TtsAsset.findOneAndUpdate(
    query,
    {
      $set: {
        title,
        sourceParentId,
        textHash,
        mimeType: input.mimeType || 'audio/mpeg',
        audioUrl,
        storageMode: 'spaces',
        status: 'ready',
        chunkCount: 1,
        charCount: normalizedText.length,
        generatedAt: new Date(),
        lastVerifiedAt: new Date(),
        lastAccessedAt: new Date(),
        lastError: '',
        metadata,
      },
      $setOnInsert: {
        failureCount: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await recordTtsAuditEvent({
    action: 'generate',
    result: 'success',
    actor: input.actor,
    assetId: ready?._id?.toString(),
    sourceType: input.sourceType,
    sourceId,
    variant: input.variant,
    message: 'Manual listen audio uploaded successfully.',
    metadata,
  });

  return ready;
}

// ---------------------------------------------------------------------------
// Asset deletion helper (used by cleanup route)
// ---------------------------------------------------------------------------

export async function deleteManualTtsAsset(input: {
  sourceType: TtsSourceType;
  sourceId: string;
  variant: TtsVariant;
  actor?: TtsActorContext;
}) {
  await connectDB();
  const sourceId = normalizeSourceId(input.sourceId);
  if (!sourceId) return;

  const assets = await TtsAsset.find({
    sourceType: input.sourceType,
    sourceId,
    variant: input.variant,
    provider: 'manual',
  });

  for (const asset of assets) {
    const audioUrl = String(asset.audioUrl || '').trim();
    if (audioUrl && !isLikelyHttpUrl(audioUrl)) {
      await deleteStoredTtsAsset(audioUrl).catch(() => undefined);
    }
    await asset.deleteOne();

    await recordTtsAuditEvent({
      action: 'delete',
      result: 'success',
      actor: input.actor,
      assetId: asset._id?.toString(),
      sourceType: input.sourceType,
      sourceId,
      variant: input.variant,
      message: 'Manual TTS asset deleted.',
    });
  }
}
// ---------------------------------------------------------------------------
// Decommissioned Synthesis Helpers (Satisfying Legacy Callers)
// ---------------------------------------------------------------------------

export async function getTtsConfig() {
  await connectDB();
  const config = await TtsConfig.findOne({ key: 'default' });
  if (config) return config;
  return new TtsConfig({ key: 'default' });
}

export async function processQueuedTtsAssets(options?: { limit?: number }) {
  void options;
  return { processed: 0, errors: 0, message: 'TTS Auto-Synthesis is decommissioned.' };
}

export async function ensureTtsAsset(options: EnsureTtsAssetOptions): Promise<EnsureTtsAssetResult> {
  void options;
  return {
    asset: null,
    reused: false,
    error: 'TTS Auto-Synthesis is decommissioned. Manual upload required.',
  };
}
