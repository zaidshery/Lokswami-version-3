import 'server-only';

import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { WorkflowActorRef, WorkflowStatus } from '@/lib/workflow/types';
import { resolveStoryWorkflow } from '@/lib/workflow/story';
import {
  listContentActivity,
  recordContentActivity,
  type ContentActivityActor,
  type ContentActivityItem,
} from '@/lib/server/contentActivity';

type StoryActivitySource = {
  _id?: unknown;
  isPublished?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
  workflow?: unknown;
};

type BuildStoryActivityMessageInput = {
  action: string;
  toStatus?: WorkflowStatus | null;
  assignedTo?: WorkflowActorRef | null;
  rejectionReason?: string | null;
};

function parseDate(value: unknown) {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toSerializableActor(actor: WorkflowActorRef | null | undefined): ContentActivityActor | null {
  if (!actor?.id && !actor?.name && !actor?.email) {
    return null;
  }

  return {
    id: actor?.id || '',
    name: actor?.name || '',
    email: actor?.email || '',
    role: actor?.role || null,
  };
}

function createDerivedActivity(
  input: Omit<ContentActivityItem, 'source'>
): ContentActivityItem {
  return {
    ...input,
    source: 'derived',
  };
}

export function buildStoryActivityMessage(input: BuildStoryActivityMessageInput) {
  switch (input.action) {
    case 'created':
      if (input.toStatus === 'submitted') return 'Story created and submitted for review.';
      if (input.toStatus === 'published') return 'Story created and published.';
      return 'Story draft created.';
    case 'saved':
      return 'Story updated.';
    case 'submit':
      return 'Story submitted for review.';
    case 'assign':
      return input.assignedTo?.name
        ? `Story assigned to ${input.assignedTo.name}.`
        : 'Story assigned to the desk.';
    case 'start_review':
      return 'Story review started.';
    case 'move_to_copy_edit':
      return 'Story moved to copy edit.';
    case 'request_changes':
      return input.rejectionReason?.trim()
        ? `Changes requested: ${input.rejectionReason.trim()}`
        : 'Story returned for reporting or desk changes.';
    case 'mark_ready_for_approval':
      return 'Story marked ready for admin approval.';
    case 'approve':
      return 'Story approved for publish.';
    case 'reject':
      return input.rejectionReason?.trim()
        ? `Story rejected: ${input.rejectionReason.trim()}`
        : 'Story rejected and returned for changes.';
    case 'schedule':
      return 'Story scheduled for publish.';
    case 'publish':
      return 'Story published.';
    case 'fast_publish':
      return 'Story urgently published with an audited desk exception.';
    case 'archive':
      return 'Story archived.';
    case 'restore_revision':
      return 'Revision restored.';
    default:
      return 'Story activity recorded.';
  }
}

export async function recordStoryActivity(input: {
  storyId: string;
  actor?: Pick<AdminSessionIdentity, 'id' | 'name' | 'email' | 'role'> | null;
  action: string;
  fromStatus?: WorkflowStatus | null;
  toStatus?: WorkflowStatus | null;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await recordContentActivity({
    contentType: 'story',
    contentId: input.storyId,
    action: input.action,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actor: input.actor,
    message: input.message,
    metadata: input.metadata,
  });
}

export function deriveStoryActivity(story: StoryActivitySource | null | undefined, limit = 30) {
  if (!story) {
    return [] as ContentActivityItem[];
  }

  const storyId = String(story._id || '').trim();
  const workflow = resolveStoryWorkflow(story);
  const timeline: ContentActivityItem[] = [];
  const seen = new Set<string>();

  const pushIfValid = (entry: Omit<ContentActivityItem, 'source'>) => {
    const createdAt = parseDate(entry.createdAt)?.toISOString();
    if (!createdAt) return;

    const dedupeKey = `${entry.action}:${createdAt}:${entry.message}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    timeline.push(
      createDerivedActivity({
        ...entry,
        createdAt,
      })
    );
  };

  workflow.comments.forEach((comment, index) => {
    pushIfValid({
      id: comment.id || `derived-comment-${comment.createdAt.toISOString()}-${index}`,
      contentType: 'story',
      contentId: storyId,
      parentId: '',
      action: comment.kind,
      fromStatus: null,
      toStatus: workflow.status,
      actor: toSerializableActor(comment.author),
      message: comment.body,
      metadata: {
        kind: comment.kind,
      },
      createdAt: comment.createdAt.toISOString(),
    });
  });

  if (workflow.submittedAt) {
    pushIfValid({
      id: `derived-submit-${workflow.submittedAt.toISOString()}`,
      contentType: 'story',
      contentId: storyId,
      parentId: '',
      action: 'submit',
      fromStatus: 'draft',
      toStatus: 'submitted',
      actor: toSerializableActor(workflow.createdBy),
      message: buildStoryActivityMessage({ action: 'submit', toStatus: 'submitted' }),
      metadata: {},
      createdAt: workflow.submittedAt.toISOString(),
    });
  }

  if (workflow.approvedAt) {
    pushIfValid({
      id: `derived-approve-${workflow.approvedAt.toISOString()}`,
      contentType: 'story',
      contentId: storyId,
      parentId: '',
      action: 'approve',
      fromStatus: 'ready_for_approval',
      toStatus: 'approved',
      actor: toSerializableActor(workflow.reviewedBy),
      message: buildStoryActivityMessage({ action: 'approve', toStatus: 'approved' }),
      metadata: {},
      createdAt: workflow.approvedAt.toISOString(),
    });
  }

  if (workflow.rejectedAt) {
    pushIfValid({
      id: `derived-reject-${workflow.rejectedAt.toISOString()}`,
      contentType: 'story',
      contentId: storyId,
      parentId: '',
      action: 'reject',
      fromStatus: null,
      toStatus: 'rejected',
      actor: toSerializableActor(workflow.reviewedBy),
      message: buildStoryActivityMessage({
        action: 'reject',
        toStatus: 'rejected',
        rejectionReason: workflow.rejectionReason,
      }),
      metadata: {
        rejectionReason: workflow.rejectionReason,
      },
      createdAt: workflow.rejectedAt.toISOString(),
    });
  }

  if (workflow.publishedAt) {
    pushIfValid({
      id: `derived-publish-${workflow.publishedAt.toISOString()}`,
      contentType: 'story',
      contentId: storyId,
      parentId: '',
      action: 'publish',
      fromStatus: workflow.scheduledFor ? 'scheduled' : 'approved',
      toStatus: 'published',
      actor: null,
      message: buildStoryActivityMessage({ action: 'publish', toStatus: 'published' }),
      metadata: {},
      createdAt: workflow.publishedAt.toISOString(),
    });
  }

  const updatedAt = parseDate(story.updatedAt);
  if (timeline.length === 0 && updatedAt) {
    pushIfValid({
      id: `derived-update-${updatedAt.toISOString()}`,
      contentType: 'story',
      contentId: storyId,
      parentId: '',
      action: 'saved',
      fromStatus: null,
      toStatus: workflow.status,
      actor: null,
      message: 'Story updated.',
      metadata: {},
      createdAt: updatedAt.toISOString(),
    });
  }

  return timeline
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, Math.max(limit, 1));
}

export async function listStoryActivity(input: {
  storyId: string;
  story?: StoryActivitySource | null;
  limit?: number;
}) {
  const recorded = await listContentActivity({
    contentType: 'story',
    contentId: input.storyId,
    limit: input.limit,
  });

  if (recorded.length > 0) {
    return recorded;
  }

  return deriveStoryActivity(input.story, input.limit);
}
