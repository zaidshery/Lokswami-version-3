import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperOcrService } from '@/lib/server/epaper/epaperOcrService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string; suggestionId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, suggestionId } = await context.params;
    const result = await epaperOcrService.review(actor, id, suggestionId, await request.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof EpaperDomainError) {
      const payload = error.message.startsWith('This page image was replaced') ? { error: error.message } : { success: false, error: error.message };
      return NextResponse.json(payload, { status: error.status });
    }
    console.error('Failed to review OCR suggestion:', error);
    return NextResponse.json({ success: false, error: 'Failed to review suggestion.' }, { status: 500 });
  }
}
