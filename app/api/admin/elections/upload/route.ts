import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canManageNewsroomSettings } from '@/lib/auth/permissions';
import {
  electionAudienceService,
  ElectionAudienceServiceError,
} from '@/lib/server/audience/electionAudienceService';

export async function POST(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canManageNewsroomSettings(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (error) {
      console.error('[election-upload] Failed to parse form data:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to parse form data' },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const result = await electionAudienceService.saveGraphic(
      String(formData.get('stateId') || ''),
      file
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ElectionAudienceServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('[election-upload] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
