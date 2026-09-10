import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { videoEditorialService } from '@/lib/server/video/videoEditorialService';
import {
  InvalidVideoIdError,
  VideoForbiddenError,
  VideoNotFoundError,
} from '@/lib/server/video/videoTypes';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const data = await videoEditorialService.getVideoActivity(id, user);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof InvalidVideoIdError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof VideoNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof VideoForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error('Error fetching video activity:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch video activity' },
      { status: 500 }
    );
  }
}
