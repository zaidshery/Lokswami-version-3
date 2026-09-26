import { NextResponse } from 'next/server';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAvailable = await isMongoAvailable({
      label: 'public health probe',
      timeoutMs: 1500,
      unavailableTtlMs: 5000,
    });

    if (!isAvailable) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          service: 'lokswami-public-api',
          dependencies: {
            mongo: 'unavailable',
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      status: 'ok',
      service: 'lokswami-public-api',
      dependencies: {
        mongo: 'available',
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        service: 'lokswami-public-api',
        dependencies: {
          mongo: 'unavailable',
        },
      },
      { status: 503 }
    );
  }
}
