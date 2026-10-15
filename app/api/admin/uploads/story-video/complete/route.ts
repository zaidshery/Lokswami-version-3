import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  parseStoryVideoSize,
  validateStoryVideoSelection,
} from '@/lib/storage/storyVideoUpload';
import { storyVideoAssetService } from '@/lib/server/media/storyVideoAssetService';
import { MediaValidationError } from '@/lib/server/media/mediaService';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/getRateLimiter';

export const runtime = 'nodejs';

async function POSTHandler(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimit = await checkRateLimit({ scope: 'heavy', identifier: `story-video-complete:${user.id}` });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many upload verification attempts.' }, { status: 429, headers: getRateLimitHeaders(rateLimit) });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const assetId = String(body.assetId || '').trim();
    const expectedSize = parseStoryVideoSize(body.expectedSize);
    const expectedFileType = String(body.expectedFileType || 'video/mp4').trim().toLowerCase();
    const expectedFileName = String(body.expectedFileName || '').trim();

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'Upload receipt is required.' }, { status: 400 });
    }

    const validationError = validateStoryVideoSelection({
      fileName: expectedFileName,
      fileType: expectedFileType,
      fileSize: expectedSize,
    });
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const asset = await storyVideoAssetService.complete({
      assetId, expectedSize, expectedFileType, expectedFileName,
    }, user);

    return NextResponse.json({
      success: true,
      message: 'Story video upload verified successfully',
      data: asset,
    });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error completing story video upload:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify story video upload' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
