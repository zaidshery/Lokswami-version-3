import { NextRequest, NextResponse } from 'next/server';
import { publicJsonCacheHeaders } from '@/lib/api/cache';
import { publicArticleService } from '@/lib/server/content/publicArticleService';

const BREAKING_CACHE_HEADERS = publicJsonCacheHeaders({
  sMaxAge: 20,
  staleWhileRevalidate: 120,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const items = await publicArticleService.getBreakingArticles(limit);

    return NextResponse.json(
      {
        success: true,
        items,
        total: items.length,
      },
      { headers: BREAKING_CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Failed to load breaking items:', error);
    return NextResponse.json(
      {
        success: false,
        items: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}
