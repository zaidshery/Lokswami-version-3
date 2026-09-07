import { NextRequest, NextResponse } from 'next/server';
import { publicJsonCacheHeaders } from '@/lib/api/cache';
import { getPublicSwipeStory } from '@/lib/server/publicVideos';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const CACHE_HEADERS = publicJsonCacheHeaders({
  sMaxAge: 300,
  staleWhileRevalidate: 900,
});
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const story = await getPublicSwipeStory(slug);
    if (!story) {
      return NextResponse.json(
        { success: false, error: 'Swipe story not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, data: story },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Failed to resolve public Swipe story:', error);
    return NextResponse.json(
      { success: false, error: 'Swipe story is temporarily unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
