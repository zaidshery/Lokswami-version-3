import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canEditContent, canViewPage } from '@/lib/auth/permissions';
import connectDB from '@/lib/db/mongoose';
import Article from '@/lib/models/Article';
import {
  createBreakingTtsUploadTarget,
  parseBreakingTtsAssetSize,
  validateBreakingTtsUploadSelection,
} from '@/lib/storage/breakingTtsUpload';
import { resolveArticleWorkflow } from '@/lib/workflow/article';

export const runtime = 'nodejs';

async function requireEditableBreakingArticle(
  admin: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>,
  articleId: string
) {
  if (!Types.ObjectId.isValid(articleId)) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 }),
    };
  }

  const article = await Article.findById(articleId).select(
    '_id title author workflow reporterMeta isBreaking updatedAt publishedAt'
  );
  if (!article) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 }),
    };
  }

  if (
    !canEditContent(admin, {
      legacyAuthorName: String(article.author || ''),
      workflow: resolveArticleWorkflow({
        workflow: article.workflow,
        updatedAt: article.updatedAt,
        publishedAt: article.publishedAt,
      }),
    })
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    };
  }

  if (!article.isBreaking) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: 'Mark this article as breaking news before uploading breaking audio.' },
        { status: 400 }
      ),
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
      fileSize: parseBreakingTtsAssetSize(body.fileSize),
    };

    const validationError = validateBreakingTtsUploadSelection(input);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const articleResult = await requireEditableBreakingArticle(admin, input.articleId);
    if (!articleResult.ok) {
      return articleResult.response;
    }

    const target = createBreakingTtsUploadTarget(input);
    return NextResponse.json(
      {
        success: true,
        message: 'Breaking audio upload initialized successfully',
        data: target,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error initializing breaking audio upload:', error);
    const message = error instanceof Error ? error.message : 'Failed to initialize breaking audio upload';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
