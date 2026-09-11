import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canDeleteContent, canViewPage } from '@/lib/auth/permissions';
import { isReporterDeskRole } from '@/lib/auth/roles';
import {
  mediaService,
  MediaValidationError,
} from '@/lib/server/media/mediaService';

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!canViewPage(user.role, 'media')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const data = await mediaService.listMedia(user);
    return NextResponse.json({
      success: true,
      data,
      meta: {
        scope: isReporterDeskRole(user.role) ? 'own' : 'all',
        canDelete: canDeleteContent(user),
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to list media' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    if (!canViewPage(user.role, 'media')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      filename?: string;
      url?: string;
      size?: number;
      type?: string;
    };

    const media = await mediaService.createMedia(
      {
        filename: String(body.filename || '').trim(),
        url: String(body.url || '').trim(),
        size: body.size,
        type: body.type,
      },
      user
    );

    return NextResponse.json({ success: true, data: media }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error('media create error', error);
    return NextResponse.json({ success: false, error: 'Failed to create media' }, { status: 500 });
  }
}
