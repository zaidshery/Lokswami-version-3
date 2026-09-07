import { Types } from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canEditEpaper } from '@/lib/auth/permissions';
import { queueEpaperOcr } from '@/lib/server/epaperOcrJobs';

type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: RouteContext) {
  const admin = await getAdminSessionFromReq(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canEditEpaper(admin.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid publication ID' }, { status: 400 });
  await connectDB();
  const pageNumber = Math.floor(Number(request.nextUrl.searchParams.get('pageNumber') || 0));
  const status = request.nextUrl.searchParams.get('status')?.trim();
  const query: Record<string, unknown> = { epaperId: id };
  if (pageNumber > 0) query.pageNumber = pageNumber;
  if (status) query.status = status;
  return NextResponse.json({ success: true, data: await EPaperOcrSuggestion.find(query).sort({ pageNumber: 1, createdAt: -1 }).lean() });
}
export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await getAdminSessionFromReq(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canEditEpaper(admin.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid publication ID' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const pages = Array.isArray(body.pageNumbers) ? body.pageNumbers.map(Number).filter((page: number) => Number.isInteger(page) && page > 0 && page <= 1000) : [];
  try {
    await connectDB();
    const jobIds = await queueEpaperOcr(id, pages, true);
    const paused = process.env.EPAPER_LOCAL_OCR_ENABLED !== '1';
    return NextResponse.json({ success: true, message: paused ? 'OCR queued. The local worker is paused pending hosting validation.' : 'OCR queued. Suggestions will appear here when processing finishes.', data: { jobIds, queued: jobIds.length, paused } }, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Could not queue OCR. Please retry.' }, { status: 503 });
  }
}
