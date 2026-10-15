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
    const rateLimit = await checkRateLimit({ scope: 'heavy', identifier: `story-video-init:${user.id}` });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many upload attempts.' }, { status: 429, headers: getRateLimitHeaders(rateLimit) });
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

    const target = await storyVideoAssetService.initialize({
      fileName,
      fileType,
      fileSize,
      storyId,
    }, user);

    return NextResponse.json(
      {
        success: true,
        message: 'Story video upload initialized successfully',
        data: target,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error initializing story video upload:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initialize story video upload' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
