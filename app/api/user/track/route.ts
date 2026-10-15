import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readerService } from '@/lib/server/reader/readerService';
import { ReaderDomainError, toReaderSessionIdentity } from '@/lib/server/reader/readerTypes';

const jsonError = (error: string, status: number) =>
  NextResponse.json({ success: false, error }, { status });

export async function GET() {
  try {
    const identity = toReaderSessionIdentity((await auth())?.user);
    if (!identity) return jsonError('Unauthorized', 401);
    return NextResponse.json({ success: true, data: await readerService.getReadingStats(identity) });
  } catch (error) {
    if (error instanceof ReaderDomainError) return jsonError(error.message, error.status);
    console.error('Failed to load user reading stats:', error);
    return jsonError('Failed to load user reading stats', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = toReaderSessionIdentity((await auth())?.user);
    if (!identity) return NextResponse.json({ success: true, skipped: true, reason: 'guest' });
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid request payload', 400);
    }
    const data = await readerService.trackRead(identity, body.articleId, body.completionPercent);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof ReaderDomainError) return jsonError(error.message, error.status);
    console.error('Failed to track user read event:', error);
    return jsonError('Failed to track user read event', 500);
  }
}
