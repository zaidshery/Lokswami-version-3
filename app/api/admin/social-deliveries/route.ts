import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { isAdminRole } from '@/lib/auth/roles';
import { normalizeSocialPlatform } from '@/lib/content/newsroomPublishing';
import { socialDistributionService } from '@/lib/server/distribution/socialDistributionService';
import type { SocialDeliveryStatus } from '@/lib/server/distribution/socialDeliveryTypes';

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const socialPostId = searchParams.get('socialPostId') || undefined;
    const storyId = searchParams.get('storyId') || undefined;
    const articleId = searchParams.get('articleId') || undefined;
    const platform = searchParams.get('platform');
    const status = searchParams.get('status');
    const reconParam = searchParams.get('reconciliationRequired');

    const deliveries = await socialDistributionService.listDeliveries({
      socialPostId,
      storyId,
      articleId,
      platform: platform && platform !== 'all' ? normalizeSocialPlatform(platform) : 'all',
      status: status && status !== 'all' ? (status as SocialDeliveryStatus) : 'all',
      reconciliationRequired: reconParam !== null ? reconParam === 'true' : undefined,
    });

    return NextResponse.json({ success: true, data: deliveries });
  } catch (error) {
    console.error('Error listing social deliveries:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list social deliveries' },
      { status: 500 }
    );
  }
}
