import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import {
  listWorkflowNotifications,
  markWorkflowNotificationsRead,
} from '@/lib/storage/workflowNotifications';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === '1';
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 30)));
  const [items, unreadItems] = await Promise.all([
    listWorkflowNotifications({
      recipientId: admin.id,
      recipientEmail: admin.email,
      unreadOnly,
      limit,
    }),
    listWorkflowNotifications({
      recipientId: admin.id,
      recipientEmail: admin.email,
      unreadOnly: true,
      limit: 100,
    }),
  ]);

  return NextResponse.json({ success: true, data: { items, unreadCount: unreadItems.length } });
}

async function PATCHHandler(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
  const all = body.all === true;
  if (!all && !ids.length) {
    return NextResponse.json({ success: false, error: 'Choose notifications to mark as read.' }, { status: 400 });
  }

  const updated = await markWorkflowNotificationsRead({
    recipientId: admin.id,
    recipientEmail: admin.email,
    ids,
    all,
  });
  return NextResponse.json({ success: true, data: { updated } });
}

export const PATCH = withAdminMutation(PATCHHandler);
