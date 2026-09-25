import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import Story from '@/lib/models/Story';
import User from '@/lib/models/User';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { normalizeAdminRole } from '@/lib/auth/roles';
import {
  canDeleteContent,
  canEditContent,
  canReadContent,
  canTransitionContent,
  canViewPage,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
import { getBlockedStoryUpdateFields } from '@/lib/auth/storyEditing';
import {
  createEmptyStoryVideoProduction,
  normalizeLinkedArticleStatus,
  normalizeStoryVideoProduction,
} from '@/lib/content/newsroomPublishing';
import {
  createEmptyReporterMeta,
  normalizeCopyEditorMeta,
  normalizeReporterMeta,
  validateReporterMeta,
  type CopyEditorMeta,
  type ReporterMeta,
} from '@/lib/content/newsroomMetadata';
import {
  derivePrimaryStoryMedia,
  normalizeStoryMediaAssets,
  validateStoryMediaAssets,
  type StoryMediaAsset,
} from '@/lib/content/storyMedia';
import {
  applyStoryWorkflowAction,
  resolveStoryWorkflow,
} from '@/lib/workflow/story';
import { validateFastPublish } from '@/lib/workflow/fastPublish';
import { validateEditorialPublishReadiness } from '@/lib/workflow/readiness';
import {
  isWorkflowPriority,
  type WorkflowStatus,
} from '@/lib/workflow/types';
import {
  buildStoryActivityMessage,
  recordStoryActivity,
} from '@/lib/server/storyActivity';
import { notifyWorkflowEvent } from '@/lib/server/workflowNotificationEvents';
import { getStoryVideoMonthlyUsageSummary } from '@/lib/server/storyVideoUsage';
import {
  assertStoryLeaseNotHeldByOther,
  deleteStoryLock,
  StoryEditLeaseConflictError,
} from '@/lib/server/storyLockService';
import {
  deleteStoredStory,
  getStoredStoryById,
  isStoryVersionConflictError,
  StoryVersionConflictError,
  updateStoredStory,
  type CreateStoryInput,
  type StoredStoryRevision,
} from '@/lib/storage/storiesFile';

export { StoryVersionConflictError, isStoryVersionConflictError, StoryEditLeaseConflictError };

export type StoryStore = 'file' | 'mongo';
export type StoryRecord = Record<string, unknown>;

export const STORY_VIDEO_STORAGE_PROVIDER = 'digitalocean_spaces';
export const STORY_VIDEO_MIN_BYTES = 1;
export const STORY_VIDEO_MAX_BYTES = 1.9 * 1024 * 1024 * 1024;

export const STORY_WORKFLOW_ACTIONS = new Set<ContentTransitionAction>([
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
  'fast_publish',
  'archive',
]);

export class StoryNotFoundError extends Error {
  constructor(message = 'Story not found') {
    super(message);
    this.name = 'StoryNotFoundError';
  }
}

export class StoryExpectedVersionError extends Error {
  constructor(message = 'A valid expectedVersion is required.') {
    super(message);
    this.name = 'StoryExpectedVersionError';
  }
}

export class StoryForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'StoryForbiddenError';
  }
}

export class StoryValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'StoryValidationError';
    this.status = status;
  }
}

export class StoryInvalidIdError extends Error {
  constructor(message = 'Invalid story ID') {
    super(message);
    this.name = 'StoryInvalidIdError';
  }
}

export type WorkflowActionBody = {
  action?: ContentTransitionAction;
  assignedToId?: string;
  scheduledFor?: string;
  dueAt?: string;
  priority?: string;
  rejectionReason?: string;
  comment?: string;
  expectedVersion?: number;
};

export function resolveStoryVersion(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
}

export function parseExpectedStoryVersion(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function extractExpectedStoryVersion(value: unknown): {
  provided: boolean;
  version: number | null;
} {
  if (value === undefined || value === null || value === '') {
    return { provided: false, version: null };
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isInteger(parsed) && parsed > 0) {
    return { provided: true, version: parsed };
  }
  return { provided: true, version: null };
}

export function buildStoryVersionMatch(expectedVersion: number): Record<string, unknown> {
  return expectedVersion === 1
    ? { $or: [{ version: 1 }, { version: { $exists: false } }] }
    : { version: expectedVersion };
}

export async function resolveStoryStore(): Promise<StoryStore> {
  if (!process.env.MONGODB_URI) return 'file';
  try {
    await connectDB();
    return 'mongo';
  } catch (error) {
    console.error('MongoDB unavailable for Story service, using file store.', error);
    return 'file';
  }
}

export async function getStoryForMutation(
  id: string,
  store: StoryStore
): Promise<StoryRecord | null> {
  if (store === 'file') {
    return (await getStoredStoryById(id)) as unknown as StoryRecord | null;
  }
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  return (await Story.findById(id).lean()) as StoryRecord | null;
}

export function isWorkflowAction(value: unknown): value is ContentTransitionAction {
  return typeof value === 'string' && STORY_WORKFLOW_ACTIONS.has(value as ContentTransitionAction);
}

export function parseOptionalDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function toBoundedDuration(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(2, Math.min(180, parsed));
}

export function normalizeMediaSizeBytes(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function validateStoryVideoMetadata(input: {
  mediaType: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: string;
}): string | null {
  if (!input.storageProvider) {
    return null;
  }

  if (input.storageProvider !== STORY_VIDEO_STORAGE_PROVIDER) {
    return 'Unsupported story video storage provider';
  }

  if (input.mediaType !== 'video') {
    return 'DigitalOcean Spaces media can only be attached to video stories';
  }

  if (!input.mediaKey) {
    return 'Uploaded story videos must include a storage key';
  }

  if (input.mediaSizeBytes < STORY_VIDEO_MIN_BYTES || input.mediaSizeBytes > STORY_VIDEO_MAX_BYTES) {
    return 'Uploaded video must be larger than 0 bytes and 1.9 GB or smaller';
  }

  if (input.mediaMimeType !== 'video/mp4') {
    return 'Uploaded story videos must be MP4 files';
  }

  return null;
}

function normalizeReporterMetaPartial(value: unknown): Partial<ReporterMeta> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const partial: Partial<ReporterMeta> = {};

  if (typeof source.locationTag === 'string') partial.locationTag = source.locationTag.trim();
  if (typeof source.sourceInfo === 'string') partial.sourceInfo = source.sourceInfo.trim();
  if (typeof source.sourceConfidential === 'boolean') partial.sourceConfidential = source.sourceConfidential;
  if (typeof source.reporterNotes === 'string') partial.reporterNotes = source.reporterNotes.trim();

  return partial;
}

function normalizeCopyEditorMetaPartial(value: unknown): Partial<CopyEditorMeta> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const partial: Partial<CopyEditorMeta> = {};

  if (typeof source.proofreadComplete === 'boolean') partial.proofreadComplete = source.proofreadComplete;
  if (typeof source.factCheckStatus === 'string') {
    partial.factCheckStatus = source.factCheckStatus as CopyEditorMeta['factCheckStatus'];
  }
  if (typeof source.headlineStatus === 'string') {
    partial.headlineStatus = source.headlineStatus as CopyEditorMeta['headlineStatus'];
  }
  if (typeof source.imageOptimizationStatus === 'string') {
    partial.imageOptimizationStatus = source.imageOptimizationStatus as CopyEditorMeta['imageOptimizationStatus'];
  }
  if (typeof source.copyEditorNotes === 'string') partial.copyEditorNotes = source.copyEditorNotes.trim();
  if (typeof source.returnForChangesReason === 'string') {
    partial.returnForChangesReason = source.returnForChangesReason.trim();
  }

  return partial;
}

export function formatBlockedFieldLabel(field: string): string {
  switch (field) {
    case 'reporterMeta':
      return 'reporter source fields';
    case 'copyEditorMeta':
      return 'copy desk review fields';
    case 'mediaUrl':
    case 'mediaKey':
    case 'mediaSizeBytes':
    case 'mediaMimeType':
    case 'storageProvider':
    case 'mediaType':
    case 'mediaAssets':
      return 'story video fields';
    case 'linkUrl':
    case 'linkLabel':
      return 'story link fields';
    default:
      return field.replace(/([A-Z])/g, ' $1').toLowerCase();
  }
}

export function normalizeStoryUpdate(
  body: unknown,
  user?: { role?: string } | null
): { updates: Record<string, unknown> | null; error: string | null } {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const updates: Record<string, unknown> = {};

  if (
    'isPublished' in source ||
    'publishedAt' in source ||
    'scheduledFor' in source ||
    'workflow' in source
  ) {
    return {
      updates: null,
      error: 'Publication state can only be changed through workflow actions.',
    };
  }

  if (typeof source.title === 'string') updates.title = source.title.trim();
  if (typeof source.caption === 'string') updates.caption = source.caption.trim();
  if (typeof source.thumbnail === 'string') updates.thumbnail = source.thumbnail.trim();
  if (typeof source.mediaUrl === 'string') updates.mediaUrl = source.mediaUrl.trim();
  if (typeof source.mediaKey === 'string') updates.mediaKey = source.mediaKey.trim();
  if (typeof source.mediaMimeType === 'string') {
    updates.mediaMimeType = source.mediaMimeType.trim().toLowerCase();
  }
  if (typeof source.storageProvider === 'string') {
    updates.storageProvider = source.storageProvider.trim();
  }
  if (source.mediaAssets !== undefined) {
    updates.mediaAssets = normalizeStoryMediaAssets(source.mediaAssets);
  }
  if (typeof source.linkUrl === 'string') updates.linkUrl = source.linkUrl.trim();
  if (typeof source.linkLabel === 'string') updates.linkLabel = source.linkLabel.trim();
  if (typeof source.category === 'string') updates.category = source.category.trim();
  if (typeof source.author === 'string') updates.author = source.author.trim();
  if (source.reporterMeta !== undefined) {
    updates.reporterMeta = normalizeReporterMetaPartial(source.reporterMeta);
  }
  if (source.copyEditorMeta !== undefined) {
    updates.copyEditorMeta = normalizeCopyEditorMetaPartial(source.copyEditorMeta);
  }

  if (source.mediaType !== undefined) {
    if (source.mediaType === 'image' || source.mediaType === 'video') {
      updates.mediaType = source.mediaType;
    } else {
      return { updates: null, error: 'Invalid media type' };
    }
  }

  if (source.durationSeconds !== undefined) {
    const duration = toBoundedDuration(source.durationSeconds);
    if (duration === null) return { updates: null, error: 'Invalid duration' };
    updates.durationSeconds = duration;
  }

  if (source.mediaSizeBytes !== undefined) {
    const mediaSizeBytes = normalizeMediaSizeBytes(source.mediaSizeBytes);
    if (mediaSizeBytes === null) return { updates: null, error: 'Invalid video size' };
    updates.mediaSizeBytes = mediaSizeBytes;
  }

  if (source.priority !== undefined) {
    const priority = Number.parseInt(String(source.priority), 10);
    if (!Number.isFinite(priority)) return { updates: null, error: 'Invalid priority' };
    updates.priority = priority;
  }

  if (source.views !== undefined) {
    const views = Number.parseInt(String(source.views), 10);
    if (!Number.isFinite(views) || views < 0) {
      return { updates: null, error: 'Invalid views count' };
    }
    updates.views = views;
  }

  if (typeof updates.title === 'string' && updates.title.length > 140) {
    return { updates: null, error: 'Title is too long (max 140 characters)' };
  }

  if (user?.role !== 'reporter' && typeof updates.caption === 'string' && updates.caption.length > 300) {
    return { updates: null, error: 'Caption is too long (max 300 characters)' };
  }

  if (typeof updates.linkUrl === 'string' && updates.linkUrl.length > 500) {
    return { updates: null, error: 'Link URL is too long' };
  }

  if (updates.reporterMeta && typeof updates.reporterMeta === 'object') {
    const reporterMetaError = validateReporterMeta(
      normalizeReporterMeta({
        ...createEmptyReporterMeta(),
        ...updates.reporterMeta,
      })
    );
    if (reporterMetaError) {
      return { updates: null, error: reporterMetaError };
    }
  }

  return { updates, error: null };
}

export function applyDerivedStoryMediaUpdates(
  updates: Record<string, unknown>,
  currentStory: StoryRecord
): StoryMediaAsset[] {
  if (updates.mediaAssets === undefined) {
    return normalizeStoryMediaAssets(currentStory.mediaAssets);
  }

  const mediaAssets = normalizeStoryMediaAssets(updates.mediaAssets);
  const thumbnailFallback =
    typeof updates.thumbnail === 'string'
      ? updates.thumbnail
      : typeof currentStory.thumbnail === 'string'
        ? currentStory.thumbnail
        : '';
  const primary = derivePrimaryStoryMedia(mediaAssets, thumbnailFallback);

  updates.mediaAssets = mediaAssets;
  updates.thumbnail = primary.thumbnail;
  updates.mediaType = primary.mediaType;
  updates.mediaUrl = primary.mediaUrl;
  updates.mediaKey = primary.mediaKey;
  updates.mediaSizeBytes = primary.mediaSizeBytes;
  updates.mediaMimeType = primary.mediaMimeType;
  updates.storageProvider = primary.storageProvider;

  return mediaAssets;
}

export function buildStoryPermissionRecord(story: StoryRecord) {
  return {
    legacyAuthorName: typeof story.author === 'string' ? story.author : '',
    workflow: resolveStoryWorkflow({
      workflow:
        typeof story.workflow === 'object' && story.workflow
          ? (story.workflow as Record<string, unknown>)
          : null,
      isPublished:
        typeof story.isPublished === 'boolean' ? story.isPublished : undefined,
      publishedAt: story.publishedAt as Date | string | undefined,
      updatedAt: story.updatedAt as Date | string | undefined,
    }),
  };
}

export function toStoredWorkflowUpdate(workflow: ReturnType<typeof resolveStoryWorkflow>) {
  return {
    status: workflow.status,
    priority: workflow.priority,
    createdBy: workflow.createdBy,
    assignedTo: workflow.assignedTo,
    reviewedBy: workflow.reviewedBy,
    submittedAt: workflow.submittedAt ? workflow.submittedAt.toISOString() : null,
    approvedAt: workflow.approvedAt ? workflow.approvedAt.toISOString() : null,
    rejectedAt: workflow.rejectedAt ? workflow.rejectedAt.toISOString() : null,
    publishedAt: workflow.publishedAt ? workflow.publishedAt.toISOString() : null,
    scheduledFor: workflow.scheduledFor ? workflow.scheduledFor.toISOString() : null,
    dueAt: workflow.dueAt ? workflow.dueAt.toISOString() : null,
    rejectionReason: workflow.rejectionReason || '',
    comments: workflow.comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
    })),
  };
}

export function compactMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) return false;
      if (typeof entry === 'string') return entry.trim().length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    })
  );
}

export async function resolveAssignee(assignedToId: string) {
  const normalized = assignedToId.trim();
  if (!normalized) return null;

  const query = Types.ObjectId.isValid(normalized)
    ? { _id: normalized }
    : { email: normalized.toLowerCase() };
  const assignee = await User.findOne({ ...query, isActive: { $ne: false } })
    .select('_id name email role isActive')
    .lean();
  const role = normalizeAdminRole(assignee?.role);
  if (!assignee || !role || assignee.isActive === false) {
    return null;
  }

  return {
    id: String(assignee._id),
    name: assignee.name || '',
    email: assignee.email || '',
    role,
  };
}

export function resolveStoryResponse(story: StoryRecord): StoryRecord {
  const workflow = resolveStoryWorkflow({
    workflow:
      typeof story.workflow === 'object' && story.workflow
        ? (story.workflow as Record<string, unknown>)
        : null,
    isPublished:
      typeof story.isPublished === 'boolean' ? story.isPublished : undefined,
    publishedAt: story.publishedAt as Date | string | undefined,
    updatedAt: story.updatedAt as Date | string | undefined,
  });

  return {
    ...story,
    version: resolveStoryVersion(story.version),
    isPublished: workflow.status === 'published',
    linkedArticleId:
      typeof story.linkedArticleId === 'string' ? story.linkedArticleId.trim() : '',
    linkedArticleStatus: normalizeLinkedArticleStatus(story.linkedArticleStatus),
    videoProduction:
      story.videoProduction !== undefined
        ? normalizeStoryVideoProduction(story.videoProduction)
        : createEmptyStoryVideoProduction(),
    workflow,
  };
}

type StoryUpdates = Record<string, unknown>;

export interface UpdateStoryCasOptions {
  skipRevision?: boolean;
  revisionSnapshot?: StoredStoryRevision | Record<string, unknown> | null;
}

export function buildStoryRevisionSnapshot(
  story: StoryRecord,
  actor?: AdminSessionIdentity,
  changeReason?: string
): StoredStoryRevision {
  const storyWorkflow = resolveStoryWorkflow(story);
  const mediaAssets = normalizeStoryMediaAssets(story.mediaAssets);

  return {
    _id: new Types.ObjectId().toString(),
    version: resolveStoryVersion(story.version),
    title: String(story.title || ''),
    caption: String(story.caption || ''),
    thumbnail: String(story.thumbnail || ''),
    mediaType: story.mediaType === 'video' ? 'video' : 'image',
    mediaUrl: String(story.mediaUrl || ''),
    mediaKey: String(story.mediaKey || ''),
    mediaSizeBytes: typeof story.mediaSizeBytes === 'number' ? story.mediaSizeBytes : 0,
    mediaMimeType: String(story.mediaMimeType || ''),
    storageProvider: String(story.storageProvider || ''),
    mediaAssets,
    videoProduction:
      story.videoProduction !== undefined
        ? normalizeStoryVideoProduction(story.videoProduction)
        : createEmptyStoryVideoProduction(),
    linkUrl: String(story.linkUrl || ''),
    linkLabel: String(story.linkLabel || ''),
    category: String(story.category || ''),
    author: String(story.author || ''),
    durationSeconds:
      typeof story.durationSeconds === 'number' ? story.durationSeconds : 0,
    priority: typeof story.priority === 'number' ? story.priority : 0,
    reporterMeta: normalizeReporterMeta(story.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(story.copyEditorMeta),
    workflow: {
      status: storyWorkflow.status,
      priority: storyWorkflow.priority,
    },
    savedAt: new Date().toISOString(),
    savedBy: actor
      ? {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          role: actor.role,
        }
      : null,
    changeReason: changeReason || 'Manual edit',
  };
}

export async function updateStoryWithCas(
  id: string,
  updates: StoryUpdates,
  expectedVersion: number,
  store: StoryStore,
  options?: UpdateStoryCasOptions
): Promise<StoryRecord> {
  if (store === 'file') {
    const updated = await updateStoredStory(
      id,
      updates as Partial<CreateStoryInput>,
      {
        expectedVersion,
        skipRevision: options?.skipRevision,
        revisionSnapshot: options?.revisionSnapshot as StoredStoryRevision | null,
      }
    );
    if (!updated) throw new StoryNotFoundError();
    return updated as unknown as StoryRecord;
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new StoryInvalidIdError('Invalid story ID');
  }

  await connectDB();
  const initializesLegacyVersion = expectedVersion === 1;
  const update: Record<string, unknown> = {
    $set: {
      ...updates,
      updatedAt: new Date(),
      ...(initializesLegacyVersion ? { version: 2 } : {}),
    },
    ...(!initializesLegacyVersion ? { $inc: { version: 1 } } : {}),
    ...(!options?.skipRevision && options?.revisionSnapshot
      ? {
          $push: {
            revisions: {
              $each: [options.revisionSnapshot],
              $slice: -30,
            },
          },
        }
      : {}),
  };
  const updated = await Story.findOneAndUpdate(
    { _id: id, ...buildStoryVersionMatch(expectedVersion) },
    update,
    { new: true, runValidators: true }
  ).lean();

  if (updated) return updated as StoryRecord;

  const latest = (await Story.findById(id).select('version').lean()) as
    | { version?: unknown }
    | null;
  if (!latest) throw new StoryNotFoundError();
  throw new StoryVersionConflictError(resolveStoryVersion(latest.version));
}

export async function deleteStoryWithCas(
  id: string,
  expectedVersion: number | null | undefined,
  store: StoryStore
): Promise<boolean> {
  if (store === 'file') {
    const deleted = await deleteStoredStory(id, {
      ...(expectedVersion !== null && expectedVersion !== undefined
        ? { expectedVersion }
        : {}),
    });
    if (!deleted) throw new StoryNotFoundError();
    return true;
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new StoryInvalidIdError('Invalid story ID');
  }

  await connectDB();
  if (expectedVersion !== null && expectedVersion !== undefined) {
    const deleted = await Story.findOneAndDelete({
      _id: id,
      ...buildStoryVersionMatch(expectedVersion),
    }).lean();

    if (deleted) return true;

    const existing = (await Story.findById(id).select('version').lean()) as
      | { version?: unknown }
      | null;
    if (existing) {
      throw new StoryVersionConflictError(resolveStoryVersion(existing.version));
    }
    throw new StoryNotFoundError();
  }

  const deleted = await Story.findByIdAndDelete(id).lean();
  if (!deleted) throw new StoryNotFoundError();
  return true;
}

export class StoryEditorialService {
  static resolveVersion(value: unknown): number {
    return resolveStoryVersion(value);
  }

  static parseExpectedVersion(value: unknown): number | null {
    return parseExpectedStoryVersion(value);
  }

  static async getStoryEditorial(
    id: string,
    actor: AdminSessionIdentity,
    store?: StoryStore
  ): Promise<StoryRecord> {
    const effectiveStore = store ?? (await resolveStoryStore());
    if (effectiveStore === 'mongo' && !Types.ObjectId.isValid(id)) {
      throw new StoryInvalidIdError('Invalid story ID');
    }

    const story = await getStoryForMutation(id, effectiveStore);
    if (!story) {
      throw new StoryNotFoundError();
    }

    if (!canReadContent(actor, buildStoryPermissionRecord(story), { allowViewerRead: true })) {
      throw new StoryForbiddenError();
    }

    return resolveStoryResponse(story);
  }

  static async updateStoryEditorial(
    id: string,
    body: unknown,
    actor: AdminSessionIdentity,
    store?: StoryStore
  ): Promise<{ story: StoryRecord; usage: unknown }> {
    if (!canViewPage(actor.role, 'stories') && !canViewPage(actor.role, 'story_edit')) {
      throw new StoryForbiddenError();
    }

    await assertStoryLeaseNotHeldByOther(id, actor);

    const { updates, error: normalizationError } = normalizeStoryUpdate(body, actor);
    if (normalizationError) {
      throw new StoryValidationError(normalizationError, 400);
    }
    if (!updates) {
      throw new StoryValidationError('No updates provided', 400);
    }

    const bodyRecord = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    const isAutosave = bodyRecord.autosave === true;
    const versionCheck = extractExpectedStoryVersion(bodyRecord.expectedVersion);
    if (!versionCheck.provided || versionCheck.version === null) {
      throw new StoryExpectedVersionError();
    }
    const expectedVersion = versionCheck.version;

    const effectiveStore = store ?? (await resolveStoryStore());
    if (effectiveStore === 'mongo' && !Types.ObjectId.isValid(id)) {
      throw new StoryInvalidIdError('Invalid story ID');
    }

    const current = await getStoryForMutation(id, effectiveStore);
    if (!current) {
      throw new StoryNotFoundError();
    }

    const permissionRecord = buildStoryPermissionRecord(current);
    if (!canEditContent(actor, permissionRecord)) {
      throw new StoryForbiddenError();
    }

    const currentVersion = resolveStoryVersion(current.version);
    if (expectedVersion !== currentVersion) {
      throw new StoryVersionConflictError(currentVersion);
    }

    const blockedFields = getBlockedStoryUpdateFields(
      actor,
      permissionRecord,
      Object.keys(updates)
    );
    if (blockedFields.length > 0) {
      const blockedLabels = [...new Set(blockedFields.map(formatBlockedFieldLabel))];
      throw new StoryForbiddenError(
        `You cannot edit ${blockedLabels.join(', ')} in the current workflow stage.`
      );
    }

    const nextMediaAssets = applyDerivedStoryMediaUpdates(updates, current);
    const mediaAssetsError = validateStoryMediaAssets(nextMediaAssets);
    if (mediaAssetsError) {
      throw new StoryValidationError(mediaAssetsError, 400);
    }

    const metadataError = validateStoryVideoMetadata({
      mediaType:
        typeof updates.mediaType === 'string'
          ? updates.mediaType
          : String(current.mediaType === 'video' ? 'video' : 'image'),
      mediaKey:
        typeof updates.mediaKey === 'string'
          ? updates.mediaKey
          : String(current.mediaKey || '').trim(),
      mediaSizeBytes:
        typeof updates.mediaSizeBytes === 'number'
          ? updates.mediaSizeBytes
          : Number(current.mediaSizeBytes || 0),
      mediaMimeType:
        typeof updates.mediaMimeType === 'string'
          ? updates.mediaMimeType
          : String(current.mediaMimeType || '').trim().toLowerCase(),
      storageProvider:
        typeof updates.storageProvider === 'string'
          ? updates.storageProvider
          : String(current.storageProvider || '').trim(),
    });
    if (metadataError) {
      throw new StoryValidationError(metadataError, 400);
    }

    const currentWorkflow = resolveStoryWorkflow(current);
    const normalizedForStore: Record<string, unknown> = {
      ...updates,
      mediaAssets: nextMediaAssets,
      isPublished: currentWorkflow.status === 'published',
      workflow: toStoredWorkflowUpdate(currentWorkflow),
      ...(updates.publishedAt instanceof Date
        ? { publishedAt: updates.publishedAt.toISOString() }
        : {}),
    };

    if (effectiveStore === 'mongo') {
      if (updates.reporterMeta && typeof updates.reporterMeta === 'object') {
        normalizedForStore.reporterMeta = normalizeReporterMeta({
          ...createEmptyReporterMeta(),
          ...(typeof current.reporterMeta === 'object' && current.reporterMeta
            ? (current.reporterMeta as Record<string, unknown>)
            : {}),
          ...updates.reporterMeta,
        });
      }
      if (updates.copyEditorMeta && typeof updates.copyEditorMeta === 'object') {
        normalizedForStore.copyEditorMeta = normalizeCopyEditorMeta({
          ...(typeof current.copyEditorMeta === 'object' && current.copyEditorMeta
            ? (current.copyEditorMeta as Record<string, unknown>)
            : {}),
          ...updates.copyEditorMeta,
        });
      }
    }

    const snapshot = isAutosave
      ? null
      : buildStoryRevisionSnapshot(
          current,
          actor,
          typeof bodyRecord.changeReason === 'string' ? bodyRecord.changeReason : undefined
        );

    const updated = await updateStoryWithCas(
      id,
      normalizedForStore,
      expectedVersion,
      effectiveStore,
      {
        skipRevision: isAutosave,
        revisionSnapshot: snapshot,
      }
    );

    if (!isAutosave) {
      try {
        await recordStoryActivity({
          storyId: id,
          actor,
          action: 'saved',
          toStatus: resolveStoryWorkflow(updated).status,
          message: buildStoryActivityMessage({ action: 'saved' }),
          metadata: {
            changedFields: Object.keys(updates),
          },
        });
      } catch (activityError) {
        console.error('Failed to record story activity on save:', activityError);
      }
    }

    let usage = null;
    try {
      usage = await getStoryVideoMonthlyUsageSummary();
    } catch (usageError) {
      console.error('Failed to get story video usage summary:', usageError);
    }

    return { story: resolveStoryResponse(updated), usage };
  }

  static async applyStoryWorkflowAction(
    id: string,
    actionBody: WorkflowActionBody,
    actor: AdminSessionIdentity,
    store?: StoryStore
  ): Promise<{
    story: StoryRecord;
    fromStatus: WorkflowStatus;
    toStatus: WorkflowStatus;
    nextWorkflow: ReturnType<typeof resolveStoryWorkflow>;
  }> {
    const action = actionBody.action;
    if (!action || !isWorkflowAction(action)) {
      throw new StoryValidationError('Invalid workflow action', 400);
    }

    const versionCheck = extractExpectedStoryVersion(actionBody.expectedVersion);
    if (!versionCheck.provided || versionCheck.version === null) {
      throw new StoryExpectedVersionError();
    }
    const expectedVersion = versionCheck.version;

    const effectiveStore = store ?? (await resolveStoryStore());
    if (effectiveStore === 'mongo' && !Types.ObjectId.isValid(id)) {
      throw new StoryInvalidIdError('Invalid story ID');
    }

    const current = await getStoryForMutation(id, effectiveStore);
    if (!current) {
      throw new StoryNotFoundError();
    }

    const permissionRecord = buildStoryPermissionRecord(current);
    if (!canTransitionContent(actor, permissionRecord, action)) {
      throw new StoryForbiddenError();
    }

    const currentVersion = resolveStoryVersion(current.version);
    if (expectedVersion !== currentVersion) {
      throw new StoryVersionConflictError(currentVersion);
    }

    const currentStoryWorkflow = resolveStoryWorkflow(current);
    const readinessError = validateEditorialPublishReadiness(
      {
        contentType: 'story',
        title: String(current.title || ''),
        category: String(current.category || ''),
        thumbnail: String(current.thumbnail || ''),
        mediaUrl: String(current.mediaUrl || ''),
        mediaAssets: current.mediaAssets,
      },
      action
    );
    if (readinessError) {
      throw new StoryValidationError(readinessError, 400);
    }

    if (action === 'fast_publish') {
      const urgentError = validateFastPublish({
        role: actor.role,
        workflow: currentStoryWorkflow,
        reason: actionBody.comment,
      });
      if (urgentError) {
        throw new StoryValidationError(urgentError, 400);
      }
    }

    let assignedTo = null;
    if (action === 'assign') {
      if (effectiveStore === 'file' && !process.env.MONGODB_URI?.trim()) {
        throw new StoryValidationError('Assignments require MongoDB-backed users.', 503);
      }
      await connectDB();
      assignedTo = await resolveAssignee(String(actionBody.assignedToId || ''));
      if (!assignedTo) {
        throw new StoryValidationError('Valid assignedToId is required', 400);
      }
    }

    const scheduledFor = parseOptionalDate(actionBody.scheduledFor);
    if (
      action === 'schedule' &&
      (!scheduledFor || scheduledFor.getTime() <= Date.now())
    ) {
      throw new StoryValidationError('scheduledFor must be a valid future date.', 400);
    }

    const { fromStatus, toStatus, nextWorkflow } = applyStoryWorkflowAction({
      action,
      actor,
      currentWorkflow: currentStoryWorkflow,
      assignedTo,
      scheduledFor,
      dueAt: parseOptionalDate(actionBody.dueAt),
      priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
      comment: actionBody.comment,
      rejectionReason: actionBody.rejectionReason,
    });

    const updates: Record<string, unknown> = {
      isPublished: toStatus === 'published',
      workflow: toStoredWorkflowUpdate(nextWorkflow),
      ...(toStatus === 'published' ? { publishedAt: new Date().toISOString() } : {}),
    };

    const updated = await updateStoryWithCas(id, updates, expectedVersion, effectiveStore, { skipRevision: true });

    try {
      await recordStoryActivity({
        storyId: id,
        actor,
        action,
        fromStatus,
        toStatus,
        message: buildStoryActivityMessage({
          action,
          toStatus,
          assignedTo: nextWorkflow.assignedTo,
          rejectionReason: nextWorkflow.rejectionReason,
        }),
        metadata: compactMetadata({
          assignedToId: nextWorkflow.assignedTo?.id || '',
          assignedToName: nextWorkflow.assignedTo?.name || '',
          priority: nextWorkflow.priority,
          dueAt: nextWorkflow.dueAt?.toISOString() || '',
          scheduledFor: nextWorkflow.scheduledFor?.toISOString() || '',
          rejectionReason: nextWorkflow.rejectionReason || '',
          comment: actionBody.comment?.trim() || '',
        }),
      });
    } catch (activityError) {
      console.error('Failed to record story activity after workflow action:', activityError);
    }

    try {
      await notifyWorkflowEvent({
        contentType: 'story',
        contentId: id,
        title: String(updated.title || 'Story'),
        href: `/admin/stories/${encodeURIComponent(id)}/edit`,
        action,
        workflow: nextWorkflow,
        actor,
        previousAssignee: currentStoryWorkflow.assignedTo,
        rejectionReason: actionBody.rejectionReason || nextWorkflow.rejectionReason || undefined,
        scheduledFor: scheduledFor || nextWorkflow.scheduledFor || undefined,
        comment: actionBody.comment || undefined,
      });
    } catch (notifyError) {
      console.error('Failed to send story workflow notification:', notifyError);
    }

    return {
      story: resolveStoryResponse(updated),
      fromStatus,
      toStatus,
      nextWorkflow,
    };
  }

  static async deleteStoryEditorial(
    id: string,
    expectedVersion: number | null | undefined,
    actor: AdminSessionIdentity,
    store?: StoryStore
  ): Promise<boolean> {
    if (!canDeleteContent(actor)) {
      throw new StoryForbiddenError();
    }

    await assertStoryLeaseNotHeldByOther(id, actor);

    const effectiveStore = store ?? (await resolveStoryStore());
    const deleted = await deleteStoryWithCas(id, expectedVersion, effectiveStore);
    if (deleted) {
      await deleteStoryLock(id).catch(() => undefined);
    }
    return deleted;
  }

  static async getStoryRevisions(
    id: string,
    actor: AdminSessionIdentity,
    store?: StoryStore
  ): Promise<Array<Record<string, unknown>>> {
    if (!canViewPage(actor.role, 'stories') && !canViewPage(actor.role, 'story_edit')) {
      throw new StoryForbiddenError();
    }

    const effectiveStore = store ?? (await resolveStoryStore());
    if (effectiveStore === 'mongo' && !Types.ObjectId.isValid(id)) {
      throw new StoryInvalidIdError('Invalid story ID');
    }

    const story = await getStoryForMutation(id, effectiveStore);
    if (!story) {
      throw new StoryNotFoundError();
    }

    if (!canReadContent(actor, buildStoryPermissionRecord(story), { allowViewerRead: true })) {
      throw new StoryForbiddenError();
    }

    const revisions = Array.isArray(story.revisions)
      ? ([...story.revisions] as Array<Record<string, unknown>>)
      : [];

    revisions.sort((a, b) => {
      const timeA = new Date(String(a.savedAt || 0)).getTime();
      const timeB = new Date(String(b.savedAt || 0)).getTime();
      return timeB - timeA;
    });

    return revisions;
  }

  static async restoreStoryRevision(
    id: string,
    revisionId: string,
    expectedVersion: number,
    actor: AdminSessionIdentity,
    store?: StoryStore
  ): Promise<{ story: StoryRecord }> {
    if (!canViewPage(actor.role, 'story_edit')) {
      throw new StoryForbiddenError();
    }

    const effectiveStore = store ?? (await resolveStoryStore());
    if (effectiveStore === 'mongo' && !Types.ObjectId.isValid(id)) {
      throw new StoryInvalidIdError('Invalid story ID');
    }

    const current = await getStoryForMutation(id, effectiveStore);
    if (!current) {
      throw new StoryNotFoundError();
    }

    const permissionRecord = buildStoryPermissionRecord(current);
    if (!canEditContent(actor, permissionRecord)) {
      throw new StoryForbiddenError();
    }

    await assertStoryLeaseNotHeldByOther(id, actor);

    const currentVersion = resolveStoryVersion(current.version);
    if (expectedVersion !== currentVersion) {
      throw new StoryVersionConflictError(currentVersion);
    }

    const revisions = Array.isArray(current.revisions)
      ? (current.revisions as Array<Record<string, unknown>>)
      : [];
    const targetRevision = revisions.find(
      (r) =>
        String(r._id || '') === revisionId ||
        String(r.id || '') === revisionId
    );

    if (!targetRevision) {
      throw new StoryNotFoundError('Revision not found');
    }

    const preRestoreSnapshot = buildStoryRevisionSnapshot(
      current,
      actor,
      `Pre-restore snapshot before reverting to revision ${revisionId}`
    );

    const currentWorkflow = resolveStoryWorkflow(current);
    const restoredMediaAssets = Array.isArray(targetRevision.mediaAssets)
      ? JSON.parse(JSON.stringify(targetRevision.mediaAssets))
      : [];

    const restoredUpdates: Record<string, unknown> = {
      title: String(targetRevision.title || ''),
      caption: String(targetRevision.caption || ''),
      thumbnail: String(targetRevision.thumbnail || ''),
      mediaType: targetRevision.mediaType === 'video' ? 'video' : 'image',
      mediaUrl: String(targetRevision.mediaUrl || ''),
      mediaKey: String(targetRevision.mediaKey || ''),
      mediaSizeBytes:
        typeof targetRevision.mediaSizeBytes === 'number' ? targetRevision.mediaSizeBytes : 0,
      mediaMimeType: String(targetRevision.mediaMimeType || ''),
      storageProvider: String(targetRevision.storageProvider || ''),
      mediaAssets: restoredMediaAssets,
      videoProduction: targetRevision.videoProduction
        ? normalizeStoryVideoProduction(targetRevision.videoProduction)
        : createEmptyStoryVideoProduction(),
      linkUrl: String(targetRevision.linkUrl || ''),
      linkLabel: String(targetRevision.linkLabel || ''),
      category: String(targetRevision.category || ''),
      author: String(targetRevision.author || ''),
      durationSeconds:
        typeof targetRevision.durationSeconds === 'number' ? targetRevision.durationSeconds : 0,
      priority: typeof targetRevision.priority === 'number' ? targetRevision.priority : 0,
      reporterMeta: normalizeReporterMeta(targetRevision.reporterMeta),
      copyEditorMeta: normalizeCopyEditorMeta(targetRevision.copyEditorMeta),
      workflow: toStoredWorkflowUpdate(currentWorkflow),
      isPublished: currentWorkflow.status === 'published',
      ...(current.publishedAt ? { publishedAt: current.publishedAt } : {}),
    };

    const updated = await updateStoryWithCas(
      id,
      restoredUpdates,
      expectedVersion,
      effectiveStore,
      {
        skipRevision: false,
        revisionSnapshot: preRestoreSnapshot,
      }
    );

    try {
      await recordStoryActivity({
        storyId: id,
        actor,
        action: 'restore_revision',
        toStatus: resolveStoryWorkflow(updated).status,
        message: buildStoryActivityMessage({ action: 'restore_revision' }),
        metadata: {
          revisionId,
          revisionVersion: targetRevision.version,
          savedAt: targetRevision.savedAt || 'unknown',
        },
      });
    } catch (activityError) {
      console.error('Failed to record story revision restore activity:', activityError);
    }

    return { story: resolveStoryResponse(updated) };
  }
}
