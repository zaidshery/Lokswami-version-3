import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await epaperUploadService.initialize(actor, await request.json().catch(() => ({})));
    return NextResponse.json({ success: true, data: result.data }, { status: result.status });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Failed to initialize e-paper upload:', error);
    return NextResponse.json({ success: false, error: 'Failed to initialize e-paper upload.' }, { status: 500 });
  }
}
