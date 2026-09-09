import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canReadContent, canViewPage } from '@/lib/auth/permissions';
import { listArticleActivity } from '@/lib/server/articleActivity';
import { findArticleById } from '@/lib/server/content/newsroomArticleRepository';
import { buildArticlePermissionRecord } from '@/lib/server/content/newsroomArticleValidation';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!canViewPage(user.role, 'articles')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const article = await findArticleById(id);
    if (!article) {
      return NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 });
    }

    if (!canReadContent(user, buildArticlePermissionRecord(article), { allowViewerRead: true })) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const activity = await listArticleActivity({ articleId: id, article });
    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    console.error('Error fetching article activity:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch article activity' },
      { status: 500 }
    );
  }
}
