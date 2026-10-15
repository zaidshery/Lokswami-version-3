import { NextRequest, NextResponse } from 'next/server';
import { epaperService } from '@/lib/server/epaper/epaperService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';
import { normalizeEPaperPublicationType } from '@/lib/types/epaper';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const pageInput = Number.parseInt(req.nextUrl.searchParams.get('pageNumber') || '', 10);
    const data = await epaperService.getPublicEditionDetail(
      id,
      normalizeEPaperPublicationType(req.nextUrl.searchParams.get('publicationType')),
      Number.isFinite(pageInput) && pageInput > 0 ? Math.floor(pageInput) : undefined
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof EpaperDomainError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Failed to fetch public e-paper:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch e-paper' }, { status: 500 });
  }
}
