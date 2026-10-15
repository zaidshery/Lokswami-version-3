import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  StoryEditorialService,
  StoryForbiddenError,
  StoryNotFoundError,
  StoryInvalidIdError,
} from '@/lib/server/storyEditorialService';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const revisions = await StoryEditorialService.getStoryRevisions(id, user);
    return NextResponse.json({ success: true, data: revisions });
  } catch (error) {
    if (error instanceof StoryInvalidIdError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error instanceof StoryForbiddenError) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    if (error instanceof StoryNotFoundError) {
      return NextResponse.json(
        { success: false, error: 'Story not found' },
        { status: 404 }
      );
    }
    console.error('Error fetching story revisions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch revisions' },
      { status: 500 }
    );
  }
}
