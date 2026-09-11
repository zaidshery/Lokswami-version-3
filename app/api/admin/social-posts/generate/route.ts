import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { isSuperAdminRole } from '@/lib/auth/roles';
import { DistributionServiceError } from '@/lib/server/distribution/distributionTypes';
import { socialDistributionService } from '@/lib/server/distribution/socialDistributionService';

function canGenerate(role: string | null | undefined) {
  return role === 'admin' || isSuperAdminRole(role);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAdminSession();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canGenerate(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { storyId?: string };
    const storyId = typeof body.storyId === 'string' ? body.storyId.trim() : '';
    const data = await socialDistributionService.generateDrafts(storyId, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof DistributionServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('Error generating social drafts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate social drafts' },
      { status: 500 }
    );
  }
}
