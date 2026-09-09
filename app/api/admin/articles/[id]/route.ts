import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import Article from '@/lib/models/Article';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import User from '@/lib/models/User';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  createEmptyCopyEditorMeta,
  createEmptyReporterMeta,
  normalizeCopyEditorMeta,
  normalizeCopyEditorMetaPartial,
  normalizeReporterMeta,
  normalizeReporterMetaPartial,
  validateCopyEditorMeta,
  validateReporterMeta,
} from '@/lib/content/newsroomMetadata';
import { normalizeArticleSourceType } from '@/lib/content/newsroomPublishing';
import {
  normalizeArticleEditorialMeta,
  normalizeArticleEditorialMetaPartial,
  validateArticleEditorialMeta,
} from '@/lib/content/articleEditorial';
import {
  normalizeArticleMediaMetadata,
  validateArticleMediaMetadata,
} from '@/lib/content/articleMediaMetadata';
import { normalizeArticleDocument } from '@/lib/content/articleDocument';
import {
  canDeleteContent,
  canEditEpaper,
  canEditContent,
  canReadContent,
  canTransitionContent,
  canViewPage,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
import {
  deleteStoredBreakingAudio,
  resolveReusableBreakingTts,
} from '@/lib/server/breakingTts';
import {
  deleteStoredArticle,
  getStoredArticleById,
  isArticleVersionConflictError,
  listAllStoredArticles,
  updateStoredArticle,
} from '@/lib/storage/articlesFile';
import {
  buildArticleActivityMessage,
  recordArticleActivity,
} from '@/lib/server/articleActivity';
import { notifyWorkflowEvent } from '@/lib/server/workflowNotificationEvents';
import { applyEpaperWorkflowAutomation } from '@/lib/server/epaperWorkflowAutomation';
import {
  assertEpaperDraftEditable,
  invalidateEpaperQa,
} from '@/lib/server/epaperWorkflowPolicy';
import {
  clearStoryLinkedArticle,
  syncStoryLinkedArticle,
} from '@/lib/server/newsroomStoryLinks';
import {
  normalizeHotspot,
  resolveUniqueSlug,
  validateHotspot,
} from '@/lib/utils/epaperArticles';
import { isAllowedAssetPath } from '@/lib/utils/epaperStorage';
import { resolveArticleOgImageUrl } from '@/lib/utils/articleMedia';
import {
  buildArticleAssistResult,
  summarizeArticleReadiness,
} from '@/lib/utils/articleAssistant';
import {
  isValidArticleSlug,
  normalizeArticleSeo,
  normalizeArticleSlug,
  readArticleCanonicalEdit,
  resolveUniqueArticleSlug,
  validateEditedArticleCanonicalOverride,
  type ArticleSeoFields,
} from '@/lib/seo/articleSeo';
import {
  applyArticleWorkflowAction,
  resolveArticleWorkflow,
} from '@/lib/workflow/article';
import { validateFastPublish } from '@/lib/workflow/fastPublish';
import { isWorkflowPriority } from '@/lib/workflow/types';

type NormalizedSeo = {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  canonicalUrl: string;
  focusKeyword: string;
  secondaryKeywords: string;
  featuredImageAlt: string;
  featuredImageCaption: string;
  imageCredit: string;
  authorProfileUrl: string;
  authorDisplayName?: string;
  authorDisplayNameSet?: boolean;
  authorAvatarUrl?: string;
  authorProgramName?: string;
  includeInNewsSitemap: boolean;
  majorUpdateNote: string;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type LeanArticleRecord = Record<string, unknown> & {
  version?: number;
  author?: string;
  breakingTts?: { audioUrl?: string } | null;
  isBreaking?: boolean;
  revisions?: unknown[];
  workflow?: Record<string, unknown> | null;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  sourceType?: string;
  sourceStoryId?: string;
  sourceStoryTitle?: string;
};

const WORKFLOW_ACTIONS = new Set<ContentTransitionAction>([
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

type WorkflowActionBody = {
  action?: ContentTransitionAction;
  assignedToId?: string;
  scheduledFor?: string;
  dueAt?: string;
  priority?: string;
  rejectionReason?: string;
  comment?: string;
};

const BREAKING_AUDIO_REQUIRED_ERROR =
  'Upload breaking news audio before publishing this breaking article.';

function buildArticlePermissionRecord(article: {
  author?: unknown;
  workflow?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
}) {
  const workflow = resolveArticleWorkflow({
    workflow:
      typeof article.workflow === 'object' && article.workflow
        ? (article.workflow as Record<string, unknown>)
        : null,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
  });

  return {
    legacyAuthorName: typeof article.author === 'string' ? article.author : '',
    workflow,
  };
}

function toPlainArticleRecord(article: unknown) {
  if (article && typeof article === 'object' && typeof (article as { toObject?: unknown }).toObject === 'function') {
    return (article as { toObject: () => unknown }).toObject();
  }
  return article;
}

function isBreakingArticleMissingAudio(article: unknown) {
  const source = toPlainArticleRecord(article);
  if (!source || typeof source !== 'object') return false;
  return Boolean((source as Record<string, unknown>).isBreaking) && !resolveReusableBreakingTts(source);
}

function validateWorkflowReadiness(
  article: unknown,
  action: ContentTransitionAction
) {
  if (action !== 'submit' && action !== 'schedule' && action !== 'publish' && action !== 'fast_publish') {
    return null;
  }

  const plain = toPlainArticleRecord(article);
  const source =
    plain && typeof plain === 'object' ? (plain as Record<string, unknown>) : {};
  const reporterMeta =
    source.reporterMeta && typeof source.reporterMeta === 'object'
      ? (source.reporterMeta as Record<string, unknown>)
      : {};
  const result = buildArticleAssistResult({
    mode: 'edit',
    title: typeof source.title === 'string' ? source.title : '',
    summary: typeof source.summary === 'string' ? source.summary : '',
    content: typeof source.content === 'string' ? source.content : '',
    category: typeof source.category === 'string' ? source.category : '',
    author: typeof source.author === 'string' ? source.author : '',
    image: typeof source.image === 'string' ? source.image : '',
    seoSlug: typeof source.slug === 'string' ? source.slug : '',
    seo:
      source.seo && typeof source.seo === 'object'
        ? (source.seo as Partial<ArticleSeoFields>)
        : undefined,
    isBreaking: Boolean(source.isBreaking),
    isTrending: Boolean(source.isTrending),
    language: 'hi',
    breakingAudioReady:
      !Boolean(source.isBreaking) || Boolean(resolveReusableBreakingTts(source)),
    requireBreakingAudio: (action === 'publish' || action === 'fast_publish') && Boolean(source.isBreaking),
    sourceInfo:
      typeof reporterMeta.sourceInfo === 'string' ? reporterMeta.sourceInfo : '',
    locationTag:
      typeof reporterMeta.locationTag === 'string' ? reporterMeta.locationTag : '',
    sourceStoryId:
      typeof source.sourceStoryId === 'string' ? source.sourceStoryId : '',
    editorial: normalizeArticleEditorialMeta(source.editorial),
  });
  const summary = summarizeArticleReadiness(result.readiness);
  if (summary.canSend) return null;
  return `Article is not ready: ${summary.blockers.map((item) => item.label).join(', ')}`;
}

function resolveArticleResponse(
  article: (Record<string, unknown> & {
    author?: string;
    workflow?: unknown;
    publishedAt?: unknown;
    updatedAt?: unknown;
  }) | LeanArticleRecord
) {
  return {
    ...article,
    sourceType: normalizeArticleSourceType(article.sourceType),
    sourceStoryId:
      typeof article.sourceStoryId === 'string' ? article.sourceStoryId.trim() : '',
    sourceStoryTitle:
      typeof article.sourceStoryTitle === 'string'
        ? article.sourceStoryTitle.trim()
        : '',
    workflow: resolveArticleWorkflow({
      workflow:
        typeof article.workflow === 'object' && article.workflow
          ? (article.workflow as Record<string, unknown>)
          : null,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
    }),
  };
}

function isWorkflowAction(value: unknown): value is ContentTransitionAction {
  return typeof value === 'string' && WORKFLOW_ACTIONS.has(value as ContentTransitionAction);
}

function compactMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) return false;
      if (typeof entry === 'string') return entry.trim().length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    })
  );
}

function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseExpectedVersion(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasPersistedArticleVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function resolveArticleVersion(value: unknown) {
  return hasPersistedArticleVersion(value) ? value : 1;
}

function buildArticleVersionMatch(expectedVersion: number) {
  return expectedVersion === 1
    ? { $or: [{ version: 1 }, { version: { $exists: false } }] }
    : { version: expectedVersion };
}

function resolveNextBreakingTts(
  currentArticle: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  const currentReporterMeta =
    currentArticle.reporterMeta && typeof currentArticle.reporterMeta === 'object'
      ? (currentArticle.reporterMeta as Record<string, unknown>)
      : {};
  const reporterMetaUpdates =
    updates.reporterMeta && typeof updates.reporterMeta === 'object'
      ? (updates.reporterMeta as Record<string, unknown>)
      : {};
  const nextArticle: Record<string, unknown> = {
    ...currentArticle,
    ...updates,
    reporterMeta: {
      ...currentReporterMeta,
      ...reporterMetaUpdates,
    },
    breakingTts: currentArticle.breakingTts,
  };

  return nextArticle.isBreaking ? resolveReusableBreakingTts(nextArticle) : null;
}

function resolveBreakingAudioUrl(article: Record<string, unknown>) {
  const breakingTts =
    article.breakingTts && typeof article.breakingTts === 'object'
      ? (article.breakingTts as Record<string, unknown>)
      : null;
  return typeof breakingTts?.audioUrl === 'string' ? breakingTts.audioUrl : '';
}

function articleVersionConflictResponse(input: {
  currentVersion: number;
  updatedAt?: unknown;
}) {
  return NextResponse.json(
    {
      success: false,
      code: 'ARTICLE_VERSION_CONFLICT',
      error: 'This draft changed in another session. Reload or compare changes before saving.',
      currentVersion: input.currentVersion,
      updatedAt:
        input.updatedAt instanceof Date
          ? input.updatedAt.toISOString()
          : typeof input.updatedAt === 'string'
            ? input.updatedAt
            : null,
    },
    { status: 409 }
  );
}

function toStoredWorkflowUpdate(workflow: ReturnType<typeof resolveArticleWorkflow>) {
  return {
    ...workflow,
    submittedAt: workflow.submittedAt?.toISOString() || null,
    approvedAt: workflow.approvedAt?.toISOString() || null,
    rejectedAt: workflow.rejectedAt?.toISOString() || null,
    publishedAt: workflow.publishedAt?.toISOString() || null,
    scheduledFor: workflow.scheduledFor?.toISOString() || null,
    dueAt: workflow.dueAt?.toISOString() || null,
    comments: workflow.comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
    })),
  };
}

async function resolveAssignee(assignedToId: string) {
  const normalized = assignedToId.trim();
  if (!normalized) return null;

  const query = Types.ObjectId.isValid(normalized)
    ? { _id: normalized }
    : { email: normalized.toLowerCase() };
  const assignee = await User.findOne(query).select('_id name email role').lean();
  if (!assignee || typeof assignee.role !== 'string' || assignee.role === 'reader') {
    return null;
  }

  return {
    id: String(assignee._id || ''),
    name: String(assignee.name || '').trim() || String(assignee.email || '').trim(),
    email: String(assignee.email || '').trim(),
    role: assignee.role,
  };
}

function normalizeSeo(input: unknown): NormalizedSeo {
  return normalizeArticleSeo(input);
}

function normalizeSeoPartial(input: unknown): Partial<NormalizedSeo> {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : {};
  const partial: Partial<NormalizedSeo> = {};
  if (typeof source.metaTitle === 'string') partial.metaTitle = source.metaTitle.trim();
  if (typeof source.metaDescription === 'string') {
    partial.metaDescription = source.metaDescription.trim();
  }
  if (typeof source.ogImage === 'string') partial.ogImage = source.ogImage.trim();
  if (typeof source.canonicalUrl === 'string') partial.canonicalUrl = source.canonicalUrl.trim();
  if (typeof source.focusKeyword === 'string') partial.focusKeyword = source.focusKeyword.trim();
  if (typeof source.secondaryKeywords === 'string') {
    partial.secondaryKeywords = source.secondaryKeywords.trim();
  }
  if (typeof source.featuredImageAlt === 'string') {
    partial.featuredImageAlt = source.featuredImageAlt.trim();
  }
  if (typeof source.featuredImageCaption === 'string') {
    partial.featuredImageCaption = source.featuredImageCaption.trim();
  }
  if (typeof source.imageCredit === 'string') partial.imageCredit = source.imageCredit.trim();
  if (typeof source.authorProfileUrl === 'string') {
    partial.authorProfileUrl = source.authorProfileUrl.trim();
  }
  if (typeof source.authorDisplayName === 'string') {
    partial.authorDisplayName = source.authorDisplayName.trim();
  }
  if (typeof source.authorDisplayNameSet === 'boolean') {
    partial.authorDisplayNameSet = source.authorDisplayNameSet;
  }
  if (typeof source.authorAvatarUrl === 'string') {
    partial.authorAvatarUrl = source.authorAvatarUrl.trim();
  }
  if (typeof source.authorProgramName === 'string') {
    partial.authorProgramName = source.authorProgramName.trim();
  }
  if (typeof source.includeInNewsSitemap === 'boolean') {
    partial.includeInNewsSitemap = source.includeInNewsSitemap;
  }
  if (typeof source.majorUpdateNote === 'string') {
    partial.majorUpdateNote = source.majorUpdateNote.trim();
  }
  return partial;
}

function isValidAbsoluteHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for article id route, using file store.', error);
    return true;
  }
}

function normalizePartialInput(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const seo = normalizeSeoPartial(source.seo);
  const hasSeo = Object.keys(seo).length > 0;
  const reporterMeta = normalizeReporterMetaPartial(source.reporterMeta);
  const copyEditorMeta = normalizeCopyEditorMetaPartial(source.copyEditorMeta);
  const editorial = normalizeArticleEditorialMetaPartial(source.editorial);
  delete editorial.flagApprovedBy;
  const media =
    typeof source.media === 'object' && source.media
      ? normalizeArticleMediaMetadata(source.media)
      : null;
  const content = typeof source.content === 'string' ? source.content.trim() : undefined;
  const hasContentDocument = source.contentJson !== undefined || content !== undefined;
  return {
    ...(typeof source.title === 'string' ? { title: source.title.trim() } : {}),
    ...(typeof source.slug === 'string' ? { slug: source.slug.trim() } : {}),
    ...(Array.isArray(source.previousSlugs) ? { previousSlugs: source.previousSlugs } : {}),
    ...(typeof source.summary === 'string' ? { summary: source.summary.trim() } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(hasContentDocument
      ? { contentJson: normalizeArticleDocument(source.contentJson, content || '') }
      : {}),
    ...(typeof source.image === 'string' ? { image: source.image.trim() } : {}),
    ...(typeof source.category === 'string' ? { category: source.category.trim() } : {}),
    ...(typeof source.author === 'string' ? { author: source.author.trim() } : {}),
    ...(source.isBreaking !== undefined ? { isBreaking: Boolean(source.isBreaking) } : {}),
    ...(source.isTrending !== undefined ? { isTrending: Boolean(source.isTrending) } : {}),
    ...(hasSeo ? { seo } : {}),
    ...(Object.keys(reporterMeta).length > 0 ? { reporterMeta } : {}),
    ...(Object.keys(copyEditorMeta).length > 0 ? { copyEditorMeta } : {}),
    ...(Object.keys(editorial).length > 0 ? { editorial } : {}),
    ...(media ? { media } : {}),
  };
}

function applyEditorialFlagApproval(
  updates: Record<string, unknown>,
  current: Record<string, unknown>,
  approver: string
) {
  const hasEditorialUpdate =
    typeof updates.editorial === 'object' && updates.editorial !== null;
  const hasFlagUpdate =
    typeof updates.isBreaking === 'boolean' || typeof updates.isTrending === 'boolean';
  if (!hasEditorialUpdate && !hasFlagUpdate) return;

  const editorial = normalizeArticleEditorialMeta({
    ...(typeof current.editorial === 'object' && current.editorial ? current.editorial : {}),
    ...(hasEditorialUpdate ? (updates.editorial as Record<string, unknown>) : {}),
  });
  const isBreaking =
    typeof updates.isBreaking === 'boolean'
      ? updates.isBreaking
      : Boolean(current.isBreaking);
  const isTrending =
    typeof updates.isTrending === 'boolean'
      ? updates.isTrending
      : Boolean(current.isTrending);
  editorial.flagApprovedBy = isBreaking || isTrending ? approver : '';
  updates.editorial = editorial;
}

function validateLengths(input: Record<string, unknown>) {
  if (typeof input.title === 'string' && input.title.length > 200) {
    return 'Title is too long (max 200 characters)';
  }
  if (typeof input.slug === 'string' && input.slug && !isValidArticleSlug(input.slug)) {
    return 'SEO slug must use lowercase letters, numbers, and hyphens only';
  }
  if (typeof input.summary === 'string' && input.summary.length > 500) {
    return 'Summary is too long (max 500 characters)';
  }

  const seo =
    typeof input.seo === 'object' && input.seo
      ? (input.seo as Record<string, unknown>)
      : null;
  if (seo) {
    if (typeof seo.metaTitle === 'string' && seo.metaTitle.length > 160) {
      return 'SEO title is too long (max 160 characters)';
    }
    if (
      typeof seo.metaDescription === 'string' &&
      seo.metaDescription.length > 320
    ) {
      return 'SEO description is too long (max 320 characters)';
    }
    if (
      typeof seo.canonicalUrl === 'string' &&
      seo.canonicalUrl &&
      !isValidAbsoluteHttpUrl(seo.canonicalUrl)
    ) {
      return 'Canonical URL must be a valid absolute URL';
    }
    if (
      typeof seo.authorProfileUrl === 'string' &&
      seo.authorProfileUrl &&
      !seo.authorProfileUrl.startsWith('/') &&
      !isValidAbsoluteHttpUrl(seo.authorProfileUrl)
    ) {
      return 'Author profile URL must be a valid absolute URL or local path';
    }
    if (
      typeof seo.authorAvatarUrl === 'string' &&
      seo.authorAvatarUrl &&
      !seo.authorAvatarUrl.startsWith('/') &&
      !isValidAbsoluteHttpUrl(seo.authorAvatarUrl)
    ) {
      return 'Author photo URL must be a valid absolute URL or local path';
    }
    if (
      typeof seo.ogImage === 'string' &&
      seo.ogImage &&
      !isValidAbsoluteHttpUrl(seo.ogImage) &&
      !seo.ogImage.startsWith('/')
    ) {
      return 'OG image must be an absolute URL or local path';
    }
  }

  const reporterMeta =
    typeof input.reporterMeta === 'object' && input.reporterMeta
      ? normalizeReporterMeta({
          ...createEmptyReporterMeta(),
          ...input.reporterMeta,
        })
      : null;
  if (reporterMeta) {
    const reporterMetaError = validateReporterMeta(reporterMeta);
    if (reporterMetaError) {
      return reporterMetaError;
    }
  }

  const copyEditorMeta =
    typeof input.copyEditorMeta === 'object' && input.copyEditorMeta
      ? normalizeCopyEditorMeta({
          ...createEmptyCopyEditorMeta(),
          ...input.copyEditorMeta,
        })
      : null;
  if (copyEditorMeta) {
    const copyEditorMetaError = validateCopyEditorMeta(copyEditorMeta);
    if (copyEditorMetaError) {
      return copyEditorMetaError;
    }
  }

  if (typeof input.editorial === 'object' && input.editorial) {
    const editorialError = validateArticleEditorialMeta(
      normalizeArticleEditorialMeta(input.editorial)
    );
    if (editorialError) {
      return editorialError;
    }
  }

  if (typeof input.media === 'object' && input.media) {
    const mediaError = validateArticleMediaMetadata(
      normalizeArticleMediaMetadata(input.media)
    );
    if (mediaError) {
      return mediaError;
    }
  }

  return null;
}

function normalizeFullInput(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const image = typeof source.image === 'string' ? source.image.trim() : '';
  const seo = normalizeSeo(source.seo);
  if (!seo.ogImage && image) {
    seo.ogImage = resolveArticleOgImageUrl({ image });
  }

  const content = typeof source.content === 'string' ? source.content.trim() : '';
  return {
    title: typeof source.title === 'string' ? source.title.trim() : '',
    slug: typeof source.slug === 'string' ? source.slug.trim() : '',
    previousSlugs: Array.isArray(source.previousSlugs) ? source.previousSlugs : [],
    summary: typeof source.summary === 'string' ? source.summary.trim() : '',
    content,
    contentJson: normalizeArticleDocument(source.contentJson, content),
    image,
    category: typeof source.category === 'string' ? source.category.trim() : '',
    author: typeof source.author === 'string' ? source.author.trim() : '',
    isBreaking: Boolean(source.isBreaking),
    isTrending: Boolean(source.isTrending),
    seo,
    reporterMeta: normalizeReporterMeta(source.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(source.copyEditorMeta),
    editorial: normalizeArticleEditorialMeta(source.editorial),
    media: normalizeArticleMediaMetadata(source.media),
  };
}

function validateRequired(input: ReturnType<typeof normalizeFullInput>) {
  if (
    !input.title ||
    !input.summary ||
    !input.content ||
    !input.image ||
    !input.category ||
    !input.author
  ) {
    return 'Missing required fields';
  }
  return validateLengths(input);
}

function buildRevisionSnapshot(article: Record<string, unknown>) {
  const seo =
    typeof article.seo === 'object' && article.seo
      ? normalizeSeo(article.seo)
      : normalizeSeo(null);

  return {
    title: typeof article.title === 'string' ? article.title : '',
    summary: typeof article.summary === 'string' ? article.summary : '',
    content: typeof article.content === 'string' ? article.content : '',
    contentJson: normalizeArticleDocument(
      article.contentJson,
      typeof article.content === 'string' ? article.content : ''
    ),
    image: typeof article.image === 'string' ? article.image : '',
    category: typeof article.category === 'string' ? article.category : '',
    author: typeof article.author === 'string' ? article.author : '',
    slug: normalizeArticleSlug(String(article.slug || '')),
    previousSlugs: Array.isArray(article.previousSlugs)
      ? article.previousSlugs.map((item) => normalizeArticleSlug(String(item || ''))).filter(Boolean)
      : [],
    isBreaking: Boolean(article.isBreaking),
    isTrending: Boolean(article.isTrending),
    seo,
    reporterMeta: normalizeReporterMeta(article.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(article.copyEditorMeta),
    editorial: normalizeArticleEditorialMeta(article.editorial),
    media: normalizeArticleMediaMetadata(article.media),
    savedAt: new Date(),
  };
}

function parsePositiveInt(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.floor(parsed);
}

function mapEpaperArticle(article: unknown) {
  const source = typeof article === 'object' && article ? (article as Record<string, unknown>) : {};
  const hotspot =
    typeof source.hotspot === 'object' && source.hotspot
      ? (source.hotspot as Record<string, unknown>)
      : {};

  return {
    _id: String(source._id || ''),
    epaperId: String(source.epaperId || ''),
    pageNumber: Number(source.pageNumber || 1),
    title: String(source.title || ''),
    slug: String(source.slug || ''),
    excerpt: String(source.excerpt || ''),
    contentHtml: String(source.contentHtml || ''),
    coverImagePath: String(source.coverImagePath || ''),
    hotspot: {
      x: Number(hotspot.x || 0),
      y: Number(hotspot.y || 0),
      w: Number(hotspot.w || 0),
      h: Number(hotspot.h || 0),
    },
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function isEpaperKind(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind');
  return kind === 'epaper';
}

function normalizeEpaperArticleInput(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  return {
    title: typeof source.title === 'string' ? source.title.trim() : '',
    slug: typeof source.slug === 'string' ? source.slug.trim() : '',
    excerpt: typeof source.excerpt === 'string' ? source.excerpt.trim() : '',
    contentHtml: typeof source.contentHtml === 'string' ? source.contentHtml.trim() : '',
    coverImagePath:
      typeof source.coverImagePath === 'string' ? source.coverImagePath.trim() : '',
    pageNumber:
      source.pageNumber !== undefined ? parsePositiveInt(source.pageNumber) : 0,
    hotspot: source.hotspot !== undefined ? normalizeHotspot(source.hotspot) : null,
  };
}

function validateEpaperArticleInput(
  input: ReturnType<typeof normalizeEpaperArticleInput>,
  isPut: boolean
) {
  if (isPut && !input.title) {
    return 'title is required';
  }
  if (input.title && input.title.length > 220) {
    return 'title is too long (max 220 chars)';
  }
  if (input.excerpt.length > 1000) {
    return 'excerpt is too long (max 1000 chars)';
  }
  if (input.pageNumber < 0) {
    return 'pageNumber must be positive';
  }
  if (input.hotspot) {
    const hotspotError = validateHotspot(input.hotspot);
    if (hotspotError) return hotspotError;
  } else if (isPut) {
    return 'hotspot is required';
  }

  if (input.coverImagePath) {
    const validCoverImage =
      input.coverImagePath.startsWith('/')
        ? isAllowedAssetPath(input.coverImagePath)
        : isValidAbsoluteHttpUrl(input.coverImagePath);
    if (!validCoverImage) {
      return 'coverImagePath must be a valid /uploads path or absolute URL';
    }
  }

  return null;
}

async function findEpaperArticle(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return EPaperArticle.findById(id).lean();
}

async function updateEpaperArticleById(
  id: string,
  body: unknown,
  isPut: boolean,
  actor?: Awaited<ReturnType<typeof getAdminSessionFromReq>>
) {
  if (!Types.ObjectId.isValid(id)) {
    return {
      ok: false as const,
      status: 400,
      payload: { success: false, error: 'Invalid article ID' },
    };
  }

  await connectDB();
  const current = await EPaperArticle.findById(id).lean();
  if (!current) {
    return {
      ok: false as const,
      status: 404,
      payload: { success: false, error: 'Article not found' },
    };
  }

  const parentEpaper = await EPaper.findById(current.epaperId)
    .select('_id status productionStatus pageCount pages')
    .lean();
  if (!parentEpaper) {
    return {
      ok: false as const,
      status: 404,
      payload: { success: false, error: 'E-paper not found' },
    };
  }
  try {
    assertEpaperDraftEditable(parentEpaper);
  } catch (error) {
    return {
      ok: false as const,
      status: 409,
      payload: {
        success: false,
        error: error instanceof Error ? error.message : 'Edition is immutable.',
      },
    };
  }

  const input = normalizeEpaperArticleInput(body);
  const validationError = validateEpaperArticleInput(input, isPut);
  if (validationError) {
    return {
      ok: false as const,
      status: 400,
      payload: { success: false, error: validationError },
    };
  }

  const updates: Record<string, unknown> = {};

  if (input.title) updates.title = input.title;
  if (input.excerpt || input.excerpt === '') updates.excerpt = input.excerpt;
  if (input.contentHtml || input.contentHtml === '') updates.contentHtml = input.contentHtml;
  if (input.coverImagePath || input.coverImagePath === '') updates.coverImagePath = input.coverImagePath;
  if (input.pageNumber > 0) updates.pageNumber = input.pageNumber;
  if (input.hotspot) updates.hotspot = input.hotspot;

  const nextTitle = input.title || current.title;
  const shouldRecomputeSlug = Boolean(input.slug || input.title);
  if (shouldRecomputeSlug) {
    const nextSlug = await resolveUniqueSlug(input.slug || nextTitle, async (candidate) => {
      const existing = await EPaperArticle.findOne({
        _id: { $ne: id },
        epaperId: current.epaperId,
        slug: candidate,
      })
        .select('_id')
        .lean();
      return Boolean(existing);
    });
    updates.slug = nextSlug;
  }

  if (updates.pageNumber !== undefined) {
    const pageCount = Number(parentEpaper.pageCount || 0);
    const pageNumber = Number(updates.pageNumber || 0);
    if (pageCount > 0 && pageNumber > pageCount) {
      return {
        ok: false as const,
        status: 400,
        payload: {
          success: false,
          error: `pageNumber must be between 1 and ${pageCount}`,
        },
      };
    }
  }

  // GAP-008: Editorial story saves must NOT mutate the public releasedSnapshot.
  // Draft edits remain private until the explicit release workflow (/api/admin/epapers/[id]/articles/[articleId]/release) is triggered.

  const updated = await EPaperArticle.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!updated) {
    return {
      ok: false as const,
      status: 404,
      payload: { success: false, error: 'Article not found' },
    };
  }

  if (actor) {
    const changedPages = Array.from(
      new Set([Number(current.pageNumber || 0), Number(updated.pageNumber || 0)])
    ).filter(Boolean);
    const nextPages = (parentEpaper.pages || []).map((page) =>
      changedPages.includes(Number(page.pageNumber || 0))
        ? {
            ...page,
            reviewStatus: 'ready',
            reviewedAt: new Date(),
            reviewedBy: actor.id,
          }
        : page
    );
    await EPaper.findByIdAndUpdate(updated.epaperId, { pages: nextPages });
    await invalidateEpaperQa({
      epaperId: String(updated.epaperId || ''),
      actor,
      reason: 'Mapped story content or hotspot changed.',
      pageNumbers: changedPages,
    });
    await applyEpaperWorkflowAutomation({
      epaperId: String(updated.epaperId || ''),
      actor,
      reason: 'A mapped e-paper story was updated.',
    });
  }

  return {
    ok: true as const,
    status: 200,
    payload: { success: true, data: mapEpaperArticle(updated) },
  };
}

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (isEpaperKind(req)) {
      if (!canEditEpaper(user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      await connectDB();
      const epaperArticle = await findEpaperArticle(id);
      if (!epaperArticle) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: mapEpaperArticle(epaperArticle) });
    }

    if (!canViewPage(user.role, 'articles')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (await shouldUseFileStore()) {
      const article = await getStoredArticleById(id);
      if (!article) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      if (
        !canReadContent(user, buildArticlePermissionRecord(article), {
          allowViewerRead: true,
        })
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      return NextResponse.json({
        success: true,
        data: resolveArticleResponse(
          article as unknown as Record<string, unknown> & {
            author?: string;
            workflow?: unknown;
            publishedAt?: unknown;
            updatedAt?: unknown;
          }
        ),
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    const article = (await Article.findById(id).lean()) as LeanArticleRecord | null;
    if (article) {
      if (
        !canReadContent(user, buildArticlePermissionRecord(article), {
          allowViewerRead: true,
        })
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      return NextResponse.json({ success: true, data: resolveArticleResponse(article) });
    }

    const epaperArticle = await findEpaperArticle(id);
    if (epaperArticle) {
      if (!canEditEpaper(user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      return NextResponse.json({ success: true, data: mapEpaperArticle(epaperArticle) });
    }

    return NextResponse.json(
      { success: false, error: 'Article not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch article' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    // Read body FIRST
    const body = await req.json();
    const bodyRecord =
      typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    const expectedVersion = parseExpectedVersion(bodyRecord.expectedVersion);
    const isAutosave = bodyRecord.autosave === true;

    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (isEpaperKind(req)) {
      if (!canEditEpaper(user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      const result = await updateEpaperArticleById(id, body, false, user);
      return NextResponse.json(result.payload, { status: result.status });
    }

    if (!canViewPage(user.role, 'article_edit')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (isWorkflowAction((body as WorkflowActionBody).action)) {
      const actionBody = body as WorkflowActionBody;
      const action = actionBody.action;

      if (await shouldUseFileStore()) {
        const currentArticle = await getStoredArticleById(id);
        if (!currentArticle) {
          return NextResponse.json(
            { success: false, error: 'Article not found' },
            { status: 404 }
          );
        }

        const permissionRecord = buildArticlePermissionRecord(currentArticle);
        if (!action || !canTransitionContent(user, permissionRecord, action)) {
          return NextResponse.json(
            { success: false, error: 'Forbidden' },
            { status: 403 }
          );
        }

        const currentVersion = resolveArticleVersion(currentArticle.version);
        if (expectedVersion !== null && expectedVersion !== currentVersion) {
          return articleVersionConflictResponse({
            currentVersion,
            updatedAt: currentArticle.updatedAt,
          });
        }

        if ((action === 'publish' || action === 'fast_publish') && isBreakingArticleMissingAudio(currentArticle)) {
          return NextResponse.json(
            { success: false, error: BREAKING_AUDIO_REQUIRED_ERROR },
            { status: 400 }
          );
        }

        const readinessError = validateWorkflowReadiness(currentArticle, action);
        if (readinessError) {
          return NextResponse.json(
            { success: false, error: readinessError },
            { status: 400 }
          );
        }

        if (action === 'fast_publish') {
          const urgentError = validateFastPublish({
            role: user.role,
            workflow: resolveArticleWorkflow(currentArticle),
            isBreaking: Boolean(currentArticle.isBreaking),
            reason: actionBody.comment,
          });
          if (urgentError) return NextResponse.json({ success: false, error: urgentError }, { status: 400 });
        }

        let assignedTo = null;
        if (action === 'assign') {
          if (!process.env.MONGODB_URI?.trim()) {
            return NextResponse.json(
              { success: false, error: 'Assignments require MongoDB-backed users.' },
              { status: 503 }
            );
          }

          await connectDB();
          assignedTo = await resolveAssignee(String(actionBody.assignedToId || ''));
          if (!assignedTo) {
            return NextResponse.json(
              { success: false, error: 'Valid assignedToId is required' },
              { status: 400 }
            );
          }
        }

        try {
          const { fromStatus, toStatus, nextWorkflow } = applyArticleWorkflowAction({
            action,
            actor: user,
            currentWorkflow: resolveArticleWorkflow(currentArticle),
            assignedTo,
            scheduledFor: parseOptionalDate(actionBody.scheduledFor),
            dueAt: parseOptionalDate(actionBody.dueAt),
            priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
            comment: actionBody.comment,
            rejectionReason: actionBody.rejectionReason,
          });

          if (toStatus === 'published' && isBreakingArticleMissingAudio(currentArticle)) {
            return NextResponse.json(
              { success: false, error: BREAKING_AUDIO_REQUIRED_ERROR },
              { status: 400 }
            );
          }

          const article = await updateStoredArticle(
            id,
            {
              workflow: toStoredWorkflowUpdate(nextWorkflow),
              ...(toStatus === 'published'
                ? { publishedAt: new Date().toISOString() }
                : {}),
            },
            { skipRevision: true, expectedVersion: currentVersion }
          );

          if (!article) {
            return NextResponse.json(
              { success: false, error: 'Article not found' },
              { status: 404 }
            );
          }

          await recordArticleActivity({
            articleId: id,
            actor: user,
            action,
            fromStatus,
            toStatus,
            message: buildArticleActivityMessage({
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

          await notifyWorkflowEvent({
            contentType: 'article',
            contentId: id,
            title: String(article.title || 'Article'),
            href: `/admin/articles/${encodeURIComponent(id)}/edit`,
            action,
            workflow: nextWorkflow,
            actor: user,
          });

          if (article.sourceStoryId) {
            await syncStoryLinkedArticle({
              useFileStore: true,
              storyId: article.sourceStoryId,
              articleId: id,
              articleStatus: nextWorkflow.status,
            });
          }

          return NextResponse.json({
            success: true,
            data: article,
            message: `Article moved to ${toStatus}.`,
          });
        } catch (workflowError) {
          if (isArticleVersionConflictError(workflowError)) {
            return articleVersionConflictResponse({
              currentVersion: workflowError.currentVersion,
              updatedAt: currentArticle.updatedAt,
            });
          }
          return NextResponse.json(
            {
              success: false,
              error:
                workflowError instanceof Error
                  ? workflowError.message
                  : 'Failed to update article workflow',
            },
            { status: 400 }
          );
        }
      }

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json(
          { success: false, error: 'Invalid article ID' },
          { status: 400 }
        );
      }

      const current = (await Article.findById(id).lean()) as LeanArticleRecord | null;
      if (!current) {
        if (!canEditEpaper(user.role)) {
          return NextResponse.json(
            { success: false, error: 'Forbidden' },
            { status: 403 }
          );
        }
        const fallback = await updateEpaperArticleById(id, body, false, user);
        return NextResponse.json(fallback.payload, { status: fallback.status });
      }

      const permissionRecord = buildArticlePermissionRecord(current);
      if (!action || !canTransitionContent(user, permissionRecord, action)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      const currentVersion = resolveArticleVersion(current.version);
      if (expectedVersion !== null && expectedVersion !== currentVersion) {
        return articleVersionConflictResponse({
          currentVersion,
          updatedAt: current.updatedAt,
        });
      }

      if ((action === 'publish' || action === 'fast_publish') && isBreakingArticleMissingAudio(current)) {
        return NextResponse.json(
          { success: false, error: BREAKING_AUDIO_REQUIRED_ERROR },
          { status: 400 }
        );
      }

      const readinessError = validateWorkflowReadiness(current, action);
      if (readinessError) {
        return NextResponse.json(
          { success: false, error: readinessError },
          { status: 400 }
        );
      }


      if (action === 'fast_publish') {
        const urgentError = validateFastPublish({
          role: user.role,
          workflow: resolveArticleWorkflow(current),
          isBreaking: Boolean(current.isBreaking),
          reason: actionBody.comment,
        });
        if (urgentError) return NextResponse.json({ success: false, error: urgentError }, { status: 400 });
      }

      let assignedTo = null;
      if (action === 'assign') {
        assignedTo = await resolveAssignee(String(actionBody.assignedToId || ''));
        if (!assignedTo) {
          return NextResponse.json(
            { success: false, error: 'Valid assignedToId is required' },
            { status: 400 }
          );
        }
      }

      try {
        const { fromStatus, toStatus, nextWorkflow } = applyArticleWorkflowAction({
          action,
          actor: user,
          currentWorkflow: resolveArticleWorkflow(current),
          assignedTo,
          scheduledFor: parseOptionalDate(actionBody.scheduledFor),
          dueAt: parseOptionalDate(actionBody.dueAt),
          priority: isWorkflowPriority(actionBody.priority) ? actionBody.priority : undefined,
          comment: actionBody.comment,
          rejectionReason: actionBody.rejectionReason,
        });

        if (toStatus === 'published' && isBreakingArticleMissingAudio(current)) {
          return NextResponse.json(
            { success: false, error: BREAKING_AUDIO_REQUIRED_ERROR },
            { status: 400 }
          );
        }

        const initializesLegacyVersion = !hasPersistedArticleVersion(current.version);
        const article = await Article.findOneAndUpdate(
          { _id: id, ...buildArticleVersionMatch(currentVersion) },
          {
            $set: {
              workflow: nextWorkflow,
              updatedAt: new Date(),
              ...(toStatus === 'published' ? { publishedAt: new Date() } : {}),
              ...(initializesLegacyVersion ? { version: currentVersion + 1 } : {}),
            },
            ...(!initializesLegacyVersion ? { $inc: { version: 1 } } : {}),
          },
          { new: true, runValidators: true }
        );

        if (!article) {
          const latest = (await Article.findById(id).lean()) as LeanArticleRecord | null;
          if (latest) {
            return articleVersionConflictResponse({
              currentVersion: resolveArticleVersion(latest.version),
              updatedAt: latest.updatedAt,
            });
          }
          return NextResponse.json(
            { success: false, error: 'Article not found' },
            { status: 404 }
          );
        }

        await recordArticleActivity({
          articleId: id,
          actor: user,
          action,
          fromStatus,
          toStatus,
          message: buildArticleActivityMessage({
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

        await notifyWorkflowEvent({
          contentType: 'article',
          contentId: id,
          title: String(article.title || 'Article'),
          href: `/admin/articles/${encodeURIComponent(id)}/edit`,
          action,
          workflow: nextWorkflow,
          actor: user,
        });

        if (typeof article.sourceStoryId === 'string' && article.sourceStoryId.trim()) {
          await syncStoryLinkedArticle({
            useFileStore: false,
            storyId: article.sourceStoryId,
            articleId: id,
            articleStatus: nextWorkflow.status,
          });
        }

        return NextResponse.json({
          success: true,
          data: article,
          message: `Article moved to ${toStatus}.`,
        });
      } catch (workflowError) {
        return NextResponse.json(
          {
            success: false,
            error:
              workflowError instanceof Error
                ? workflowError.message
                : 'Failed to update article workflow',
          },
          { status: 400 }
        );
      }
    }

    const updates = normalizePartialInput(body);
    const validationError = validateLengths(updates);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    if (await shouldUseFileStore()) {
      const currentArticle = await getStoredArticleById(id);
      if (!currentArticle) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      if (!canEditContent(user, buildArticlePermissionRecord(currentArticle))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      applyEditorialFlagApproval(
        updates as unknown as Record<string, unknown>,
        currentArticle as unknown as Record<string, unknown>,
        user.name || user.email
      );

      const currentVersion = resolveArticleVersion(currentArticle.version);
      if (expectedVersion !== null && expectedVersion !== currentVersion) {
        return articleVersionConflictResponse({
          currentVersion,
          updatedAt: currentArticle.updatedAt,
        });
      }

      if (typeof updates.slug === 'string' || !currentArticle.slug) {
        const existingArticles = await listAllStoredArticles();
        const resolvedSlug = await resolveUniqueArticleSlug(
          typeof updates.slug === 'string' && updates.slug
            ? updates.slug
            : typeof updates.title === 'string' && updates.title
              ? updates.title
              : currentArticle.title,
          async (candidate) =>
            existingArticles.some(
              (article) =>
                article._id !== id &&
                (article.slug === candidate || (article.previousSlugs || []).includes(candidate))
            )
        );
        const previousSlugs = new Set(currentArticle.previousSlugs || []);
        if (currentArticle.slug && currentArticle.slug !== resolvedSlug) {
          previousSlugs.add(currentArticle.slug);
        }
        updates.slug = resolvedSlug;
        updates.previousSlugs = Array.from(previousSlugs).filter((item) => item !== resolvedSlug);
      }

      const canonicalError = validateEditedArticleCanonicalOverride(
        readArticleCanonicalEdit(bodyRecord.seo),
        currentArticle.seo?.canonicalUrl,
        { id, slug: String(updates.slug || currentArticle.slug || '') }
      );
      if (canonicalError) {
        return NextResponse.json({ success: false, error: canonicalError }, { status: 400 });
      }

      const previousBreakingAudioUrl = resolveBreakingAudioUrl(
        currentArticle as unknown as Record<string, unknown>
      );
      const updatesWithBreakingTts = {
        ...updates,
        breakingTts: resolveNextBreakingTts(
          currentArticle as unknown as Record<string, unknown>,
          updates as unknown as Record<string, unknown>
        ),
      };

      let article;
      try {
        article = await updateStoredArticle(
          id,
          updatesWithBreakingTts,
          isAutosave || expectedVersion !== null
            ? {
                skipRevision: isAutosave,
                ...(expectedVersion !== null ? { expectedVersion } : {}),
              }
            : undefined
        );
      } catch (updateError) {
        if (isArticleVersionConflictError(updateError)) {
          return articleVersionConflictResponse({
            currentVersion: updateError.currentVersion,
            updatedAt: currentArticle.updatedAt,
          });
        }
        throw updateError;
      }
      if (!article) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }

      if (previousBreakingAudioUrl && !article.breakingTts) {
        await deleteStoredBreakingAudio(previousBreakingAudioUrl).catch(() => undefined);
      }

      const changedFields = Object.keys(updates);
      if (changedFields.length > 0) {
        await recordArticleActivity({
          articleId: id,
          actor: user,
          action: 'saved',
          toStatus: resolveArticleWorkflow(article).status,
          message: buildArticleActivityMessage({ action: 'saved' }),
          metadata: {
            changedFields,
          },
        });
      }

      return NextResponse.json({ success: true, data: article });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    const current = (await Article.findById(id).lean()) as LeanArticleRecord | null;
    if (!current) {
      if (!canEditEpaper(user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      const fallback = await updateEpaperArticleById(id, body, false, user);
      return NextResponse.json(fallback.payload, { status: fallback.status });
    }
    if (!canEditContent(user, buildArticlePermissionRecord(current))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    applyEditorialFlagApproval(
      updates as unknown as Record<string, unknown>,
      current as Record<string, unknown>,
      user.name || user.email
    );
    const currentVersion = resolveArticleVersion(current.version);
    if (expectedVersion !== null && expectedVersion !== currentVersion) {
      return articleVersionConflictResponse({
        currentVersion,
        updatedAt: current.updatedAt,
      });
    }

    if (typeof updates.slug === 'string' || !normalizeArticleSlug(String(current.slug || ''))) {
      const currentSlug = normalizeArticleSlug(String(current.slug || ''));
      const resolvedSlug = await resolveUniqueArticleSlug(
        typeof updates.slug === 'string' && updates.slug
          ? updates.slug
          : typeof updates.title === 'string' && updates.title
            ? updates.title
            : String(current.title || ''),
        async (candidate) =>
          Boolean(
            await Article.exists({
              _id: { $ne: id },
              $or: [{ slug: candidate }, { previousSlugs: candidate }],
            })
          )
      );
      const previousSlugs = new Set(
        Array.isArray(current.previousSlugs)
          ? current.previousSlugs.map((item) => normalizeArticleSlug(String(item || '')))
          : []
      );
      if (currentSlug && currentSlug !== resolvedSlug) previousSlugs.add(currentSlug);
      updates.slug = resolvedSlug;
      updates.previousSlugs = Array.from(previousSlugs).filter((item) => item && item !== resolvedSlug);
    }

    const canonicalError = validateEditedArticleCanonicalOverride(
      readArticleCanonicalEdit(bodyRecord.seo),
      normalizeSeo(current.seo).canonicalUrl,
      { id, slug: String(updates.slug || current.slug || '') }
    );
    if (canonicalError) {
      return NextResponse.json({ success: false, error: canonicalError }, { status: 400 });
    }

    const previousBreakingAudioUrl = resolveBreakingAudioUrl(
      current as Record<string, unknown>
    );
    const nextBreakingTts = resolveNextBreakingTts(
      current as Record<string, unknown>,
      updates as unknown as Record<string, unknown>
    );
    const revision = buildRevisionSnapshot(current as Record<string, unknown>);
    const initializesLegacyVersion = !hasPersistedArticleVersion(current.version);
    const mongoUpdate = {
      $set: {
        ...updates,
        breakingTts: nextBreakingTts,
        updatedAt: new Date(),
        ...(initializesLegacyVersion ? { version: currentVersion + 1 } : {}),
      },
      ...(!initializesLegacyVersion ? { $inc: { version: 1 } } : {}),
      ...(!isAutosave
        ? { $push: { revisions: { $each: [revision], $slice: -30 } } }
        : {}),
    };
    const article = expectedVersion !== null
      ? await Article.findOneAndUpdate(
          { _id: id, ...buildArticleVersionMatch(expectedVersion) },
          mongoUpdate,
          { new: true, runValidators: true }
        )
      : await Article.findByIdAndUpdate(
      id,
      {
        ...mongoUpdate,
      },
      { new: true, runValidators: true }
    );

    if (!article) {
      if (expectedVersion !== null) {
        const latest = (await Article.findById(id).lean()) as LeanArticleRecord | null;
        if (latest) {
          return articleVersionConflictResponse({
            currentVersion: resolveArticleVersion(latest.version),
            updatedAt: latest.updatedAt,
          });
        }
      }
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    if (previousBreakingAudioUrl && !nextBreakingTts) {
      await deleteStoredBreakingAudio(previousBreakingAudioUrl).catch(() => undefined);
    }

    const changedFields = Object.keys(updates);
    if (changedFields.length > 0) {
      await recordArticleActivity({
        articleId: id,
        actor: user,
        action: 'saved',
        toStatus: resolveArticleWorkflow(article.toObject()).status,
        message: buildArticleActivityMessage({ action: 'saved' }),
        metadata: {
          changedFields,
        },
      });
    }

    return NextResponse.json({ success: true, data: article });
  } catch (error) {
    console.error('Error patching article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update article' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    // Read body FIRST
    const body = await req.json();
    const bodyRecord =
      typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    const expectedVersion = parseExpectedVersion(bodyRecord.expectedVersion);

    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (isEpaperKind(req)) {
      if (!canEditEpaper(user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      const result = await updateEpaperArticleById(id, body, true, user);
      return NextResponse.json(result.payload, { status: result.status });
    }

    if (!canViewPage(user.role, 'article_edit')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const input = normalizeFullInput(body);
    input.editorial.flagApprovedBy =
      input.isBreaking || input.isTrending ? user.name || user.email : '';
    const validationError = validateRequired(input);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    if (await shouldUseFileStore()) {
      const currentArticle = await getStoredArticleById(id);
      if (!currentArticle) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      if (!canEditContent(user, buildArticlePermissionRecord(currentArticle))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      const currentVersion = resolveArticleVersion(currentArticle.version);
      if (expectedVersion !== null && expectedVersion !== currentVersion) {
        return articleVersionConflictResponse({
          currentVersion,
          updatedAt: currentArticle.updatedAt,
        });
      }

      {
        const existingArticles = await listAllStoredArticles();
        const resolvedSlug = await resolveUniqueArticleSlug(
          input.slug || input.seo.metaTitle || input.title,
          async (candidate) =>
            existingArticles.some(
              (article) =>
                article._id !== id &&
                (article.slug === candidate || (article.previousSlugs || []).includes(candidate))
            )
        );
        const previousSlugs = new Set(currentArticle.previousSlugs || []);
        if (currentArticle.slug && currentArticle.slug !== resolvedSlug) {
          previousSlugs.add(currentArticle.slug);
        }
        input.slug = resolvedSlug;
        input.previousSlugs = Array.from(previousSlugs).filter((item) => item !== resolvedSlug);
      }

      const canonicalEdit = readArticleCanonicalEdit(bodyRecord.seo);
      if (canonicalEdit.kind === 'omitted') {
        input.seo.canonicalUrl = currentArticle.seo?.canonicalUrl || '';
      }
      const canonicalError = validateEditedArticleCanonicalOverride(
        canonicalEdit,
        currentArticle.seo?.canonicalUrl,
        { id, slug: input.slug }
      );
      if (canonicalError) {
        return NextResponse.json({ success: false, error: canonicalError }, { status: 400 });
      }

      const previousBreakingAudioUrl = resolveBreakingAudioUrl(
        currentArticle as unknown as Record<string, unknown>
      );
      const inputWithBreakingTts = {
        ...input,
        breakingTts: resolveNextBreakingTts(
          currentArticle as unknown as Record<string, unknown>,
          input as unknown as Record<string, unknown>
        ),
      };

      let article;
      try {
        article =
          expectedVersion !== null
            ? await updateStoredArticle(id, inputWithBreakingTts, { expectedVersion })
            : await updateStoredArticle(id, inputWithBreakingTts);
      } catch (updateError) {
        if (isArticleVersionConflictError(updateError)) {
          return articleVersionConflictResponse({
            currentVersion: updateError.currentVersion,
            updatedAt: currentArticle.updatedAt,
          });
        }
        throw updateError;
      }
      if (!article) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }

      if (previousBreakingAudioUrl && !article.breakingTts) {
        await deleteStoredBreakingAudio(previousBreakingAudioUrl).catch(() => undefined);
      }

      await recordArticleActivity({
        articleId: id,
        actor: user,
        action: 'saved',
        toStatus: resolveArticleWorkflow(article).status,
        message: buildArticleActivityMessage({ action: 'saved' }),
        metadata: {
          changedFields: Object.keys(input),
        },
      });

      return NextResponse.json({
        success: true,
        data: article,
        message: 'Article updated successfully',
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    const current = (await Article.findById(id).lean()) as LeanArticleRecord | null;
    if (!current) {
        if (!canEditEpaper(user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      const fallback = await updateEpaperArticleById(id, body, true, user);
      return NextResponse.json(fallback.payload, { status: fallback.status });
    }
    if (!canEditContent(user, buildArticlePermissionRecord(current))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    {
      const currentSlug = normalizeArticleSlug(String(current.slug || ''));
      const resolvedSlug = await resolveUniqueArticleSlug(
        input.slug || input.seo.metaTitle || input.title,
        async (candidate) =>
          Boolean(
            await Article.exists({
              _id: { $ne: id },
              $or: [{ slug: candidate }, { previousSlugs: candidate }],
            })
          )
      );
      const previousSlugs = new Set(
        Array.isArray(current.previousSlugs)
          ? current.previousSlugs.map((item) => normalizeArticleSlug(String(item || '')))
          : []
      );
      if (currentSlug && currentSlug !== resolvedSlug) previousSlugs.add(currentSlug);
      input.slug = resolvedSlug;
      input.previousSlugs = Array.from(previousSlugs).filter((item) => item && item !== resolvedSlug);
    }

    const canonicalEdit = readArticleCanonicalEdit(bodyRecord.seo);
    const currentCanonicalUrl = normalizeSeo(current.seo).canonicalUrl;
    if (canonicalEdit.kind === 'omitted') {
      input.seo.canonicalUrl = currentCanonicalUrl;
    }
    const canonicalError = validateEditedArticleCanonicalOverride(
      canonicalEdit,
      currentCanonicalUrl,
      { id, slug: input.slug }
    );
    if (canonicalError) {
      return NextResponse.json({ success: false, error: canonicalError }, { status: 400 });
    }

    const currentVersion = resolveArticleVersion(current.version);
    if (expectedVersion !== null && expectedVersion !== currentVersion) {
      return articleVersionConflictResponse({
        currentVersion,
        updatedAt: current.updatedAt,
      });
    }

    const previousBreakingAudioUrl = resolveBreakingAudioUrl(
      current as Record<string, unknown>
    );
    const nextBreakingTts = resolveNextBreakingTts(
      current as Record<string, unknown>,
      input as unknown as Record<string, unknown>
    );
    const revision = buildRevisionSnapshot(current as Record<string, unknown>);
    const initializesLegacyVersion = !hasPersistedArticleVersion(current.version);
    const mongoUpdate = {
      $set: {
        ...input,
        breakingTts: nextBreakingTts,
        updatedAt: new Date(),
        ...(initializesLegacyVersion ? { version: currentVersion + 1 } : {}),
      },
      ...(!initializesLegacyVersion ? { $inc: { version: 1 } } : {}),
      $push: { revisions: { $each: [revision], $slice: -30 } },
    };
    const article =
      expectedVersion !== null
        ? await Article.findOneAndUpdate(
            { _id: id, ...buildArticleVersionMatch(expectedVersion) },
            mongoUpdate,
            { new: true, runValidators: true }
          )
        : await Article.findByIdAndUpdate(id, mongoUpdate, {
            new: true,
            runValidators: true,
          });

    if (!article) {
      if (expectedVersion !== null) {
        const latest = (await Article.findById(id).lean()) as LeanArticleRecord | null;
        if (latest) {
          return articleVersionConflictResponse({
            currentVersion: resolveArticleVersion(latest.version),
            updatedAt: latest.updatedAt,
          });
        }
      }
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    if (previousBreakingAudioUrl && !nextBreakingTts) {
      await deleteStoredBreakingAudio(previousBreakingAudioUrl).catch(() => undefined);
    }

    await recordArticleActivity({
      articleId: id,
      actor: user,
      action: 'saved',
      toStatus: resolveArticleWorkflow(article.toObject()).status,
      message: buildArticleActivityMessage({ action: 'saved' }),
      metadata: {
        changedFields: Object.keys(input),
      },
    });

    return NextResponse.json({
      success: true,
      data: article,
      message: 'Article updated successfully',
    });
  } catch (error) {
    console.error('Error putting article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update article' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const requestedExpectedVersion = parseExpectedVersion(
      req.nextUrl.searchParams.get('expectedVersion')
    );

    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (isEpaperKind(req)) {
      if (!canEditEpaper(user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      await connectDB();
      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json(
          { success: false, error: 'Invalid article ID' },
          { status: 400 }
        );
      }
      const existing = await EPaperArticle.findById(id).lean();
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      const parent = await EPaper.findById(existing.epaperId)
        .select('_id status productionStatus pages')
        .lean();
      if (!parent) {
        return NextResponse.json(
          { success: false, error: 'E-paper not found' },
          { status: 404 }
        );
      }
      try {
        assertEpaperDraftEditable(parent);
      } catch (error) {
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Edition is immutable.' },
          { status: 409 }
        );
      }

      const deleted = await EPaperArticle.findByIdAndDelete(id).lean();
      if (!deleted) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      const pageNumber = Number(existing.pageNumber || 0);
      const pages = (parent.pages || []).map((page) =>
        Number(page.pageNumber || 0) === pageNumber
          ? {
              ...page,
              reviewStatus: 'pending',
              reviewedAt: null,
              reviewedBy: null,
            }
          : page
      );
      await EPaper.findByIdAndUpdate(existing.epaperId, { pages });
      await invalidateEpaperQa({
        epaperId: String(existing.epaperId),
        actor: user,
        reason: 'A mapped story was deleted.',
        pageNumbers: [pageNumber],
      });
      return NextResponse.json({
        success: true,
        message: 'Article deleted successfully',
      });
    }

    if (!canDeleteContent(user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (!canViewPage(user.role, 'article_edit')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (await shouldUseFileStore()) {
      const existing = await getStoredArticleById(id);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      const currentVersion = resolveArticleVersion(existing.version);
      if (
        requestedExpectedVersion !== null &&
        requestedExpectedVersion !== currentVersion
      ) {
        return articleVersionConflictResponse({
          currentVersion,
          updatedAt: existing.updatedAt,
        });
      }
      let deleted;
      try {
        deleted = await deleteStoredArticle(id, { expectedVersion: currentVersion });
      } catch (deleteError) {
        if (isArticleVersionConflictError(deleteError)) {
          return articleVersionConflictResponse({
            currentVersion: deleteError.currentVersion,
            updatedAt: existing.updatedAt,
          });
        }
        throw deleteError;
      }
      if (!deleted) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      if (existing?.breakingTts?.audioUrl) {
        await deleteStoredBreakingAudio(existing.breakingTts.audioUrl).catch(() => undefined);
      }
      if (existing.sourceStoryId) {
        await clearStoryLinkedArticle({
          useFileStore: true,
          storyId: existing.sourceStoryId,
          articleId: id,
        });
      }
      return NextResponse.json({
        success: true,
        message: 'Article deleted successfully',
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    const current = (await Article.findById(id).lean()) as LeanArticleRecord | null;
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }
    const currentVersion = resolveArticleVersion(current.version);
    if (
      requestedExpectedVersion !== null &&
      requestedExpectedVersion !== currentVersion
    ) {
      return articleVersionConflictResponse({
        currentVersion,
        updatedAt: current.updatedAt,
      });
    }

    const article = await Article.findOneAndDelete({
      _id: id,
      ...buildArticleVersionMatch(currentVersion),
    }).lean();
    if (article) {
      const deletedArticle =
        typeof article === 'object' && article && !Array.isArray(article)
          ? (article as Record<string, unknown>)
          : null;
      const breakingTts =
        deletedArticle && typeof deletedArticle.breakingTts === 'object'
          ? (deletedArticle.breakingTts as Record<string, unknown>)
          : null;
      const audioUrl =
        breakingTts && typeof breakingTts.audioUrl === 'string'
          ? breakingTts.audioUrl
          : '';
      if (audioUrl) {
        await deleteStoredBreakingAudio(audioUrl).catch(() => undefined);
      }
      if (
        typeof deletedArticle?.sourceStoryId === 'string' &&
        deletedArticle.sourceStoryId.trim()
      ) {
        await clearStoryLinkedArticle({
          useFileStore: false,
          storyId: deletedArticle.sourceStoryId,
          articleId: id,
        });
      }
      return NextResponse.json({
        success: true,
        message: 'Article deleted successfully',
      });
    }

    const latest = (await Article.findById(id).lean()) as LeanArticleRecord | null;
    if (latest) {
      return articleVersionConflictResponse({
        currentVersion: resolveArticleVersion(latest.version),
        updatedAt: latest.updatedAt,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Article not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error deleting article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete article' },
      { status: 500 }
    );
  }
}
