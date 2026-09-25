import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import Story from '@/lib/models/Story';
import { getAdminSession } from '@/lib/auth/admin';
import { getCanDownloadStoryAssets } from '@/lib/auth/storyEditing';
import { normalizeStoryMediaAssets, type StoryMediaAsset } from '@/lib/content/storyMedia';
import { mediaRepository } from '@/lib/server/media/mediaRepository';
import {
  createBoundedMediaDownload,
  DOWNLOAD_LIMITS,
  MediaDownloadError,
  resolveTrustedObjectKey,
} from '@/lib/server/media/mediaDownloadService';
import { getStoredStoryById } from '@/lib/storage/storiesFile';
import { resolveStoryWorkflow } from '@/lib/workflow/story';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/getRateLimiter';

type RouteContext = { params: Promise<{ id: string }> };
type StoryDownloadAsset = 'thumbnail' | 'media';
type StoryRecord = Record<string, unknown> & { mediaAssets?: StoryMediaAsset[] };

function isStoryDownloadAsset(value: string | null): value is StoryDownloadAsset {
  return value === 'thumbnail' || value === 'media';
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;
  try { await connectDB(); return false; } catch { return true; }
}

function buildStoryPermissionRecord(story: StoryRecord) {
  return {
    legacyAuthorName: typeof story.author === 'string' ? story.author : '',
    workflow: resolveStoryWorkflow({
      workflow: typeof story.workflow === 'object' && story.workflow ? story.workflow : null,
      isPublished: story.isPublished,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
    }),
  };
}

function sanitizeFileName(value: unknown) {
  return String(value || 'story').trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'story';
}

function safeMime(value: unknown, kind: 'image' | 'video') {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4']);
  return allowed.has(mime) ? mime : kind === 'video' ? 'video/mp4' : 'application/octet-stream';
}

function extensionForMime(mime: string) {
  return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'application/pdf': '.pdf', 'video/mp4': '.mp4' } as Record<string, string>)[mime] || '.bin';
}

function selectAsset(story: StoryRecord, requested: StoryDownloadAsset) {
  const assets = normalizeStoryMediaAssets(story.mediaAssets);
  if (requested === 'thumbnail') {
    const thumbnail = String(story.thumbnail || '').trim();
    return assets.find((asset) => asset.kind === 'image' && asset.url === thumbnail)
      || assets.find((asset) => asset.kind === 'image') || null;
  }
  const mediaUrl = String(story.mediaUrl || '').trim();
  return assets.find((asset) => asset.url === mediaUrl)
    || assets.find((asset) => asset.kind === 'video') || assets[0] || null;
}

async function resolveSource(story: StoryRecord, requested: StoryDownloadAsset) {
  const selected = selectAsset(story, requested);
  if (selected?.assetId) {
    const record = await mediaRepository.getMediaById(selected.assetId);
    const storyId = String(story._id || '').trim();
    const linkedToStory = record?.ownerType === 'story' && (
      record.ownerId === storyId ||
      (record.references || []).some((reference) => reference.ownerType === 'story' && reference.ownerId === storyId)
    );
    if (!record || !linkedToStory || record.status === 'deleted' || record.provider !== 'do-spaces') {
      throw new MediaDownloadError('Canonical media record is unavailable.', 409, 'MEDIA_REFERENCE_INVALID');
    }
    const kind = record.mediaKind === 'video' ? 'video' as const : 'image' as const;
    return {
      key: resolveTrustedObjectKey({ objectKey: record.objectKey }), kind,
      mime: safeMime(record.type, kind), size: Number(record.size || 0),
    };
  }

  const legacyUrl = requested === 'thumbnail'
    ? String(story.thumbnail || '') : String(story.mediaUrl || selected?.url || '');
  const legacyKey = requested === 'media'
    ? String(story.mediaKey || selected?.key || '') : String(selected?.key || '');
  if (!legacyUrl && !legacyKey) {
    throw new MediaDownloadError('Story media is not available.', 404, 'MEDIA_NOT_FOUND');
  }
  const kind = requested === 'media' && (story.mediaType === 'video' || selected?.kind === 'video')
    ? 'video' as const : 'image' as const;
  return {
    key: resolveTrustedObjectKey({ objectKey: legacyKey, legacyUrl }), kind,
    mime: safeMime(selected?.mimeType || story.mediaMimeType, kind),
    size: Number(selected?.sizeBytes || story.mediaSizeBytes || 0),
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSession();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const rateLimit = await checkRateLimit({ scope: 'heavy', identifier: `story-download:${user.id}` });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many download requests.' }, { status: 429, headers: getRateLimitHeaders(rateLimit) });
    }
    const requested = new URL(req.url).searchParams.get('asset');
    if (!isStoryDownloadAsset(requested)) {
      return NextResponse.json({ success: false, error: 'A valid asset query is required.' }, { status: 400 });
    }

    const { id } = await context.params;
    let story: StoryRecord | null;
    if (await shouldUseFileStore()) story = (await getStoredStoryById(id)) as StoryRecord | null;
    else {
      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, error: 'Invalid story ID' }, { status: 400 });
      }
      story = (await Story.findById(id).lean()) as StoryRecord | null;
    }
    if (!story) return NextResponse.json({ success: false, error: 'Story not found' }, { status: 404 });
    if (!getCanDownloadStoryAssets(user, buildStoryPermissionRecord(story))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const source = await resolveSource(story, requested);
    const limit = source.mime === 'application/pdf' ? DOWNLOAD_LIMITS.document
      : source.kind === 'video' ? DOWNLOAD_LIMITS.video : DOWNLOAD_LIMITS.image;
    const download = await createBoundedMediaDownload({
      objectKey: source.key, maxBytes: limit, expectedSize: source.size,
    });
    const filename = `${sanitizeFileName(story.title)}-${requested}${extensionForMime(source.mime)}`;
    return new NextResponse(download.body, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': source.mime,
        'X-Content-Type-Options': 'nosniff',
        ...(download.declaredSize ? { 'Content-Length': String(download.declaredSize) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof MediaDownloadError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Error downloading story asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to download story asset' }, { status: 500 });
  }
}
