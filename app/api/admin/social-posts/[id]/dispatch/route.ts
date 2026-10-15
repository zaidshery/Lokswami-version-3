import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canDispatchSocialPosts } from '@/lib/auth/permissions';
import { DistributionServiceError } from '@/lib/server/distribution/distributionTypes';
import { socialDistributionService } from '@/lib/server/distribution/socialDistributionService';
import { auditSocialDispatched } from '@/lib/security/phase38Observability';

type RouteContext = { params: Promise<{ id: string }> };

async function POSTHandler(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canDispatchSocialPosts(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const result = await socialDistributionService.dispatch(id, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    void auditSocialDispatched({
      actor: user,
      resourceId: id,
      resourceName: 'Social Post Dispatch',
      metadata: { automation: result.automation },
    });

    return NextResponse.json({
      success: true,
      data: result.data,
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
    console.error('Error dispatching social post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to dispatch social post' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
