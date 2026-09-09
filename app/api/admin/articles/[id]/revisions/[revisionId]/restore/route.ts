import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { EditorialRevisionService } from '@/lib/server/content/editorialRevisionService';
import {
  ArticleNotFoundError,
  ArticleVersionConflictError,
  EditorialForbiddenError,
  EditorialValidationError,
} from '@/lib/server/content/newsroomArticleTypes';

type RouteContext = {
  params: Promise<{ id: string; revisionId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id, revisionId } = await context.params;
    const restored = await EditorialRevisionService.restoreRevision(id, revisionId, user);

    return NextResponse.json({
      success: true,
      data: restored,
      message: 'Revision restored successfully',
    });
  } catch (error) {
    if (error instanceof EditorialForbiddenError) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    if (error instanceof ArticleNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message || 'Article or revision not found' },
        { status: 404 }
      );
    }
    if (error instanceof ArticleVersionConflictError) {
      return NextResponse.json(
        {
          success: false,
          code: 'ARTICLE_VERSION_CONFLICT',
          error: error.message,
          currentVersion: error.currentVersion,
          updatedAt: error.updatedAt,
        },
        { status: 409 }
      );
    }
    if (error instanceof EditorialValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('Error restoring revision:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to restore revision' },
      { status: 500 }
    );
  }
}
