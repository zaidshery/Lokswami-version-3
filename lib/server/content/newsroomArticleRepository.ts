import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import Article from '@/lib/models/Article';
import User from '@/lib/models/User';
import { isAdminRole } from '@/lib/auth/roles';
import {
  createStoredArticle,
  deleteStoredArticle,
  getStoredArticleById,
  isArticleVersionConflictError,
  listAllStoredArticles,
  restoreStoredArticleRevision,
  updateStoredArticle,
} from '@/lib/storage/articlesFile';
import {
  ArticleNotFoundError,
  ArticleVersionConflictError,
  InvalidArticleIdError,
  MongoAssignmentUnavailableError,
  type AssigneeRef,
  type NewsroomArticleStore,
  type PersistedArticleRecord,
  type RevisionSnapshot,
} from './newsroomArticleTypes';

export function hasPersistedArticleVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function resolveArticleVersion(value: unknown): number {
  return hasPersistedArticleVersion(value) ? value : 1;
}

export function buildArticleVersionMatch(expectedVersion: number): Record<string, unknown> {
  return expectedVersion === 1
    ? { $or: [{ version: 1 }, { version: { $exists: false } }] }
    : { version: expectedVersion };
}

export async function shouldUseFileStore(): Promise<boolean> {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for newsroom article repository, using file store.', error);
    return true;
  }
}

export async function resolveNewsroomArticleStore(): Promise<NewsroomArticleStore> {
  const useFile = await shouldUseFileStore();
  return useFile ? 'file' : 'mongo';
}

export async function findArticleById(
  id: string,
  store?: NewsroomArticleStore
): Promise<PersistedArticleRecord | null> {
  const effectiveStore: NewsroomArticleStore = store ?? (await resolveNewsroomArticleStore());
  if (effectiveStore === 'file') {
    const stored = await getStoredArticleById(id);
    return (stored as unknown as PersistedArticleRecord) || null;
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new InvalidArticleIdError('Invalid article ID');
  }

  await connectDB();
  const article = await Article.findById(id).lean();
  return (article as unknown as PersistedArticleRecord) || null;
}

export async function listAllNewsroomArticles(
  query: { category?: string | null },
  store?: NewsroomArticleStore
): Promise<{
  articles: PersistedArticleRecord[];
  source: 'mongo' | 'file';
}> {
  const effectiveStore: NewsroomArticleStore = store ?? (await resolveNewsroomArticleStore());
  const getStored = async () => {
    const all = await listAllStoredArticles();
    return {
      articles: all as unknown as PersistedArticleRecord[],
      source: 'file' as const,
    };
  };

  if (effectiveStore === 'file') {
    return getStored();
  }

  const filter: Record<string, unknown> = {};
  if (query.category && query.category !== 'all') {
    filter.category = query.category;
  }

  try {
    const mongoArticles = await Article.find(filter)
      .select(
        '_id id title slug previousSlugs version category author image views isBreaking isTrending publishedAt updatedAt workflow sourceType sourceStoryId sourceStoryTitle breakingTts'
      )
      .sort({ updatedAt: -1, publishedAt: -1, _id: -1 })
      .maxTimeMS(8000)
      .lean();

    if (!mongoArticles || mongoArticles.length === 0) {
      return getStored();
    }

    return {
      articles: mongoArticles as unknown as PersistedArticleRecord[],
      source: 'mongo',
    };
  } catch (error) {
    console.error('MongoDB articles query failed or timed out, falling back to file store:', error);
    return getStored();
  }
}

export async function createNewsroomArticle(
  data: Record<string, unknown>,
  store?: NewsroomArticleStore
): Promise<PersistedArticleRecord> {
  const effectiveStore: NewsroomArticleStore = store ?? (await resolveNewsroomArticleStore());
  if (effectiveStore === 'file') {
    const created = await createStoredArticle(data as unknown as Parameters<typeof createStoredArticle>[0]);
    return created as unknown as PersistedArticleRecord;
  }

  await connectDB();
  const created = await Article.create(data);
  return (typeof created.toObject === 'function' ? created.toObject() : created) as PersistedArticleRecord;
}

export async function updateNewsroomArticleWithCas(
  id: string,
  updates: Record<string, unknown>,
  options: {
    expectedVersion?: number | null;
    forceCas?: boolean;
    skipRevision?: boolean;
    revisionSnapshot?: RevisionSnapshot | null;
    currentRecord?: PersistedArticleRecord | null;
    store?: NewsroomArticleStore;
  } = {}
): Promise<PersistedArticleRecord> {
  const effectiveStore: NewsroomArticleStore = options.store ?? (await resolveNewsroomArticleStore());
  if (effectiveStore === 'file') {
    const currentArticle = options.currentRecord ?? (await getStoredArticleById(id));
    if (!currentArticle) {
      throw new ArticleNotFoundError();
    }

    const currentVersion = resolveArticleVersion(currentArticle.version);
    if (
      options.expectedVersion !== undefined &&
      options.expectedVersion !== null &&
      options.expectedVersion !== currentVersion
    ) {
      throw new ArticleVersionConflictError(currentVersion, currentArticle.updatedAt);
    }

    const targetExpectedVersion =
      options.expectedVersion !== undefined && options.expectedVersion !== null
        ? options.expectedVersion
        : options.forceCas
          ? currentVersion
          : undefined;

    const hasFileOptions = options.skipRevision || targetExpectedVersion !== undefined;
    const fileOptions = hasFileOptions
      ? {
          ...(options.skipRevision ? { skipRevision: true } : {}),
          ...(targetExpectedVersion !== undefined ? { expectedVersion: targetExpectedVersion } : {}),
        }
      : undefined;

    try {
      const updated = fileOptions
        ? await updateStoredArticle(id, updates as Parameters<typeof updateStoredArticle>[1], fileOptions)
        : await updateStoredArticle(id, updates as Parameters<typeof updateStoredArticle>[1]);

      if (!updated) {
        throw new ArticleNotFoundError();
      }

      return updated as unknown as PersistedArticleRecord;
    } catch (error) {
      if (isArticleVersionConflictError(error)) {
        throw new ArticleVersionConflictError(
          (error as { currentVersion?: number }).currentVersion ?? currentVersion,
          currentArticle.updatedAt
        );
      }
      throw error;
    }
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new InvalidArticleIdError('Invalid article ID');
  }

  await connectDB();
  const current =
    options.currentRecord ??
    ((await Article.findById(id).lean()) as PersistedArticleRecord | null);
  if (!current) {
    throw new ArticleNotFoundError();
  }

  const currentVersion = resolveArticleVersion(current.version);
  if (
    options.expectedVersion !== undefined &&
    options.expectedVersion !== null &&
    options.expectedVersion !== currentVersion
  ) {
    throw new ArticleVersionConflictError(currentVersion, current.updatedAt);
  }

  const initializesLegacyVersion = !hasPersistedArticleVersion(current.version);
  const mongoUpdate = {
    $set: {
      ...updates,
      updatedAt: new Date(),
      ...(initializesLegacyVersion ? { version: currentVersion + 1 } : {}),
    },
    ...(!initializesLegacyVersion ? { $inc: { version: 1 } } : {}),
    ...(!options.skipRevision && options.revisionSnapshot
      ? { $push: { revisions: { $each: [options.revisionSnapshot], $slice: -30 } } }
      : {}),
  };

  const targetExpectedVersion =
    options.expectedVersion !== undefined && options.expectedVersion !== null
      ? options.expectedVersion
      : options.forceCas
        ? currentVersion
        : null;

  const filter =
    targetExpectedVersion !== null
      ? { _id: id, ...buildArticleVersionMatch(targetExpectedVersion) }
      : null;

  const updatedQuery = filter
    ? Article.findOneAndUpdate(filter, mongoUpdate, { new: true, runValidators: true })
    : Article.findByIdAndUpdate(id, mongoUpdate, { new: true, runValidators: true });

  const updated = typeof (updatedQuery as { lean?: unknown }).lean === 'function'
    ? await (updatedQuery as { lean: () => Promise<unknown> }).lean()
    : await updatedQuery;

  if (!updated) {
    if (targetExpectedVersion !== null) {
      const latest = (await Article.findById(id).lean()) as {
        version?: unknown;
        updatedAt?: Date | string | null;
      } | null;
      if (latest) {
        throw new ArticleVersionConflictError(
          resolveArticleVersion(latest.version),
          latest.updatedAt
        );
      }
    }
    throw new ArticleNotFoundError();
  }

  return (typeof (updated as { toObject?: () => unknown }).toObject === 'function'
    ? (updated as { toObject: () => unknown }).toObject()
    : updated) as PersistedArticleRecord;
}

export async function deleteNewsroomArticleWithCas(
  id: string,
  expectedVersion?: number | null,
  store?: NewsroomArticleStore
): Promise<PersistedArticleRecord> {
  const effectiveStore: NewsroomArticleStore = store ?? (await resolveNewsroomArticleStore());
  if (effectiveStore === 'file') {
    const current = await getStoredArticleById(id);
    if (!current) {
      throw new ArticleNotFoundError();
    }

    const currentVersion = resolveArticleVersion(current.version);
    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== currentVersion
    ) {
      throw new ArticleVersionConflictError(currentVersion, current.updatedAt);
    }

    try {
      const deleted = await deleteStoredArticle(id, {
        expectedVersion: currentVersion,
      });

      if (!deleted) {
        throw new ArticleNotFoundError();
      }

      return current as unknown as PersistedArticleRecord;
    } catch (error) {
      if (isArticleVersionConflictError(error)) {
        throw new ArticleVersionConflictError(
          (error as { currentVersion?: number }).currentVersion ?? currentVersion,
          current.updatedAt
        );
      }
      throw error;
    }
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new InvalidArticleIdError('Invalid article ID');
  }

  await connectDB();
  const current = (await Article.findById(id).lean()) as {
    version?: unknown;
    updatedAt?: Date | string | null;
  } | null;
  if (!current) {
    throw new ArticleNotFoundError();
  }

  const currentVersion = resolveArticleVersion(current.version);
  if (
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    expectedVersion !== currentVersion
  ) {
    throw new ArticleVersionConflictError(currentVersion, current.updatedAt);
  }

  const filter = {
    _id: id,
    ...buildArticleVersionMatch(currentVersion),
  };

  const deleteQuery = Article.findOneAndDelete(filter);
  const deleted = typeof (deleteQuery as { lean?: unknown }).lean === 'function'
    ? await (deleteQuery as { lean: () => Promise<unknown> }).lean()
    : await deleteQuery;

  if (!deleted) {
    const latest = (await Article.findById(id).lean()) as {
      version?: unknown;
      updatedAt?: Date | string | null;
    } | null;
    if (latest) {
      throw new ArticleVersionConflictError(
        resolveArticleVersion(latest.version),
        latest.updatedAt
      );
    }
    throw new ArticleNotFoundError();
  }

  return (typeof (deleted as { toObject?: () => unknown }).toObject === 'function'
    ? (deleted as { toObject: () => unknown }).toObject()
    : deleted) as PersistedArticleRecord;
}

export async function checkSlugConflict(
  slug: string,
  excludeId?: string,
  store?: NewsroomArticleStore
): Promise<boolean> {
  const effectiveStore: NewsroomArticleStore = store ?? (await resolveNewsroomArticleStore());
  if (effectiveStore === 'file') {
    const all = await listAllStoredArticles();
    return all.some((article) => {
      if (excludeId && (article._id === excludeId || (article as unknown as { id?: string }).id === excludeId)) {
        return false;
      }
      if (article.slug === slug) return true;
      if (Array.isArray(article.previousSlugs) && article.previousSlugs.includes(slug)) {
        return true;
      }
      return false;
    });
  }

  await connectDB();
  const query: Record<string, unknown> = {
    $or: [{ slug }, { previousSlugs: slug }],
  };
  if (excludeId && Types.ObjectId.isValid(excludeId)) {
    query._id = { $ne: excludeId };
  }

  const existing = await Article.exists(query);
  return Boolean(existing);
}

export async function getArticleRevisions(
  id: string,
  store?: NewsroomArticleStore
): Promise<{
  article: PersistedArticleRecord | null;
  revisions: Array<Record<string, unknown>>;
}> {
  const effectiveStore: NewsroomArticleStore = store ?? (await resolveNewsroomArticleStore());
  if (effectiveStore === 'file') {
    const article = await getStoredArticleById(id);
    if (!article) return { article: null, revisions: [] };

    const revisions = [...(article.revisions || [])].sort(
      (a, b) =>
        new Date(String(b.savedAt || '')).getTime() - new Date(String(a.savedAt || '')).getTime()
    );
    return {
      article: article as unknown as PersistedArticleRecord,
      revisions: revisions as unknown as Record<string, unknown>[],
    };
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new InvalidArticleIdError('Invalid article ID');
  }

  await connectDB();
  const article = (await Article.findById(id)
    .select('author workflow updatedAt publishedAt revisions')
    .lean()) as (Record<string, unknown> & {
    revisions?: Array<{ savedAt?: unknown }>;
  }) | null;

  if (!article) return { article: null, revisions: [] };

  const revisions = Array.isArray(article.revisions) ? [...article.revisions] : [];
  revisions.sort(
    (a, b) =>
      new Date(String(b.savedAt || '')).getTime() - new Date(String(a.savedAt || '')).getTime()
  );

  return {
    article: article as unknown as PersistedArticleRecord,
    revisions: revisions as unknown as Record<string, unknown>[],
  };
}

export async function restoreRevisionInStore(
  id: string,
  revisionId: string,
  updates: Record<string, unknown>,
  snapshot: RevisionSnapshot,
  hasStoredVersion: boolean,
  currentVersion: number,
  store?: NewsroomArticleStore
): Promise<PersistedArticleRecord | null> {
  const effectiveStore: NewsroomArticleStore = store ?? (await resolveNewsroomArticleStore());
  if (effectiveStore === 'file') {
    const restored = await restoreStoredArticleRevision(id, revisionId);
    return (restored as unknown as PersistedArticleRecord) || null;
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new InvalidArticleIdError('Invalid article ID');
  }

  await connectDB();
  const restored = await Article.findOneAndUpdate(
    {
      _id: id,
      version: hasStoredVersion ? currentVersion : { $exists: false },
    },
    {
      $set: updates,
      $inc: { version: hasStoredVersion ? 1 : 2 },
      $push: { revisions: { $each: [snapshot], $slice: -30 } },
    },
    { new: true, runValidators: true }
  );

  return (restored as unknown as PersistedArticleRecord) || null;
}

export async function resolveAssignee(assignedToId: string): Promise<AssigneeRef | null> {
  const normalized = assignedToId.trim();
  if (!normalized) return null;

  if (!process.env.MONGODB_URI?.trim()) {
    throw new MongoAssignmentUnavailableError();
  }

  await connectDB();
  const query = Types.ObjectId.isValid(normalized)
    ? { _id: normalized }
    : { email: normalized.toLowerCase() };

  const assignee = (await User.findOne(query).select('_id name email role').lean()) as {
    _id?: unknown;
    name?: unknown;
    email?: unknown;
    role?: unknown;
  } | null;
  if (!assignee || typeof assignee.role !== 'string' || assignee.role === 'reader' || !isAdminRole(assignee.role)) {
    return null;
  }

  return {
    id: String(assignee._id || ''),
    name: String(assignee.name || '').trim() || String(assignee.email || '').trim(),
    email: String(assignee.email || '').trim(),
    role: assignee.role,
  };
}
