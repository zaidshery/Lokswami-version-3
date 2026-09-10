import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperRevisionService } from '@/lib/server/epaper/epaperRevisionService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await epaperRevisionService.create(actor, id);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof EpaperDomainError) {
      const data = 'data' in error ? (error as EpaperDomainError & { data?: unknown }).data : undefined;
      return NextResponse.json({ success: false, error: error.message, ...(data ? { data } : {}) }, { status: error.status });
    }
    console.error('Failed to create e-paper revision:', error);
    return NextResponse.json({ success: false, error: 'Failed to create revision.' }, { status: 500 });
  }
}
