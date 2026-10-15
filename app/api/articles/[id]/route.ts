import { NextResponse } from 'next/server';
import { publicJsonCacheHeaders } from '@/lib/api/cache';
import { publicArticleService } from '@/lib/server/content/publicArticleService';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ARTICLE_DETAIL_CACHE_HEADERS = publicJsonCacheHeaders({
  sMaxAge: 300,
  staleWhileRevalidate: 1800,
});

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const articleId = decodeURIComponent(id).trim();

    if (!articleId) {
      return NextResponse.json(
        { success: false, error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    const article = await publicArticleService.getLegacyArticleByIdOrSlug(articleId);
    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: article },
      { headers: ARTICLE_DETAIL_CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Failed to load public article detail:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch article' },
      { status: 500 }
    );
  }
}
