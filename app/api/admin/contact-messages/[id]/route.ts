import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageContactInbox } from '@/lib/auth/permissions';
import {
  contactService,
  ContactServiceError,
} from '@/lib/server/audience/contactService';

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function resolveId(req: NextRequest) {
  return clean(req.nextUrl.pathname.split('/').pop(), 80);
}

function serviceError(error: unknown, fallback: string) {
  if (error instanceof ContactServiceError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  console.error(fallback, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

async function authorize() {
  const user = await getAdminSession();
  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
      user: null,
    };
  }
  if (!canManageContactInbox(user.role)) {
    return {
      response: NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { response: null, user };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    const data = await contactService.getInboxMessage(resolveId(req));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serviceError(error, 'Failed to fetch contact message');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const data = await contactService.updateInboxMessage(
      resolveId(req),
      body,
      clean((auth.user.username || auth.user.email) as string, 120) || 'Admin'
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serviceError(error, 'Failed to update contact workflow');
  }
}
