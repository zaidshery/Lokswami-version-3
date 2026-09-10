import { NextRequest, NextResponse } from 'next/server';
import { epaperService } from '@/lib/server/epaper/epaperService';
import { parsePublicEpaperFilters } from '@/lib/utils/publicEpaperFilters';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
};

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedStatus = (searchParams.get('status') || 'published').trim().toLowerCase();
    if (requestedStatus && requestedStatus !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Public endpoint only supports published e-papers' },
        { status: 400 }
      );
    }
    const parsed = parsePublicEpaperFilters(searchParams);
    if ('error' in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const result = await epaperService.listPublicEpapers({
      filters: parsed.filters,
      limit: parsePositiveInt(searchParams.get('limit'), 20, 100),
      page: parsePositiveInt(searchParams.get('page'), 1, 500),
    });
    return NextResponse.json({ success: true, ...result }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('Failed to list public e-papers:', error);
    return NextResponse.json({ success: false, error: 'Failed to list e-papers' }, { status: 500 });
  }
}
