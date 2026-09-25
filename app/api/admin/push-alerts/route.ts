import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { isAdminRole } from '@/lib/auth/roles';
import { pushDeliveryService } from '@/lib/server/push/pushDeliveryService';
import type { PushDeliveryStatus } from '@/lib/server/push/pushDeliveryTypes';

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const sourceStoryId = searchParams.get('storyId') || undefined;
    const sourceArticleId = searchParams.get('articleId') || undefined;

    const data = await pushDeliveryService.listAlerts({
      status: status && status !== 'all' ? (status as PushDeliveryStatus) : 'all',
      sourceStoryId,
      sourceArticleId,
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        provider: pushDeliveryService.getPublicProviderStatus(),
      },
    });
  } catch (error) {
    console.error('Error listing push alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list push alerts' },
      { status: 500 }
    );
  }
}
