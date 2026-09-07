import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import { processQueuedEpaperOcrJobs } from '@/lib/server/epaperOcrJobs';
import {
  cleanupAbandonedEpaperUploads,
  processQueuedEpaperJobs,
} from '@/lib/server/epaperProcessingJobs';

function hasCronSecret(request: NextRequest) {
  const expected =
    process.env.ADMIN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const provided = request.headers.get('x-cron-secret')?.trim() || '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function POST(request: NextRequest) {
  const configuredSecret =
    process.env.ADMIN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return NextResponse.json(
      { success: false, error: 'Cron secret is not configured.' },
      { status: 503 }
    );
  }
  if (!hasCronSecret(request)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDB();
  const [processing, cleanup] = await Promise.all([
    processQueuedEpaperJobs({ limit: 1 }),
    cleanupAbandonedEpaperUploads(),
  ]);
  const ocr = await processQueuedEpaperOcrJobs();
  return NextResponse.json({ success: true, data: { processing, cleanup, ocr } });
}
