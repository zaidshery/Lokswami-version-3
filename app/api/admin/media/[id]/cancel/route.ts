import { NextRequest, NextResponse } from 'next/server';
import { withAdminMutation } from '@/lib/api/adminRoute';
import { getAdminSession } from '@/lib/auth/admin';
import { mediaService, MediaValidationError } from '@/lib/server/media/mediaService';

export const POST = withAdminMutation(async (req: NextRequest) => {
  try {
    const actor = await getAdminSession();
    if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const id = new URL(req.url).pathname.split('/').at(-2) || '';
    const data = await mediaService.cancelPendingUpload(id, actor);
    return NextResponse.json({ success: true, data }, { status: data.cleanupPending ? 202 : 200 });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: 'Cancellation reference lookup or persistence failed; retry safely.' }, { status: 503 });
  }
});
