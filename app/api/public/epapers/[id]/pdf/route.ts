import { NextRequest, NextResponse } from 'next/server';
import { epaperService } from '@/lib/server/epaper/epaperService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const url = await epaperService.resolvePublicPdfUrl(id);
    const response = NextResponse.redirect(url, { status: 302 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof EpaperDomainError) {
      const status = error.status === 400 ? 502 : error.status;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    console.error('Failed to resolve e-paper PDF redirect:', error);
    return NextResponse.json({ success: false, error: 'Failed to serve e-paper PDF' }, { status: 500 });
  }
}
