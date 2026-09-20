import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canEditEpaper } from '@/lib/auth/permissions';
import { isPdfAsset } from '@/lib/constants/epaperCities';
import { generateArticleHotspotsFromThumbnail } from '@/lib/utils/epaperOcrAssist';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Failed to auto-detect article hotspots';
}

function getErrorStatus(message: string) {
  if (
    /thumbnail is required|only image thumbnails|unsupported thumbnail|invalid/i.test(message) ||
    /E201|OCR could not parse|OCR request denied \(403\)|OCR request failed with status 403|custom ocr/i.test(message)
  ) {
    return 400;
  }
  return 500;
}

async function POSTHandler(req: NextRequest) {
  try {
    const user = await getAdminSession();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (!canEditEpaper(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const source =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const thumbnail = typeof source.thumbnail === 'string' ? source.thumbnail.trim() : '';
    if (!thumbnail) {
      return NextResponse.json(
        { success: false, error: 'Thumbnail is required' },
        { status: 400 }
      );
    }

    if (isPdfAsset(thumbnail)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Auto mapping needs image thumbnail (JPG/PNG). PDF thumbnails are not supported.',
        },
        { status: 400 }
      );
    }

    const hotspots = await generateArticleHotspotsFromThumbnail(thumbnail);

    return NextResponse.json({
      success: true,
      data: {
        hotspots,
        count: hotspots.length,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: getErrorStatus(message) }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
