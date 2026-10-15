import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  ttsService,
  TtsValidationError,
} from '@/lib/server/audio/ttsService';
import type { TtsAssetStatus, TtsSourceType, TtsVariant } from '@/lib/types/tts';

function parseLimit(value: string | null, fallback: number) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'all') {
    return 500;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = parseLimit(searchParams.get('limit'), 24);
    const status = (searchParams.get('status')?.trim() || '') as TtsAssetStatus;
    const variant = (searchParams.get('variant')?.trim() || '') as TtsVariant;
    const sourceType = (searchParams.get('sourceType')?.trim() || '') as TtsSourceType;
    const sourceId = searchParams.get('sourceId')?.trim() || '';
    const sourceIds = searchParams.get('sourceIds')
      ? searchParams.get('sourceIds')!.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 500)
      : [];
    const sourceParentId = searchParams.get('sourceParentId')?.trim() || '';

    const data = await ttsService.listAssets(
      {
        limit,
        status,
        variant,
        sourceType,
        sourceId,
        sourceIds,
        sourceParentId,
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

    console.error('Failed to load admin TTS assets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load TTS assets.' },
      { status: 500 }
    );
  }
}
