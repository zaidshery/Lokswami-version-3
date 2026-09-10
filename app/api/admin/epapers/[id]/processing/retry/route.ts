import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperProcessingService } from '@/lib/server/epaper/epaperProcessingService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await epaperProcessingService.retry(actor, id, await request.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    throw error;
  }
}
