import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { isCopyEditorRole, isSuperAdminRole } from '@/lib/auth/roles';
import { socialDistributionService } from '@/lib/server/distribution/socialDistributionService';

function canReadSocialPosts(role: string | null | undefined) {
  return role === 'admin' || isSuperAdminRole(role) || isCopyEditorRole(role);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSession();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canReadSocialPosts(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const result = await socialDistributionService.list(new URL(req.url));
    return NextResponse.json({
      success: true,
      data: result.data,
      meta: { automation: result.automation },
    });
  } catch (error) {
    console.error('Error fetching social posts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch social posts' },
      { status: 500 }
    );
  }
}
