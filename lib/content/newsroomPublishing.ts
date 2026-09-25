import type { AdminRole } from '@/lib/auth/roles';
import type { WorkflowActorRef, WorkflowStatus } from '@/lib/workflow/types';

export const ARTICLE_SOURCE_TYPES = ['story', 'direct'] as const;
export type ArticleSourceType = (typeof ARTICLE_SOURCE_TYPES)[number];

export const LINKED_ARTICLE_STATUSES = [
  'not_created',
  'draft',
  'submitted',
  'published',
] as const;
export type LinkedArticleStatus = (typeof LINKED_ARTICLE_STATUSES)[number];

export const STORY_VIDEO_PRODUCTION_STATUSES = [
  'not_started',
  'editing',
  'qa_review',
  'ready_to_publish',
  'published',
  'failed',
] as const;
export type StoryVideoProductionStatus =
  (typeof STORY_VIDEO_PRODUCTION_STATUSES)[number];

export type StoryVideoProductionAssignment = WorkflowActorRef | null;

export type StoryVideoTechnicalMetadata = {
  sizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1' | 'unknown';
  container: string;
  codec?: string;
  etag?: string;
};

export type StoryVideoProduction = {
  status: StoryVideoProductionStatus;
  assignedTo: StoryVideoProductionAssignment;
  editorNotes: string;
  masterAssetId?: string;
  masterExportUrl: string;
  thumbnailUrl: string;
  verifiedAt?: string | null;
  technicalMetadata?: StoryVideoTechnicalMetadata | null;
  lastError?: string | null;
  updatedAt: string | null;
};

export const SOCIAL_PLATFORMS = ['youtube', 'facebook', 'instagram'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_POST_STATUSES = [
  'draft',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export const SOCIAL_AUTOMATION_PROVIDERS = [
  'manual',
  'n8n',
  'generic_webhook',
] as const;
export type SocialAutomationProvider = (typeof SOCIAL_AUTOMATION_PROVIDERS)[number];

export type SocialPostRecord = {
  _id: string;
  sourceStoryId: string;
  sourceArticleId: string;
  platform: SocialPlatform;
  status: SocialPostStatus;
  caption: string;
  hashtags: string;
  thumbnailUrl: string;
  videoUrl: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostId: string;
  externalUrl: string;
  lastError: string;
  automationProvider: SocialAutomationProvider;
  automationDispatchedAt: string | null;
  automationExecutionId: string;
  automationExecutionUrl: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
  } | null;
};

export function isArticleSourceType(value: unknown): value is ArticleSourceType {
  return typeof value === 'string' && ARTICLE_SOURCE_TYPES.includes(value as ArticleSourceType);
}

export function normalizeArticleSourceType(value: unknown): ArticleSourceType {
  return isArticleSourceType(value) ? value : 'direct';
}

export function isLinkedArticleStatus(value: unknown): value is LinkedArticleStatus {
  return (
    typeof value === 'string' &&
    LINKED_ARTICLE_STATUSES.includes(value as LinkedArticleStatus)
  );
}

export function normalizeLinkedArticleStatus(value: unknown): LinkedArticleStatus {
  return isLinkedArticleStatus(value) ? value : 'not_created';
}

export function isStoryVideoProductionStatus(
  value: unknown
): value is StoryVideoProductionStatus {
  return (
    typeof value === 'string' &&
    STORY_VIDEO_PRODUCTION_STATUSES.includes(value as StoryVideoProductionStatus)
  );
}

export function normalizeStoryVideoProductionStatus(
  value: unknown
): StoryVideoProductionStatus {
  return isStoryVideoProductionStatus(value) ? value : 'not_started';
}

export function createEmptyStoryVideoProduction(): StoryVideoProduction {
  return {
    status: 'not_started',
    assignedTo: null,
    editorNotes: '',
    masterAssetId: '',
    masterExportUrl: '',
    thumbnailUrl: '',
    verifiedAt: null,
    technicalMetadata: null,
    lastError: null,
    updatedAt: null,
  };
}

function normalizeWorkflowActorRef(value: unknown): WorkflowActorRef | null {
  const source =
    typeof value === 'object' && value ? (value as Record<string, unknown>) : null;
  if (!source) return null;

  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const email = typeof source.email === 'string' ? source.email.trim() : '';
  const role = source.role;

  if (!id || !name || !email || typeof role !== 'string') {
    return null;
  }

  return {
    id,
    name,
    email,
    role: role as AdminRole,
  };
}

export function normalizeStoryVideoProduction(
  value: unknown
): StoryVideoProduction {
  const source =
    typeof value === 'object' && value ? (value as Record<string, unknown>) : {};

  return {
    status: normalizeStoryVideoProductionStatus(source.status),
    assignedTo: normalizeWorkflowActorRef(source.assignedTo),
    editorNotes:
      typeof source.editorNotes === 'string' ? source.editorNotes.trim() : '',
    masterAssetId:
      typeof source.masterAssetId === 'string' ? source.masterAssetId.trim() : '',
    masterExportUrl:
      typeof source.masterExportUrl === 'string'
        ? source.masterExportUrl.trim()
        : '',
    thumbnailUrl:
      typeof source.thumbnailUrl === 'string' ? source.thumbnailUrl.trim() : '',
    verifiedAt:
      typeof source.verifiedAt === 'string' && source.verifiedAt.trim()
        ? source.verifiedAt
        : null,
    technicalMetadata:
      typeof source.technicalMetadata === 'object' && source.technicalMetadata
        ? (source.technicalMetadata as StoryVideoTechnicalMetadata)
        : null,
    lastError:
      typeof source.lastError === 'string' && source.lastError.trim()
        ? source.lastError
        : null,
    updatedAt:
      typeof source.updatedAt === 'string' && source.updatedAt.trim()
        ? source.updatedAt
        : null,
  };
}

export function getLinkedArticleStatusFromWorkflowStatus(
  status: WorkflowStatus | string | null | undefined
): LinkedArticleStatus {
  switch (status) {
    case 'published':
      return 'published';
    case 'draft':
      return 'draft';
    case 'submitted':
    case 'assigned':
    case 'in_review':
    case 'copy_edit':
    case 'changes_requested':
    case 'ready_for_approval':
    case 'approved':
    case 'scheduled':
    case 'rejected':
    case 'archived':
      return 'submitted';
    default:
      return 'draft';
  }
}

export function isStoryReadyForArticleCreation(
  status: WorkflowStatus | string | null | undefined
) {
  return status === 'approved' || status === 'scheduled' || status === 'published';
}

export function isStoryReadyForArticleDrafting(
  status: WorkflowStatus | string | null | undefined
) {
  return (
    status === 'submitted' ||
    status === 'assigned' ||
    status === 'in_review' ||
    status === 'copy_edit' ||
    status === 'ready_for_approval' ||
    isStoryReadyForArticleCreation(status)
  );
}

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && SOCIAL_PLATFORMS.includes(value as SocialPlatform);
}

export function normalizeSocialPlatform(value: unknown): SocialPlatform {
  return isSocialPlatform(value) ? value : 'youtube';
}

export function isSocialPostStatus(value: unknown): value is SocialPostStatus {
  return (
    typeof value === 'string' &&
    SOCIAL_POST_STATUSES.includes(value as SocialPostStatus)
  );
}

export function normalizeSocialPostStatus(value: unknown): SocialPostStatus {
  return isSocialPostStatus(value) ? value : 'draft';
}

export function isSocialAutomationProvider(value: unknown): value is SocialAutomationProvider {
  return (
    typeof value === 'string' &&
    SOCIAL_AUTOMATION_PROVIDERS.includes(value as SocialAutomationProvider)
  );
}

export function normalizeSocialAutomationProvider(
  value: unknown
): SocialAutomationProvider {
  return isSocialAutomationProvider(value) ? value : 'manual';
}
