import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageContactInbox } from '@/lib/auth/permissions';
import { contactService } from '@/lib/server/audience/contactService';

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSession();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageContactInbox(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const result = await contactService.listInbox(req.nextUrl);
    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      counts: result.counts,
    });
  } catch (error) {
    console.error('Failed to list contact messages:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load contact inbox' },
      { status: 500 }
    );
  }
}
