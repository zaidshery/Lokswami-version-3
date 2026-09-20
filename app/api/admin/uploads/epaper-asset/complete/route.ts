import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canEditEpaper } from '@/lib/auth/permissions';
import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import {
  type EpaperAssetKind,
  EPAPER_ASSET_KINDS,
  parseEpaperAssetSize,
  verifyEpaperAssetUpload,
} from '@/lib/storage/epaperAssetUpload';
import {
  buildEpaperStoryTtsText,
  saveManualTtsAsset,
} from '@/lib/server/ttsAssets';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';

export const runtime = 'nodejs';

type StorySource = {
  paperId: string;
  storyId: string;
  paperTitle: string;
  cityName: string;
  publishDate: string;
  pageNumber: number;
  title: string;
  excerpt: string;
  contentHtml: string;
  paperStatus: string;
  productionStatus: string;
};

function parseKind(value: unknown): EpaperAssetKind | null {
  const normalized = String(value || '').trim();
  return EPAPER_ASSET_KINDS.includes(normalized as EpaperAssetKind)
    ? (normalized as EpaperAssetKind)
    : null;
}

function serializeTtsAsset(asset: unknown) {
  if (!asset || typeof asset !== 'object') return null;
  const source = asset as Record<string, unknown>;
  return {
    id: String(source._id || ''),
    status: String(source.status || ''),
    provider: String(source.provider || ''),
    audioUrl: String(source.audioUrl || ''),
    voice: String(source.voice || ''),
    model: String(source.model || ''),
    languageCode: String(source.languageCode || ''),
    mimeType: String(source.mimeType || ''),
    generatedAt: source.generatedAt instanceof Date
      ? source.generatedAt.toISOString()
      : String(source.generatedAt || ''),
    updatedAt: source.updatedAt instanceof Date
      ? source.updatedAt.toISOString()
      : String(source.updatedAt || ''),
    lastVerifiedAt: source.lastVerifiedAt instanceof Date
      ? source.lastVerifiedAt.toISOString()
      : String(source.lastVerifiedAt || ''),
    lastError: String(source.lastError || ''),
    chunkCount: Number(source.chunkCount || 0),
    charCount: Number(source.charCount || 0),
  };
}

async function loadStorySource(paperId: string, storyId: string): Promise<StorySource | null> {
  if (!Types.ObjectId.isValid(paperId) || !Types.ObjectId.isValid(storyId)) {
    return null;
  }

  const [paper, story] = await Promise.all([
    EPaper.findById(paperId).select(
      '_id title cityName publishDate status productionStatus'
    ),
    EPaperArticle.findOne({ _id: storyId, epaperId: paperId }).select(
      '_id epaperId pageNumber title excerpt contentHtml'
    ),
  ]);

  if (!paper || !story) return null;

  return {
    paperId: String(paper._id),
    storyId: String(story._id),
    paperTitle: String(paper.title || '').trim(),
    cityName: String(paper.cityName || '').trim(),
    publishDate:
      paper.publishDate instanceof Date
        ? paper.publishDate.toISOString()
        : String(paper.publishDate || '').trim(),
    pageNumber: Math.max(1, Number(story.pageNumber || 1)),
    title: String(story.title || '').trim(),
    excerpt: String(story.excerpt || '').trim(),
    contentHtml: String(story.contentHtml || '').trim(),
    paperStatus: String(paper.status || ''),
    productionStatus: String(paper.productionStatus || ''),
  };
}

async function POSTHandler(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canEditEpaper(admin.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = parseKind(body.kind);
    if (!kind) {
      return NextResponse.json({ success: false, error: 'Invalid e-paper asset kind.' }, { status: 400 });
    }

    const mediaKey = String(body.mediaKey || '').trim();
    if (!mediaKey) {
      return NextResponse.json({ success: false, error: 'Uploaded asset key is required.' }, { status: 400 });
    }

    const asset = await verifyEpaperAssetUpload({
      kind,
      mediaKey,
      expectedSize: parseEpaperAssetSize(body.expectedSize),
      expectedFileType: typeof body.expectedFileType === 'string' ? body.expectedFileType.trim() : '',
      expectedFileName: typeof body.expectedFileName === 'string' ? body.expectedFileName.trim() : '',
    });

    if (kind !== 'epaper_story_audio') {
      return NextResponse.json({
        success: true,
        message: 'E-paper asset upload verified successfully',
        data: { asset },
      });
    }

    await connectDB();
    const epaperId = String(body.epaperId || '').trim();
    const articleId = String(body.articleId || '').trim();
    const story = await loadStorySource(epaperId, articleId);
    if (!story) {
      return NextResponse.json(
        { success: false, error: 'Story not found for manual audio upload.' },
        { status: 404 }
      );
    }
    try {
      assertEpaperDraftEditable({
        status: story.paperStatus,
        productionStatus: story.productionStatus,
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Edition is immutable.',
        },
        { status: 409 }
      );
    }

    const text = buildEpaperStoryTtsText({
      title: story.title,
      excerpt: story.excerpt,
      contentHtml: story.contentHtml,
    });
    const ttsAsset = await saveManualTtsAsset({
      sourceType: 'epaperArticle',
      sourceId: story.storyId,
      sourceParentId: story.paperId,
      variant: 'epaper_story',
      title: story.title || story.paperTitle,
      text,
      audioUrl: asset.mediaUrl,
      mimeType: asset.mediaMimeType,
      mediaKey: asset.mediaKey,
      actor: admin,
      metadata: {
        source: 'admin-manual-epaper-audio-upload',
        paperTitle: story.paperTitle,
        cityName: story.cityName,
        publishDate: story.publishDate,
        pageNumber: story.pageNumber,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Manual story listen audio uploaded successfully',
      data: {
        asset,
        ttsAsset: serializeTtsAsset(ttsAsset),
      },
    });
  } catch (error) {
    console.error('Error completing e-paper asset upload:', error);
    const message = error instanceof Error ? error.message : 'Failed to verify e-paper asset upload';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
