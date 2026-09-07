import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
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
import {
  buildVideoSlug,
  inferVideoMediaProvider,
  normalizeVideoAspectRatio,
  normalizeVideoProcessingStatus,
  normalizeVideoSlug,
  type VideoAspectRatio,
  type VideoMediaProvider,
  type VideoProcessingStatus,
} from '@/lib/content/videoPublication';

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

export interface StoredVideo {
  _id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  category: string;
  isShort: boolean;
  isPublished: boolean;
  shortsRank: number;
  views: number;
  createdAt: string;
  publishedAt: string;
  updatedAt: string;
  workflow: StoredWorkflowMeta;
  slug: string;
  articleId: string;
  posterUrl: string;
  mediaProvider: VideoMediaProvider;
  playbackUrl: string;
  hlsUrl: string;
  aspectRatio: VideoAspectRatio;
  captionUrl: string;
  transcript: string;
  processingStatus: VideoProcessingStatus;
  instagramUrl: string;
  youtubeUrl: string;
}

export interface CreateVideoInput {
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  category: string;
  isShort?: boolean;
  isPublished?: boolean;
  shortsRank?: number;
  views?: number;
  createdAt?: string;
  publishedAt?: string;
  workflow?: Partial<StoredWorkflowMeta>;
  slug?: string;
  articleId?: string;
  posterUrl?: string;
  mediaProvider?: VideoMediaProvider;
  playbackUrl?: string;
  hlsUrl?: string;
  aspectRatio?: VideoAspectRatio;
  captionUrl?: string;
  transcript?: string;
  processingStatus?: VideoProcessingStatus;
  instagramUrl?: string;
  youtubeUrl?: string;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'videos.json');

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function normalizeStoredVideo(input: unknown): StoredVideo | null {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const description = typeof source.description === 'string' ? source.description.trim() : '';
  const thumbnail = typeof source.thumbnail === 'string' ? source.thumbnail.trim() : '';
  const videoUrl = typeof source.videoUrl === 'string' ? source.videoUrl.trim() : '';
  const category = typeof source.category === 'string' ? source.category.trim() : '';

  if (!title || !description || !thumbnail || !videoUrl || !category) {
    return null;
  }

  const isPublished = source.isPublished === false ? false : true;

  const id = typeof source._id === 'string' && source._id.trim() ? source._id : createId();
  const playbackUrl = typeof source.playbackUrl === 'string' && source.playbackUrl.trim()
    ? source.playbackUrl.trim()
    : videoUrl;

  return {
    _id: id,
    title,
    description,
    thumbnail,
    videoUrl,
    duration: Number.isFinite(Number(source.duration)) ? Number(source.duration) : 0,
    category,
    isShort: Boolean(source.isShort),
    isPublished,
    shortsRank: Number.isFinite(Number(source.shortsRank)) ? Number(source.shortsRank) : 0,
    views: Number.isFinite(Number(source.views)) ? Math.max(0, Number(source.views)) : 0,
    createdAt:
      typeof source.createdAt === 'string' && source.createdAt.trim()
        ? source.createdAt
        : new Date().toISOString(),
    publishedAt:
      typeof source.publishedAt === 'string' && source.publishedAt.trim()
        ? source.publishedAt
        : new Date().toISOString(),
    updatedAt:
      typeof source.updatedAt === 'string' && source.updatedAt.trim()
        ? source.updatedAt
        : new Date().toISOString(),
    workflow: normalizeWorkflowMeta(source.workflow, isPublished),
    slug: normalizeVideoSlug(source.slug) || buildVideoSlug(title, id),
    articleId: typeof source.articleId === 'string' ? source.articleId.trim() : '',
    posterUrl:
      typeof source.posterUrl === 'string' && source.posterUrl.trim()
        ? source.posterUrl.trim()
        : thumbnail,
    mediaProvider: inferVideoMediaProvider(source.mediaProvider || playbackUrl),
    playbackUrl,
    hlsUrl: typeof source.hlsUrl === 'string' ? source.hlsUrl.trim() : '',
    aspectRatio: normalizeVideoAspectRatio(source.aspectRatio),
    captionUrl: typeof source.captionUrl === 'string' ? source.captionUrl.trim() : '',
    transcript: typeof source.transcript === 'string' ? source.transcript.trim() : '',
    processingStatus: normalizeVideoProcessingStatus(source.processingStatus),
    instagramUrl: typeof source.instagramUrl === 'string' ? source.instagramUrl.trim() : '',
    youtubeUrl: typeof source.youtubeUrl === 'string' ? source.youtubeUrl.trim() : '',
  };
}

async function readAllVideos(): Promise<StoredVideo[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed
          .map((item) => normalizeStoredVideo(item))
          .filter((item): item is StoredVideo => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

async function writeAllVideos(videos: StoredVideo[]) {
  await writeJsonFileAtomically(dataPath, videos);
}

export async function listStoredVideos(params: {
  category?: string | null;
  type?: string | null;
  published?: boolean;
  search?: string;
  sort?: string | null;
  workflowStatus?: string | null;
  limit: number;
  page: number;
}) {
  const { category, type, published, search, sort, workflowStatus, limit, page } = params;
  const all = await readAllVideos();

  let filtered = all;

  if (category && category !== 'all') {
    filtered = filtered.filter((item) => item.category === category);
  }

  if (type === 'shorts') {
    filtered = filtered.filter((item) => item.isShort);
  } else if (type === 'standard') {
    filtered = filtered.filter((item) => !item.isShort);
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
        item.description.toLowerCase().includes(normalizedSearch)
    );
  }

  if (sort === 'trending') {
    filtered.sort(
      (a, b) =>
        b.views - a.views ||
        new Date(b.updatedAt || b.publishedAt).getTime() -
          new Date(a.updatedAt || a.publishedAt).getTime()
    );
  } else if (sort === 'shorts' || type === 'shorts') {
    filtered.sort(
      (a, b) =>
        b.shortsRank - a.shortsRank ||
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

export async function listAllStoredVideos() {
  const all = await readAllVideos();
  return all.map((item) => ({
    ...item,
    createdAt: item.createdAt || item.publishedAt || new Date().toISOString(),
  }));
}

export async function getStoredVideoById(id: string) {
  const all = await readAllVideos();
  return all.find((item) => item._id === id) || null;
}

export async function createStoredVideo(input: CreateVideoInput) {
  const now = new Date().toISOString();
  const all = await readAllVideos();
  const isPublished = input.isPublished === false ? false : true;

  const id = createId();
  const requestedSlug = normalizeVideoSlug(input.slug);
  const baseSlug = requestedSlug || buildVideoSlug(input.title, id);
  const existingSlugs = new Set(all.map((item) => item.slug));
  if (requestedSlug && existingSlugs.has(requestedSlug)) {
    throw Object.assign(new Error('Video slug is already in use.'), { code: 11000 });
  }
  let slug = baseSlug;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug.slice(0, 170)}-${suffix}`;
    suffix += 1;
  }

  const playbackUrl = input.playbackUrl?.trim() || input.videoUrl;
  const video: StoredVideo = {
    _id: id,
    title: input.title,
    description: input.description,
    thumbnail: input.thumbnail,
    videoUrl: input.videoUrl,
    duration: input.duration,
    category: input.category,
    isShort: Boolean(input.isShort),
    isPublished,
    shortsRank: Number.isFinite(input.shortsRank) ? Number(input.shortsRank) : 0,
    views: Number.isFinite(input.views) ? Number(input.views) : 0,
    createdAt: input.createdAt || input.publishedAt || now,
    publishedAt: input.publishedAt || now,
    updatedAt: now,
    workflow: normalizeWorkflowMeta(input.workflow, isPublished),
    slug,
    articleId: input.articleId?.trim() || '',
    posterUrl: input.posterUrl?.trim() || input.thumbnail,
    mediaProvider: inferVideoMediaProvider(input.mediaProvider || playbackUrl),
    playbackUrl,
    hlsUrl: input.hlsUrl?.trim() || '',
    aspectRatio: normalizeVideoAspectRatio(input.aspectRatio),
    captionUrl: input.captionUrl?.trim() || '',
    transcript: input.transcript?.trim() || '',
    processingStatus: normalizeVideoProcessingStatus(input.processingStatus),
    instagramUrl: input.instagramUrl?.trim() || '',
    youtubeUrl: input.youtubeUrl?.trim() || '',
  };

  all.push(video);
  await writeAllVideos(all);
  return video;
}

export async function updateStoredVideo(
  id: string,
  updates: Partial<CreateVideoInput> & {
    publishedAt?: string;
    updatedAt?: string;
    workflow?: Partial<StoredWorkflowMeta>;
  }
) {
  const all = await readAllVideos();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return null;

  const current = all[index];
  const nextIsPublished =
    updates.isPublished !== undefined ? Boolean(updates.isPublished) : current.isPublished;

  const next: StoredVideo = {
    ...current,
    ...updates,
    isShort:
      updates.isShort !== undefined ? Boolean(updates.isShort) : current.isShort,
    isPublished: nextIsPublished,
    shortsRank:
      updates.shortsRank !== undefined && Number.isFinite(updates.shortsRank)
        ? Number(updates.shortsRank)
        : current.shortsRank,
    views:
      updates.views !== undefined && Number.isFinite(updates.views)
        ? Number(updates.views)
        : current.views,
    updatedAt: updates.updatedAt || new Date().toISOString(),
    workflow:
      updates.workflow !== undefined
        ? normalizeWorkflowMeta({ ...current.workflow, ...updates.workflow }, nextIsPublished)
        : current.workflow,
    slug:
      updates.slug !== undefined
        ? normalizeVideoSlug(updates.slug) || current.slug
        : current.slug,
    articleId: updates.articleId !== undefined ? updates.articleId.trim() : current.articleId,
    posterUrl: updates.posterUrl !== undefined ? updates.posterUrl.trim() : current.posterUrl,
    mediaProvider:
      updates.mediaProvider !== undefined
        ? inferVideoMediaProvider(updates.mediaProvider)
        : current.mediaProvider,
    playbackUrl:
      updates.playbackUrl !== undefined ? updates.playbackUrl.trim() : current.playbackUrl,
    hlsUrl: updates.hlsUrl !== undefined ? updates.hlsUrl.trim() : current.hlsUrl,
    aspectRatio:
      updates.aspectRatio !== undefined
        ? normalizeVideoAspectRatio(updates.aspectRatio)
        : current.aspectRatio,
    captionUrl:
      updates.captionUrl !== undefined ? updates.captionUrl.trim() : current.captionUrl,
    transcript:
      updates.transcript !== undefined ? updates.transcript.trim() : current.transcript,
    processingStatus:
      updates.processingStatus !== undefined
        ? normalizeVideoProcessingStatus(updates.processingStatus)
        : current.processingStatus,
    instagramUrl:
      updates.instagramUrl !== undefined ? updates.instagramUrl.trim() : current.instagramUrl,
    youtubeUrl:
      updates.youtubeUrl !== undefined ? updates.youtubeUrl.trim() : current.youtubeUrl,
  };

  if (all.some((item, itemIndex) => itemIndex !== index && item.slug === next.slug)) {
    throw Object.assign(new Error('Video slug is already in use.'), { code: 11000 });
  }

  all[index] = next;
  await writeAllVideos(all);
  return next;
}

export async function deleteStoredVideo(id: string) {
  const all = await readAllVideos();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return false;

  all.splice(index, 1);
  await writeAllVideos(all);
  return true;
}
