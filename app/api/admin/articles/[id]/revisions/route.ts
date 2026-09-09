import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { EditorialRevisionService } from '@/lib/server/content/editorialRevisionService';
import {
  ArticleNotFoundError,
  EditorialForbiddenError,
  EditorialValidationError,
} from '@/lib/server/content/newsroomArticleTypes';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const revisions = await EditorialRevisionService.getRevisions(id, user);
    return NextResponse.json({ success: true, data: revisions });
  } catch (error) {
    if (error instanceof EditorialForbiddenError) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    if (error instanceof ArticleNotFoundError) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }
    if (error instanceof EditorialValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('Error fetching article revisions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch revisions' },
      { status: 500 }
    );
  }
}
