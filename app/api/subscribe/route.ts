import { NextRequest, NextResponse } from 'next/server';
import { audienceCaptureService } from '@/lib/server/audience/audienceCaptureService';

export async function POST(req: NextRequest) {
  try {
    const outcome = await audienceCaptureService.subscribe(await req.json());
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to subscribe. Please try again.' },
      { status: 500 }
    );
  }
}
