import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import {
  normalizeSocialAutomationProvider,
  normalizeSocialPlatform,
  normalizeSocialPostStatus,
  type SocialPlatform,
  type SocialPostRecord,
  type SocialPostStatus,
} from '@/lib/content/newsroomPublishing';
import type { WorkflowActorRef } from '@/lib/workflow/types';

type CreateSocialPostInput = Omit<
  SocialPostRecord,
  '_id' | 'createdAt' | 'updatedAt'
>;

type UpdateSocialPostInput = Partial<CreateSocialPostInput>;

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'social-posts.json');

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

function normalizeActor(value: unknown): WorkflowActorRef | null {
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
    role: role as WorkflowActorRef['role'],
  };
}

function normalizeSocialPost(input: unknown): SocialPostRecord | null {
  const source =
    typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const sourceStoryId =
    typeof source.sourceStoryId === 'string' ? source.sourceStoryId.trim() : '';
  const sourceArticleId =
    typeof source.sourceArticleId === 'string' ? source.sourceArticleId.trim() : '';
  const videoUrl = typeof source.videoUrl === 'string' ? source.videoUrl.trim() : '';

  if (!sourceStoryId || !videoUrl) return null;

  return {
    _id: typeof source._id === 'string' && source._id.trim() ? source._id : createId(),
    sourceStoryId,
    sourceArticleId,
    platform: normalizeSocialPlatform(source.platform),
    status: normalizeSocialPostStatus(source.status),
    caption: typeof source.caption === 'string' ? source.caption.trim() : '',
    hashtags: typeof source.hashtags === 'string' ? source.hashtags.trim() : '',
    thumbnailUrl:
      typeof source.thumbnailUrl === 'string' ? source.thumbnailUrl.trim() : '',
    videoUrl,
    scheduledAt: normalizeOptionalDateString(source.scheduledAt),
    publishedAt: normalizeOptionalDateString(source.publishedAt),
    externalPostId:
      typeof source.externalPostId === 'string' ? source.externalPostId.trim() : '',
    externalUrl:
      typeof source.externalUrl === 'string' ? source.externalUrl.trim() : '',
    lastError: typeof source.lastError === 'string' ? source.lastError.trim() : '',
    automationProvider: normalizeSocialAutomationProvider(source.automationProvider),
    automationDispatchedAt: normalizeOptionalDateString(source.automationDispatchedAt),
    automationExecutionId:
      typeof source.automationExecutionId === 'string'
        ? source.automationExecutionId.trim()
        : '',
    automationExecutionUrl:
      typeof source.automationExecutionUrl === 'string'
        ? source.automationExecutionUrl.trim()
        : '',
    createdAt:
      normalizeOptionalDateString(source.createdAt) || new Date().toISOString(),
    updatedAt:
      normalizeOptionalDateString(source.updatedAt) || new Date().toISOString(),
    createdBy: normalizeActor(source.createdBy),
  };
}

async function readAllSocialPosts(): Promise<SocialPostRecord[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => normalizeSocialPost(entry))
          .filter((entry): entry is SocialPostRecord => Boolean(entry))
      : [];
  } catch {
    return [];
  }
}

async function writeAllSocialPosts(posts: SocialPostRecord[]) {
  await writeJsonFileAtomically(dataPath, posts);
}

export async function listStoredSocialPosts(filters?: {
  storyId?: string;
  articleId?: string;
  platform?: SocialPlatform | 'all';
  status?: SocialPostStatus | 'all';
}) {
  const all = await readAllSocialPosts();
  const next = all
    .filter((post) => (filters?.storyId ? post.sourceStoryId === filters.storyId : true))
    .filter((post) =>
      filters?.articleId ? post.sourceArticleId === filters.articleId : true
    )
    .filter((post) =>
      filters?.platform && filters.platform !== 'all'
        ? post.platform === filters.platform
        : true
    )
    .filter((post) =>
      filters?.status && filters.status !== 'all' ? post.status === filters.status : true
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );

  return next;
}

export async function getStoredSocialPostById(id: string) {
  const all = await readAllSocialPosts();
  return all.find((entry) => entry._id === id) || null;
}

export async function getStoredSocialPostByStoryAndPlatform(
  storyId: string,
  platform: SocialPlatform
) {
  const all = await readAllSocialPosts();
  return (
    all.find(
      (entry) => entry.sourceStoryId === storyId && entry.platform === platform
    ) || null
  );
}

export async function createStoredSocialPost(input: CreateSocialPostInput) {
  const now = new Date().toISOString();
  const all = await readAllSocialPosts();
  const record: SocialPostRecord = {
    _id: createId(),
    sourceStoryId: input.sourceStoryId.trim(),
    sourceArticleId: input.sourceArticleId.trim(),
    platform: normalizeSocialPlatform(input.platform),
    status: normalizeSocialPostStatus(input.status),
    caption: input.caption.trim(),
    hashtags: input.hashtags.trim(),
    thumbnailUrl: input.thumbnailUrl.trim(),
    videoUrl: input.videoUrl.trim(),
    scheduledAt: normalizeOptionalDateString(input.scheduledAt),
    publishedAt: normalizeOptionalDateString(input.publishedAt),
    externalPostId: input.externalPostId.trim(),
    externalUrl: input.externalUrl.trim(),
    lastError: input.lastError.trim(),
    automationProvider: normalizeSocialAutomationProvider(input.automationProvider),
    automationDispatchedAt: normalizeOptionalDateString(input.automationDispatchedAt),
    automationExecutionId: input.automationExecutionId.trim(),
    automationExecutionUrl: input.automationExecutionUrl.trim(),
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  all.push(record);
  await writeAllSocialPosts(all);
  return record;
}

export async function upsertStoredSocialPostByStoryAndPlatform(
  storyId: string,
  platform: SocialPlatform,
  input: UpdateSocialPostInput & {
    sourceStoryId: string;
    videoUrl: string;
  }
) {
  const all = await readAllSocialPosts();
  const index = all.findIndex(
    (entry) => entry.sourceStoryId === storyId && entry.platform === platform
  );

  if (index === -1) {
    const created = await createStoredSocialPost({
      sourceStoryId: input.sourceStoryId,
      sourceArticleId: input.sourceArticleId || '',
      platform,
      status: input.status || 'draft',
      caption: input.caption || '',
      hashtags: input.hashtags || '',
      thumbnailUrl: input.thumbnailUrl || '',
      videoUrl: input.videoUrl,
      scheduledAt: input.scheduledAt || null,
      publishedAt: input.publishedAt || null,
      externalPostId: input.externalPostId || '',
      externalUrl: input.externalUrl || '',
      lastError: input.lastError || '',
      automationProvider: input.automationProvider || 'manual',
      automationDispatchedAt: input.automationDispatchedAt || null,
      automationExecutionId: input.automationExecutionId || '',
      automationExecutionUrl: input.automationExecutionUrl || '',
      createdBy: input.createdBy || null,
    });
    return created;
  }

  const current = all[index];
  const next: SocialPostRecord = {
    ...current,
    ...input,
    platform,
    status:
      input.status !== undefined
        ? normalizeSocialPostStatus(input.status)
        : current.status,
    scheduledAt:
      input.scheduledAt !== undefined
        ? normalizeOptionalDateString(input.scheduledAt)
        : current.scheduledAt,
    publishedAt:
      input.publishedAt !== undefined
        ? normalizeOptionalDateString(input.publishedAt)
        : current.publishedAt,
    updatedAt: new Date().toISOString(),
    sourceStoryId: input.sourceStoryId.trim(),
    sourceArticleId:
      typeof input.sourceArticleId === 'string'
        ? input.sourceArticleId.trim()
        : current.sourceArticleId,
    caption:
      typeof input.caption === 'string' ? input.caption.trim() : current.caption,
    hashtags:
      typeof input.hashtags === 'string'
        ? input.hashtags.trim()
        : current.hashtags,
    thumbnailUrl:
      typeof input.thumbnailUrl === 'string'
        ? input.thumbnailUrl.trim()
        : current.thumbnailUrl,
    videoUrl:
      typeof input.videoUrl === 'string' ? input.videoUrl.trim() : current.videoUrl,
    externalPostId:
      typeof input.externalPostId === 'string'
        ? input.externalPostId.trim()
        : current.externalPostId,
    externalUrl:
      typeof input.externalUrl === 'string'
        ? input.externalUrl.trim()
        : current.externalUrl,
    lastError:
      typeof input.lastError === 'string'
        ? input.lastError.trim()
        : current.lastError,
    automationProvider:
      input.automationProvider !== undefined
        ? normalizeSocialAutomationProvider(input.automationProvider)
        : current.automationProvider,
    automationDispatchedAt:
      input.automationDispatchedAt !== undefined
        ? normalizeOptionalDateString(input.automationDispatchedAt)
        : current.automationDispatchedAt,
    automationExecutionId:
      typeof input.automationExecutionId === 'string'
        ? input.automationExecutionId.trim()
        : current.automationExecutionId,
    automationExecutionUrl:
      typeof input.automationExecutionUrl === 'string'
        ? input.automationExecutionUrl.trim()
        : current.automationExecutionUrl,
    createdBy: input.createdBy !== undefined ? input.createdBy : current.createdBy,
  };

  all[index] = next;
  await writeAllSocialPosts(all);
  return next;
}

export async function updateStoredSocialPost(id: string, updates: UpdateSocialPostInput) {
  const all = await readAllSocialPosts();
  const index = all.findIndex((entry) => entry._id === id);
  if (index === -1) return null;

  const current = all[index];
  const next: SocialPostRecord = {
    ...current,
    ...updates,
    platform:
      updates.platform !== undefined
        ? normalizeSocialPlatform(updates.platform)
        : current.platform,
    status:
      updates.status !== undefined
        ? normalizeSocialPostStatus(updates.status)
        : current.status,
    scheduledAt:
      updates.scheduledAt !== undefined
        ? normalizeOptionalDateString(updates.scheduledAt)
        : current.scheduledAt,
    publishedAt:
      updates.publishedAt !== undefined
        ? normalizeOptionalDateString(updates.publishedAt)
        : current.publishedAt,
    updatedAt: new Date().toISOString(),
    sourceStoryId:
      typeof updates.sourceStoryId === 'string'
        ? updates.sourceStoryId.trim()
        : current.sourceStoryId,
    sourceArticleId:
      typeof updates.sourceArticleId === 'string'
        ? updates.sourceArticleId.trim()
        : current.sourceArticleId,
    caption:
      typeof updates.caption === 'string' ? updates.caption.trim() : current.caption,
    hashtags:
      typeof updates.hashtags === 'string'
        ? updates.hashtags.trim()
        : current.hashtags,
    thumbnailUrl:
      typeof updates.thumbnailUrl === 'string'
        ? updates.thumbnailUrl.trim()
        : current.thumbnailUrl,
    videoUrl:
      typeof updates.videoUrl === 'string' ? updates.videoUrl.trim() : current.videoUrl,
    externalPostId:
      typeof updates.externalPostId === 'string'
        ? updates.externalPostId.trim()
        : current.externalPostId,
    externalUrl:
      typeof updates.externalUrl === 'string'
        ? updates.externalUrl.trim()
        : current.externalUrl,
    lastError:
      typeof updates.lastError === 'string'
        ? updates.lastError.trim()
        : current.lastError,
    automationProvider:
      updates.automationProvider !== undefined
        ? normalizeSocialAutomationProvider(updates.automationProvider)
        : current.automationProvider,
    automationDispatchedAt:
      updates.automationDispatchedAt !== undefined
        ? normalizeOptionalDateString(updates.automationDispatchedAt)
        : current.automationDispatchedAt,
    automationExecutionId:
      typeof updates.automationExecutionId === 'string'
        ? updates.automationExecutionId.trim()
        : current.automationExecutionId,
    automationExecutionUrl:
      typeof updates.automationExecutionUrl === 'string'
        ? updates.automationExecutionUrl.trim()
        : current.automationExecutionUrl,
    createdBy: updates.createdBy !== undefined ? updates.createdBy : current.createdBy,
  };

  all[index] = next;
  await writeAllSocialPosts(all);
  return next;
}
