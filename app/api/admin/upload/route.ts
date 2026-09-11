import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  mediaService,
  MediaValidationError,
} from '@/lib/server/media/mediaService';
import type { MediaUploadPurpose } from '@/lib/server/media/mediaTypes';

export const runtime = 'nodejs';

function parseUploadPurpose(value: FormDataEntryValue | null): MediaUploadPurpose {
  if (value === 'story-thumbnail') return 'story-thumbnail';
  if (value === 'video-thumbnail') return 'video-thumbnail';
  if (value === 'epaper-thumbnail') return 'epaper-thumbnail';
  if (value === 'epaper-paper') return 'epaper-paper';
  return 'image';
}

function isRetriableBodyReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /disturbed|locked|already read|body/i.test(message);
}

async function readUploadFormData(req: NextRequest): Promise<FormData> {
  try {
    return await req.formData();
  } catch (error) {
    if (!isRetriableBodyReadError(error) || typeof req.clone !== 'function') {
      throw error;
    }

    return req.clone().formData();
  }
}

function parseFocalPoint(value: FormDataEntryValue | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, parsed));
}

export async function POST(req: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await readUploadFormData(req);
    } catch (error) {
      console.error('Failed to read upload form data:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to process request body' },
        { status: 400 }
      );
    }

    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const file = formData.get('file');
    const purpose = parseUploadPurpose(formData.get('purpose'));

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const optimizeArticleImage =
      purpose === 'image' && formData.get('optimizeArticleImage') === 'true';

    const data = await mediaService.processUpload(file, purpose, user.role, {
      optimizeArticleImage,
      focalPointX: parseFocalPoint(formData.get('focalPointX')),
      focalPointY: parseFocalPoint(formData.get('focalPointY')),
    });

    return NextResponse.json(
      {
        success: true,
        message: optimizeArticleImage
          ? 'Article image optimized and uploaded successfully'
          : 'File uploaded successfully',
        data,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const name = error instanceof Error ? error.name : 'Error';
    console.error('CRITICAL: Upload handler failed:', {
      message,
      stack,
      name,
    });
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
