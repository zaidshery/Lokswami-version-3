import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  canReadContent,
  isAssignedContent,
  isOwnContent,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
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
import { resolveReusableBreakingTts } from '@/lib/server/breakingTts';
import { resolveArticleOgImageUrl } from '@/lib/utils/articleMedia';
import {
  buildArticleAssistResult,
  summarizeArticleReadiness,
} from '@/lib/utils/articleAssistant';
import {
  isValidArticleSlug,
  normalizeArticleSeo,
  normalizeArticleSlug,
  type ArticleSeoFields,
} from '@/lib/seo/articleSeo';
import { resolveArticleWorkflow } from '@/lib/workflow/article';
import type { WorkflowMeta } from '@/lib/workflow/types';
import type {
  NormalizedArticleInput,
  NormalizedSeo,
  RevisionSnapshot,
} from './newsroomArticleTypes';

export const BREAKING_AUDIO_REQUIRED_ERROR =
  'Upload breaking news audio before publishing this breaking article.';

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

export function isWorkflowAction(value: unknown): value is ContentTransitionAction {
  return typeof value === 'string' && WORKFLOW_ACTIONS.has(value as ContentTransitionAction);
}

export function buildArticlePermissionRecord(article: {
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

export function resolveArticleResponse<T extends Record<string, unknown>>(
  article: T
): T & {
  sourceType: 'story' | 'direct';
  sourceStoryId: string;
  sourceStoryTitle: string;
} {
  return {
    ...article,
    sourceType: normalizeArticleSourceType(article.sourceType),
    sourceStoryId:
      typeof article.sourceStoryId === 'string' ? article.sourceStoryId.trim() : '',
    sourceStoryTitle:
      typeof article.sourceStoryTitle === 'string'
        ? article.sourceStoryTitle.trim()
        : '',
  };
}

export function isBreakingArticleMissingAudio(article: unknown): boolean {
  if (!article || typeof article !== 'object') return false;
  const source = article as Record<string, unknown>;
  return Boolean(source.isBreaking) && !resolveReusableBreakingTts(source);
}

export function validateWorkflowReadiness(
  article: unknown,
  action: ContentTransitionAction
): string | null {
  if (action !== 'submit' && action !== 'schedule' && action !== 'publish' && action !== 'fast_publish') {
    return null;
  }

  const source = article && typeof article === 'object' ? (article as Record<string, unknown>) : {};
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

export function validateArticleCreationReadiness(
  input: NormalizedArticleInput,
  options: {
    breakingAudioReady?: boolean;
    requireBreakingAudio?: boolean;
  } = {}
): string | null {
  const result = buildArticleAssistResult({
    mode: 'create',
    title: input.title,
    summary: input.summary,
    content: input.content,
    category: input.category,
    author: input.author,
    image: input.image,
    seoSlug: input.slug,
    seo: input.seo,
    isBreaking: input.isBreaking,
    isTrending: input.isTrending,
    language: 'hi',
    breakingAudioReady: options.breakingAudioReady,
    requireBreakingAudio: options.requireBreakingAudio,
    sourceInfo: input.reporterMeta.sourceInfo,
    sourceStoryId: input.sourceStoryId,
    locationTag: input.reporterMeta.locationTag,
    editorial: input.editorial,
  });
  const summary = summarizeArticleReadiness(result.readiness);

  if (summary.canSend) return null;
  return `Article is not ready: ${summary.blockers
    .map((item) => item.label)
    .join(', ')}`;
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

export function parseOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseExpectedVersion(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function toStoredWorkflowUpdate(workflow: ReturnType<typeof resolveArticleWorkflow>) {
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

export function isValidAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeSeo(input: unknown): NormalizedSeo {
  return normalizeArticleSeo(input);
}

export function normalizeSeoPartial(input: unknown): Partial<NormalizedSeo> {
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

export function validateLengths(input: Record<string, unknown>): string | null {
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

export function normalizeFullInput(body: unknown): NormalizedArticleInput {
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
    sourceType: normalizeArticleSourceType(source.sourceType),
    sourceStoryId: typeof source.sourceStoryId === 'string' ? source.sourceStoryId.trim() : '',
    sourceStoryTitle: typeof source.sourceStoryTitle === 'string' ? source.sourceStoryTitle.trim() : '',
  };
}

export function normalizePartialInput(body: unknown): Record<string, unknown> {
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

export function validateRequired(input: NormalizedArticleInput): string | null {
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
  return validateLengths(input as unknown as Record<string, unknown>);
}

export function buildRevisionSnapshot(article: Record<string, unknown>): RevisionSnapshot {
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

export function applyEditorialFlagApproval(
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

export function matchesActor(user: AdminSessionIdentity, actorId: string | null | undefined): boolean {
  if (!actorId) return false;
  const normalizedActorId = actorId.trim().toLowerCase();
  if (!normalizedActorId) return false;
  return (
    normalizedActorId === user.id.trim().toLowerCase() ||
    normalizedActorId === user.email.trim().toLowerCase()
  );
}

export function matchesArticleAuthorScope(authorName: string, user: AdminSessionIdentity): boolean {
  const normalizedAuthor = authorName.trim().toLowerCase();
  if (!normalizedAuthor) return false;
  return (
    normalizedAuthor === user.name.trim().toLowerCase() ||
    normalizedAuthor === user.email.trim().toLowerCase()
  );
}

const REVIEW_QUEUE_STATUSES = new Set([
  'submitted',
  'assigned',
  'in_review',
  'copy_edit',
  'changes_requested',
  'ready_for_approval',
  'approved',
  'scheduled',
]);

function matchesActorValue(candidate: string | null | undefined, expected: string | null): boolean {
  if (!candidate || !expected) return false;
  return candidate.trim().toLowerCase() === expected.trim().toLowerCase();
}

export function matchesListFilters(
  article: Record<string, unknown>,
  user: AdminSessionIdentity,
  filters: {
    scope: string;
    workflowStatus: string;
    assignedTo: string | null;
    createdBy: string | null;
  }
): boolean {
  const permissionRecord = buildArticlePermissionRecord(article);

  if (!canReadContent(user, permissionRecord, { allowViewerRead: true })) {
    return false;
  }

  if (filters.scope === 'mine' && !isOwnContent(user, permissionRecord)) {
    return false;
  }

  if (filters.scope === 'assigned' && !isAssignedContent(user, permissionRecord)) {
    return false;
  }

  const workflow =
    article.workflow && typeof article.workflow === 'object'
      ? (article.workflow as Record<string, unknown>)
      : {};
  const status = typeof workflow.status === 'string' ? workflow.status : '';

  if (filters.scope === 'review' && !REVIEW_QUEUE_STATUSES.has(status)) {
    return false;
  }

  if (filters.workflowStatus && status !== filters.workflowStatus) {
    return false;
  }

  const createdBy =
    workflow.createdBy && typeof workflow.createdBy === 'object'
      ? (workflow.createdBy as Record<string, unknown>)
      : {};
  const assignedTo =
    workflow.assignedTo && typeof workflow.assignedTo === 'object'
      ? (workflow.assignedTo as Record<string, unknown>)
      : {};

  if (
    filters.assignedTo &&
    !matchesActorValue(typeof assignedTo.id === 'string' ? assignedTo.id : null, filters.assignedTo) &&
    !matchesActorValue(typeof assignedTo.email === 'string' ? assignedTo.email : null, filters.assignedTo)
  ) {
    return false;
  }

  if (
    filters.createdBy &&
    !matchesActorValue(typeof createdBy.id === 'string' ? createdBy.id : null, filters.createdBy) &&
    !matchesActorValue(typeof createdBy.email === 'string' ? createdBy.email : null, filters.createdBy)
  ) {
    return false;
  }

  return true;
}

export function buildInitialWorkflow(
  intent: 'draft' | 'submit' | 'review' | 'publish',
  user: AdminSessionIdentity,
  options: { deferPublish?: boolean } = {}
): WorkflowMeta {
  const actorRef = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const status =
    intent === 'publish'
      ? options.deferPublish
        ? 'approved'
        : 'published'
      : intent === 'review' || intent === 'submit'
        ? 'submitted'
        : 'draft';

  const now = new Date();
  return {
    status,
    priority: 'normal',
    assignedTo: null,
    createdBy: actorRef,
    reviewedBy: intent === 'publish' ? actorRef : null,
    submittedAt: intent === 'review' || intent === 'submit' || intent === 'publish' ? now : null,
    approvedAt: intent === 'publish' ? now : null,
    rejectedAt: null,
    publishedAt: intent === 'publish' && !options.deferPublish ? now : null,
    scheduledFor: null,
    dueAt: null,
    rejectionReason: '',
    comments: [],
  };
}

export function sanitizeReporterArticleInput(
  input: NormalizedArticleInput,
  user: AdminSessionIdentity
): NormalizedArticleInput {
  const bodyText = input.content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    ...input,
    summary: bodyText.slice(0, 240),
    category: 'General',
    author: user.name?.trim() || user.email.trim() || 'Reporter',
    isBreaking: false,
    isTrending: false,
    seo: normalizeSeo(undefined),
    reporterMeta: normalizeReporterMeta(undefined),
    copyEditorMeta: normalizeCopyEditorMeta(undefined),
    editorial: normalizeArticleEditorialMeta(undefined),
    media: normalizeArticleMediaMetadata(undefined),
    sourceStoryId: '',
    sourceType: normalizeArticleSourceType('manual'),
  };
}

export function resolveBreakingAudioUrl(article: Record<string, unknown>): string {
  const breakingTts =
    article.breakingTts && typeof article.breakingTts === 'object'
      ? (article.breakingTts as Record<string, unknown>)
      : null;
  return typeof breakingTts?.audioUrl === 'string' ? breakingTts.audioUrl : '';
}

export function resolveNextBreakingTts(
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
