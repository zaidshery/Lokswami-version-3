import { NextRequest, NextResponse } from 'next/server';
import { getAudienceRequestMetadata } from '@/lib/server/audience/audienceCaptureService';
import {
  contactService,
  ContactServiceError,
} from '@/lib/server/audience/contactService';

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

    const outcome = await contactService.submit(
      body,
      getAudienceRequestMetadata(req.headers)
    );
    return NextResponse.json(outcome.body, {
      status: outcome.status,
      headers: outcome.headers,
    });
  } catch (error) {
    if (error instanceof ContactServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('Contact submission failed:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to send message right now. Please try again.' },
      { status: 500 }
    );
  }
}
