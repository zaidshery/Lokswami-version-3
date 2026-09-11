import { NextRequest, NextResponse } from 'next/server';
import { audienceCaptureService } from '@/lib/server/audience/audienceCaptureService';

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

    const outcome = await audienceCaptureService.captureMarketingLead(body);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('Marketing lead submission failed:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to save preference right now' },
      { status: 500 }
    );
  }
}
