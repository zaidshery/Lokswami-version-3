import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { pushDeliveryService } from '@/lib/server/push/pushDeliveryService';
import { auditPushPrepared } from '@/lib/security/phase38Observability';

async function POSTHandler(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canViewPage(user.role, 'push_alerts')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title : '';
    const alertBody = typeof body.body === 'string' ? body.body : '';
    const deepLink = typeof body.deepLink === 'string' ? body.deepLink : '';
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : undefined;
    const priority = body.priority === 'high' ? 'high' : 'normal';
    const audienceType = body.audienceType === 'test_recipients' ? 'test_recipients' : 'all_subscribers';
    const sourceStoryId = typeof body.sourceStoryId === 'string' ? body.sourceStoryId : undefined;
    const sourceArticleId = typeof body.sourceArticleId === 'string' ? body.sourceArticleId : undefined;

    const prepared = await pushDeliveryService.prepareAlert(
      {
        title,
        body: alertBody,
        deepLink,
        imageUrl,
        priority,
        audienceType,
        sourceStoryId,
        sourceArticleId,
      },
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      }
    );

    void auditPushPrepared({
      actor: user,
      resourceId: prepared.deliveryId,
      resourceName: prepared.payload.title,
      metadata: {
        audience: prepared.recipient.type,
        deepLink: prepared.payload.deepLink,
      },
    });

    return NextResponse.json({
      success: true,
      data: prepared,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to prepare push alert';
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('PUSH_PREPARATION_FAILED') ? 400 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
