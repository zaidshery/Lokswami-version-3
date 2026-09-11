import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  ttsService,
  TtsValidationError,
} from '@/lib/server/audio/ttsService';

function parseLimit(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(200, Math.max(1, Math.floor(parsed)));
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      assetIds?: string[];
      status?: 'ready' | 'stale' | 'failed' | 'pending' | 'all';
      limit?: number;
    };

    const limit = parseLimit(body.limit, 50);
    const data = await ttsService.revalidateAssets(
      {
        assetIds: body.assetIds,
        status: body.status,
        limit,
      },
      admin
    );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof TtsValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to revalidate admin TTS assets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revalidate TTS assets.' },
      { status: 500 }
    );
  }
}
