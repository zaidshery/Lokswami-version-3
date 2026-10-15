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
    return NextResponse.json({ success: true, data: await readerService.listSavedArticles(identity) });
  } catch (error) {
    if (error instanceof ReaderDomainError) return jsonError(error.message, error.status);
    console.error('Failed to list saved articles:', error);
    return jsonError('Failed to list saved articles', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = toReaderSessionIdentity((await auth())?.user);
    if (!identity) return jsonError('Unauthorized', 401);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid request payload', 400);
    }
    return NextResponse.json({
      success: true,
      data: await readerService.toggleSavedArticle(identity, body.articleId),
    });
  } catch (error) {
    if (error instanceof ReaderDomainError) return jsonError(error.message, error.status);
    console.error('Failed to toggle saved article:', error);
    return jsonError('Failed to toggle saved article', 500);
  }
}
