import { NextResponse } from 'next/server';
import {
  getMongoAvailabilitySnapshot,
  isMongoAvailable,
} from '@/lib/db/mongoAvailability';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbConnected = await isMongoAvailable({
      label: 'health check',
      timeoutMs: 1500,
      unavailableTtlMs: 5000,
    });

    if (dbConnected) {
      return NextResponse.json({
        status: 'ok',
        db: 'connected',
      });
    }

    return NextResponse.json(
      {
        status: 'error',
        db: 'unavailable',
      },
      { status: 503 }
    );
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        db: 'unavailable',
      },
      { status: 503 }
    );
  }
}
