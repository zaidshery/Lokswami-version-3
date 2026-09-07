export type EPaperStatus = 'draft' | 'published';
export const EPAPER_PUBLICATION_TYPES = ['epaper', 'emagazine'] as const;
export type EPaperPublicationType = (typeof EPAPER_PUBLICATION_TYPES)[number];
export type EPaperReadinessStatus = 'ready' | 'needs-review' | 'not-ready';
export const EPAPER_PAGE_REVIEW_STATUSES = ['pending', 'needs_attention', 'ready'] as const;
export type EPaperPageReviewStatus = (typeof EPAPER_PAGE_REVIEW_STATUSES)[number];
export const EPAPER_PAGE_TYPES = [
  'editorial',
  'advertisement',
  'classified',
  'photo',
  'blank',
] as const;
export type EPaperPageType = (typeof EPAPER_PAGE_TYPES)[number];
export const EPAPER_PAGE_PROCESSING_STATUSES = [
  'pending',
  'processing',
  'ready',
  'failed',
] as const;
export type EPaperPageProcessingStatus =
  (typeof EPAPER_PAGE_PROCESSING_STATUSES)[number];
export const EPAPER_PROCESSING_JOB_STATUSES = [
  'queued',
  'processing',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
] as const;
export type EPaperProcessingJobStatus =
  (typeof EPAPER_PROCESSING_JOB_STATUSES)[number];
export const EPAPER_OCR_SUGGESTION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'suppressed',
] as const;
export type EPaperOcrSuggestionStatus =
  (typeof EPAPER_OCR_SUGGESTION_STATUSES)[number];
export type EPaperProductionStatus =
  | 'draft_upload'
  | 'pages_ready'
  | 'ocr_review'
  | 'hotspot_mapping'
  | 'ready_to_publish'
  | 'published'
  | 'archived';

export interface EPaperWorkflowActor {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface EPaperWorkflowComment {
  id: string;
  body: string;
  kind: string;
  author: EPaperWorkflowActor;
  createdAt: string;
}

export interface EPaperPageData {
  pageNumber: number;
  imagePath?: string;
  width?: number;
  height?: number;
  pageType?: EPaperPageType;
  classificationNote?: string;
  processingStatus?: EPaperPageProcessingStatus;
  processingError?: string;
  processedAt?: string | null;
  reviewStatus?: EPaperPageReviewStatus;
  reviewNote?: string;
  reviewedAt?: string | null;
  reviewedBy?: EPaperWorkflowActor | null;
}

export interface EPaperReadiness {
  assetReadiness?: 'ready' | 'not-ready';
  mappingReadiness?: 'ready' | 'needs-review';
  status: EPaperReadinessStatus;
  blockers: string[];
  warnings: string[];
  pageImageCoveragePercent: number;
  hotspotCoveragePercent: number;
  textCoveragePercent: number;
  pagesWithImage: number;
  pagesMissingImage: number;
  pagesWithHotspots: number;
  pagesMissingHotspots: number;
  mappedArticles: number;
  articlesWithReadableText: number;
  articlesMissingReadableText: number;
  editorialPages: number;
  nonEditorialPages: number;
  pagesReadyForPublish: number;
  pagesPendingQa: number;
  pagesNeedingAttention: number;
  missingImagePages: number[];
  missingHotspotPages: number[];
  pendingQaPages: number[];
  invalidBlankPages: number[];
}

export interface EPaperAutomationInfo {
  sourceType:
    | 'manual-upload'
    | 'drive-import'
    | 'remote-import'
    | 'legacy'
    | 'unknown';
  sourceLabel?: string;
  sourceUrl?: string;
  sourceHost?: string;
  pageImageGenerationEnabled: boolean;
  pageImageGenerationAvailable: boolean;
  pageImageGenerationReason?: string;
}

export interface EPaperRecord {
  _id: string;
  publicationType?: EPaperPublicationType;
  citySlug: string;
  cityName: string;
  title: string;
  publishDate: string;
  pdfPath: string;
  thumbnailPath: string;
  pageCount: number;
  pages: EPaperPageData[];
  status: EPaperStatus;
  familyId?: string;
  revisionNumber?: number;
  isCurrentRevision?: boolean;
  supersedesId?: string;
  publishedAt?: string | null;
  productionStatus?: EPaperProductionStatus;
  productionAssignee?: EPaperWorkflowActor | null;
  productionNotes?: EPaperWorkflowComment[];
  qaCompletedAt?: string | null;
  articleCount?: number;
  pagesWithImage?: number;
  pagesMissingImage?: number;
  readiness?: EPaperReadiness;
  automation?: EPaperAutomationInfo;
  sourceType?: EPaperAutomationInfo['sourceType'];
  sourceLabel?: string;
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EPaperArticleHotspot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EPaperArticleRecord {
  releaseVersion?: number;
  _id: string;
  epaperId: string;
  pageNumber: number;
  title: string;
  slug: string;
  excerpt?: string;
  contentHtml?: string;
  coverImagePath?: string;
  videoUrl?: string;
  hotspot: EPaperArticleHotspot;
  workflow?: {
    status?: string;
    priority?: string;
    createdBy?: EPaperWorkflowActor | null;
    assignedTo?: EPaperWorkflowActor | null;
    reviewedBy?: EPaperWorkflowActor | null;
    submittedAt?: string | null;
    approvedAt?: string | null;
    rejectedAt?: string | null;
    publishedAt?: string | null;
    scheduledFor?: string | null;
    dueAt?: string | null;
    rejectionReason?: string;
    comments?: EPaperWorkflowComment[];
  };
  createdAt?: string;
  updatedAt?: string;
}

const epaperPageReviewStatusSet = new Set<string>(EPAPER_PAGE_REVIEW_STATUSES);
const epaperPublicationTypeSet = new Set<string>(EPAPER_PUBLICATION_TYPES);

export function isEPaperPublicationType(value: unknown): value is EPaperPublicationType {
  return typeof value === 'string' && epaperPublicationTypeSet.has(value);
}

export function normalizeEPaperPublicationType(value: unknown): EPaperPublicationType {
  return value === 'emagazine' ? 'emagazine' : 'epaper';
}

export function isEPaperPageReviewStatus(value: unknown): value is EPaperPageReviewStatus {
  return typeof value === 'string' && epaperPageReviewStatusSet.has(value);
}

const epaperPageTypeSet = new Set<string>(EPAPER_PAGE_TYPES);

export function isEPaperPageType(value: unknown): value is EPaperPageType {
  return typeof value === 'string' && epaperPageTypeSet.has(value);
}
