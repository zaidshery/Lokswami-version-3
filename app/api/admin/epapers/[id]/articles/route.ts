import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { epaperArticleService } from '@/lib/server/epaper/epaperArticleService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const actor = await getAdminSession();
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const parsed = Number.parseInt(new URL(req.url).searchParams.get('pageNumber') || '', 10);
    const data = await epaperArticleService.list(actor, id, Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, 'Failed to list articles');
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const actor = await getAdminSession();
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const data = await epaperArticleService.create(actor, id, await req.json().catch(() => ({})));
    return NextResponse.json({ success: true, message: 'Article created successfully', data }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create article');
  }
}
