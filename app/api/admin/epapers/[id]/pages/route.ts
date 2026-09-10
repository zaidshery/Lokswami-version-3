import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperPageService } from '@/lib/server/epaper/epaperPageService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(req);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await epaperPageService.update(
      actor,
      id,
      await req.json().catch(() => ({})),
      req.headers.get('content-type') || ''
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Only JPG, PNG, or WEBP images are allowed') || message.includes('Image size exceeds 10MB') || message.includes('Image signature is invalid')) {
      return NextResponse.json({ success: false, error: 'Page image must be JPG/PNG/WEBP, under 10MB, and a valid image file' }, { status: 400 });
    }
    console.error('Failed to update e-paper pages:', error);
    return NextResponse.json({ success: false, error: 'Failed to update page images' }, { status: 500 });
  }
}
