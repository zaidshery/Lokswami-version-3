import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canManageNewsroomSettings } from '@/lib/auth/permissions';
import {
  electionAudienceService,
  ElectionAudienceServiceError,
} from '@/lib/server/audience/electionAudienceService';

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canManageNewsroomSettings(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const result = await electionAudienceService.deleteGraphic((await req.json()).stateId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ElectionAudienceServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('Error deleting election graphic:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
