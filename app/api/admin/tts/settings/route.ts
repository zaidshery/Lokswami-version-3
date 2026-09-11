import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  ttsService,
  TtsValidationError,
} from '@/lib/server/audio/ttsService';

// Auto-TTS (Gemini TTS) has been removed from this platform.
// All article audio is uploaded manually via DigitalOcean Spaces.
// This settings endpoint now only reports on manual upload storage and asset health.

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const data = await ttsService.getSettings(admin);

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

    console.error('Failed to load admin TTS settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load TTS settings.' },
      { status: 500 }
    );
  }
}

// PUT is no longer supported — auto-TTS configuration has been removed.
export async function PUT(req: NextRequest) {
  try {
    const admin = await getAdminSessionFromReq(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await ttsService.recordConfigAttempt(admin);

    return NextResponse.json(
      {
        success: false,
        error: 'Auto-TTS configuration has been removed. Audio is uploaded manually.',
      },
      { status: 405 }
    );
  } catch (error) {
    console.error('Failed to handle admin TTS settings PUT:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to handle TTS settings request.' },
      { status: 500 }
    );
  }
}
