import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { dispatchWorkQueueCommand, type WorkQueueCommandInput } from '@/lib/server/workQueueCommands';

async function POSTHandler(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!canViewPage(admin.role, 'work_queue')) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as WorkQueueCommandInput | null;
  if (!body || !['article', 'story', 'video', 'epaper'].includes(body.contentType) || !body.action) {
    return NextResponse.json({ success: false, error: 'Invalid work queue action.' }, { status: 400 });
  }
  return dispatchWorkQueueCommand(request, body);
}

export const POST = withAdminMutation(POSTHandler);
