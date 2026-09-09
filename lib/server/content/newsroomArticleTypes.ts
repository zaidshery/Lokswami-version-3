import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { AdminRole } from '@/lib/auth/roles';
import type { ContentTransitionAction } from '@/lib/auth/permissions';
import type { ArticleSeoFields } from '@/lib/seo/articleSeo';
import type { ArticleDocument } from '@/lib/content/articleDocument';
import type { ArticleMediaMetadata } from '@/lib/content/articleMediaMetadata';
import type { ArticleEditorialMeta } from '@/lib/content/articleEditorial';
import type { ReporterMeta, CopyEditorMeta } from '@/lib/content/newsroomMetadata';
import type { WorkflowMeta, WorkflowStatus, WorkflowPriority } from '@/lib/workflow/types';

export type { AdminSessionIdentity, WorkflowMeta, WorkflowStatus, WorkflowPriority };

export class ArticleVersionConflictError extends Error {
  readonly code = 'ARTICLE_VERSION_CONFLICT';
  readonly currentVersion: number;
  readonly updatedAt: Date | string | null;

  constructor(currentVersion: number, updatedAt?: Date | string | null) {
    super('This draft changed in another session. Reload or compare changes before saving.');
    this.name = 'ArticleVersionConflictError';
    this.currentVersion = currentVersion;
    this.updatedAt = updatedAt ?? null;
  }
}

export class ArticleNotFoundError extends Error {
  constructor(message = 'Article not found') {
    super(message);
    this.name = 'ArticleNotFoundError';
  }
}

export class EditorialValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'EditorialValidationError';
    this.status = status;
  }
}

export class EditorialForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'EditorialForbiddenError';
  }
}

export class MongoAssignmentUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super('Assignments require MongoDB-backed users.');
    this.name = 'MongoAssignmentUnavailableError';
  }
}

export interface NewsroomListQuery {
  category?: string | null;
  scope?: string | null;
  workflowStatus?: string | null;
  assignedTo?: string | null;
  createdBy?: string | null;
  limit?: number | null;
  page?: number;
}

export interface NewsroomListPagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface NewsroomListResult {
  data: Record<string, unknown>[];
  pagination: NewsroomListPagination;
}

export interface AssigneeRef {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

export interface WorkflowActionBody {
  action?: ContentTransitionAction;
  assignedToId?: string;
  scheduledFor?: string;
  dueAt?: string;
  priority?: string;
  rejectionReason?: string;
  comment?: string;
  expectedVersion?: number | null;
}

export interface NormalizedSeo {
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
}

export interface NormalizedArticleInput {
  title: string;
  slug: string;
  previousSlugs: string[];
  summary: string;
  content: string;
  contentJson?: ArticleDocument;
  image: string;
  category: string;
  author: string;
  isBreaking: boolean;
  isTrending: boolean;
  seo: NormalizedSeo;
  reporterMeta: ReporterMeta;
  copyEditorMeta: CopyEditorMeta;
  editorial: ArticleEditorialMeta;
  media: ArticleMediaMetadata;
  sourceType?: string;
  sourceStoryId?: string;
  sourceStoryTitle?: string;
}

export interface RevisionSnapshot {
  title: string;
  summary: string;
  content: string;
  contentJson?: ArticleDocument;
  image: string;
  category: string;
  author: string;
  slug: string;
  previousSlugs: string[];
  isBreaking: boolean;
  isTrending: boolean;
  seo: NormalizedSeo;
  reporterMeta: ReporterMeta;
  copyEditorMeta: CopyEditorMeta;
  editorial: ArticleEditorialMeta;
  media: ArticleMediaMetadata;
  savedAt: Date;
}

export interface PersistedArticleRecord {
  _id: string;
  id?: string;
  version?: number;
  title: string;
  slug: string;
  previousSlugs?: string[];
  summary: string;
  content: string;
  contentJson?: ArticleDocument;
  image: string;
  category: string;
  author: string;
  isBreaking?: boolean;
  isTrending?: boolean;
  views?: number;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  seo?: Partial<ArticleSeoFields> | null;
  reporterMeta?: Record<string, unknown> | null;
  copyEditorMeta?: Record<string, unknown> | null;
  editorial?: Record<string, unknown> | null;
  media?: Record<string, unknown> | null;
  workflow?: Record<string, unknown> | null;
  revisions?: Array<Record<string, unknown>>;
  sourceType?: string;
  sourceStoryId?: string;
  sourceStoryTitle?: string;
  breakingTts?: { audioUrl?: string } | null;
  [key: string]: unknown;
}
