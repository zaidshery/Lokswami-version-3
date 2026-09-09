import { NextRequest, NextResponse } from 'next/server';
import { publicJsonCacheHeaders } from '@/lib/api/cache';
import { publicArticleService } from '@/lib/server/content/publicArticleService';

const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const cursorPublishedAt = searchParams.get('cursorPublishedAt');
    const cursorId = searchParams.get('cursorId');

    const payload = await publicArticleService.getLatestFeed(limit, {
      cursorPublishedAt,
      cursorId,
    });

    return NextResponse.json(payload, {
      headers: publicJsonCacheHeaders({ sMaxAge: 120, staleWhileRevalidate: 600 }),
    });
  } catch (error) {
    console.error('Failed to load public latest feed:', error);
    return NextResponse.json(
      {
        items: [],
        limit: DEFAULT_LIMIT,
        hasMore: false,
        nextCursor: null,
      },
      { status: 500 }
    );
  }
}
