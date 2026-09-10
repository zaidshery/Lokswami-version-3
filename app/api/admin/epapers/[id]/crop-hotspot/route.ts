import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperCropService } from '@/lib/server/epaper/epaperCropService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(req);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    return NextResponse.json(await epaperCropService.crop(actor, id, await req.json().catch(() => ({}))));
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : 'Failed to crop hotspot';
    console.error('Failed to crop e-paper hotspot:', error);
    return NextResponse.json({ success: false, error: message }, { status: /too small|invalid|required|missing|unsupported|inside/i.test(message) ? 400 : 500 });
  }
}
