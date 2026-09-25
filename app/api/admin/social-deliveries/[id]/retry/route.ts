import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canDispatchSocialPosts } from '@/lib/auth/permissions';
import { DistributionServiceError } from '@/lib/server/distribution/distributionTypes';
import { socialDistributionService } from '@/lib/server/distribution/socialDistributionService';

type RouteContext = { params: Promise<{ id: string }> };

async function POSTHandler(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canDispatchSocialPosts(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const result = await socialDistributionService.retryDelivery(id, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      delivery: result.delivery,
      meta: { automation: result.automation },
    });
  } catch (error) {
    if (error instanceof DistributionServiceError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          ...(error.data !== undefined ? { data: error.data } : {}),
        },
        { status: error.status }
      );
    }
    console.error('Error retrying social delivery:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to retry social delivery' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
