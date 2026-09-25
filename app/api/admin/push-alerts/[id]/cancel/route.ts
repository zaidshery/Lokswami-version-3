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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Cancelled by desk';

    const cancelled = await pushDeliveryService.cancelAlert(id, reason, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      data: cancelled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel push alert';
    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes('NOT_FOUND') ? 404 : 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
