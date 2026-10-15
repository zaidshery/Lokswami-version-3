import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canManageWorkflowAssignments } from '@/lib/auth/permissions';
import { ADMIN_ROLE_QUERY_VALUES, normalizeAdminRole } from '@/lib/auth/roles';
import { getAllWorkflowDeskItems, type DeskItem } from '@/lib/admin/articleWorkflowOverview';

type Candidate = { _id?: unknown; name?: string; email?: string; role?: string; isActive?: boolean };

const TERMINAL = new Set(['published', 'archived']);
const CONTENT_TYPES = new Set<DeskItem['contentType']>(['article', 'story', 'video', 'epaper']);

export async function GET(request: NextRequest) {
  const admin = await getAdminSessionFromReq(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageWorkflowAssignments(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const requested = new Set<DeskItem['contentType']>(
      String(request.nextUrl.searchParams.get('contentTypes') || 'article')
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is DeskItem['contentType'] => CONTENT_TYPES.has(value as DeskItem['contentType']))
    );
    if (!requested.size) {
      return NextResponse.json({ success: false, error: 'Choose a supported content type.' }, { status: 400 });
    }
    await connectDB();
    const [members, items] = await Promise.all([
      User.find({ role: { $in: ADMIN_ROLE_QUERY_VALUES }, isActive: { $ne: false } })
        .select('_id name email role isActive')
        .lean() as Promise<Candidate[]>,
      getAllWorkflowDeskItems(),
    ]);

    const workload = new Map<string, number>();
    const overdue = new Map<string, number>();
    const now = Date.now();
    for (const item of items) {
      if (TERMINAL.has(item.status)) continue;
      const keys = [item.assignedToId, item.assignedToEmail.toLowerCase()].filter(Boolean);
      const isOverdue = Boolean(
        item.dueAt && !Number.isNaN(Date.parse(item.dueAt)) && Date.parse(item.dueAt) < now
      );
      for (const key of keys) {
        workload.set(key, (workload.get(key) || 0) + 1);
        if (isOverdue) overdue.set(key, (overdue.get(key) || 0) + 1);
      }
    }

    const suggestions = members.flatMap((member) => {
      const role = normalizeAdminRole(member.role);
      const id = typeof member._id?.toString === 'function' ? member._id.toString() : '';
      const email = String(member.email || '').trim().toLowerCase();
      if (!role || !id || !email || member.isActive === false) return [];
      const activeWorkload = Math.max(workload.get(id) || 0, workload.get(email) || 0);
      const overdueWorkload = Math.max(overdue.get(id) || 0, overdue.get(email) || 0);
      return [{
        id,
        name: String(member.name || email).trim(),
        role,
        isActive: true,
        activeWorkload,
        overdueWorkload,
      }];
    }).sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Assignee suggestions GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to load assignee suggestions' }, { status: 500 });
  }
}
