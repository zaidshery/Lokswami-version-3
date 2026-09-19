import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canEditContent, canViewPage } from '@/lib/auth/permissions';
import connectDB from '@/lib/db/mongoose';
import { loadArticleManualTtsSource } from '@/lib/server/articleTtsManual';
import {
  createArticleTtsUploadTarget,
  parseArticleTtsAssetSize,
  validateArticleTtsUploadSelection,
} from '@/lib/storage/articleTtsUpload';

export const runtime = 'nodejs';

async function requireEditableArticle(admin: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>, articleId: string) {
  const article = await loadArticleManualTtsSource(articleId);
  if (!article) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 }),
    };
  }

  if (!canEditContent(admin, { legacyAuthorName: article.author, workflow: article.workflow })) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const, article };
}

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
    const input = {
      articleId: String(body.articleId || '').trim(),
      fileName: String(body.fileName || '').trim(),
      fileType: String(body.fileType || '').trim().toLowerCase(),
      fileSize: parseArticleTtsAssetSize(body.fileSize),
    };

    const validationError = validateArticleTtsUploadSelection(input);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const articleResult = await requireEditableArticle(admin, input.articleId);
    if (!articleResult.ok) {
      return articleResult.response;
    }

    const target = createArticleTtsUploadTarget(input);
    return NextResponse.json(
      {
        success: true,
        message: 'Article audio upload initialized successfully',
        data: target,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error initializing article audio upload:', error);
    const message = error instanceof Error ? error.message : 'Failed to initialize article audio upload';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
