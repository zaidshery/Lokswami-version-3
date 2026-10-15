import { withAdminMutation } from '@/lib/api/adminRoute';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperProcessingService } from '@/lib/server/epaper/epaperProcessingService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';
import { NextRequest, NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await epaperProcessingService.reconcile(actor, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof EpaperDomainError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    throw error;
  }
}

export const POST = withAdminMutation(POSTHandler);
