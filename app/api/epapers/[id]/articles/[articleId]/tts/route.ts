import { NextRequest, NextResponse } from 'next/server';
import { epaperTtsService } from '@/lib/server/epaper/epaperTtsService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string; articleId: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { id, articleId } = await context.params;
    return NextResponse.json({ success: true, data: await epaperTtsService.publicStory(id.trim(), articleId.trim()) });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('E-paper story TTS route failed:', error);
    return NextResponse.json({ success: false, error: error instanceof Error && error.message.trim() ? error.message : 'Failed to load e-paper story audio.' }, { status: 500 });
  }
}
