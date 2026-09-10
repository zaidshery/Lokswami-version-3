import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { videoEditorialService } from '@/lib/server/video/videoEditorialService';
import {
  VideoForbiddenError,
  VideoValidationError,
} from '@/lib/server/video/videoTypes';

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort');
    const published = parseBooleanParam(searchParams.get('published'));
    const workflowStatus = String(searchParams.get('workflowStatus') || '').trim().toLowerCase();
    const limit = searchParams.get('limit');
    const page = searchParams.get('page');

    const result = await videoEditorialService.listVideos(
      {
        category,
        type,
        search,
        sort,
        published,
        workflowStatus,
        limit,
        page,
      },
      user
    );

    return NextResponse.json({
      success: true,
      data: result.videos,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const result = await videoEditorialService.createVideo(body, user);

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        message: result.message,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating video:', error);
    if (error instanceof VideoValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof VideoForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000) {
      return NextResponse.json(
        { success: false, error: 'That Swipe slug is already in use. Choose a unique slug.' },
        { status: 409 }
      );
    }

    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to create video'
        : 'Failed to create video';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
