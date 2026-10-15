import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { epaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const actor = await getAdminSession();
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ success: true, data: await epaperEditorialService.activity(actor, id) });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Failed to fetch e-paper activity:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch e-paper activity' }, { status: 500 });
  }
}
