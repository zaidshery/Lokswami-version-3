import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import { type BreakingTtsMetadata, normalizeBreakingTtsMetadata } from '@/lib/types/breaking';
import {
  createEmptyCopyEditorMeta,
  createEmptyReporterMeta,
  normalizeCopyEditorMeta,
  normalizeReporterMeta,
  type CopyEditorMeta,
  type ReporterMeta,
} from '@/lib/content/newsroomMetadata';
import {
  normalizeArticleSourceType,
  type ArticleSourceType,
} from '@/lib/content/newsroomPublishing';
import {
  createEmptyArticleEditorialMeta,
  normalizeArticleEditorialMeta,
  type ArticleEditorialMeta,
} from '@/lib/content/articleEditorial';
import {
  createEmptyArticleMediaMetadata,
  normalizeArticleMediaMetadata,
  type ArticleMediaMetadata,
} from '@/lib/content/articleMediaMetadata';
import {
  normalizeArticleDocument,
  type ArticleDocument,
} from '@/lib/content/articleDocument';
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
import { resolveArticleOgImageUrl } from '@/lib/utils/articleMedia';
import {
  defaultArticleSeo,
  normalizeArticleSeo,
  normalizeArticleSlug,
  readArticleCanonicalEdit,
  validateEditedArticleCanonicalOverride,
  type ArticleSeoFields,
} from '@/lib/seo/articleSeo';

export type ArticleSeo = ArticleSeoFields;

export interface StoredArticleRevision {
  _id: string;
  title: string;
  summary: string;
  content: string;
  contentJson: ArticleDocument;
  image: string;
  category: string;
  author: string;
  slug: string;
  previousSlugs: string[];
  isBreaking: boolean;
  isTrending: boolean;
  seo: ArticleSeo;
  reporterMeta: ReporterMeta;
  copyEditorMeta: CopyEditorMeta;
  editorial: ArticleEditorialMeta;
  media: ArticleMediaMetadata;
  savedAt: string;
}

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

export interface StoredArticle {
  _id: string;
  version: number;
  title: string;
  summary: string;
  content: string;
  contentJson: ArticleDocument;
  image: string;
  category: string;
  author: string;
  slug: string;
  previousSlugs: string[];
  publishedAt: string;
  updatedAt: string;
  views: number;
  isBreaking: boolean;
  isTrending: boolean;
  seo: ArticleSeo;
  revisions: StoredArticleRevision[];
  breakingTts?: BreakingTtsMetadata | null;
  workflow: StoredWorkflowMeta;
  reporterMeta: ReporterMeta;
  copyEditorMeta: CopyEditorMeta;
  editorial: ArticleEditorialMeta;
  media: ArticleMediaMetadata;
  sourceType: ArticleSourceType;
  sourceStoryId: string;
  sourceStoryTitle: string;
}

export interface CreateArticleInput {
  title: string;
  summary: string;
  content: string;
  contentJson?: ArticleDocument;
  image: string;
  category: string;
  author: string;
  slug?: string;
  previousSlugs?: string[];
  isBreaking?: boolean;
  isTrending?: boolean;
  seo?: Partial<ArticleSeo>;
  workflow?: Partial<StoredWorkflowMeta>;
  reporterMeta?: Partial<ReporterMeta>;
  copyEditorMeta?: Partial<CopyEditorMeta>;
  editorial?: Partial<ArticleEditorialMeta>;
  media?: Partial<ArticleMediaMetadata>;
  sourceType?: ArticleSourceType;
  sourceStoryId?: string;
  sourceStoryTitle?: string;
}

type UpdateArticleInput = Partial<CreateArticleInput> & {
  views?: number;
  publishedAt?: string;
  slug?: string;
  previousSlugs?: string[];
  seo?: Partial<ArticleSeo>;
  breakingTts?: BreakingTtsMetadata | null;
  workflow?: Partial<StoredWorkflowMeta>;
  reporterMeta?: Partial<ReporterMeta>;
  copyEditorMeta?: Partial<CopyEditorMeta>;
  editorial?: Partial<ArticleEditorialMeta>;
  media?: Partial<ArticleMediaMetadata>;
};

type UpdateStoredArticleOptions = {
  skipRevision?: boolean;
  skipVersion?: boolean;
  expectedVersion?: number;
};

type DeleteStoredArticleOptions = {
  expectedVersion?: number;
};

export class ArticleVersionConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super('This article was updated in another session.');
    this.name = 'ArticleVersionConflictError';
    this.currentVersion = currentVersion;
  }
}

export class ArticleRevisionCanonicalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArticleRevisionCanonicalValidationError';
  }
}

export function isArticleVersionConflictError(
  error: unknown
): error is ArticleVersionConflictError {
  return error instanceof ArticleVersionConflictError;
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'articles.json');
const MAX_STORED_REVISIONS = 30;
const USE_REMOTE_DEMO_MEDIA =
  process.env.NEXT_PUBLIC_USE_REMOTE_DEMO_MEDIA === 'true';
const UNSPLASH_IMAGE_HOST = /^https:\/\/images\.unsplash\.com\//i;
const LOCAL_NEWS_FALLBACK_IMAGE = '/placeholders/news-16x9.svg';
let articleMutationQueue: Promise<void> = Promise.resolve();

function runArticleMutation<T>(mutation: () => Promise<T>) {
  const result = articleMutationQueue.then(mutation);
  articleMutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptySeo(): ArticleSeo {
  return defaultArticleSeo();
}

function normalizeMediaUrl(input: unknown, fallback = LOCAL_NEWS_FALLBACK_IMAGE) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return fallback;
  if (!USE_REMOTE_DEMO_MEDIA && UNSPLASH_IMAGE_HOST.test(value)) {
    return fallback;
  }
  return value;
}

function normalizeSeo(input: unknown): ArticleSeo {
  const seo = normalizeArticleSeo(input);
  return {
    ...seo,
    ogImage: normalizeMediaUrl(seo.ogImage, ''),
  };
}

function normalizeSlugList(input: unknown) {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  input.forEach((item) => {
    const slug = typeof item === 'string' ? normalizeArticleSlug(item) : '';
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    output.push(slug);
  });
  return output;
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

function normalizeWorkflowMeta(input: unknown): StoredWorkflowMeta {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : {};
  const workflow = createWorkflowMeta({
    status: isWorkflowStatus(source.status) ? source.status : 'published',
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

function withSeoOgFallback(seo: ArticleSeo, image: string) {
  if (seo.ogImage || !image) return seo;
  return {
    ...seo,
    ogImage: resolveArticleOgImageUrl({ image }),
  };
}

function normalizeRevision(input: unknown): StoredArticleRevision | null {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const title = typeof source.title === 'string' ? source.title : '';
  const summary = typeof source.summary === 'string' ? source.summary : '';
  const content = typeof source.content === 'string' ? source.content : '';
  const image = normalizeMediaUrl(source.image);
  const category = typeof source.category === 'string' ? source.category : '';
  const author = typeof source.author === 'string' ? source.author : '';
  if (!title || !summary || !content || !image || !category || !author) {
    return null;
  }

  return {
    _id: typeof source._id === 'string' && source._id.trim() ? source._id : createId(),
    title,
    summary,
    content,
    contentJson: normalizeArticleDocument(source.contentJson, content),
    image,
    category,
    author,
    slug: normalizeArticleSlug(typeof source.slug === 'string' ? source.slug : ''),
    previousSlugs: normalizeSlugList(source.previousSlugs),
    isBreaking: Boolean(source.isBreaking),
    isTrending: Boolean(source.isTrending),
    seo: withSeoOgFallback(normalizeSeo(source.seo), image),
    reporterMeta: normalizeReporterMeta(source.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(source.copyEditorMeta),
    editorial: normalizeArticleEditorialMeta(source.editorial),
    media: normalizeArticleMediaMetadata(source.media),
    savedAt:
      typeof source.savedAt === 'string' && source.savedAt.trim()
        ? source.savedAt
        : new Date().toISOString(),
  };
}

function normalizeStoredArticle(input: unknown): StoredArticle | null {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : null;
  if (!source) return null;

  const workflow = normalizeWorkflowMeta(source.workflow);
  const title = typeof source.title === 'string' ? source.title : '';
  const summary = typeof source.summary === 'string' ? source.summary : '';
  const content = typeof source.content === 'string' ? source.content : '';
  const image = normalizeMediaUrl(
    source.image,
    workflow.status === 'draft' ? '' : LOCAL_NEWS_FALLBACK_IMAGE
  );
  const category = typeof source.category === 'string' ? source.category : '';
  const author = typeof source.author === 'string' ? source.author : '';
  const slug = normalizeArticleSlug(
    typeof source.slug === 'string' && source.slug.trim() ? source.slug : title
  );
  const previousSlugs = normalizeSlugList(source.previousSlugs).filter((item) => item !== slug);

  if (
    workflow.status !== 'draft' &&
    (!title || !summary || !content || !image || !category || !author)
  ) {
    return null;
  }

  const viewsRaw =
    typeof source.views === 'number' ? source.views : Number(source.views);

  const revisions = Array.isArray(source.revisions)
    ? source.revisions
        .map((revision) => normalizeRevision(revision))
        .filter((revision): revision is StoredArticleRevision => Boolean(revision))
        .slice(-MAX_STORED_REVISIONS)
    : [];

  return {
    _id: typeof source._id === 'string' && source._id.trim() ? source._id : createId(),
    version:
      typeof source.version === 'number' && Number.isInteger(source.version) && source.version > 0
        ? source.version
        : 1,
    title,
    summary,
    content,
    contentJson: normalizeArticleDocument(source.contentJson, content),
    image,
    category,
    author,
    slug,
    previousSlugs,
    isBreaking: Boolean(source.isBreaking),
    isTrending: Boolean(source.isTrending),
    views: Number.isFinite(viewsRaw) ? viewsRaw : 0,
    publishedAt:
      typeof source.publishedAt === 'string' && source.publishedAt.trim()
        ? source.publishedAt
        : new Date().toISOString(),
    updatedAt:
      typeof source.updatedAt === 'string' && source.updatedAt.trim()
        ? source.updatedAt
        : new Date().toISOString(),
    seo: withSeoOgFallback(normalizeSeo(source.seo), image),
    revisions,
    breakingTts: normalizeBreakingTtsMetadata(source.breakingTts),
    workflow,
    reporterMeta: normalizeReporterMeta(source.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(source.copyEditorMeta),
    editorial: normalizeArticleEditorialMeta(source.editorial),
    media: normalizeArticleMediaMetadata(source.media),
    sourceType: normalizeArticleSourceType(source.sourceType),
    sourceStoryId:
      typeof source.sourceStoryId === 'string' ? source.sourceStoryId.trim() : '',
    sourceStoryTitle:
      typeof source.sourceStoryTitle === 'string'
        ? source.sourceStoryTitle.trim()
        : '',
  };
}

function createRevisionSnapshot(article: StoredArticle): StoredArticleRevision {
  return {
    _id: createId(),
    title: article.title,
    summary: article.summary,
    content: article.content,
    contentJson: article.contentJson,
    image: article.image,
    category: article.category,
    author: article.author,
    slug: article.slug,
    previousSlugs: article.previousSlugs,
    isBreaking: article.isBreaking,
    isTrending: article.isTrending,
    seo: article.seo || emptySeo(),
    reporterMeta: article.reporterMeta || createEmptyReporterMeta(),
    copyEditorMeta: article.copyEditorMeta || createEmptyCopyEditorMeta(),
    editorial: article.editorial || createEmptyArticleEditorialMeta(),
    media: article.media || createEmptyArticleMediaMetadata(),
    savedAt: new Date().toISOString(),
  };
}

type ArticleStoreSnapshot = {
  articles: StoredArticle[];
  rawArticles: Record<string, unknown>[];
};

async function readArticleStore(
  options: { failOnReadError?: boolean } = {}
): Promise<ArticleStoreSnapshot> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    const rawArticles = Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null
        )
      : [];
    return {
      articles: rawArticles
        .map((item) => normalizeStoredArticle(item))
        .filter((item): item is StoredArticle => Boolean(item)),
      rawArticles,
    };
  } catch (error) {
    if (
      options.failOnReadError &&
      !(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
    ) {
      throw error;
    }
    return { articles: [], rawArticles: [] };
  }
}

async function readAllArticles(options: { failOnReadError?: boolean } = {}) {
  return (await readArticleStore(options)).articles;
}

async function writeAllArticles(articles: StoredArticle[]) {
  await writeJsonFileAtomically(dataPath, articles);
}

export async function listStoredArticles(params: {
  category?: string | null;
  limit: number;
  page: number;
}) {
  const { category, limit, page } = params;
  const all = await readAllArticles();

  let filtered = all;
  if (category && category !== 'all') {
    filtered = filtered.filter((item) => item.category === category);
  }

  filtered.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  return { data, total: filtered.length };
}

export async function listAllStoredArticles() {
  return readAllArticles();
}

export async function getStoredArticleById(id: string) {
  const all = await readAllArticles();
  return all.find((item) => item._id === id) || null;
}

export async function getStoredArticleByIdStrict(id: string) {
  const all = await readAllArticles({ failOnReadError: true });
  return all.find((item) => item._id === id) || null;
}

export async function listStoredArticleResolutionRecords() {
  const all = await readAllArticles({ failOnReadError: true });
  return all.map((article) => ({
    _id: article._id,
    slug: article.slug,
    previousSlugs: article.previousSlugs,
    title: article.title,
    summary: article.summary,
    image: article.image,
    category: article.category,
    author: article.author,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    seo: article.seo,
    workflow: article.workflow,
  }));
}

export async function getStoredArticleByIdOrSlug(token: string) {
  const normalized = token.trim();
  if (!normalized) return null;

  const slug = normalizeArticleSlug(normalized);
  const all = await readAllArticles();
  return (
    all.find(
      (item) =>
        item._id === normalized ||
        (slug && (item.slug === slug || item.previousSlugs.includes(slug)))
    ) || null
  );
}

export async function findStoredArticleBySourceStoryId(sourceStoryId: string) {
  const normalized = sourceStoryId.trim();
  if (!normalized) return null;

  const all = await readAllArticles();
  return all.find((item) => item.sourceStoryId === normalized) || null;
}

export async function listStoredArticleRevisions(id: string) {
  const article = await getStoredArticleById(id);
  if (!article) return null;

  return [...article.revisions].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

async function createStoredArticleUnlocked(input: CreateArticleInput) {
  const now = new Date().toISOString();
  const all = await readAllArticles();

  const article: StoredArticle = {
    _id: createId(),
    version: 1,
    title: input.title,
    summary: input.summary,
    content: input.content,
    contentJson: normalizeArticleDocument(input.contentJson, input.content),
    image: normalizeMediaUrl(
      input.image,
      input.workflow?.status === 'draft' ? '' : LOCAL_NEWS_FALLBACK_IMAGE
    ),
    category: input.category,
    author: input.author,
    slug: normalizeArticleSlug(input.slug || input.title),
    previousSlugs: normalizeSlugList(input.previousSlugs),
    isBreaking: Boolean(input.isBreaking),
    isTrending: Boolean(input.isTrending),
    views: 0,
    publishedAt: now,
    updatedAt: now,
    seo: withSeoOgFallback(
      normalizeSeo(input.seo),
      normalizeMediaUrl(
        input.image,
        input.workflow?.status === 'draft' ? '' : LOCAL_NEWS_FALLBACK_IMAGE
      )
    ),
    revisions: [],
    breakingTts: null,
    workflow: normalizeWorkflowMeta(input.workflow),
    reporterMeta: normalizeReporterMeta(input.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(input.copyEditorMeta),
    editorial: normalizeArticleEditorialMeta(input.editorial),
    media: normalizeArticleMediaMetadata(input.media),
    sourceType: normalizeArticleSourceType(input.sourceType),
    sourceStoryId:
      typeof input.sourceStoryId === 'string' ? input.sourceStoryId.trim() : '',
    sourceStoryTitle:
      typeof input.sourceStoryTitle === 'string'
        ? input.sourceStoryTitle.trim()
        : '',
  };

  all.push(article);
  await writeAllArticles(all);
  return article;
}

export function createStoredArticle(input: CreateArticleInput) {
  return runArticleMutation(() => createStoredArticleUnlocked(input));
}

async function updateStoredArticleUnlocked(
  id: string,
  updates: UpdateArticleInput,
  options?: UpdateStoredArticleOptions
) {
  const all = await readAllArticles();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return null;

  const current = all[index];
  if (
    options?.expectedVersion !== undefined &&
    current.version !== options.expectedVersion
  ) {
    throw new ArticleVersionConflictError(current.version);
  }
  const nextSeo =
    updates.seo !== undefined
      ? normalizeSeo({ ...current.seo, ...updates.seo })
      : current.seo;

  const nextImage =
    updates.image !== undefined
      ? normalizeMediaUrl(
          updates.image,
          current.workflow.status === 'draft' ? '' : LOCAL_NEWS_FALLBACK_IMAGE
        )
      : current.image;

  const next: StoredArticle = {
    ...current,
    ...updates,
    version: options?.skipVersion ? current.version : current.version + 1,
    image: nextImage,
    contentJson:
      updates.contentJson !== undefined || updates.content !== undefined
        ? normalizeArticleDocument(updates.contentJson, String(updates.content ?? current.content))
        : current.contentJson,
    slug:
      updates.slug !== undefined
        ? normalizeArticleSlug(updates.slug)
        : current.slug,
    previousSlugs:
      updates.previousSlugs !== undefined
        ? normalizeSlugList(updates.previousSlugs)
        : current.previousSlugs,
    seo: withSeoOgFallback(nextSeo, nextImage),
    isBreaking:
      updates.isBreaking !== undefined ? updates.isBreaking : current.isBreaking,
    isTrending:
      updates.isTrending !== undefined ? updates.isTrending : current.isTrending,
    updatedAt: new Date().toISOString(),
    workflow:
      updates.workflow !== undefined
        ? normalizeWorkflowMeta({ ...current.workflow, ...updates.workflow })
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
    editorial:
      updates.editorial !== undefined
        ? normalizeArticleEditorialMeta({ ...current.editorial, ...updates.editorial })
        : current.editorial,
    media:
      updates.media !== undefined
        ? normalizeArticleMediaMetadata({
            ...current.media,
            ...updates.media,
            variants: {
              ...current.media.variants,
              ...(updates.media.variants || {}),
            },
          })
        : current.media,
    sourceType:
      updates.sourceType !== undefined
        ? normalizeArticleSourceType(updates.sourceType)
        : current.sourceType,
    sourceStoryId:
      typeof updates.sourceStoryId === 'string'
        ? updates.sourceStoryId.trim()
        : current.sourceStoryId,
    sourceStoryTitle:
      typeof updates.sourceStoryTitle === 'string'
        ? updates.sourceStoryTitle.trim()
        : current.sourceStoryTitle,
  };

  const hasContentChange =
    current.title !== next.title ||
    current.summary !== next.summary ||
    current.content !== next.content ||
    JSON.stringify(current.contentJson) !== JSON.stringify(next.contentJson) ||
    current.image !== next.image ||
    current.category !== next.category ||
    current.author !== next.author ||
    current.slug !== next.slug ||
    current.previousSlugs.join('|') !== next.previousSlugs.join('|') ||
    current.isBreaking !== next.isBreaking ||
    current.isTrending !== next.isTrending ||
    current.seo.metaTitle !== next.seo.metaTitle ||
    current.seo.metaDescription !== next.seo.metaDescription ||
    current.seo.ogImage !== next.seo.ogImage ||
    current.seo.canonicalUrl !== next.seo.canonicalUrl ||
    current.seo.focusKeyword !== next.seo.focusKeyword ||
    current.seo.secondaryKeywords !== next.seo.secondaryKeywords ||
    current.seo.featuredImageAlt !== next.seo.featuredImageAlt ||
    current.seo.featuredImageCaption !== next.seo.featuredImageCaption ||
    current.seo.imageCredit !== next.seo.imageCredit ||
    current.seo.authorProfileUrl !== next.seo.authorProfileUrl ||
    current.seo.authorDisplayName !== next.seo.authorDisplayName ||
    current.seo.authorAvatarUrl !== next.seo.authorAvatarUrl ||
    current.seo.authorProgramName !== next.seo.authorProgramName ||
    current.seo.includeInNewsSitemap !== next.seo.includeInNewsSitemap ||
    current.seo.majorUpdateNote !== next.seo.majorUpdateNote ||
    current.reporterMeta.locationTag !== next.reporterMeta.locationTag ||
    current.reporterMeta.sourceInfo !== next.reporterMeta.sourceInfo ||
    current.reporterMeta.sourceConfidential !== next.reporterMeta.sourceConfidential ||
    current.reporterMeta.reporterNotes !== next.reporterMeta.reporterNotes ||
    current.copyEditorMeta.proofreadComplete !== next.copyEditorMeta.proofreadComplete ||
    current.copyEditorMeta.factCheckStatus !== next.copyEditorMeta.factCheckStatus ||
    current.copyEditorMeta.headlineStatus !== next.copyEditorMeta.headlineStatus ||
    current.copyEditorMeta.imageOptimizationStatus !== next.copyEditorMeta.imageOptimizationStatus ||
    current.copyEditorMeta.copyEditorNotes !== next.copyEditorMeta.copyEditorNotes ||
    current.copyEditorMeta.returnForChangesReason !==
      next.copyEditorMeta.returnForChangesReason ||
    JSON.stringify(current.editorial) !== JSON.stringify(next.editorial) ||
    JSON.stringify(current.media) !== JSON.stringify(next.media);

  if (hasContentChange && !options?.skipRevision) {
    const snapshot = createRevisionSnapshot(current);
    next.revisions = [...current.revisions, snapshot].slice(-MAX_STORED_REVISIONS);
  } else {
    next.revisions = current.revisions;
  }

  all[index] = next;
  await writeAllArticles(all);
  return next;
}

export function updateStoredArticle(
  id: string,
  updates: UpdateArticleInput,
  options?: UpdateStoredArticleOptions
) {
  return runArticleMutation(() => updateStoredArticleUnlocked(id, updates, options));
}

async function restoreStoredArticleRevisionUnlocked(
  id: string,
  revisionId: string
) {
  const store = await readArticleStore();
  const all = store.articles;
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return null;

  const current = all[index];
  const revision = current.revisions.find((item) => item._id === revisionId);
  if (!revision) return null;

  const rawCurrent = store.rawArticles.find((item) => String(item._id || '') === id);
  const rawRevision = Array.isArray(rawCurrent?.revisions)
    ? rawCurrent.revisions.find(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          String((item as Record<string, unknown>)._id || '') === revisionId
      )
    : undefined;
  if (!rawRevision) return null;

  const snapshot = createRevisionSnapshot(current);
  const revisionSlug = normalizeArticleSlug(revision.slug);
  const slugConflict =
    Boolean(revisionSlug && revisionSlug !== current.slug) &&
    all.some(
      (item, itemIndex) =>
        itemIndex !== index &&
        (item.slug === revisionSlug || item.previousSlugs.includes(revisionSlug))
    );
  const restoredSlug = revisionSlug && !slugConflict ? revisionSlug : current.slug;
  const restoredPreviousSlugs = new Set(current.previousSlugs);
  if (revisionSlug && !slugConflict) {
    revision.previousSlugs.forEach((slug) => restoredPreviousSlugs.add(slug));
    if (current.slug && current.slug !== restoredSlug) {
      restoredPreviousSlugs.add(current.slug);
    }
  }
  restoredPreviousSlugs.delete(restoredSlug);
  const canonicalEdit = readArticleCanonicalEdit(rawRevision.seo);
  const canonicalError = validateEditedArticleCanonicalOverride(
    canonicalEdit,
    current.seo.canonicalUrl,
    { id, slug: restoredSlug }
  );
  if (canonicalError) throw new ArticleRevisionCanonicalValidationError(canonicalError);
  const restoredSeo = normalizeSeo(revision.seo);
  if (canonicalEdit.kind === 'omitted') {
    restoredSeo.canonicalUrl = current.seo.canonicalUrl;
  }
  const restored: StoredArticle = {
    ...current,
    version: current.version + 1,
    title: revision.title,
    summary: revision.summary,
    content: revision.content,
    contentJson: normalizeArticleDocument(revision.contentJson, revision.content),
    image: revision.image,
    category: revision.category,
    author: revision.author,
    slug: restoredSlug,
    previousSlugs: Array.from(restoredPreviousSlugs),
    isBreaking: revision.isBreaking,
    isTrending: revision.isTrending,
    seo: restoredSeo,
    reporterMeta: normalizeReporterMeta(revision.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(revision.copyEditorMeta),
    editorial: normalizeArticleEditorialMeta(revision.editorial),
    media: normalizeArticleMediaMetadata(revision.media),
    updatedAt: new Date().toISOString(),
    revisions: [...current.revisions, snapshot].slice(-MAX_STORED_REVISIONS),
  };

  all[index] = restored;
  await writeAllArticles(all);
  return restored;
}

export function restoreStoredArticleRevision(id: string, revisionId: string) {
  return runArticleMutation(() =>
    restoreStoredArticleRevisionUnlocked(id, revisionId)
  );
}

async function deleteStoredArticleUnlocked(
  id: string,
  options?: DeleteStoredArticleOptions
) {
  const all = await readAllArticles();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return false;

  const current = all[index];
  if (
    options?.expectedVersion !== undefined &&
    current.version !== options.expectedVersion
  ) {
    throw new ArticleVersionConflictError(current.version);
  }

  all.splice(index, 1);
  await writeAllArticles(all);
  return true;
}

export function deleteStoredArticle(id: string, options?: DeleteStoredArticleOptions) {
  return runArticleMutation(() => deleteStoredArticleUnlocked(id, options));
}
