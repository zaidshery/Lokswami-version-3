import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { EditorialService } from '@/lib/server/content/editorialService';
import {
  ArticleNotFoundError,
  ArticleVersionConflictError,
  EditorialForbiddenError,
  EditorialValidationError,
  MongoAssignmentUnavailableError,
} from '@/lib/server/content/newsroomArticleTypes';
import {
  isWorkflowAction,
  parseExpectedVersion,
} from '@/lib/server/content/newsroomArticleValidation';
import {
  deleteEpaperArticleById,
  getEpaperArticleDetail,
  isEpaperKind,
  updateEpaperArticleById,
} from '@/lib/server/epaper/adminArticleCompat';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function handleEditorialError(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 500
): NextResponse {
  if (error instanceof ArticleVersionConflictError) {
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        error: error.message,
        currentVersion: error.currentVersion,
        updatedAt:
          error.updatedAt instanceof Date
            ? error.updatedAt.toISOString()
            : typeof error.updatedAt === 'string'
              ? error.updatedAt
              : null,
      },
      { status: 409 }
    );
  }

  if (error instanceof EditorialForbiddenError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }

  if (error instanceof MongoAssignmentUnavailableError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 503 });
  }

  if (error instanceof ArticleNotFoundError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }

  if (error instanceof EditorialValidationError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ success: false, error: fallbackMessage }, { status: fallbackStatus });
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    if (isEpaperKind(req)) {
      const epaperResult = await getEpaperArticleDetail(id, user);
      return NextResponse.json(epaperResult.payload, { status: epaperResult.status });
    }

    const result = await EditorialService.getArticleForNewsroom(id, user);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    return handleEditorialError(error, 'Internal Server Error', 500);
  }
}

export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    if (isEpaperKind(req)) {
      const epaperResult = await updateEpaperArticleById(id, body, true, user);
      return NextResponse.json(epaperResult.payload, { status: epaperResult.status });
    }

    const queryExpectedVersion = parseExpectedVersion(req.nextUrl.searchParams.get('expectedVersion'));
    const bodyExpectedVersion = parseExpectedVersion(body.expectedVersion);
    const expectedVersion = queryExpectedVersion ?? bodyExpectedVersion;

    const result = await EditorialService.fullUpdate(id, { ...body, expectedVersion }, user);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleEditorialError(error, 'Failed to update article', 500);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    if (isEpaperKind(req)) {
      const epaperResult = await updateEpaperArticleById(id, body, false, user);
      return NextResponse.json(epaperResult.payload, { status: epaperResult.status });
    }

    const queryExpectedVersion = parseExpectedVersion(req.nextUrl.searchParams.get('expectedVersion'));
    const bodyExpectedVersion = parseExpectedVersion(body.expectedVersion);
    const expectedVersion = queryExpectedVersion ?? bodyExpectedVersion;

    if (isWorkflowAction(body?.action)) {
      const result = await EditorialService.applyWorkflowAction(
        id,
        { ...body, expectedVersion },
        user
      );
      return NextResponse.json({
        success: true,
        data: result.article,
        message: `Article moved to ${result.toStatus}.`,
      });
    }

    const result = await EditorialService.partialUpdate(id, { ...body, expectedVersion }, user);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleEditorialError(error, 'Failed to process request', 500);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    if (isEpaperKind(req)) {
      const epaperResult = await deleteEpaperArticleById(id, user);
      return NextResponse.json(epaperResult.payload, { status: epaperResult.status });
    }

    const body = await req.json().catch(() => ({}));
    const queryExpectedVersion = parseExpectedVersion(req.nextUrl.searchParams.get('expectedVersion'));
    const bodyExpectedVersion = parseExpectedVersion(body?.expectedVersion);
    const expectedVersion = queryExpectedVersion ?? bodyExpectedVersion;

    await EditorialService.deleteArticle(id, expectedVersion, user);
    return NextResponse.json({ success: true, message: 'Article deleted successfully' });
  } catch (error) {
    return handleEditorialError(error, 'Failed to delete article', 500);
  }
}
