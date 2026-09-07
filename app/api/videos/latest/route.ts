import { NextRequest, NextResponse } from 'next/server';
import { publicJsonCacheHeaders } from '@/lib/api/cache';
import { getPublicVideoFeedPage } from '@/lib/server/publicVideos';

const VIDEOS_CACHE_HEADERS = publicJsonCacheHeaders({
  sMaxAge: 300,
  staleWhileRevalidate: 900,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const cursorPublishedAt = searchParams.get('cursorPublishedAt');
    const cursorId = searchParams.get('cursorId');

    const result = await getPublicVideoFeedPage({
      limit,
      cursorPublishedAt,
      cursorId,
    });

    return NextResponse.json(result, { headers: VIDEOS_CACHE_HEADERS });
  } catch (error) {
    console.error('Failed to fetch public videos latest feed:', error);
    return NextResponse.json(
      { items: [], limit: 20, hasMore: false, nextCursor: null },
      { status: 500 }
    );
  }
}
