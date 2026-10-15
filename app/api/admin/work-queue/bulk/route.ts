import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageWorkflowAssignments, canViewPage } from '@/lib/auth/permissions';
import { dispatchWorkQueueCommand } from '@/lib/server/workQueueCommands';
import type { WorkflowContentKey } from '@/lib/admin/articleWorkflowOverview';
import { isWorkflowPriority } from '@/lib/workflow/types';

type BulkItem = { contentType?: unknown; id?: unknown; expectedVersion?: unknown };

async function PATCHHandler(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!canViewPage(admin.role, 'work_queue') || !canManageWorkflowAssignments(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    items?: BulkItem[];
    assignedToId?: unknown;
    priority?: unknown;
    dueAt?: unknown;
  };
  const submittedItems = Array.isArray(body.items) ? body.items : [];
  if (submittedItems.length > 25) {
    return NextResponse.json(
      { success: false, error: 'Bulk triage is limited to 25 selected items.' },
      { status: 400 }
    );
  }
  const items = Array.from(
    new Map(
      submittedItems.map((item) => [
        `${String(item.contentType || '')}:${String(item.id || '').trim()}`,
        item,
      ])
    ).values()
  );
  const assignedToId = String(body.assignedToId || '').trim();
  if (!items.length || !assignedToId) {
    return NextResponse.json({ success: false, error: 'Choose work items and an assignee.' }, { status: 400 });
  }

  const results = [] as Array<{ contentType: string; id: string; success: boolean; status: number; error?: string }>;
  for (const item of items) {
    const contentType = String(item.contentType || '') as WorkflowContentKey;
    const id = String(item.id || '').trim();
    if (!['article', 'story', 'video', 'epaper'].includes(contentType) || !id) {
      results.push({ contentType, id, success: false, status: 400, error: 'Invalid work item.' });
      continue;
    }
    const response = await dispatchWorkQueueCommand(request, {
      contentType,
      id,
      action: 'assign',
      expectedVersion: typeof item.expectedVersion === 'number' ? item.expectedVersion : undefined,
      assignedToId,
      priority: isWorkflowPriority(body.priority) ? body.priority : undefined,
      dueAt: typeof body.dueAt === 'string' ? body.dueAt : undefined,
    });
    const payload = (await response.clone().json().catch(() => ({}))) as { success?: boolean; error?: string };
    results.push({ contentType, id, success: response.ok && payload.success !== false, status: response.status, error: response.ok ? undefined : payload.error || 'Update failed.' });
  }

  const succeeded = results.filter((result) => result.success).length;
  return NextResponse.json({
    success: succeeded === results.length,
    partial: succeeded > 0 && succeeded < results.length,
    data: { succeeded, failed: results.length - succeeded, results },
  }, { status: succeeded ? 200 : 400 });
}

export const PATCH = withAdminMutation(PATCHHandler);
