import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperTtsService } from '@/lib/server/epaper/epaperTtsService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string; articleId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(req);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, articleId } = await context.params;
    return NextResponse.json({ success: true, data: await epaperTtsService.adminStoryStatus(actor, id.trim(), articleId.trim()) });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Failed to load admin e-paper TTS status:', error);
    return NextResponse.json({ success: false, error: 'Failed to load story TTS status.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const actor = await getAdminSessionFromReq(req);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ success: false, error: epaperTtsService.disabledAutoGeneration(actor) }, { status: 405 });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: 'Failed to handle story audio request.' }, { status: 500 });
  }
}
