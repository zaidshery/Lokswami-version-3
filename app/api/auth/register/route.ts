import { NextRequest, NextResponse } from 'next/server';
import { readerIdentityService } from '@/lib/server/reader/readerIdentityService';
import { ReaderDomainError } from '@/lib/server/reader/readerTypes';

export async function POST(req: NextRequest) {
  try {
    const user = await readerIdentityService.register(await req.json());
    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof ReaderDomainError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[Register API] Error creating user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error while creating your account.' },
      { status: 500 }
    );
  }
}
