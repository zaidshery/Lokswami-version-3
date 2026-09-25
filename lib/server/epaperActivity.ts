import 'server-only';

import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { EPaperProductionStatus, WorkflowActorRef, WorkflowComment } from '@/lib/workflow/types';
import { resolveEpaperProduction } from '@/lib/workflow/epaper';
import {
  listContentActivity,
  recordContentActivity,
  type ContentActivityActor,
  type ContentActivityItem,
} from '@/lib/server/contentActivity';

type EPaperActivitySource = {
  _id?: unknown;
  status?: unknown;
  productionStatus?: unknown;
  productionAssignee?: unknown;
  productionNotes?: unknown;
  qaCompletedAt?: unknown;
  updatedAt?: unknown;
};

type ActivityMessageInput = {
  action: string;
  toStatus?: EPaperProductionStatus | null;
  assignedTo?: WorkflowActorRef | null;
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

export function buildEpaperActivityMessage(input: ActivityMessageInput) {
  switch (input.action) {
    case 'metadata_update':
      return 'E-paper metadata updated.';
    case 'assign':
      return input.assignedTo?.name
        ? `Edition assigned to ${input.assignedTo.name}.`
        : 'Edition assignment updated.';
    case 'note':
      return 'Production note added.';
    case 'draft_upload':
      return 'Edition returned to draft upload stage.';
    case 'pages_ready':
      return 'Page images are ready for OCR review.';
    case 'ocr_review':
      return 'Edition moved into OCR review.';
    case 'hotspot_mapping':
      return 'Edition moved into hotspot mapping.';
    case 'ready_to_publish':
      return 'Edition marked ready to publish.';
    case 'published':
      return 'Edition published.';
    case 'archived':
      return 'Edition archived.';
    case 'page_image_uploaded':
      return 'Page image uploaded.';
    case 'page_images_generated':
      return 'Page images generated from PDF.';
    case 'pdf_processing_queued':
      return 'PDF page conversion queued.';
    case 'pdf_processing_completed':
      return 'PDF page conversion completed.';
    case 'pdf_processing_failed':
      return 'PDF page conversion needs attention.';
    case 'cover_thumbnail_updated':
      return 'Cover preview updated from page 1.';
    case 'ocr_auto_detected':
      return 'OCR detected story boxes for edition pages.';
    case 'story_audio_generated':
      return 'Story listen audio generated automatically.';
    case 'story_created':
      return 'A mapped e-paper story was created.';
    case 'page_review_updated':
      return 'Page review updated.';
    case 'request_changes':
      return 'QA requested editorial changes.';
    case 'qa_invalidated':
      return 'Edition returned to QA after content changed.';
    case 'revision_created':
      return 'A draft replacement revision was created.';
    case 'ocr_suggestion_accepted':
      return 'An OCR suggestion was accepted as a story.';
    case 'ocr_suggestion_rejected':
      return 'An OCR suggestion was rejected.';
    case 'edition_deleted':
      return 'Edition deleted and unreferenced assets cleaned up.';
    case 'ocr_queued':
      return 'OCR extraction queued for edition pages.';
    case 'cleanup_failed':
      return 'Asset cleanup encountered errors during deletion.';
    default:
      return 'E-paper activity recorded.';
  }
}

export async function recordEpaperActivity(input: {
  epaperId: string;
  actor?: Pick<AdminSessionIdentity, 'id' | 'name' | 'email' | 'role'> | null;
  action: string;
  fromStatus?: EPaperProductionStatus | null;
  toStatus?: EPaperProductionStatus | null;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await recordContentActivity({
    contentType: 'epaper',
    contentId: input.epaperId,
    action: input.action,
    fromStatus: input.fromStatus as never,
    toStatus: input.toStatus as never,
    actor: input.actor,
    message: input.message,
    metadata: input.metadata,
  });
}

function noteToDerivedActivity(epaperId: string, comment: WorkflowComment, index: number, status: EPaperProductionStatus) {
  return createDerivedActivity({
    id: comment.id || `epaper-note-${index}`,
    contentType: 'epaper',
    contentId: epaperId,
    parentId: '',
    action: comment.kind,
    fromStatus: null,
    toStatus: status as never,
    actor: toSerializableActor(comment.author),
    message: comment.body,
    metadata: {
      kind: comment.kind,
    },
    createdAt: comment.createdAt.toISOString(),
  });
}

export function deriveEpaperActivity(epaper: EPaperActivitySource | null | undefined, limit = 30) {
  if (!epaper) {
    return [] as ContentActivityItem[];
  }

  const epaperId = String(epaper._id || '').trim();
  const production = resolveEpaperProduction(epaper);
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

  production.productionNotes.forEach((comment, index) => {
    const entry = noteToDerivedActivity(epaperId, comment, index, production.productionStatus);
    pushIfValid(entry);
  });

  if (production.qaCompletedAt) {
    pushIfValid({
      id: `derived-qa-${production.qaCompletedAt.toISOString()}`,
      contentType: 'epaper',
      contentId: epaperId,
      parentId: '',
      action: 'ready_to_publish',
      fromStatus: 'hotspot_mapping' as never,
      toStatus: 'ready_to_publish' as never,
      actor: null,
      message: buildEpaperActivityMessage({ action: 'ready_to_publish', toStatus: 'ready_to_publish' }),
      metadata: {},
      createdAt: production.qaCompletedAt.toISOString(),
    });
  }

  const updatedAt = parseDate(epaper.updatedAt);
  if (timeline.length === 0 && updatedAt) {
    pushIfValid({
      id: `derived-update-${updatedAt.toISOString()}`,
      contentType: 'epaper',
      contentId: epaperId,
      parentId: '',
      action: 'metadata_update',
      fromStatus: null,
      toStatus: production.productionStatus as never,
      actor: null,
      message: buildEpaperActivityMessage({ action: 'metadata_update' }),
      metadata: {},
      createdAt: updatedAt.toISOString(),
    });
  }

  return timeline
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, Math.max(limit, 1));
}

export async function listEpaperActivity(input: {
  epaperId: string;
  epaper?: EPaperActivitySource | null;
  limit?: number;
}) {
  const recorded = await listContentActivity({
    contentType: 'epaper',
    contentId: input.epaperId,
    limit: input.limit,
  });

  if (recorded.length > 0) {
    return recorded;
  }

  return deriveEpaperActivity(input.epaper, input.limit);
}
