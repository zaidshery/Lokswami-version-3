import { NextRequest, NextResponse } from 'next/server';
import {
  audienceCaptureService,
  getAudienceRequestMetadata,
} from '@/lib/server/audience/audienceCaptureService';

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const outcome = await audienceCaptureService.captureCareerApplication(
      body,
      getAudienceRequestMetadata(req.headers)
    );
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('Career application failed:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to submit application right now. Please try again.' },
      { status: 500 }
    );
  }
}
