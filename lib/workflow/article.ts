import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { ContentTransitionAction } from '@/lib/auth/permissions';
import {
  canTransitionWorkflow,
  getWorkflowTransitionRequirements,
} from '@/lib/workflow/transitions';
import {
  createWorkflowMeta,
  isWorkflowPriority,
  isWorkflowStatus,
  type WorkflowActorRef,
  type WorkflowComment,
  type WorkflowCommentKind,
  type WorkflowMeta,
  type WorkflowPriority,
  type WorkflowStatus,
} from '@/lib/workflow/types';

type WorkflowActionParams = {
  action: ContentTransitionAction;
  actor: Pick<AdminSessionIdentity, 'id' | 'name' | 'email' | 'role'>;
  currentWorkflow: WorkflowMeta;
  assignedTo?: WorkflowActorRef | null;
  scheduledFor?: Date | null;
  dueAt?: Date | null;
  priority?: WorkflowPriority;
  comment?: string;
  rejectionReason?: string;
};

const WORKFLOW_ACTION_TARGET_STATUS: Record<ContentTransitionAction, WorkflowStatus> = {
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

function toCommentKind(action: ContentTransitionAction, hasComment: boolean): WorkflowCommentKind {
  if (action === 'reject') return 'rejection_note';
  if (action === 'request_changes') return 'revision_request';
  if (action === 'approve') return 'approval_note';
  if (action === 'fast_publish') return 'approval_note';
  if (action === 'submit' && hasComment) return 'comment';
  return 'comment';
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeActorRef(value: unknown): WorkflowActorRef | null {
  const source = typeof value === 'object' && value ? (value as Record<string, unknown>) : null;
  const id = typeof source?.id === 'string' ? source.id.trim() : '';
  const name = typeof source?.name === 'string' ? source.name.trim() : '';
  const email = typeof source?.email === 'string' ? source.email.trim() : '';
  const role = source?.role;

  if (!id || !name || !email || typeof role !== 'string') {
    return null;
  }

  return {
    id,
    name,
    email,
    role: role as WorkflowActorRef['role'],
  };
}

export function toWorkflowActorRef(
  actor: Pick<AdminSessionIdentity, 'id' | 'name' | 'email' | 'role'>
): WorkflowActorRef {
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
  };
}

export function resolveArticleWorkflow(source: {
  workflow?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
  createdBy?: WorkflowActorRef | null;
}): WorkflowMeta {
  const workflow =
    typeof source.workflow === 'object' && source.workflow
      ? (source.workflow as Record<string, unknown>)
      : null;
  const fallbackStatus =
    source.publishedAt || source.updatedAt ? 'published' : 'draft';

  return createWorkflowMeta({
    ...workflow,
    status: isWorkflowStatus(workflow?.status) ? workflow.status : fallbackStatus,
    priority: isWorkflowPriority(workflow?.priority) ? workflow.priority : 'normal',
    createdBy: normalizeActorRef(workflow?.createdBy) ?? source.createdBy ?? null,
    assignedTo: normalizeActorRef(workflow?.assignedTo),
    reviewedBy: normalizeActorRef(workflow?.reviewedBy),
    submittedAt: parseOptionalDate(workflow?.submittedAt),
    approvedAt: parseOptionalDate(workflow?.approvedAt),
    rejectedAt: parseOptionalDate(workflow?.rejectedAt),
    publishedAt: parseOptionalDate(workflow?.publishedAt),
    scheduledFor: parseOptionalDate(workflow?.scheduledFor),
    dueAt: parseOptionalDate(workflow?.dueAt),
    rejectionReason:
      typeof workflow?.rejectionReason === 'string' ? workflow.rejectionReason : '',
    comments: Array.isArray(workflow?.comments)
      ? workflow.comments.map((comment) => ({
          id: String(comment.id || '').trim() || cryptoRandomId(),
          body: String(comment.body || '').trim(),
          kind:
            comment.kind === 'revision_request' ||
            comment.kind === 'approval_note' ||
            comment.kind === 'rejection_note'
              ? comment.kind
              : 'comment',
          author: comment.author
            ? {
                id: String(comment.author.id || '').trim(),
                name: String(comment.author.name || '').trim(),
                email: String(comment.author.email || '').trim(),
                role: comment.author.role,
              }
            : {
                id: '',
                name: '',
                email: '',
                role: 'admin',
              },
          createdAt: parseOptionalDate(comment.createdAt) ?? new Date(),
        }))
      : [],
  });
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWorkflowComment(
  action: ContentTransitionAction,
  actor: WorkflowActorRef,
  body: string
): WorkflowComment | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  return {
    id: cryptoRandomId(),
    body: trimmed,
    kind: toCommentKind(action, Boolean(trimmed)),
    author: actor,
    createdAt: new Date(),
  };
}

export function getTargetWorkflowStatus(action: ContentTransitionAction): WorkflowStatus {
  return WORKFLOW_ACTION_TARGET_STATUS[action];
}

export function applyArticleWorkflowAction(params: WorkflowActionParams) {
  const actorRef = toWorkflowActorRef(params.actor);
  const fromStatus = params.currentWorkflow.status;
  const toStatus = getTargetWorkflowStatus(params.action);
  const nextComment = createWorkflowComment(params.action, actorRef, params.comment || '');

  if (params.action !== 'fast_publish' && !canTransitionWorkflow(fromStatus, toStatus)) {
    throw new Error(`Cannot move article from ${fromStatus} to ${toStatus}.`);
  }

  const requirements = params.action === 'fast_publish' ? [] : getWorkflowTransitionRequirements(fromStatus, toStatus);
  if (params.action === 'fast_publish' && !params.comment?.trim()) {
    throw new Error('A reason is required for urgent publishing.');
  }
  if (requirements.includes('assignedTo') && !params.assignedTo) {
    throw new Error('assignedTo is required for this transition.');
  }
  if (requirements.includes('scheduledFor') && !params.scheduledFor) {
    throw new Error('scheduledFor must be a valid future date.');
  }
  if (
    requirements.includes('scheduledFor') &&
    params.scheduledFor &&
    params.scheduledFor.getTime() <= Date.now()
  ) {
    throw new Error('scheduledFor must be a valid future date.');
  }
  if (requirements.includes('rejectionReason') && !params.rejectionReason?.trim()) {
    throw new Error('rejectionReason is required for this transition.');
  }

  const nextWorkflow = createWorkflowMeta({
    ...params.currentWorkflow,
    status: toStatus,
    priority: params.priority ?? params.currentWorkflow.priority,
    createdBy: params.currentWorkflow.createdBy ?? actorRef,
    assignedTo:
      params.action === 'assign'
        ? params.assignedTo ?? params.currentWorkflow.assignedTo
        : params.action === 'start_review'
          ? params.currentWorkflow.assignedTo ?? actorRef
        : params.action === 'archive'
          ? params.currentWorkflow.assignedTo
          : params.currentWorkflow.assignedTo,
    reviewedBy:
      params.action === 'start_review' ||
      params.action === 'move_to_copy_edit' ||
      params.action === 'request_changes' ||
      params.action === 'mark_ready_for_approval' ||
      params.action === 'approve' ||
      params.action === 'reject'
      || params.action === 'fast_publish'
        ? actorRef
        : params.currentWorkflow.reviewedBy,
    submittedAt:
      params.action === 'submit' ? new Date() : params.currentWorkflow.submittedAt,
    approvedAt:
      params.action === 'approve' || params.action === 'fast_publish' ? new Date() : params.currentWorkflow.approvedAt,
    rejectedAt:
      params.action === 'reject' ? new Date() : params.currentWorkflow.rejectedAt,
    publishedAt:
      params.action === 'publish' || params.action === 'fast_publish' ? new Date() : params.currentWorkflow.publishedAt,
    scheduledFor:
      params.action === 'schedule'
        ? params.scheduledFor ?? null
        : params.action === 'publish' || params.action === 'fast_publish'
          ? null
          : params.currentWorkflow.scheduledFor,
    dueAt: params.dueAt ?? params.currentWorkflow.dueAt,
    rejectionReason:
      params.action === 'reject' || params.action === 'request_changes'
        ? params.rejectionReason?.trim() || ''
        : params.action === 'approve' ||
            params.action === 'publish' ||
            params.action === 'fast_publish' ||
            params.action === 'submit' ||
            params.action === 'mark_ready_for_approval'
          ? ''
          : params.currentWorkflow.rejectionReason,
    comments: [
      ...params.currentWorkflow.comments,
      ...(nextComment ? [nextComment as WorkflowComment] : []),
    ],
  });

  return {
    fromStatus,
    toStatus,
    nextWorkflow,
  };
}
