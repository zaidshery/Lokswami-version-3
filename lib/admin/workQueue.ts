import 'server-only';

import {
  canEditEpaper,
  canTransitionContent,
  canViewPage,
  type ContentTransitionAction,
  type PermissionUser,
} from '@/lib/auth/permissions';
import type { AdminRole } from '@/lib/auth/roles';
import {
  getAllWorkflowDeskItems,
  type DeskItem,
  type WorkflowContentKey,
} from '@/lib/admin/articleWorkflowOverview';
import {
  canTransitionWorkflow,
  getAllowedEpaperProductionTransitions,
} from '@/lib/workflow/transitions';
import {
  isEpaperProductionStatus,
  isWorkflowPriority,
  isWorkflowStatus,
  type ContentActivityStatus,
  type WorkflowPriority,
} from '@/lib/workflow/types';

export const WORK_QUEUE_VIEWS = [
  'mine',
  'unassigned',
  'review',
  'approval',
  'publishing',
  'overdue',
  'all',
] as const;

export type WorkQueueView = (typeof WORK_QUEUE_VIEWS)[number];
export type WorkQueueSort = 'updated_desc' | 'due_asc' | 'priority_desc' | 'title_asc';

export type WorkQueueAction =
  | ContentTransitionAction
  | 'fast_publish'
  | 'open'
  | 'advance_production';

export type WorkQueueItem = DeskItem & {
  isMine: boolean;
  isUnassigned: boolean;
  isOverdue: boolean;
  availableActions: WorkQueueAction[];
  nextAction: WorkQueueAction;
  nextActionLabel: string;
};

export type WorkQueueFilters = {
  view?: WorkQueueView;
  contentType?: WorkflowContentKey | 'all';
  status?: ContentActivityStatus | 'all';
  priority?: WorkflowPriority | 'all';
  assignee?: string;
  search?: string;
  sort?: WorkQueueSort;
  cursor?: string;
  limit?: number;
  mineOnly?: boolean;
};

export type WorkQueueOverview = {
  items: WorkQueueItem[];
  total: number;
  nextCursor: string | null;
  viewCounts: Record<WorkQueueView, number>;
  filters: Required<Pick<WorkQueueFilters, 'view' | 'contentType' | 'status' | 'priority' | 'search' | 'sort'>> & {
    assignee: string;
    cursor: number;
  };
};

const PRIORITY_WEIGHT: Record<WorkflowPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

function actorMatches(user: PermissionUser, ...values: string[]) {
  const identities = new Set([user.id, user.email].map((value) => value.trim().toLowerCase()));
  return values.some((value) => identities.has(value.trim().toLowerCase()));
}

function isTerminal(status: ContentActivityStatus) {
  return status === 'published' || status === 'archived';
}

function canReadQueueItem(user: PermissionUser, item: DeskItem) {
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (item.contentType === 'epaper') return canEditEpaper(user.role);

  const isMine = actorMatches(
    user,
    item.createdById,
    item.createdByEmail,
    item.assignedToId,
    item.assignedToEmail
  );
  if (user.role === 'reporter') {
    return isMine && (item.contentType === 'story' || item.contentType === 'article');
  }
  if (user.role === 'copy_editor') {
    return isMine || item.status === 'submitted';
  }
  return false;
}

function getContentActions(user: PermissionUser, item: DeskItem): WorkQueueAction[] {
  if (!isWorkflowStatus(item.status)) return [];

  const permissionRecord = {
    workflowStatus: item.status,
    createdById: item.createdById || item.createdByEmail,
    assignedToId: item.assignedToId || item.assignedToEmail,
  };
  const candidates: ContentTransitionAction[] = [
    'submit',
    'assign',
    'start_review',
    'move_to_copy_edit',
    'request_changes',
    'mark_ready_for_approval',
    'approve',
    'reject',
    'schedule',
    'publish',
    'archive',
  ];
  const targetByAction: Record<ContentTransitionAction, ContentActivityStatus> = {
    submit: 'submitted',
    assign: 'assigned',
    start_review: 'in_review',
    move_to_copy_edit: 'copy_edit',
    request_changes: 'changes_requested',
    mark_ready_for_approval: 'ready_for_approval',
    approve: 'approved',
    reject: 'rejected',
    schedule: 'scheduled',
    publish: 'published',
    fast_publish: 'published',
    archive: 'archived',
  };

  const actions = candidates.filter((action) => {
    const target = targetByAction[action];
    return (
      isWorkflowStatus(target) &&
      canTransitionWorkflow(item.status as never, target) &&
      canTransitionContent(user, permissionRecord, action)
    );
  }) as WorkQueueAction[];

  if (
    (user.role === 'admin' || user.role === 'super_admin') &&
    !isTerminal(item.status) &&
    (item.priority === 'urgent' || item.isBreaking === true)
  ) {
    actions.push('fast_publish');
  }

  return actions;
}

function getEpaperActions(role: AdminRole, item: DeskItem): WorkQueueAction[] {
  if (!isEpaperProductionStatus(item.status) || !canEditEpaper(role)) return [];
  const transitions = getAllowedEpaperProductionTransitions(item.status);
  if (!transitions.length) return [];
  return ['advance_production'];
}

function actionLabel(action: WorkQueueAction, item: DeskItem) {
  if (action === 'open') return 'Open item';
  if (action === 'advance_production') {
    return item.status === 'ready_to_publish' ? 'Review release' : 'Continue production';
  }
  const labels: Record<Exclude<WorkQueueAction, 'open' | 'advance_production'>, string> = {
    submit: 'Submit for review',
    assign: 'Assign owner',
    start_review: 'Start review',
    move_to_copy_edit: 'Move to copy edit',
    request_changes: 'Request changes',
    mark_ready_for_approval: 'Send for approval',
    approve: 'Approve',
    reject: 'Reject',
    schedule: 'Schedule',
    publish: 'Publish',
    archive: 'Archive',
    fast_publish: 'Urgent publish',
  };
  return labels[action];
}

function toWorkQueueItem(user: PermissionUser, item: DeskItem): WorkQueueItem {
  const isMine = actorMatches(
    user,
    item.createdById,
    item.createdByEmail,
    item.assignedToId,
    item.assignedToEmail
  );
  const isUnassigned = !item.assignedToId && !item.assignedToEmail && !item.assignedToName;
  const isOverdue = Boolean(
    item.dueAt && !isTerminal(item.status) && new Date(item.dueAt).getTime() < Date.now()
  );
  const availableActions =
    item.contentType === 'epaper'
      ? getEpaperActions(user.role, item)
      : getContentActions(user, item);
  const preferred = [
    'request_changes',
    'mark_ready_for_approval',
    'approve',
    'publish',
    'schedule',
    'start_review',
    'move_to_copy_edit',
    'assign',
    'submit',
    'advance_production',
  ].find((action) => availableActions.includes(action as WorkQueueAction));
  const nextAction = (preferred as WorkQueueAction | undefined) || 'open';

  return {
    ...item,
    isMine,
    isUnassigned,
    isOverdue,
    availableActions,
    nextAction,
    nextActionLabel: actionLabel(nextAction, item),
  };
}

function matchesView(item: WorkQueueItem, view: WorkQueueView) {
  switch (view) {
    case 'mine':
      return item.isMine && !isTerminal(item.status);
    case 'unassigned':
      return item.isUnassigned && !isTerminal(item.status);
    case 'review':
      return ['submitted', 'assigned', 'in_review', 'copy_edit', 'changes_requested', 'pages_ready', 'ocr_review', 'hotspot_mapping'].includes(item.status);
    case 'approval':
      return item.status === 'ready_for_approval';
    case 'publishing':
      return ['approved', 'scheduled', 'ready_to_publish'].includes(item.status);
    case 'overdue':
      return item.isOverdue;
    default:
      return true;
  }
}

function normalizeFilters(
  input: WorkQueueFilters
): Required<Pick<WorkQueueFilters, 'view' | 'contentType' | 'status' | 'priority' | 'search' | 'sort'>> & { assignee: string } {
  const view = WORK_QUEUE_VIEWS.includes(input.view as WorkQueueView) ? input.view! : 'mine';
  const contentType: WorkflowContentKey | 'all' = ['article', 'story', 'video', 'epaper'].includes(String(input.contentType))
    ? (input.contentType as WorkflowContentKey)
    : 'all';
  const status: ContentActivityStatus | 'all' =
    isWorkflowStatus(input.status) || isEpaperProductionStatus(input.status)
      ? input.status
      : 'all';
  const priority: WorkflowPriority | 'all' = isWorkflowPriority(input.priority) ? input.priority : 'all';
  const sort: WorkQueueSort = ['due_asc', 'priority_desc', 'title_asc'].includes(String(input.sort))
    ? (input.sort as WorkQueueSort)
    : 'updated_desc';

  return {
    view,
    contentType,
    status,
    priority,
    assignee: String(input.assignee || '').trim().toLowerCase(),
    search: String(input.search || '').trim().toLowerCase(),
    sort,
  };
}

function sortItems(items: WorkQueueItem[], sort: WorkQueueSort) {
  return items.sort((left, right) => {
    if (sort === 'title_asc') return left.title.localeCompare(right.title);
    if (sort === 'priority_desc') {
      return (PRIORITY_WEIGHT[right.priority || 'normal'] - PRIORITY_WEIGHT[left.priority || 'normal']) ||
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }
    if (sort === 'due_asc') {
      const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export async function getWorkQueueOverview(
  user: PermissionUser,
  input: WorkQueueFilters = {}
): Promise<WorkQueueOverview> {
  const filters = normalizeFilters(input);
  const all = (await getAllWorkflowDeskItems())
    .filter((item) => canReadQueueItem(user, item))
    .map((item) => toWorkQueueItem(user, item))
    .filter((item) => !input.mineOnly || item.isMine);

  const viewCounts = Object.fromEntries(
    WORK_QUEUE_VIEWS.map((view) => [view, all.filter((item) => matchesView(item, view)).length])
  ) as Record<WorkQueueView, number>;

  const filtered = sortItems(
    all.filter((item) => {
      if (!matchesView(item, filters.view)) return false;
      if (filters.contentType !== 'all' && item.contentType !== filters.contentType) return false;
      if (filters.status !== 'all') {
        if (filters.status === 'in_review') {
          if (item.status !== 'in_review' && item.status !== 'submitted') return false;
        } else if (item.status !== filters.status) {
          return false;
        }
      }
      if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
      if (
        filters.assignee &&
        ![item.assignedToId, item.assignedToEmail, item.assignedToName]
          .join(' ')
          .toLowerCase()
          .includes(filters.assignee)
      ) return false;
      if (
        filters.search &&
        ![item.title, item.category, item.author, item.assignedToName, item.createdByName]
          .join(' ')
          .toLowerCase()
          .includes(filters.search)
      ) return false;
      return true;
    }),
    filters.sort
  );

  const cursor = Math.max(0, Number.parseInt(String(input.cursor || '0'), 10) || 0);
  const limit = Math.max(10, Math.min(100, Number(input.limit || 30)));
  const items = filtered.slice(cursor, cursor + limit);
  const nextCursor = cursor + items.length < filtered.length ? String(cursor + items.length) : null;

  return {
    items,
    total: filtered.length,
    nextCursor,
    viewCounts,
    filters: { ...filters, cursor },
  };
}

export function canOpenWorkQueue(role: AdminRole | null | undefined) {
  return canViewPage(role, 'my_work') || canViewPage(role, 'review_queue');
}
