import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  parseStoryVideoSize,
  validateStoryVideoSelection,
  verifyStoryVideoUpload,
} from '@/lib/storage/storyVideoUpload';

export const runtime = 'nodejs';

async function POSTHandler(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mediaKey = String(body.mediaKey || '').trim();
    const expectedSize = parseStoryVideoSize(body.expectedSize);
    const expectedFileType = String(body.expectedFileType || 'video/mp4').trim().toLowerCase();
    const expectedFileName = String(body.expectedFileName || mediaKey.split('/').pop() || '').trim();

    if (!mediaKey) {
      return NextResponse.json({ success: false, error: 'Uploaded video key is required.' }, { status: 400 });
    }

    const validationError = validateStoryVideoSelection({
      fileName: expectedFileName,
      fileType: expectedFileType,
      fileSize: expectedSize,
    });
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const asset = await verifyStoryVideoUpload(mediaKey);

    if (expectedSize && Math.abs(asset.mediaSizeBytes - expectedSize) > 1024) {
      return NextResponse.json(
        { success: false, error: 'Uploaded video size does not match the selected file.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Story video upload verified successfully',
      data: asset,
    });
  } catch (error) {
    console.error('Error completing story video upload:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to verify story video upload';

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
