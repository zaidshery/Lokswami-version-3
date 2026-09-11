import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import {
  mediaService,
  MediaValidationError,
} from '@/lib/server/media/mediaService';

export async function DELETE(
  req: NextRequest,
  context?: { params?: Promise<{ id?: string }> | { id?: string } }
) {
  try {
    const user = await getAdminSession();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    if (!canViewPage(user.role, 'media')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const resolvedParams = context?.params ? await context.params : undefined;
    const pathParts = req.url.split('?')[0].split('/');
    const id = resolvedParams?.id || pathParts[pathParts.length - 1];

    await mediaService.deleteMedia(id, user);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    console.error('media delete err', err);
    return NextResponse.json({ success: false, error: 'Failed to delete' }, { status: 500 });
  }
}
