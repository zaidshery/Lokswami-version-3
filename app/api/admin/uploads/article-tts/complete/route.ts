import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canEditContent, canViewPage } from '@/lib/auth/permissions';
import connectDB from '@/lib/db/mongoose';
import {
  loadArticleManualTtsSource,
  serializeManagedTtsAsset,
} from '@/lib/server/articleTtsManual';
import {
  buildArticleFullTtsText,
  saveManualTtsAsset,
} from '@/lib/server/ttsAssets';
import {
  parseArticleTtsAssetSize,
  verifyArticleTtsUpload,
} from '@/lib/storage/articleTtsUpload';

export const runtime = 'nodejs';

async function POSTHandler(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canViewPage(admin.role, 'article_edit')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const articleId = String(body.articleId || '').trim();
    const mediaKey = String(body.mediaKey || '').trim();
    if (!articleId) {
      return NextResponse.json(
        { success: false, error: 'articleId is required for article audio uploads.' },
        { status: 400 }
      );
    }
    if (!mediaKey) {
      return NextResponse.json(
        { success: false, error: 'Uploaded article audio key is required.' },
        { status: 400 }
      );
    }

    const article = await loadArticleManualTtsSource(articleId);
    if (!article) {
      return NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 });
    }
    if (!canEditContent(admin, { legacyAuthorName: article.author, workflow: article.workflow })) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const text = buildArticleFullTtsText({
      title: article.title,
      summary: article.summary,
      content: article.content,
    });
    if (!text) {
      return NextResponse.json(
        {
          success: false,
          error: 'Save article title, summary, and content before uploading listen audio.',
        },
        { status: 400 }
      );
    }

    const asset = await verifyArticleTtsUpload({
      mediaKey,
      expectedSize: parseArticleTtsAssetSize(body.expectedSize),
      expectedFileType: typeof body.expectedFileType === 'string' ? body.expectedFileType.trim() : '',
      expectedFileName: typeof body.expectedFileName === 'string' ? body.expectedFileName.trim() : '',
    });

    const ttsAsset = await saveManualTtsAsset({
      sourceType: 'article',
      sourceId: article.id,
      variant: 'article_full',
      title: article.title,
      text,
      audioUrl: asset.mediaUrl,
      mimeType: asset.mediaMimeType,
      mediaKey: asset.mediaKey,
      actor: admin,
      metadata: {
        source: 'admin-manual-article-audio-upload',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Manual article listen audio uploaded successfully',
      data: {
        asset,
        ttsAsset: serializeManagedTtsAsset(ttsAsset),
      },
    });
  } catch (error) {
    console.error('Error completing article audio upload:', error);
    const message = error instanceof Error ? error.message : 'Failed to verify article audio upload';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
