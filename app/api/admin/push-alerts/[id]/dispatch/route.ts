import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { pushDeliveryService } from '@/lib/server/push/pushDeliveryService';

type RouteContext = { params: Promise<{ id: string }> };

async function POSTHandler(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canViewPage(user.role, 'push_alerts')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const { delivery, result } = await pushDeliveryService.attemptDelivery(id);

    return NextResponse.json({
      success: result.status === 'succeeded' || result.status === 'manual',
      data: delivery,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push dispatch attempt failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
