import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  ttsService,
  TtsValidationError,
} from '@/lib/server/audio/ttsService';

import type { TtsAssetStatus, TtsSourceType, TtsVariant } from '@/lib/types/tts';

function parseLimit(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const limit = parseLimit(body.limit, 100);

    const data = await ttsService.cleanupAssets(
      {
        status: typeof body.status === 'string' ? (body.status as TtsAssetStatus | 'all') : undefined,
        variant: typeof body.variant === 'string' ? (body.variant as TtsVariant) : undefined,
        sourceType: typeof body.sourceType === 'string' ? (body.sourceType as TtsSourceType) : undefined,
        sourceId: typeof body.sourceId === 'string' ? body.sourceId.trim() : undefined,
        sourceParentId: typeof body.sourceParentId === 'string' ? body.sourceParentId.trim() : undefined,
        limit,
        dryRun: Boolean(body.dryRun),
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

    console.error('Failed to cleanup admin TTS assets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cleanup TTS assets.' },
      { status: 500 }
    );
  }
}
