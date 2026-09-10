import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { epaperTtsService } from '@/lib/server/epaper/epaperTtsService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const actor = await getAdminSession();
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const data = await epaperTtsService.bulkDisabled(actor, id.trim(), await req.json().catch(() => ({})));
    return NextResponse.json({ success: false, error: data.message, data }, { status: 405 });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Failed to run admin e-paper TTS job:', error);
    return NextResponse.json({ success: false, error: 'Failed to process e-paper audio request.' }, { status: 500 });
  }
}
