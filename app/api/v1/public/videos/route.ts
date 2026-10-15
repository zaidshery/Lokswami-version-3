import { NextRequest, NextResponse } from 'next/server';
import { GET as getLatest } from '@/app/api/videos/latest/route';
import { getPublicVideosByIds } from '@/lib/server/publicVideos';

export async function GET(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('ids');
  if (value === null) return getLatest(req);
  const ids = [...new Set(value.split(','))];
  if (ids.length > 50 || ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    return NextResponse.json({ items: [] }, { status: 400 });
  }
  try {
    return NextResponse.json({ items: await getPublicVideosByIds(ids) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to load saved public videos.', error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
