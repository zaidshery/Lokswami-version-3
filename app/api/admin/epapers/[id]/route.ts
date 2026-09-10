import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { epaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EpaperDomainError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  const duplicate = typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
  if (duplicate) {
    return NextResponse.json({ success: false, error: 'An issue of this publication type for this scope/date already exists' }, { status: 409 });
  }
  console.error(fallback, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

async function actorOrUnauthorized() {
  const actor = await getAdminSession();
  return actor || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const actor = await actorOrUnauthorized();
  if (actor instanceof NextResponse) return actor;
  try {
    const { id } = await context.params;
    const data = await epaperEditorialService.get(actor, id, req.nextUrl.searchParams.get('publicationType'));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, 'Failed to fetch e-paper');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const actor = await actorOrUnauthorized();
  if (actor instanceof NextResponse) return actor;
  try {
    const { id } = await context.params;
    const result = await epaperEditorialService.updateMetadata(actor, id, await req.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, 'Failed to update e-paper');
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const actor = await actorOrUnauthorized();
  if (actor instanceof NextResponse) return actor;
  try {
    const { id } = await context.params;
    const result = await epaperEditorialService.updateWorkflow(actor, id, await req.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, 'Failed to update e-paper production');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const actor = await actorOrUnauthorized();
  if (actor instanceof NextResponse) return actor;
  try {
    const { id } = await context.params;
    const result = await epaperEditorialService.delete(actor, id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, 'Failed to delete e-paper');
  }
}
