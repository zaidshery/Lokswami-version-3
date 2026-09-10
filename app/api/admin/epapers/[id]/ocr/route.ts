import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperOcrService } from '@/lib/server/epaper/epaperOcrService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const pageNumber = Math.floor(Number(request.nextUrl.searchParams.get('pageNumber') || 0));
    const data = await epaperOcrService.list(actor, id, pageNumber > 0 ? pageNumber : undefined, request.nextUrl.searchParams.get('status')?.trim());
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await epaperOcrService.queue(actor, id, await request.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result }, { status: 202 });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Could not queue OCR. Please retry.' }, { status: 503 });
  }
}
