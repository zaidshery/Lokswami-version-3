import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { epaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';

export async function POST(req: NextRequest) {
  const actor = await getAdminSession();
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await epaperUploadService.importRemote(actor, await req.json().catch(() => ({})));
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof EpaperDomainError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    const message = error instanceof Error && error.message.trim() ? error.message : 'Failed to import e-paper';
    const status = /already exists/i.test(message) ? 409 : /required|valid|supported|download|timed out|larger than|could not infer|max/i.test(message) ? 400 : 500;
    console.error('Failed to import e-paper:', error);
    return NextResponse.json({ success: false, error: status === 500 ? 'Failed to import e-paper' : message }, { status });
  }
}
