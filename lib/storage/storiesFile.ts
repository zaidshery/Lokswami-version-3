import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import {
  normalizeCopyEditorMeta,
  normalizeReporterMeta,
  type CopyEditorMeta,
  type ReporterMeta,
} from '@/lib/content/newsroomMetadata';
import {
  normalizeStoryMediaAssets,
  type StoryMediaAsset,
} from '@/lib/content/storyMedia';
import {
  createEmptyStoryVideoProduction,
  normalizeLinkedArticleStatus,
  normalizeStoryVideoProduction,
  type LinkedArticleStatus,
  type StoryVideoProduction,
} from '@/lib/content/newsroomPublishing';
import {
  createWorkflowMeta,
  isWorkflowCommentKind,
  isWorkflowPriority,
  isWorkflowStatus,
  type WorkflowActorRef,
  type WorkflowCommentKind,
  type WorkflowPriority,
  type WorkflowStatus,
} from '@/lib/workflow/types';

export interface StoredWorkflowComment {
  id: string;
  body: string;
  kind: WorkflowCommentKind;
  author: WorkflowActorRef;
  createdAt: string;
}

export interface StoredWorkflowMeta {
  status: WorkflowStatus;
  priority: WorkflowPriority;
  createdBy: WorkflowActorRef | null;
  assignedTo: WorkflowActorRef | null;
  reviewedBy: WorkflowActorRef | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  dueAt: string | null;
  rejectionReason: string;
  comments: StoredWorkflowComment[];
}

export interface StoredStory {
  _id: string;
  title: string;
  caption: string;
  thumbnail: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: string;
  mediaAssets: StoryMediaAsset[];
  linkUrl: string;
  linkLabel: string;
  category: string;
  author: string;
  durationSeconds: number;
  priority: number;
  views: number;
  isPublished: boolean;
  publishedAt: string;
  updatedAt: string;
  workflow: StoredWorkflowMeta;
  reporterMeta: ReporterMeta;
  copyEditorMeta: CopyEditorMeta;
  linkedArticleId: string;
  linkedArticleStatus: LinkedArticleStatus;
  videoProduction: StoryVideoProduction;
}

export interface CreateStoryInput {
  title: string;
  caption?: string;
  thumbnail: string;
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  mediaKey?: string;
  mediaSizeBytes?: number;
  mediaMimeType?: string;
  storageProvider?: string;
  mediaAssets?: StoryMediaAsset[];
  linkUrl?: string;
  linkLabel?: string;
  category?: string;
  author?: string;
  durationSeconds?: number;
  priority?: number;
  views?: number;
  isPublished?: boolean;
  publishedAt?: string;
  workflow?: Partial<StoredWorkflowMeta>;
  reporterMeta?: Partial<ReporterMeta>;
  copyEditorMeta?: Partial<CopyEditorMeta>;
  linkedArticleId?: string;
  linkedArticleStatus?: LinkedArticleStatus;
  videoProduction?: Partial<StoryVideoProduction>;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'stories.json');

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toBoundedDuration(value: number | undefined) {
  if (!Number.isFinite(value)) return 6;
  return Math.max(2, Math.min(180, Number(value)));
}

function normalizeOptionalDateString(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeWorkflowComment(input: unknown): StoredWorkflowComment | null {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const authorSource =
    typeof source.author === 'object' && source.author
      ? (source.author as Record<string, unknown>)
      : null;
  const body = typeof source.body === 'string' ? source.body.trim() : '';
  const authorId = typeof authorSource?.id === 'string' ? authorSource.id.trim() : '';
  const authorName = typeof authorSource?.name === 'string' ? authorSource.name.trim() : '';
  const authorEmail = typeof authorSource?.email === 'string' ? authorSource.email.trim() : '';
  const authorRole = authorSource?.role;

  if (!body || !authorId || !authorName || !authorEmail || typeof authorRole !== 'string') {
    return null;
  }

  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id : createId(),
    body,
    kind: isWorkflowCommentKind(source.kind) ? source.kind : 'comment',
    author: {
      id: authorId,
      name: authorName,
      email: authorEmail,
      role: authorRole as WorkflowActorRef['role'],
    },
    createdAt: normalizeOptionalDateString(source.createdAt) || new Date().toISOString(),
  };
}

function normalizeWorkflowMeta(input: unknown, isPublished: boolean): StoredWorkflowMeta {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : {};
  const workflow = createWorkflowMeta({
    status: isWorkflowStatus(source.status) ? source.status : isPublished ? 'published' : 'draft',
    priority: isWorkflowPriority(source.priority) ? source.priority : 'normal',
  });

  const comments = Array.isArray(source.comments)
    ? source.comments
        .map((comment) => normalizeWorkflowComment(comment))
        .filter((comment): comment is StoredWorkflowComment => Boolean(comment))
    : [];

  return {
    status: workflow.status,
    priority: workflow.priority,
    createdBy:
      typeof source.createdBy === 'object' && source.createdBy
        ? (source.createdBy as WorkflowActorRef)
        : null,
    assignedTo:
      typeof source.assignedTo === 'object' && source.assignedTo
        ? (source.assignedTo as WorkflowActorRef)
        : null,
    reviewedBy:
      typeof source.reviewedBy === 'object' && source.reviewedBy
        ? (source.reviewedBy as WorkflowActorRef)
        : null,
    submittedAt: normalizeOptionalDateString(source.submittedAt),
    approvedAt: normalizeOptionalDateString(source.approvedAt),
    rejectedAt: normalizeOptionalDateString(source.rejectedAt),
    publishedAt: normalizeOptionalDateString(source.publishedAt),
    scheduledFor: normalizeOptionalDateString(source.scheduledFor),
    dueAt: normalizeOptionalDateString(source.dueAt),
    rejectionReason:
      typeof source.rejectionReason === 'string' ? source.rejectionReason.trim() : '',
    comments,
  };
}

function normalizeStoredStory(input: unknown): StoredStory | null {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const thumbnail = typeof source.thumbnail === 'string' ? source.thumbnail.trim() : '';
  if (!title || !thumbnail) return null;

  const isPublished = source.isPublished === false ? false : true;
  const publishedAt =
    typeof source.publishedAt === 'string' && source.publishedAt.trim()
      ? source.publishedAt
      : new Date().toISOString();

  return {
    _id: typeof source._id === 'string' && source._id.trim() ? source._id : createId(),
    title,
    caption: typeof source.caption === 'string' ? source.caption.trim() : '',
    thumbnail,
    mediaType: source.mediaType === 'video' ? 'video' : 'image',
    mediaUrl: typeof source.mediaUrl === 'string' ? source.mediaUrl.trim() : '',
    mediaKey: typeof source.mediaKey === 'string' ? source.mediaKey.trim() : '',
    mediaSizeBytes: Number.isFinite(Number(source.mediaSizeBytes))
      ? Math.max(0, Number(source.mediaSizeBytes))
      : 0,
    mediaMimeType: typeof source.mediaMimeType === 'string' ? source.mediaMimeType.trim() : '',
    storageProvider: typeof source.storageProvider === 'string' ? source.storageProvider.trim() : '',
    mediaAssets: normalizeStoryMediaAssets(source.mediaAssets),
    linkUrl: typeof source.linkUrl === 'string' ? source.linkUrl.trim() : '',
    linkLabel: typeof source.linkLabel === 'string' ? source.linkLabel.trim() : '',
    category: typeof source.category === 'string' && source.category.trim() ? source.category.trim() : 'General',
    author: typeof source.author === 'string' && source.author.trim() ? source.author.trim() : 'Desk',
    durationSeconds: toBoundedDuration(Number(source.durationSeconds)),
    priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0,
    views: Number.isFinite(Number(source.views)) ? Math.max(0, Number(source.views)) : 0,
    isPublished,
    publishedAt,
    updatedAt:
      typeof source.updatedAt === 'string' && source.updatedAt.trim()
        ? source.updatedAt
        : new Date().toISOString(),
    workflow: normalizeWorkflowMeta(source.workflow, isPublished),
    reporterMeta: normalizeReporterMeta(source.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(source.copyEditorMeta),
    linkedArticleId:
      typeof source.linkedArticleId === 'string' ? source.linkedArticleId.trim() : '',
    linkedArticleStatus: normalizeLinkedArticleStatus(source.linkedArticleStatus),
    videoProduction: normalizeStoryVideoProduction(source.videoProduction),
  };
}

async function readAllStories(): Promise<StoredStory[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed
          .map((item) => normalizeStoredStory(item))
          .filter((item): item is StoredStory => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

async function writeAllStories(stories: StoredStory[]) {
  await writeJsonFileAtomically(dataPath, stories);
}

export async function listStoredStories(params: {
  category?: string | null;
  published?: boolean;
  search?: string;
  sort?: string | null;
  workflowStatus?: string | null;
  limit: number;
  page: number;
}) {
  const { category, published, search, sort, workflowStatus, limit, page } = params;
  const all = await readAllStories();
  let filtered = all;

  if (category && category !== 'all') {
    filtered = filtered.filter((item) => item.category === category);
  }

  if (typeof published === 'boolean') {
    filtered = filtered.filter((item) => item.isPublished === published);
  }

  if (workflowStatus && isWorkflowStatus(workflowStatus)) {
    filtered = filtered.filter((item) => item.workflow.status === workflowStatus);
  }

  const normalizedSearch = (search || '').trim().toLowerCase();
  if (normalizedSearch) {
    filtered = filtered.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedSearch) ||
        item.caption.toLowerCase().includes(normalizedSearch) ||
        item.category.toLowerCase().includes(normalizedSearch)
    );
  }

  if (sort === 'priority') {
    filtered.sort(
      (a, b) =>
        b.priority - a.priority ||
        new Date(b.updatedAt || b.publishedAt).getTime() -
          new Date(a.updatedAt || a.publishedAt).getTime()
    );
  } else if (sort === 'trending') {
    filtered.sort(
      (a, b) =>
        b.views - a.views ||
        new Date(b.updatedAt || b.publishedAt).getTime() -
          new Date(a.updatedAt || a.publishedAt).getTime()
    );
  } else {
    filtered.sort(
      (a, b) =>
        new Date(b.updatedAt || b.publishedAt).getTime() -
        new Date(a.updatedAt || a.publishedAt).getTime()
    );
  }

  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);
  return { data, total: filtered.length };
}

export async function listAllStoredStories() {
  return readAllStories();
}

export async function getStoredStoryById(id: string) {
  const all = await readAllStories();
  return all.find((item) => item._id === id) || null;
}

export async function createStoredStory(input: CreateStoryInput) {
  const now = new Date().toISOString();
  const all = await readAllStories();
  const isPublished = input.isPublished === false ? false : true;

  const story: StoredStory = {
    _id: createId(),
    title: input.title,
    caption: input.caption || '',
    thumbnail: input.thumbnail,
    mediaType: input.mediaType === 'video' ? 'video' : 'image',
    mediaUrl: input.mediaUrl || '',
    mediaKey: input.mediaKey || '',
    mediaSizeBytes:
      input.mediaSizeBytes !== undefined && Number.isFinite(Number(input.mediaSizeBytes))
        ? Math.max(0, Number(input.mediaSizeBytes))
        : 0,
    mediaMimeType: input.mediaMimeType || '',
    storageProvider: input.storageProvider || '',
    mediaAssets: normalizeStoryMediaAssets(input.mediaAssets),
    linkUrl: input.linkUrl || '',
    linkLabel: input.linkLabel || '',
    category: input.category || 'General',
    author: input.author || 'Desk',
    durationSeconds: toBoundedDuration(input.durationSeconds),
    priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
    views: Number.isFinite(input.views) ? Number(input.views) : 0,
    isPublished,
    publishedAt: input.publishedAt || now,
    updatedAt: now,
    workflow: normalizeWorkflowMeta(input.workflow, isPublished),
    reporterMeta: normalizeReporterMeta(input.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(input.copyEditorMeta),
    linkedArticleId:
      typeof input.linkedArticleId === 'string' ? input.linkedArticleId.trim() : '',
    linkedArticleStatus: normalizeLinkedArticleStatus(input.linkedArticleStatus),
    videoProduction:
      input.videoProduction !== undefined
        ? normalizeStoryVideoProduction(input.videoProduction)
        : createEmptyStoryVideoProduction(),
  };

  all.push(story);
  await writeAllStories(all);
  return story;
}

export async function updateStoredStory(
  id: string,
  updates: Partial<CreateStoryInput> & {
    durationSeconds?: number;
    priority?: number;
    views?: number;
    publishedAt?: string;
    updatedAt?: string;
    workflow?: Partial<StoredWorkflowMeta>;
    reporterMeta?: Partial<ReporterMeta>;
    copyEditorMeta?: Partial<CopyEditorMeta>;
  }
) {
  const all = await readAllStories();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return null;

  const current = all[index];
  const nextIsPublished =
    updates.isPublished !== undefined ? Boolean(updates.isPublished) : current.isPublished;

  const next: StoredStory = {
    ...current,
    ...updates,
    mediaType:
      updates.mediaType === 'video'
        ? 'video'
        : updates.mediaType === 'image'
          ? 'image'
          : current.mediaType,
    durationSeconds:
      updates.durationSeconds !== undefined
        ? toBoundedDuration(updates.durationSeconds)
        : current.durationSeconds,
    priority:
      updates.priority !== undefined && Number.isFinite(updates.priority)
        ? Number(updates.priority)
        : current.priority,
    views:
      updates.views !== undefined && Number.isFinite(updates.views)
        ? Number(updates.views)
        : current.views,
    mediaKey:
      typeof updates.mediaKey === 'string' ? updates.mediaKey.trim() : current.mediaKey,
    mediaSizeBytes:
      updates.mediaSizeBytes !== undefined && Number.isFinite(Number(updates.mediaSizeBytes))
        ? Math.max(0, Number(updates.mediaSizeBytes))
        : current.mediaSizeBytes,
    mediaMimeType:
      typeof updates.mediaMimeType === 'string'
        ? updates.mediaMimeType.trim()
        : current.mediaMimeType,
    storageProvider:
      typeof updates.storageProvider === 'string'
        ? updates.storageProvider.trim()
        : current.storageProvider,
    mediaAssets:
      updates.mediaAssets !== undefined
        ? normalizeStoryMediaAssets(updates.mediaAssets)
        : current.mediaAssets,
    isPublished: nextIsPublished,
    updatedAt: updates.updatedAt || new Date().toISOString(),
    workflow:
      updates.workflow !== undefined
        ? normalizeWorkflowMeta({ ...current.workflow, ...updates.workflow }, nextIsPublished)
        : current.workflow,
    reporterMeta:
      updates.reporterMeta !== undefined
        ? normalizeReporterMeta({ ...current.reporterMeta, ...updates.reporterMeta })
        : current.reporterMeta,
    copyEditorMeta:
      updates.copyEditorMeta !== undefined
        ? normalizeCopyEditorMeta({
            ...current.copyEditorMeta,
            ...updates.copyEditorMeta,
          })
        : current.copyEditorMeta,
    linkedArticleId:
      typeof updates.linkedArticleId === 'string'
        ? updates.linkedArticleId.trim()
        : current.linkedArticleId,
    linkedArticleStatus:
      updates.linkedArticleStatus !== undefined
        ? normalizeLinkedArticleStatus(updates.linkedArticleStatus)
        : current.linkedArticleStatus,
    videoProduction:
      updates.videoProduction !== undefined
        ? normalizeStoryVideoProduction({
            ...current.videoProduction,
            ...updates.videoProduction,
          })
        : current.videoProduction,
  };

  all[index] = next;
  await writeAllStories(all);
  return next;
}

export async function deleteStoredStory(id: string) {
  const all = await readAllStories();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return false;

  all.splice(index, 1);
  await writeAllStories(all);
  return true;
}
