import { NextRequest, NextResponse } from 'next/server';
import { publicJsonCacheHeaders } from '@/lib/api/cache';
import { getPublicSwipeFeedPage } from '@/lib/server/publicSwipeFeed';

const SHORTS_CACHE_HEADERS = publicJsonCacheHeaders({
  sMaxAge: 300,
  staleWhileRevalidate: 900,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const result = await getPublicSwipeFeedPage({
      limit: searchParams.get('limit') || '8',
      cursorPublishedAt: searchParams.get('cursorPublishedAt'),
      cursorId: searchParams.get('cursorId'),
    });
    return NextResponse.json(result, { headers: SHORTS_CACHE_HEADERS });
  } catch (error) {
    console.error('Failed to fetch public shorts latest feed:', error);
    return NextResponse.json(
      { items: [], limit: 8, hasMore: false, nextCursor: null },
      { status: 500 }
    );
  }
}
