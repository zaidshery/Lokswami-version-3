import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { epaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

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

export async function GET(req: NextRequest) {
  const actor = await getAdminSession();
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await epaperEditorialService.list(actor, new URL(req.url).searchParams);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, 'Failed to list e-papers');
  }
}

export async function POST(req: NextRequest) {
  const actor = await getAdminSession();
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await epaperEditorialService.create(actor, await req.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof EpaperDomainError) return errorResponse(error, 'Failed to create e-paper');
    const message = error instanceof Error && error.message.trim() ? error.message : '';
    if (/required|valid|must be|too high|max|asset|upload|file|key|size|content type/i.test(message)) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return errorResponse(error, 'Failed to create e-paper');
  }
}
