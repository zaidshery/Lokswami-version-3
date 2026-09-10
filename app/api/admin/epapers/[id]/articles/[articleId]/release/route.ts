import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperArticleService } from '@/lib/server/epaper/epaperArticleService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string; articleId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, articleId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const version = await epaperArticleService.release(actor, id, articleId, body.expectedUpdatedAt);
    return NextResponse.json({ success: true, version });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Failed to release e-paper story:', error);
    return NextResponse.json({ error: 'Failed to release story.' }, { status: 500 });
  }
}
