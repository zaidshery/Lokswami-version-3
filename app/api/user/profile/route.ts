import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readerService } from '@/lib/server/reader/readerService';
import { ReaderDomainError } from '@/lib/server/reader/readerTypes';

const unauthorized = () => NextResponse.json(
  { success: false, error: 'Unauthorized. Please sign in.' },
  { status: 401 }
);

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) return unauthorized();
    return NextResponse.json({ success: true, data: await readerService.getProfile(session.user) });
  } catch (error) {
    console.error('[Profile API GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load profile.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return unauthorized();
    const data = await readerService.updateProfile(session.user.email.toLowerCase(), await req.json());
    return NextResponse.json({ success: true, message: 'Profile updated successfully.', data });
  } catch (error) {
    if (error instanceof ReaderDomainError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[Profile API PATCH] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update profile.' }, { status: 500 });
  }
}
