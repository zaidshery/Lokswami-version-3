import connectDB from '@/lib/db/mongoose';
import Article from '@/lib/models/Article';
import EPaper from '@/lib/models/EPaper';
import Story from '@/lib/models/Story';
import Video from '@/lib/models/Video';
import { listAllStoredArticles } from '@/lib/storage/articlesFile';
import { listAllStoredEPapers } from '@/lib/storage/epapersFile';
import { listAllStoredStories } from '@/lib/storage/storiesFile';
import { listAllStoredVideos } from '@/lib/storage/videosFile';
import {
  normalizeCopyEditorMeta,
  normalizeReporterMeta,
  type CopyEditorMeta,
  type ReporterMeta,
} from '@/lib/content/newsroomMetadata';
import {
  countStoryMediaAssets,
  normalizeStoryMediaAssets,
  type StoryMediaAsset,
} from '@/lib/content/storyMedia';
import {
  isAssignedContent,
  isOwnContent,
  type PermissionUser,
} from '@/lib/auth/permissions';
import { resolveArticleWorkflow } from '@/lib/workflow/article';
import { resolveEpaperProduction } from '@/lib/workflow/epaper';
import { resolveStoryWorkflow } from '@/lib/workflow/story';
import { resolveVideoWorkflow } from '@/lib/workflow/video';
import {
  isWorkflowStatus,
  type EPaperProductionStatus,
  type WorkflowPriority,
  type WorkflowStatus,
} from '@/lib/workflow/types';
import {
  buildEditorialReadiness,
  buildPublicationReadiness,
  type WorkflowReadinessReport,
} from '@/lib/workflow/readiness';
import { resolveEPaperPublicationType } from '@/lib/utils/epaperPublication';
import type { EPaperPublicationType } from '@/lib/types/epaper';

export type WorkflowContentKey = 'article' | 'story' | 'video' | 'epaper';
type DeskStatus = WorkflowStatus | EPaperProductionStatus;
export type ReviewQueueAssignmentFilter = 'assigned' | 'unassigned';

type ArticleSource = {
  _id?: unknown;
  version?: unknown;
  title?: string;
  summary?: string;
  content?: string;
  category?: string;
  author?: string;
  image?: string;
  slug?: string;
  isBreaking?: boolean;
  breakingTts?: unknown;
  updatedAt?: Date | string;
  publishedAt?: Date | string;
  workflow?: unknown;
  reporterMeta?: unknown;
  copyEditorMeta?: unknown;
};

type StorySource = {
  _id?: unknown;
  version?: unknown;
  title?: string;
  caption?: string;
  category?: string;
  author?: string;
  updatedAt?: Date | string;
  publishedAt?: Date | string;
  workflow?: unknown;
  isPublished?: boolean;
  reporterMeta?: unknown;
  copyEditorMeta?: unknown;
  thumbnail?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  mediaAssets?: StoryMediaAsset[] | unknown;
  storageProvider?: string;
};

type VideoSource = {
  _id?: unknown;
  title?: string;
  description?: string;
  thumbnail?: string;
  videoUrl?: string;
  category?: string;
  updatedAt?: Date | string;
  publishedAt?: Date | string;
  workflow?: unknown;
  isPublished?: boolean;
};

type EPaperSource = {
  _id?: unknown;
  title?: string;
  publicationType?: unknown;
  cityName?: string;
  city?: string;
  publishDate?: Date | string;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  status?: 'draft' | 'published';
  productionStatus?: unknown;
  productionAssignee?: unknown;
  productionNotes?: unknown;
  qaCompletedAt?: Date | string | null;
  sourceLabel?: string;
  pdfPath?: string;
  thumbnailPath?: string;
  pageCount?: number;
  pages?: Array<{ imagePath?: string }>;
  readiness?: { blockers?: string[]; warnings?: string[]; pagesMissingImage?: number };
};

export type DeskItem = {
  contentType: WorkflowContentKey;
  publicationType: EPaperPublicationType | null;
  isBreaking?: boolean;
  id: string;
  version?: number;
  title: string;
  category: string;
  author: string;
  updatedAt: string;
  status: DeskStatus;
  priority: WorkflowPriority | null;
  assignedToId: string;
  assignedToEmail: string;
  assignedToName: string;
  createdById: string;
  createdByEmail: string;
  createdByName: string;
  dueAt: string | null;
  scheduledFor: string | null;
  commentsCount: number;
  readiness: WorkflowReadinessReport;
  editHref: string;
  deskHref: string;
  reporterSummary: ReporterMeta | null;
  copyEditorSummary: CopyEditorMeta | null;
  assetSummary?: {
    images: number;
    videos: number;
    hasThumbnail: boolean;
    hasVideo: boolean;
    storageProvider: string;
  } | null;
};

export type WorkflowArticleCard = DeskItem;
export type WorkflowStatusCounts = Partial<Record<WorkflowStatus, number>>;
export type EPaperProductionCounts = Partial<Record<EPaperProductionStatus, number>>;

export type MyWorkOverview = {
  counts: Partial<Record<WorkflowStatus, number>>;
  productionCounts: EPaperProductionCounts;
  contentCounts: Partial<Record<WorkflowContentKey, number>>;
  items: WorkflowArticleCard[];
};

export type ReviewQueueOverview = {
  counts: Partial<Record<WorkflowStatus, number>>;
  productionCounts: EPaperProductionCounts;
  items: WorkflowArticleCard[];
  contentCounts: Partial<Record<WorkflowContentKey, number>>;
};

type OverviewOptions = {
  maxItems?: number | null;
  filters?: {
    contentType?: WorkflowContentKey;
    status?: DeskStatus;
    priority?: WorkflowPriority;
    assignment?: ReviewQueueAssignmentFilter;
  };
};

export type ArticleWorkflowSummary = {
  counts: WorkflowStatusCounts;
  needsReview: number;
  readyToPublish: number;
  published: number;
  drafts: number;
  rejected: number;
};

export const REVIEW_QUEUE_STATUSES: WorkflowStatus[] = [
  'submitted',
  'assigned',
  'in_review',
  'copy_edit',
  'changes_requested',
  'ready_for_approval',
  'approved',
  'scheduled',
];

export const REVIEW_QUEUE_EPAPER_STATUSES: EPaperProductionStatus[] = [
  'pages_ready',
  'ocr_review',
  'hotspot_mapping',
  'ready_to_publish',
];

function shouldUseFileStore() {
  return !process.env.MONGODB_URI?.trim();
}

function toIsoDate(value: unknown) {
  const parsed =
    value instanceof Date ? value : value ? new Date(String(value)) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function bumpStatusCount(
  counts: Partial<Record<WorkflowStatus, number>>,
  status: WorkflowStatus
) {
  counts[status] = Number(counts[status] || 0) + 1;
}

function bumpContentCount(
  counts: Partial<Record<WorkflowContentKey, number>>,
  contentType: WorkflowContentKey
) {
  counts[contentType] = Number(counts[contentType] || 0) + 1;
}

function bumpProductionCount(
  counts: Partial<Record<EPaperProductionStatus, number>>,
  status: EPaperProductionStatus
) {
  counts[status] = Number(counts[status] || 0) + 1;
}

function toWorkflowSummary(counts: WorkflowStatusCounts): ArticleWorkflowSummary {
  return {
    counts,
    needsReview:
      Number(counts.submitted || 0) +
      Number(counts.assigned || 0) +
      Number(counts.in_review || 0) +
      Number(counts.copy_edit || 0) +
      Number(counts.changes_requested || 0),
    readyToPublish:
      Number(counts.ready_for_approval || 0) +
      Number(counts.approved || 0) +
      Number(counts.scheduled || 0),
    published: Number(counts.published || 0),
    drafts: Number(counts.draft || 0),
    rejected: Number(counts.rejected || 0),
  };
}

function buildArticleItem(source: ArticleSource): DeskItem | null {
  const id = String(source._id || '').trim();
  const title = String(source.title || '').trim();
  if (!id || !title) return null;

  const workflow = resolveArticleWorkflow({
    workflow: source.workflow,
    publishedAt: source.publishedAt,
    updatedAt: source.updatedAt,
  });

  return {
    contentType: 'article',
    publicationType: null,
    isBreaking: Boolean(source.isBreaking),
    id,
    version:
      typeof source.version === 'number' && Number.isInteger(source.version) && source.version > 0
        ? source.version
        : 1,
    title,
    category: String(source.category || 'General').trim() || 'General',
    author: String(source.author || 'Desk').trim() || 'Desk',
    updatedAt: toIsoDate(source.updatedAt || source.publishedAt),
    status: workflow.status,
    priority: workflow.priority,
    assignedToId: workflow.assignedTo?.id || '',
    assignedToEmail: workflow.assignedTo?.email || '',
    assignedToName: workflow.assignedTo?.name || '',
    createdById: workflow.createdBy?.id || '',
    createdByEmail: workflow.createdBy?.email || '',
    createdByName: workflow.createdBy?.name || '',
    dueAt: workflow.dueAt?.toISOString() || null,
    scheduledFor: workflow.scheduledFor?.toISOString() || null,
    commentsCount: workflow.comments.length,
    readiness: buildEditorialReadiness({
      contentType: 'article',
      title: source.title,
      summary: source.summary,
      content: source.content,
      category: source.category,
      author: source.author,
      image: source.image,
      slug: source.slug,
      isBreaking: source.isBreaking,
      breakingAudioReady:
        !source.isBreaking || Boolean(
          source.breakingTts && typeof source.breakingTts === 'object' &&
            String((source.breakingTts as { audioUrl?: unknown }).audioUrl || '').trim()
        ),
    }),
    editHref: `/admin/articles/${encodeURIComponent(id)}/edit`,
    deskHref: '/admin/articles',
    reporterSummary: normalizeReporterMeta(source.reporterMeta),
    copyEditorSummary: normalizeCopyEditorMeta(source.copyEditorMeta),
  };
}

function buildStoryItem(source: StorySource): DeskItem | null {
  const id = String(source._id || '').trim();
  const title = String(source.title || '').trim();
  if (!id || !title) return null;

  const workflow = resolveStoryWorkflow({
    workflow: source.workflow,
    isPublished: source.isPublished,
    publishedAt: source.publishedAt,
    updatedAt: source.updatedAt,
  });
  const mediaAssets = normalizeStoryMediaAssets(source.mediaAssets);
  const mediaCounts = countStoryMediaAssets(mediaAssets);
  const hasThumbnail =
    Boolean(String(source.thumbnail || '').trim()) || mediaCounts.images > 0;
  const hasVideo =
    source.mediaType === 'video' ||
    Boolean(String(source.mediaUrl || '').trim()) ||
    mediaCounts.videos > 0;

  return {
    contentType: 'story',
    publicationType: null,
    id,
    version:
      typeof source.version === 'number' && Number.isInteger(source.version) && source.version > 0
        ? source.version
        : 1,
    title,
    category: String(source.category || 'General').trim() || 'General',
    author: workflow.createdBy?.name || String(source.author || 'Desk').trim() || 'Desk',
    updatedAt: toIsoDate(source.updatedAt || source.publishedAt),
    status: workflow.status,
    priority: workflow.priority,
    assignedToId: workflow.assignedTo?.id || '',
    assignedToEmail: workflow.assignedTo?.email || '',
    assignedToName: workflow.assignedTo?.name || '',
    createdById: workflow.createdBy?.id || '',
    createdByEmail: workflow.createdBy?.email || '',
    createdByName: workflow.createdBy?.name || '',
    dueAt: workflow.dueAt?.toISOString() || null,
    scheduledFor: workflow.scheduledFor?.toISOString() || null,
    commentsCount: workflow.comments.length,
    readiness: buildEditorialReadiness({
      contentType: 'story',
      title: source.title,
      category: source.category,
      thumbnail: source.thumbnail,
      mediaUrl: source.mediaUrl,
      mediaAssets: source.mediaAssets,
    }),
    editHref: `/admin/stories/${encodeURIComponent(id)}/edit`,
    deskHref: '/admin/stories',
    reporterSummary: normalizeReporterMeta(source.reporterMeta),
    copyEditorSummary: normalizeCopyEditorMeta(source.copyEditorMeta),
    assetSummary: {
      images: mediaCounts.images || (hasThumbnail ? 1 : 0),
      videos: mediaCounts.videos || (hasVideo ? 1 : 0),
      hasThumbnail,
      hasVideo,
      storageProvider: String(source.storageProvider || '').trim(),
    },
  };
}

function buildVideoItem(source: VideoSource): DeskItem | null {
  const id = String(source._id || '').trim();
  const title = String(source.title || '').trim();
  if (!id || !title) return null;

  const workflow = resolveVideoWorkflow({
    workflow: source.workflow,
    isPublished: source.isPublished,
    publishedAt: source.publishedAt,
    updatedAt: source.updatedAt,
  });

  return {
    contentType: 'video',
    publicationType: null,
    id,
    title,
    category: String(source.category || 'General').trim() || 'General',
    author: workflow.createdBy?.name || 'Desk',
    updatedAt: toIsoDate(source.updatedAt || source.publishedAt),
    status: workflow.status,
    priority: workflow.priority,
    assignedToId: workflow.assignedTo?.id || '',
    assignedToEmail: workflow.assignedTo?.email || '',
    assignedToName: workflow.assignedTo?.name || '',
    createdById: workflow.createdBy?.id || '',
    createdByEmail: workflow.createdBy?.email || '',
    createdByName: workflow.createdBy?.name || '',
    dueAt: workflow.dueAt?.toISOString() || null,
    scheduledFor: workflow.scheduledFor?.toISOString() || null,
    commentsCount: workflow.comments.length,
    readiness: buildEditorialReadiness({
      contentType: 'video',
      title: source.title,
      description: source.description,
      category: source.category,
      thumbnail: source.thumbnail,
      videoUrl: source.videoUrl,
    }),
    editHref: `/admin/videos/${encodeURIComponent(id)}/edit`,
    deskHref: '/admin/videos',
    reporterSummary: null,
    copyEditorSummary: null,
  };
}

function buildEpaperItem(source: EPaperSource): DeskItem | null {
  const id = String(source._id || '').trim();
  const title = String(source.title || '').trim();
  if (!id || !title) return null;

  const production = resolveEpaperProduction({
    productionStatus: source.productionStatus,
    productionAssignee: source.productionAssignee,
    productionNotes: source.productionNotes,
    qaCompletedAt: source.qaCompletedAt,
    status: source.status,
  });

  const cityName = String(source.cityName || source.city || 'Edition').trim() || 'Edition';
  const sourceLabel = String(source.sourceLabel || 'E-Paper Desk').trim() || 'E-Paper Desk';
  const publicationType = resolveEPaperPublicationType(source.publicationType);
  const pages = Array.isArray(source.pages) ? source.pages : [];
  const pagesMissingImage =
    typeof source.readiness?.pagesMissingImage === 'number'
      ? source.readiness.pagesMissingImage
      : Math.max(0, Number(source.pageCount || 0) - pages.filter((page) => Boolean(page?.imagePath)).length);

  return {
    contentType: 'epaper',
    publicationType,
    id,
    title,
    category: cityName,
    author: sourceLabel,
    updatedAt: toIsoDate(source.updatedAt || source.publishDate || source.createdAt),
    status: production.productionStatus,
    priority: null,
    assignedToId: production.productionAssignee?.id || '',
    assignedToEmail: production.productionAssignee?.email || '',
    assignedToName: production.productionAssignee?.name || '',
    createdById: '',
    createdByEmail: '',
    createdByName: '',
    dueAt: null,
    scheduledFor: null,
    commentsCount: production.productionNotes.length,
    readiness: buildPublicationReadiness({
      publicationType,
      title: source.title,
      pdfPath: source.pdfPath,
      thumbnailPath: source.thumbnailPath,
      pageCount: source.pageCount,
      pagesMissingImage,
      blockers: source.readiness?.blockers,
      warnings: source.readiness?.warnings,
    }),
    editHref: `/admin/${publicationType === 'emagazine' ? 'emagazines' : 'epapers'}/${encodeURIComponent(id)}`,
    deskHref: publicationType === 'emagazine' ? '/admin/emagazines' : '/admin/epapers',
    reporterSummary: null,
    copyEditorSummary: null,
  };
}

function buildPermissionRecordFromSource(item: {
  contentType: WorkflowContentKey;
  source: ArticleSource | StorySource | VideoSource | EPaperSource;
}) {
  if (item.contentType === 'article') {
    const source = item.source as ArticleSource;
    return {
      legacyAuthorName: String(source.author || ''),
      workflow: resolveArticleWorkflow({
        workflow: source.workflow,
        publishedAt: source.publishedAt,
        updatedAt: source.updatedAt,
      }),
    };
  }

  if (item.contentType === 'story') {
    const source = item.source as StorySource;
    return {
      legacyAuthorName: String(source.author || ''),
      workflow: resolveStoryWorkflow({
        workflow: source.workflow,
        isPublished: source.isPublished,
        publishedAt: source.publishedAt,
        updatedAt: source.updatedAt,
      }),
    };
  }

  if (item.contentType === 'epaper') {
    const source = item.source as EPaperSource;
    const production = resolveEpaperProduction({
      productionStatus: source.productionStatus,
      productionAssignee: source.productionAssignee,
      productionNotes: source.productionNotes,
      qaCompletedAt: source.qaCompletedAt,
      status: source.status,
    });

    return {
      assignedToId: production.productionAssignee?.id || '',
    };
  }

  const source = item.source as VideoSource;
  return {
    workflow: resolveVideoWorkflow({
      workflow: source.workflow,
      isPublished: source.isPublished,
      publishedAt: source.publishedAt,
      updatedAt: source.updatedAt,
    }),
  };
}

async function loadArticles(): Promise<ArticleSource[]> {
  if (shouldUseFileStore()) {
    return listAllStoredArticles();
  }

  try {
    await connectDB();
    return (await Article.find({})
      .select('_id version title summary content category author image slug isBreaking breakingTts updatedAt publishedAt workflow reporterMeta copyEditorMeta')
      .sort({ updatedAt: -1, publishedAt: -1, _id: -1 })
      .lean()) as ArticleSource[];
  } catch (error) {
    console.error('MongoDB unavailable for article workflow overview, using file store.', error);
    return listAllStoredArticles();
  }
}

async function loadStories(): Promise<StorySource[]> {
  if (shouldUseFileStore()) {
    return listAllStoredStories();
  }

  try {
    await connectDB();
    return (await Story.find({})
      .select(
        '_id title caption category author updatedAt publishedAt workflow isPublished reporterMeta copyEditorMeta thumbnail mediaUrl mediaType mediaAssets storageProvider'
      )
      .sort({ updatedAt: -1, publishedAt: -1, _id: -1 })
      .lean()) as StorySource[];
  } catch (error) {
    console.error('MongoDB unavailable for story workflow overview, using file store.', error);
    return listAllStoredStories();
  }
}

async function loadVideos(): Promise<VideoSource[]> {
  if (shouldUseFileStore()) {
    return listAllStoredVideos();
  }

  try {
    await connectDB();
    return (await Video.find({})
      .select('_id title description thumbnail videoUrl category updatedAt publishedAt workflow isPublished')
      .sort({ updatedAt: -1, publishedAt: -1, _id: -1 })
      .lean()) as VideoSource[];
  } catch (error) {
    console.error('MongoDB unavailable for video workflow overview, using file store.', error);
    return listAllStoredVideos();
  }
}

async function loadEPapers(): Promise<EPaperSource[]> {
  if (shouldUseFileStore()) {
    return (await listAllStoredEPapers()).map((source) => ({
      _id: source._id,
      title: source.title,
      cityName: source.city,
      publishDate: source.publishDate,
      updatedAt: source.updatedAt,
      createdAt: source.publishedAt,
      status: 'published',
      productionStatus: 'published',
      sourceLabel: 'Legacy file store',
    }));
  }

  try {
    await connectDB();
    return (await EPaper.find({})
      .select(
        '_id title publicationType cityName publishDate updatedAt createdAt status productionStatus productionAssignee productionNotes qaCompletedAt sourceLabel pdfPath thumbnailPath pageCount pages readiness'
      )
      .sort({ updatedAt: -1, publishDate: -1, _id: -1 })
      .lean()) as EPaperSource[];
  } catch (error) {
    console.error('MongoDB unavailable for e-paper workflow overview, using file store.', error);
    return (await listAllStoredEPapers()).map((source) => ({
      _id: source._id,
      title: source.title,
      cityName: source.city,
      publishDate: source.publishDate,
      updatedAt: source.updatedAt,
      createdAt: source.publishedAt,
      status: 'published',
      productionStatus: 'published',
      sourceLabel: 'Legacy file store',
    }));
  }
}

async function loadDeskItems() {
  const [articles, stories, videos, epapers] = await Promise.all([
    loadArticles(),
    loadStories(),
    loadVideos(),
    loadEPapers(),
  ]);

  return [
    ...articles.map((source) => ({ contentType: 'article' as const, source })),
    ...stories.map((source) => ({ contentType: 'story' as const, source })),
    ...videos.map((source) => ({ contentType: 'video' as const, source })),
    ...epapers.map((source) => ({ contentType: 'epaper' as const, source })),
  ];
}

export async function getAllWorkflowDeskItems(): Promise<DeskItem[]> {
  const all = await loadDeskItems();
  return all
    .map((entry) => toDeskItem(entry))
    .filter((item): item is DeskItem => Boolean(item))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function toDeskItem(entry: {
  contentType: WorkflowContentKey;
  source: ArticleSource | StorySource | VideoSource | EPaperSource;
}) {
  switch (entry.contentType) {
    case 'article':
      return buildArticleItem(entry.source as ArticleSource);
    case 'story':
      return buildStoryItem(entry.source as StorySource);
    case 'video':
      return buildVideoItem(entry.source as VideoSource);
    case 'epaper':
      return buildEpaperItem(entry.source as EPaperSource);
    default:
      return null;
  }
}

export async function getMyWorkOverview(
  user: PermissionUser,
  options: OverviewOptions = {}
): Promise<MyWorkOverview> {
  const all = await loadDeskItems();
  const counts: Partial<Record<WorkflowStatus, number>> = {};
  const productionCounts: EPaperProductionCounts = {};
  const contentCounts: Partial<Record<WorkflowContentKey, number>> = {};
  const maxItems = options.maxItems ?? 8;

  const items = all
    .filter((entry) => {
      const permissionRecord = buildPermissionRecordFromSource(entry);
      const matches = isOwnContent(user, permissionRecord) || isAssignedContent(user, permissionRecord);
      if (matches) {
        const item = toDeskItem(entry);
        if (!item) return false;

        if (isWorkflowStatus(item.status)) {
          bumpStatusCount(counts, item.status);
        } else {
          bumpProductionCount(productionCounts, item.status);
        }
        bumpContentCount(contentCounts, entry.contentType);
      }
      return matches;
    })
    .map((entry) => toDeskItem(entry))
    .filter((item): item is DeskItem => Boolean(item))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  return {
    counts,
    productionCounts,
    contentCounts,
    items: maxItems === null ? items : items.slice(0, maxItems),
  };
}

export async function getReviewQueueOverview(
  options: OverviewOptions = {}
): Promise<ReviewQueueOverview> {
  const all = await loadDeskItems();
  const counts: Partial<Record<WorkflowStatus, number>> = {};
  const productionCounts: EPaperProductionCounts = {};
  const contentCounts: Partial<Record<WorkflowContentKey, number>> = {};
  const maxItems = options.maxItems ?? 12;

  const items = all
    .filter((entry) => {
      const item = toDeskItem(entry);
      if (!item) return false;

      const included = isWorkflowStatus(item.status)
        ? REVIEW_QUEUE_STATUSES.includes(item.status)
        : REVIEW_QUEUE_EPAPER_STATUSES.includes(item.status);
      if (included) {
        if (isWorkflowStatus(item.status)) {
          bumpStatusCount(counts, item.status);
        } else {
          bumpProductionCount(productionCounts, item.status);
        }
        bumpContentCount(contentCounts, entry.contentType);
      }

      if (!included) return false;

      if (options.filters?.contentType && item.contentType !== options.filters.contentType) {
        return false;
      }

      if (options.filters?.status && item.status !== options.filters.status) {
        return false;
      }

      if (options.filters?.priority && item.priority !== options.filters.priority) {
        return false;
      }

      if (options.filters?.assignment) {
        const hasAssignee = Boolean(
          item.assignedToId || item.assignedToEmail || item.assignedToName
        );
        if (options.filters.assignment === 'assigned' && !hasAssignee) {
          return false;
        }
        if (options.filters.assignment === 'unassigned' && hasAssignee) {
          return false;
        }
      }

      return true;
    })
    .map((entry) => toDeskItem(entry))
    .filter((item): item is DeskItem => Boolean(item))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  return {
    counts,
    productionCounts,
    items: maxItems === null ? items : items.slice(0, maxItems),
    contentCounts,
  };
}

export async function getArticleWorkflowSummary(): Promise<ArticleWorkflowSummary> {
  const all = await loadArticles();
  const counts: WorkflowStatusCounts = {};

  for (const article of all) {
    const workflow = resolveArticleWorkflow({
      workflow: article.workflow,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
    });
    bumpStatusCount(counts, workflow.status);
  }

  return toWorkflowSummary(counts);
}
