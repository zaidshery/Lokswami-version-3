import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canReadContent, canViewPage } from '@/lib/auth/permissions';
import {
  buildArticleFullTtsText,
  findReadyManualTtsAsset,
} from '@/lib/server/ttsAssets';
import {
  loadArticleManualTtsSource,
  serializeManagedTtsAsset,
} from '@/lib/server/articleTtsManual';

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function requireMongoBackedTts() {
  if (!process.env.MONGODB_URI?.trim()) {
    return 'Shared admin TTS controls require MongoDB.';
  }

  try {
    await connectDB();
    return '';
  } catch (error) {
    console.error('MongoDB unavailable for admin article TTS route:', error);
    return 'Shared admin TTS controls are unavailable right now.';
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!canViewPage(admin.role, 'articles')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const mongoError = await requireMongoBackedTts();
    if (mongoError) {
      return NextResponse.json(
        { success: false, error: mongoError },
        { status: 503 }
      );
    }

    const { id } = await context.params;
    const articleId = id.trim();
    const article = await loadArticleManualTtsSource(articleId);

    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }
    if (
      !canReadContent(
        admin,
        { legacyAuthorName: article.author, workflow: article.workflow },
        { allowViewerRead: true }
      )
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const text = buildArticleFullTtsText(article);
    if (!text) {
      return NextResponse.json({
        success: true,
        data: {
          variant: 'article_full',
          eligible: false,
          ready: false,
          asset: null,
          message: 'Save article title, summary, and content before uploading listen audio.',
        },
      });
    }

    const manualAsset = await findReadyManualTtsAsset({
      sourceType: 'article',
      sourceId: article.id,
      variant: 'article_full',
      actor: admin,
    });
    const asset = serializeManagedTtsAsset(manualAsset);
    const ready = Boolean(asset?.status === 'ready' && asset.audioUrl);

    return NextResponse.json({
      success: true,
      data: {
        variant: 'article_full',
        eligible: true,
        ready,
        asset,
        message: ready
          ? 'Manual article listen audio is ready for readers.'
          : 'No manual listen audio has been uploaded for this article yet.',
      },
    });
  } catch (error) {
    console.error('Failed to load admin article TTS status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load article TTS status.' },
      { status: 500 }
    );
  }
}

async function POSTHandler(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!canViewPage(admin.role, 'article_edit')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Article listen audio now uses manual uploads. Upload an audio file from the article editor.',
      },
      { status: 405 }
    );
  } catch (error) {
    console.error('Failed to handle admin article TTS request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to handle article listen audio.' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
