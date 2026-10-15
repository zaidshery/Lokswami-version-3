import { NextResponse } from 'next/server';
import {
  analyticsService,
  AnalyticsValidationError,
} from '@/lib/server/analytics/analyticsService';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const result = await analyticsService.trackWebVital(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnalyticsValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error('Web vitals ingestion error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error processing web vital' },
      { status: 500 }
    );
  }
}
