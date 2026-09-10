import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await epaperUploadService.finalize(actor, id, await request.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to finalize upload.';
    console.error('Failed to finalize e-paper upload:', error);
    return NextResponse.json({ success: false, error: message }, { status: error instanceof EpaperDomainError ? error.status : 400 });
  }
}
