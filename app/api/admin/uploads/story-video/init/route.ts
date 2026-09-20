import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  createStoryVideoUploadTarget,
  parseStoryVideoSize,
  validateStoryVideoSelection,
} from '@/lib/storage/storyVideoUpload';

export const runtime = 'nodejs';

async function POSTHandler(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const fileName = String(body.fileName || '').trim();
    const fileType = String(body.fileType || '').trim().toLowerCase();
    const fileSize = parseStoryVideoSize(body.fileSize);
    const storyId = typeof body.storyId === 'string' ? body.storyId.trim() : '';

    const validationError = validateStoryVideoSelection({ fileName, fileType, fileSize });
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const target = createStoryVideoUploadTarget({
      fileName,
      fileType,
      fileSize,
      storyId,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Story video upload initialized successfully',
        data: target,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error initializing story video upload:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to initialize story video upload';

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
