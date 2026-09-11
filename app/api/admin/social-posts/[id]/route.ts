import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { isSuperAdminRole } from '@/lib/auth/roles';
import {
  socialDistributionService,
} from '@/lib/server/distribution/socialDistributionService';
import { DistributionServiceError } from '@/lib/server/distribution/distributionTypes';

type RouteContext = { params: Promise<{ id: string }> };

function canManageSocialPosts(role: string | null | undefined) {
  return role === 'admin' || isSuperAdminRole(role);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canManageSocialPosts(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const data = await socialDistributionService.update(id, await req.json());
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof DistributionServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('Error updating social post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update social post' },
      { status: 500 }
    );
  }
}
