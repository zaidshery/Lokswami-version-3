'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  Upload,
  AlertCircle,
  CheckCircle,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Loader,
  Search,
  Volume2,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import ArticleEditorStudio, {
  ArticleEditorSidebar,
  type ArticleEditorStudioMode,
} from '@/components/forms/ArticleEditorStudio';
import ArticleDraftRecoveryNotice from '@/components/forms/ArticleDraftRecoveryNotice';
import ArticleFeaturedImageReaderPreview from '@/components/forms/ArticleFeaturedImageReaderPreview';
import ArticleWorkbenchAssistant, {
  getArticleAssistPatchKey,
} from '@/components/forms/ArticleWorkbenchAssistant';
import ArticleTranslationReview from '@/components/forms/ArticleTranslationReview';
import useArticleServerDraft from '@/components/forms/useArticleServerDraft';
import {
  CmsEditorCanvas,
  CmsEditorColumns,
  CmsEditorMain,
  CmsEditorSidebar,
} from '@/components/admin/CmsEditorLayout';
import { CmsWorkflowActivityTimeline } from '@/components/admin/CmsWorkflowActivityTimeline';
import WorkflowRail from '@/components/admin/WorkflowRail';
import { CmsWorkflowPriorityBadge, CmsWorkflowStatusBadge } from '@/components/admin/CmsWorkflowStatusBadge';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { uploadAuthorProfileImage } from '@/lib/utils/authorProfileImageUpload';
import {
  FACT_CHECK_STATUSES,
  HEADLINE_STATUSES,
  IMAGE_OPTIMIZATION_STATUSES,
} from '@/lib/content/newsroomMetadata';
import {
  canManageWorkflowAssignments,
  canTransitionContent,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
import {
  isAdminRole,
  isCopyEditorRole,
  isReporterDeskRole,
  type AdminRole,
} from '@/lib/auth/roles';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import {
  buildSpokenBreakingHeadline,
  normalizeBreakingTtsMetadata,
  type BreakingTtsMetadata,
} from '@/lib/types/breaking';
import { formatUiDateTime } from '@/lib/utils/dateFormat';
import { buildDefaultArticlePermalink } from '@/lib/utils/articleEditorTemplates';
import { uploadArticleTtsAudioDirect } from '@/lib/utils/articleTtsUploadClient';
import { uploadBreakingTtsAudioDirect } from '@/lib/utils/breakingTtsUploadClient';
import {
  ARTICLE_IMAGE_UPLOAD_GUIDE,
  getArticleImageHints,
  prepareArticleImageFile,
} from '@/lib/utils/articleImageUpload';
import { resolveArticleOgImageUrl } from '@/lib/utils/articleMedia';
import {
  buildArticleGooglePreview,
  buildArticlePublicPath,
  isValidArticleSlug,
  normalizeArticleSeo,
  normalizeArticleSlug,
  stripArticleHtml,
} from '@/lib/seo/articleSeo';
import {
  suggestArticleFocusKeyword,
  suggestArticleSecondaryKeywords,
  type ArticleAssistField,
  type ArticleAssistPatch,
  type ArticleAssistResult,
} from '@/lib/utils/articleAssistant';
import {
  buildWorkflowFeedbackSummary,
  type WorkflowFeedbackTone,
} from '@/lib/workflow/feedback';
import { getAllowedWorkflowTransitions } from '@/lib/workflow/transitions';
import type { WorkflowPriority, WorkflowStatus } from '@/lib/workflow/types';
import { migrateArticleHtmlToDocument } from '@/lib/content/articleDocument';
import {
  createEmptyArticleEditorialMeta,
  normalizeArticleEditorialMeta,
  type ArticleEditorialMeta,
} from '@/lib/content/articleEditorial';
import {
  getOrCreateArticleDraftEditorSessionId,
  isCurrentArticleDraftEditorSession,
} from '@/lib/content/articleDraftRecovery';

const DEFAULT_CATEGORIES = NEWS_CATEGORIES.map((category) => category.nameEn);
const SERVER_AUTOSAVE_DEBOUNCE_MS = 4000;
const LOCAL_AUTOSAVE_DEBOUNCE_MS = 1000;
const DRAFT_STORAGE_PREFIX = 'lokswami:article-draft:edit:';
const WORKFLOW_PRIORITIES: WorkflowPriority[] = ['low', 'normal', 'high', 'urgent'];
const MANUAL_AUDIO_ACCEPT = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4';

const STATUS_TO_ACTION: Partial<Record<WorkflowStatus, ContentTransitionAction>> = {
  submitted: 'submit',
  assigned: 'assign',
  in_review: 'start_review',
  copy_edit: 'move_to_copy_edit',
  changes_requested: 'request_changes',
  ready_for_approval: 'mark_ready_for_approval',
  approved: 'approve',
  rejected: 'reject',
  scheduled: 'schedule',
  published: 'publish',
  archived: 'archive',
};

const ACTION_LABELS: Record<ContentTransitionAction, string> = {
  submit: 'Submit For Review',
  assign: 'Assign',
  start_review: 'Start Review',
  move_to_copy_edit: 'Move To Copy Edit',
  request_changes: 'Request Changes',
  mark_ready_for_approval: 'Mark Ready For Approval',
  approve: 'Approve',
  reject: 'Reject',
  schedule: 'Schedule',
  publish: 'Publish',
  fast_publish: 'Urgent Publish',
  archive: 'Archive',
};

type ArticleFormState = {
  title: string;
  summary: string;
  content: string;
  category: string;
  author: string;
  locationTag: string;
  sourceInfo: string;
  sourceConfidential: boolean;
  reporterNotes: string;
  proofreadComplete: boolean;
  factCheckStatus: 'pending' | 'verified' | 'needs_follow_up';
  headlineStatus: 'pending' | 'rewritten' | 'approved';
  imageOptimizationStatus: 'pending' | 'optimized' | 'not_needed';
  copyEditorNotes: string;
  returnForChangesReason: string;
  isBreaking: boolean;
  isTrending: boolean;
  seoSlug: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  canonicalUrl: string;
  focusKeyword: string;
  secondaryKeywords: string;
  featuredImageAlt: string;
  featuredImageCaption: string;
  imageCredit: string;
  authorProfileUrl: string;
  authorDisplayName: string;
  authorDisplayNameSet: boolean;
  authorAvatarUrl: string;
  authorProgramName: string;
  includeInNewsSitemap: boolean;
  majorUpdateNote: string;
  sourceType: 'story' | 'direct';
  sourceStoryId: string;
  sourceStoryTitle: string;
  editorial: ArticleEditorialMeta;
};

type EditArticleDraftRecovery = {
  formData: ArticleFormState;
  imagePreview: string;
  contentMode: ArticleEditorStudioMode;
  focusMode: boolean;
  savedAt: string;
  recoveryStorageKey: string;
};

type ArticleSeo = {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  focusKeyword?: string;
  secondaryKeywords?: string;
  featuredImageAlt?: string;
  featuredImageCaption?: string;
  imageCredit?: string;
  authorProfileUrl?: string;
  authorDisplayName?: string;
  authorDisplayNameSet?: boolean;
  authorAvatarUrl?: string;
  authorProgramName?: string;
  includeInNewsSitemap?: boolean;
  majorUpdateNote?: string;
};

type RelatedArticleSuggestion = {
  id: string;
  slug?: string;
  title: string;
  category?: string;
};

type ArticleReporterMeta = {
  locationTag?: string;
  sourceInfo?: string;
  sourceConfidential?: boolean;
  reporterNotes?: string;
};

type ArticleCopyEditorMeta = {
  proofreadComplete?: boolean;
  factCheckStatus?: ArticleFormState['factCheckStatus'];
  headlineStatus?: ArticleFormState['headlineStatus'];
  imageOptimizationStatus?: ArticleFormState['imageOptimizationStatus'];
  copyEditorNotes?: string;
  returnForChangesReason?: string;
};

type ManagedTtsAsset = {
  id?: string;
  status?: string;
  provider?: string;
  audioUrl?: string;
  voice?: string;
  model?: string;
  languageCode?: string;
  mimeType?: string;
  storageMode?: string;
  generatedAt?: string;
  updatedAt?: string;
  lastVerifiedAt?: string;
  lastError?: string;
  chunkCount?: number;
  charCount?: number;
};

type ManagedTtsResponse = {
  eligible?: boolean;
  ready?: boolean;
  asset?: ManagedTtsAsset | null;
  message?: string;
};

type RevisionItem = {
  _id?: string;
  title?: string;
  summary?: string;
  savedAt?: string;
};

type WorkflowActor = {
  id?: string;
  name?: string;
  email?: string;
  role?: AdminRole;
};

type WorkflowCommentItem = {
  id?: string;
  body?: string;
  kind?: string;
  author?: WorkflowActor | null;
  createdAt?: string | null;
};

type WorkflowState = {
  status: WorkflowStatus;
  priority: WorkflowPriority;
  createdBy: WorkflowActor | null;
  assignedTo: WorkflowActor | null;
  reviewedBy: WorkflowActor | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  dueAt: string | null;
  rejectionReason: string;
  comments: WorkflowCommentItem[];
};

type ArticleActivityItem = {
  id?: string;
  action?: string;
  fromStatus?: WorkflowStatus | null;
  toStatus?: WorkflowStatus | null;
  actor?: WorkflowActor | null;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  source?: 'audit' | 'derived';
};

type AssignableUserOption = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  profileUrl?: string;
  image?: string;
};

const EMPTY_FORM: ArticleFormState = {
  title: '',
  summary: '',
  content: '',
  category: 'National',
  author: '',
  locationTag: '',
  sourceInfo: '',
  sourceConfidential: false,
  reporterNotes: '',
  proofreadComplete: false,
  factCheckStatus: 'pending',
  headlineStatus: 'pending',
  imageOptimizationStatus: 'pending',
  copyEditorNotes: '',
  returnForChangesReason: '',
  isBreaking: false,
  isTrending: false,
  seoSlug: '',
  seoTitle: '',
  seoDescription: '',
  ogImage: '',
  canonicalUrl: '',
  focusKeyword: '',
  secondaryKeywords: '',
  featuredImageAlt: '',
  featuredImageCaption: '',
  imageCredit: '',
  authorProfileUrl: '',
  authorDisplayName: '',
  authorDisplayNameSet: false,
  authorAvatarUrl: '',
  authorProgramName: '',
  includeInNewsSitemap: true,
  majorUpdateNote: '',
  sourceType: 'direct',
  sourceStoryId: '',
  sourceStoryTitle: '',
  editorial: createEmptyArticleEditorialMeta(),
};

const EMPTY_WORKFLOW: WorkflowState = {
  status: 'draft',
  priority: 'normal',
  createdBy: null,
  assignedTo: null,
  reviewedBy: null,
  submittedAt: null,
  approvedAt: null,
  rejectedAt: null,
  publishedAt: null,
  scheduledFor: null,
  dueAt: null,
  rejectionReason: '',
  comments: [],
};

function formatDraftTimestamp(value: string) {
  return formatUiDateTime(value, '');
}

function isValidAbsoluteHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeDraftArticleSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 200);
}

function formatBreakingTtsTimestamp(value: string | undefined) {
  if (!value) return '';
  return formatUiDateTime(value, '');
}

function buildArticleListenSignature(input: Pick<ArticleFormState, 'title' | 'summary' | 'content'>) {
  return [input.title.trim(), input.summary.trim(), input.content.trim()].join('\n::\n');
}

function buildBreakingRecordingScriptFromForm(
  input: Pick<ArticleFormState, 'title' | 'locationTag'>,
  id = 'breaking-preview'
) {
  return buildSpokenBreakingHeadline({
    id,
    title: input.title.trim() || 'Untitled breaking headline',
    ...(input.locationTag.trim() ? { city: input.locationTag.trim() } : {}),
  });
}

function buildSavedFormSnapshot(formData: ArticleFormState, imagePreview: string) {
  return JSON.stringify({
    ...formData,
    imagePreview: imagePreview.trim(),
  });
}

function normalizeWorkflowState(input: unknown): WorkflowState {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : {};
  const comments = Array.isArray(source.comments)
    ? source.comments.map((entry) => {
        const comment = typeof entry === 'object' && entry ? (entry as Record<string, unknown>) : {};
        const author =
          typeof comment.author === 'object' && comment.author
            ? (comment.author as Record<string, unknown>)
            : {};

        return {
          id: typeof comment.id === 'string' ? comment.id : '',
          body: typeof comment.body === 'string' ? comment.body : '',
          kind: typeof comment.kind === 'string' ? comment.kind : 'comment',
          author: {
            id: typeof author.id === 'string' ? author.id : '',
            name: typeof author.name === 'string' ? author.name : '',
            email: typeof author.email === 'string' ? author.email : '',
            role: typeof author.role === 'string' ? (author.role as AdminRole) : undefined,
          },
          createdAt: typeof comment.createdAt === 'string' ? comment.createdAt : null,
        } satisfies WorkflowCommentItem;
      })
    : [];

  const toActor = (value: unknown): WorkflowActor | null => {
    const actor = typeof value === 'object' && value ? (value as Record<string, unknown>) : null;
    if (!actor) return null;

    const id = typeof actor.id === 'string' ? actor.id : '';
    const name = typeof actor.name === 'string' ? actor.name : '';
    const email = typeof actor.email === 'string' ? actor.email : '';
    const role = typeof actor.role === 'string' ? (actor.role as AdminRole) : undefined;

    if (!id && !email && !name) {
      return null;
    }

    return { id, name, email, role };
  };

  return {
    status: typeof source.status === 'string' ? (source.status as WorkflowStatus) : 'draft',
    priority: typeof source.priority === 'string' ? (source.priority as WorkflowPriority) : 'normal',
    createdBy: toActor(source.createdBy),
    assignedTo: toActor(source.assignedTo),
    reviewedBy: toActor(source.reviewedBy),
    submittedAt: typeof source.submittedAt === 'string' ? source.submittedAt : null,
    approvedAt: typeof source.approvedAt === 'string' ? source.approvedAt : null,
    rejectedAt: typeof source.rejectedAt === 'string' ? source.rejectedAt : null,
    publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : null,
    scheduledFor: typeof source.scheduledFor === 'string' ? source.scheduledFor : null,
    dueAt: typeof source.dueAt === 'string' ? source.dueAt : null,
    rejectionReason: typeof source.rejectionReason === 'string' ? source.rejectionReason : '',
    comments,
  };
}

function toDateTimeInputValue(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  const hours = `${parsed.getHours()}`.padStart(2, '0');
  const minutes = `${parsed.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatWorkflowStatus(status: WorkflowStatus) {
  return status.replace(/_/g, ' ');
}

function formatActivityActionLabel(action: string | undefined) {
  switch (action) {
    case 'created':
      return 'Created';
    case 'saved':
      return 'Saved';
    case 'submit':
      return 'Submitted';
    case 'assign':
      return 'Assigned';
    case 'start_review':
      return 'Review Started';
    case 'move_to_copy_edit':
      return 'Copy Edit';
    case 'request_changes':
      return 'Changes Requested';
    case 'mark_ready_for_approval':
      return 'Ready For Approval';
    case 'approve':
      return 'Approved';
    case 'reject':
      return 'Rejected';
    case 'schedule':
      return 'Scheduled';
    case 'publish':
      return 'Published';
    case 'archive':
      return 'Archived';
    case 'restore_revision':
      return 'Revision Restored';
    case 'approval_note':
      return 'Approval Note';
    case 'rejection_note':
      return 'Rejection Note';
    case 'revision_request':
      return 'Revision Request';
    case 'comment':
      return 'Comment';
    default:
      return String(action || 'Activity')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function getArticlePublishPathHint(status: WorkflowStatus) {
  switch (status) {
    case 'ready_for_approval':
      return 'Approve this article first; the publish action appears after approval.';
    case 'approved':
    case 'scheduled':
      return 'This article is cleared for publishing from the workflow actions below.';
    case 'published':
      return 'This article is already published.';
    case 'draft':
    case 'changes_requested':
    case 'rejected':
      return 'Submit this article for review before it can move toward publish.';
    case 'submitted':
    case 'assigned':
    case 'in_review':
    case 'copy_edit':
      return 'Complete review, mark ready for approval, approve, then publish.';
    case 'archived':
      return 'Move this article back to draft before publishing again.';
    default:
      return '';
  }
}

function formatNewsroomRoleLabel(role: AdminRole | undefined) {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'copy_editor':
      return 'Copy Editor';
    case 'reporter':
      return 'Reporter';
    default:
      return 'Team';
  }
}

function getWorkflowFeedbackToneClass(tone: WorkflowFeedbackTone) {
  switch (tone) {
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-900';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'info':
      return 'border-blue-200 bg-blue-50 text-blue-900';
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'neutral':
    default:
      return 'border-gray-200 bg-white text-gray-900';
  }
}



function parseWorkflowActionDate(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export default function EditArticle() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params?.id) ? params.id[0] || '' : params?.id || '';
  const articleId = decodeURIComponent(routeId);
  const defaultPermalink = useMemo(
    () => buildDefaultArticlePermalink(articleId),
    [articleId]
  );
  const legacyDraftStorageKey = `${DRAFT_STORAGE_PREFIX}${articleId}`;
  const draftOwner = String(session?.user?.email || 'anonymous')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, '-');
  const draftStorageKey = `${DRAFT_STORAGE_PREFIX}${draftOwner}:${articleId}`;

  const [formData, setFormData] = useState<ArticleFormState>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [savedFormSnapshot, setSavedFormSnapshot] = useState('');
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySlug, setNewCategorySlug] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isUploadingAuthorPhoto, setIsUploadingAuthorPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSeoSlugTouched, setIsSeoSlugTouched] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticleSuggestion[]>([]);
  const [contentMode, setContentMode] = useState<ArticleEditorStudioMode>('write');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [pendingDraftRecovery, setPendingDraftRecovery] =
    useState<EditArticleDraftRecovery | null>(null);
  const [draftEditorSessionId, setDraftEditorSessionId] = useState('');
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [restoringRevisionId, setRestoringRevisionId] = useState('');
  const [imageQualityNote, setImageQualityNote] = useState('');
  const [breakingTtsInfo, setBreakingTtsInfo] = useState<BreakingTtsMetadata | null>(null);
  const [isUploadingBreakingTts, setIsUploadingBreakingTts] = useState(false);
  const [savedBreakingRecordingScript, setSavedBreakingRecordingScript] = useState('');
  const [articleTtsInfo, setArticleTtsInfo] = useState<ManagedTtsAsset | null>(null);
  const [articleTtsEligible, setArticleTtsEligible] = useState(false);
  const [articleTtsReady, setArticleTtsReady] = useState(false);
  const [isLoadingArticleTts, setIsLoadingArticleTts] = useState(false);
  const [isRegeneratingArticleTts, setIsRegeneratingArticleTts] = useState(false);
  const [savedArticleListenSignature, setSavedArticleListenSignature] = useState('');
  const [workflow, setWorkflow] = useState<WorkflowState>(EMPTY_WORKFLOW);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUserOption[]>([]);
  const [isLoadingAssignableUsers, setIsLoadingAssignableUsers] = useState(false);
  const [workflowAssigneeId, setWorkflowAssigneeId] = useState('');
  const [workflowComment, setWorkflowComment] = useState('');
  const [workflowRejectionReason, setWorkflowRejectionReason] = useState('');
  const [workflowScheduledFor, setWorkflowScheduledFor] = useState('');
  const [workflowDueAt, setWorkflowDueAt] = useState('');
  const [workflowPriority, setWorkflowPriority] = useState<WorkflowPriority>('normal');
  const [runningWorkflowAction, setRunningWorkflowAction] = useState<ContentTransitionAction | ''>('');
  const [articleActivity, setArticleActivity] = useState<ArticleActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [assistResult, setAssistResult] = useState<ArticleAssistResult | null>(null);
  const [assistError, setAssistError] = useState('');
  const [isAssistLoading, setIsAssistLoading] = useState(false);
  const [rejectedAssistPatchKeys, setRejectedAssistPatchKeys] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    setDraftEditorSessionId(getOrCreateArticleDraftEditorSessionId(draftStorageKey));
  }, [draftStorageKey]);

  const currentArticleListenSignature = useMemo(
    () => buildArticleListenSignature(formData),
    [formData]
  );

  const currentBreakingRecordingScript = useMemo(
    () =>
      buildBreakingRecordingScriptFromForm(formData, articleId || 'breaking-preview'),
    [articleId, formData]
  );

  const currentFormSnapshot = useMemo(
    () => buildSavedFormSnapshot(formData, imagePreview),
    [formData, imagePreview]
  );

  const editDraftPayload = useMemo(
    () => ({
      title: formData.title,
      slug: formData.seoSlug,
      summary: formData.summary,
      content: formData.content,
      contentJson: migrateArticleHtmlToDocument(formData.content),
      category: formData.category,
      author: formData.author,
      ...(imagePreview && !imagePreview.startsWith('data:') ? { image: imagePreview } : {}),
      reporterMeta: {
        locationTag: formData.locationTag,
        sourceInfo: formData.sourceInfo,
        sourceConfidential: formData.sourceConfidential,
        reporterNotes: formData.reporterNotes,
      },
      copyEditorMeta: {
        proofreadComplete: formData.proofreadComplete,
        factCheckStatus: formData.factCheckStatus,
        headlineStatus: formData.headlineStatus,
        imageOptimizationStatus: formData.imageOptimizationStatus,
        copyEditorNotes: formData.copyEditorNotes,
        returnForChangesReason: formData.returnForChangesReason,
      },
      isBreaking: formData.isBreaking,
      isTrending: formData.isTrending,
      editorial: formData.editorial,
      seo: {
        metaTitle: formData.seoTitle,
        metaDescription: formData.seoDescription,
        ogImage: formData.ogImage,
        canonicalUrl: formData.canonicalUrl,
        focusKeyword: formData.focusKeyword,
        secondaryKeywords: formData.secondaryKeywords,
        featuredImageAlt: formData.featuredImageAlt,
        featuredImageCaption: formData.featuredImageCaption,
        imageCredit: formData.imageCredit,
        authorProfileUrl: formData.authorProfileUrl,
        authorDisplayName: formData.authorDisplayName,
        authorDisplayNameSet: formData.authorDisplayNameSet,
        authorAvatarUrl: formData.authorAvatarUrl,
        authorProgramName: formData.authorProgramName,
        includeInNewsSitemap: formData.includeInNewsSitemap,
        majorUpdateNote: formData.majorUpdateNote,
      },
    }),
    [formData, imagePreview]
  );
  const editDraftPayloadSignature = useMemo(
    () => JSON.stringify(editDraftPayload),
    [editDraftPayload]
  );
  const hasMeaningfulDraftContent = Boolean(
    formData.title.trim() || formData.summary.trim() || formData.content.trim()
  );
  const {
    draftVersion: serverDraftVersion,
    savedAt: serverDraftSavedAt,
    status: serverDraftStatus,
    message: serverDraftMessage,
    saveNow: saveServerDraft,
    adoptDraft: adoptServerDraft,
    pauseAndWait: pauseAndWaitForServerDraft,
    resume: resumeServerDraft,
  } = useArticleServerDraft({
    enabled:
      Boolean(articleId) &&
      draftReady &&
      !pendingDraftRecovery &&
      !isLoading &&
      !isSaving &&
      !restoringRevisionId &&
      !runningWorkflowAction &&
      currentFormSnapshot !== savedFormSnapshot,
    hasMeaningfulContent: hasMeaningfulDraftContent,
    payload: editDraftPayload,
    debounceMs: SERVER_AUTOSAVE_DEBOUNCE_MS,
    createIfMissing: false,
    onSaved: (record) => {
      setDraftSavedAt(record.updatedAt);
      if (record.payloadSignature === editDraftPayloadSignature) {
        setSavedFormSnapshot(currentFormSnapshot);
      }
    },
  });

  useEffect(() => {
    if (!restoringRevisionId) resumeServerDraft();
  }, [restoringRevisionId, resumeServerDraft]);

  const permissionUser = useMemo(() => {
    const sessionUser = session?.user;
    const email = sessionUser?.email?.trim() || '';
    const role = sessionUser?.role;

    if (!sessionUser || !email || !isAdminRole(role)) {
      return null;
    }

    return {
      id: sessionUser.userId || sessionUser.id || email,
      email,
      name: sessionUser.name?.trim() || email.split('@')[0] || 'Admin',
      role,
    };
  }, [session]);

  const workflowPermissionRecord = useMemo(
    () => ({
      legacyAuthorName: formData.author,
      workflow,
    }),
    [formData.author, workflow]
  );

  const canUseWorkflowDesk = canManageWorkflowAssignments(permissionUser?.role);
  const staffAuthorOptions = useMemo(() => {
    const options: AssignableUserOption[] = [
      ...(permissionUser
        ? [
            {
              id: permissionUser.id,
              name: permissionUser.name,
              email: permissionUser.email,
              role: permissionUser.role,
              profileUrl: permissionUser.id
                ? `/main/author/${encodeURIComponent(permissionUser.id)}`
                : '',
            },
          ]
        : []),
      ...assignableUsers,
    ];
    const seen = new Set<string>();
    return options.filter((member) => {
      const key = member.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [assignableUsers, permissionUser]);
  const canEditCopyDeskMeta = Boolean(
    permissionUser?.role &&
      (permissionUser.role === 'admin' ||
        permissionUser.role === 'super_admin' ||
        isCopyEditorRole(permissionUser.role))
  );
  const canCreateCategories =
    permissionUser?.role === 'admin' || permissionUser?.role === 'super_admin';
  const isReporterView = isReporterDeskRole(permissionUser?.role);
  const hasUnsavedChanges = Boolean(imageFile) || currentFormSnapshot !== savedFormSnapshot;

  const availableWorkflowActions = useMemo(() => {
    if (!permissionUser) return [] as ContentTransitionAction[];

    return getAllowedWorkflowTransitions(workflow.status)
      .map((status) => STATUS_TO_ACTION[status])
      .filter((action): action is ContentTransitionAction => Boolean(action))
      .filter((action) =>
        canTransitionContent(permissionUser, workflowPermissionRecord, action)
      );
  }, [permissionUser, workflow.status, workflowPermissionRecord]);
  const workflowPublishHint = getArticlePublishPathHint(workflow.status);

  const recentWorkflowComments = useMemo(
    () =>
      [...workflow.comments]
        .filter((comment) => comment.body?.trim())
        .slice(-5)
        .reverse(),
    [workflow.comments]
  );

  const workflowFeedback = useMemo(
    () =>
      buildWorkflowFeedbackSummary({
        contentLabel: 'Article',
        status: workflow.status,
        assignedToName: workflow.assignedTo?.name || workflow.assignedTo?.email || '',
        reviewedByName: workflow.reviewedBy?.name || workflow.reviewedBy?.email || '',
        rejectionReason: workflow.rejectionReason,
        returnForChangesReason: formData.returnForChangesReason,
        copyEditorNotes: formData.copyEditorNotes,
        workflowComments: workflow.comments,
      }),
    [
      formData.copyEditorNotes,
      formData.returnForChangesReason,
      workflow.assignedTo?.email,
      workflow.assignedTo?.name,
      workflow.comments,
      workflow.rejectionReason,
      workflow.reviewedBy?.email,
      workflow.reviewedBy?.name,
      workflow.status,
    ]
  );

  const breakingTtsStatus = !formData.isBreaking
    ? 'disabled'
    : breakingTtsInfo?.audioUrl
      ? 'ready'
      : 'missing';
  const breakingTtsNeedsSave =
    formData.isBreaking && currentBreakingRecordingScript !== savedBreakingRecordingScript;
  const articleTtsNeedsSave = currentArticleListenSignature !== savedArticleListenSignature;
  const articleTtsStatus = !articleTtsEligible
    ? 'disabled'
    : articleTtsReady && articleTtsInfo?.audioUrl
      ? 'ready'
      : articleTtsInfo?.status || 'missing';

  const buildAssistPayload = useCallback(() => ({
    mode: 'edit',
    title: formData.title,
    summary: formData.summary,
    content: formData.content,
    category: formData.category,
    author: formData.author,
    image: imagePreview ? 'featured-image-ready' : '',
    seoSlug: formData.seoSlug,
    seo: {
      metaTitle: formData.seoTitle,
      metaDescription: formData.seoDescription,
      ogImage: formData.ogImage,
      canonicalUrl: formData.canonicalUrl,
      focusKeyword: formData.focusKeyword,
      secondaryKeywords: formData.secondaryKeywords,
      featuredImageAlt: formData.featuredImageAlt,
      featuredImageCaption: formData.featuredImageCaption,
      imageCredit: formData.imageCredit,
      authorProfileUrl: formData.authorProfileUrl,
      includeInNewsSitemap: formData.includeInNewsSitemap,
      majorUpdateNote: formData.majorUpdateNote,
    },
    isBreaking: formData.isBreaking,
    isTrending: formData.isTrending,
    language: 'hi',
    breakingAudioReady: !formData.isBreaking || breakingTtsStatus === 'ready',
    listenAudioReady: articleTtsStatus === 'ready',
    sourceInfo: formData.sourceInfo,
    sourceStoryId: formData.sourceStoryId,
    locationTag: formData.locationTag,
    editorial: formData.editorial,
  }), [articleTtsStatus, breakingTtsStatus, formData, imagePreview]);

  const fetchArticleTtsStatus = useCallback(async () => {
    if (!articleId) {
      setArticleTtsEligible(false);
      setArticleTtsReady(false);
      setArticleTtsInfo(null);
      return;
    }

    setIsLoadingArticleTts(true);
    try {
      const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}/tts`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: ManagedTtsResponse;
      };

      if (!response.ok || !data.success || !data.data) {
        setArticleTtsEligible(false);
        setArticleTtsReady(false);
        setArticleTtsInfo(null);
        return;
      }

      setArticleTtsEligible(Boolean(data.data.eligible));
      setArticleTtsReady(Boolean(data.data.ready));
      setArticleTtsInfo(data.data.asset || null);
    } catch {
      setArticleTtsEligible(false);
      setArticleTtsReady(false);
      setArticleTtsInfo(null);
    } finally {
      setIsLoadingArticleTts(false);
    }
  }, [articleId]);

  const fetchRevisions = useCallback(async () => {
    if (!articleId) return;
    setIsLoadingRevisions(true);
    try {
      const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}/revisions`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const data = await response.json();
      setRevisions(response.ok && data?.success && Array.isArray(data.data) ? data.data : []);
    } catch {
      setRevisions([]);
    } finally {
      setIsLoadingRevisions(false);
    }
  }, [articleId]);

  const fetchArticleActivity = useCallback(async () => {
    if (!articleId) {
      setArticleActivity([]);
      return;
    }

    setIsLoadingActivity(true);
    try {
      const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}/activity`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: ArticleActivityItem[];
      };

      if (!response.ok || !data.success || !Array.isArray(data.data)) {
        setArticleActivity([]);
        return;
      }

      setArticleActivity(
        data.data.map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          action: typeof item.action === 'string' ? item.action : 'activity',
          fromStatus:
            typeof item.fromStatus === 'string'
              ? (item.fromStatus as WorkflowStatus)
              : null,
          toStatus:
            typeof item.toStatus === 'string'
              ? (item.toStatus as WorkflowStatus)
              : null,
          actor:
            item.actor && typeof item.actor === 'object'
              ? {
                  id: typeof item.actor.id === 'string' ? item.actor.id : '',
                  name: typeof item.actor.name === 'string' ? item.actor.name : '',
                  email: typeof item.actor.email === 'string' ? item.actor.email : '',
                  role:
                    typeof item.actor.role === 'string'
                      ? (item.actor.role as AdminRole)
                      : undefined,
                }
              : null,
          message: typeof item.message === 'string' ? item.message : '',
          metadata:
            item.metadata && typeof item.metadata === 'object'
              ? (item.metadata as Record<string, unknown>)
              : {},
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
          source: item.source === 'derived' ? 'derived' : 'audit',
        }))
      );
    } catch {
      setArticleActivity([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }, [articleId]);

  const fetchAssignableUsers = useCallback(async () => {
    if (!canUseWorkflowDesk) {
      setAssignableUsers([]);
      return;
    }

    setIsLoadingAssignableUsers(true);
    try {
      const response = await fetch('/api/admin/team/options', {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: AssignableUserOption[];
      };

      if (!response.ok || !data.success || !Array.isArray(data.data)) {
        setAssignableUsers([]);
        return;
      }

      setAssignableUsers(
        data.data.filter(
          (member): member is AssignableUserOption =>
            Boolean(member.id && member.email && member.role)
        )
      );
    } catch {
      setAssignableUsers([]);
    } finally {
      setIsLoadingAssignableUsers(false);
    }
  }, [canUseWorkflowDesk]);

  const applyLocalDraftRecovery = useCallback((draft: EditArticleDraftRecovery) => {
    setFormData(draft.formData);
    setImagePreview(draft.imagePreview);
    setContentMode(draft.contentMode);
    setIsFocusMode(draft.focusMode);
    setDraftSavedAt(draft.savedAt);
    setDraftRestored(true);
  }, []);

  const fetchArticle = useCallback(async () => {
    if (sessionStatus === 'loading' || !draftEditorSessionId) return;
    if (!articleId) {
      setIsLoading(false);
      setDraftReady(true);
      return;
    }

    setIsLoading(true);
    setDraftReady(false);
    setPendingDraftRecovery(null);
    let shouldEnableDrafts = true;
    try {
      const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.data) {
        setError('Failed to load article');
        return;
      }

      const article = data.data as {
        _id?: string;
        version?: number;
        updatedAt?: string;
        title?: string;
        summary?: string;
        content?: string;
        category?: string;
        author?: string;
        image?: string;
        slug?: string;
        isBreaking?: boolean;
        isTrending?: boolean;
        editorial?: unknown;
        sourceType?: 'story' | 'direct';
        sourceStoryId?: string;
        sourceStoryTitle?: string;
        seo?: ArticleSeo;
        reporterMeta?: ArticleReporterMeta;
        copyEditorMeta?: ArticleCopyEditorMeta;
        breakingTts?: BreakingTtsMetadata | null;
        workflow?: unknown;
      };

      const baseForm: ArticleFormState = {
        title: article.title || '',
        summary: article.summary || '',
        content: article.content || '',
        category: article.category || 'National',
        author: article.author || '',
        locationTag: article.reporterMeta?.locationTag || '',
        sourceInfo: article.reporterMeta?.sourceInfo || '',
        sourceConfidential: Boolean(article.reporterMeta?.sourceConfidential),
        reporterNotes: article.reporterMeta?.reporterNotes || '',
        proofreadComplete: Boolean(article.copyEditorMeta?.proofreadComplete),
        factCheckStatus: article.copyEditorMeta?.factCheckStatus || 'pending',
        headlineStatus: article.copyEditorMeta?.headlineStatus || 'pending',
        imageOptimizationStatus:
          article.copyEditorMeta?.imageOptimizationStatus || 'pending',
        copyEditorNotes: article.copyEditorMeta?.copyEditorNotes || '',
        returnForChangesReason:
          article.copyEditorMeta?.returnForChangesReason || '',
        isBreaking: Boolean(article.isBreaking),
        isTrending: Boolean(article.isTrending),
        editorial: normalizeArticleEditorialMeta(article.editorial),
        seoSlug: article.slug || normalizeArticleSlug(article.seo?.metaTitle || article.title || ''),
        seoTitle: article.seo?.metaTitle || '',
        seoDescription: article.seo?.metaDescription || '',
        ogImage: article.seo?.ogImage || '',
        canonicalUrl: article.seo?.canonicalUrl || '',
        focusKeyword: article.seo?.focusKeyword || '',
        secondaryKeywords: article.seo?.secondaryKeywords || '',
        featuredImageAlt: article.seo?.featuredImageAlt || '',
        featuredImageCaption: article.seo?.featuredImageCaption || '',
        imageCredit: article.seo?.imageCredit || '',
        authorProfileUrl: article.seo?.authorProfileUrl || '',
        authorDisplayName: (article.seo?.authorDisplayName ?? article.author) || '',
        authorDisplayNameSet: article.seo?.authorDisplayNameSet ?? Boolean(article.seo?.authorDisplayName),
        authorAvatarUrl: article.seo?.authorAvatarUrl || '',
        authorProgramName: article.seo?.authorProgramName || '',
        includeInNewsSitemap: article.seo?.includeInNewsSitemap !== false,
        majorUpdateNote: article.seo?.majorUpdateNote || '',
        sourceType: article.sourceType === 'story' ? 'story' : 'direct',
        sourceStoryId: article.sourceStoryId || '',
        sourceStoryTitle: article.sourceStoryTitle || '',
      };

      const nextWorkflow = normalizeWorkflowState(article.workflow);
      let nextForm = baseForm;
      let nextImage = article.image || '';
      let nextMode: ArticleEditorStudioMode = 'write';
      let nextFocusMode = false;
      let nextSavedAt = '';
      let restored = false;

      if (typeof window !== 'undefined') {
        try {
          const currentRaw = localStorage.getItem(draftStorageKey);
          const recoveryStorageKey = currentRaw
            ? draftStorageKey
            : legacyDraftStorageKey;
          const raw = currentRaw || localStorage.getItem(legacyDraftStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              savedAt?: string;
              editorSessionId?: string;
              formData?: Partial<ArticleFormState>;
              imagePreview?: string;
              contentMode?: ArticleEditorStudioMode;
              focusMode?: boolean;
            };
            if (parsed.formData) {
              const recoveredForm: ArticleFormState = {
                ...baseForm,
                ...parsed.formData,
                editorial: {
                  ...baseForm.editorial,
                  ...(parsed.formData.editorial || {}),
                },
              };
              const recoveredImage = parsed.imagePreview?.trim()
                ? parsed.imagePreview
                : nextImage;
              const recoveryDiffersFromServer =
                buildSavedFormSnapshot(recoveredForm, recoveredImage) !==
                buildSavedFormSnapshot(baseForm, article.image || '');

              if (recoveryDiffersFromServer) {
                const recoveredMode =
                  parsed.contentMode === 'preview' || parsed.contentMode === 'split'
                    ? parsed.contentMode
                    : 'write';
                const recovery: EditArticleDraftRecovery = {
                  formData: recoveredForm,
                  imagePreview: recoveredImage,
                  contentMode: recoveredMode,
                  focusMode: Boolean(parsed.focusMode),
                  savedAt: parsed.savedAt || '',
                  recoveryStorageKey,
                };

                if (
                  isCurrentArticleDraftEditorSession(
                    parsed.editorSessionId,
                    draftEditorSessionId
                  )
                ) {
                  nextForm = recovery.formData;
                  nextImage = recovery.imagePreview;
                  nextMode = recovery.contentMode;
                  nextFocusMode = recovery.focusMode;
                  nextSavedAt = recovery.savedAt;
                  restored = true;
                  if (recoveryStorageKey !== draftStorageKey) {
                    localStorage.removeItem(recoveryStorageKey);
                  }
                } else {
                  setPendingDraftRecovery(recovery);
                  shouldEnableDrafts = false;
                }
              } else {
                localStorage.removeItem(recoveryStorageKey);
              }
            }
          }
        } catch {
          // Ignore malformed draft payload.
        }
      }

      setFormData(nextForm);
      setIsSeoSlugTouched(true);
      setImagePreview(nextImage);
      setContentMode(nextMode);
      setIsFocusMode(nextFocusMode);
      setDraftSavedAt(nextSavedAt);
      setDraftRestored(restored);
      setBreakingTtsInfo(normalizeBreakingTtsMetadata(article.breakingTts));
      setSavedArticleListenSignature(buildArticleListenSignature(baseForm));
      setSavedBreakingRecordingScript(buildBreakingRecordingScriptFromForm(baseForm, articleId));
      setSavedFormSnapshot(buildSavedFormSnapshot(baseForm, article.image || ''));
      setWorkflow(nextWorkflow);
      setWorkflowPriority(nextWorkflow.priority);
      setWorkflowAssigneeId(nextWorkflow.assignedTo?.id || '');
      setWorkflowScheduledFor(toDateTimeInputValue(nextWorkflow.scheduledFor));
      setWorkflowDueAt(toDateTimeInputValue(nextWorkflow.dueAt));
      setWorkflowRejectionReason(nextWorkflow.rejectionReason || '');
      setWorkflowComment('');
      setImageFile(null);
      adoptServerDraft({
        id: String(article._id || articleId),
        version:
          Number.isInteger(Number(article.version)) && Number(article.version) > 0
            ? Number(article.version)
            : 1,
        updatedAt: article.updatedAt || new Date().toISOString(),
      });
      void fetchArticleTtsStatus();
    } catch {
      setError('Failed to load article');
    } finally {
      setIsLoading(false);
      setDraftReady(shouldEnableDrafts);
    }
  }, [
    adoptServerDraft,
    articleId,
    draftEditorSessionId,
    draftStorageKey,
    fetchArticleTtsStatus,
    legacyDraftStorageKey,
    sessionStatus,
  ]);

  useEffect(() => {
    void fetchArticle();
    void fetchRevisions();
    void fetchArticleActivity();
  }, [fetchArticle, fetchRevisions, fetchArticleActivity]);

  useEffect(() => {
    void fetchAssignableUsers();
  }, [fetchAssignableUsers]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetch('/api/admin/categories');
        const data = await response.json();
        if (response.ok && Array.isArray(data.data) && data.data.length) {
          const nextCategories = data.data.map((category: { name: string }) => category.name);
          setCategories(nextCategories);
          setFormData((current) => ({
            ...current,
            category: nextCategories.includes(current.category) ? current.category : nextCategories[0],
          }));
        }
      } catch {
        // Keep defaults.
      }
    };

    void loadCategories();
  }, []);

  useEffect(() => {
    let active = true;

    const loadRelatedArticles = async () => {
      try {
        const response = await fetch('/api/articles/latest?limit=50', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        if (!active) return;
        setRelatedArticles(
          rows
            .map((item: Record<string, unknown>) => ({
              id: String(item._id || item.id || ''),
              slug: typeof item.slug === 'string' ? item.slug : undefined,
              title: String(item.title || ''),
              category: typeof item.category === 'string' ? item.category : undefined,
            }))
            .filter((item: RelatedArticleSuggestion) => item.id && item.title && item.id !== articleId)
        );
      } catch {
        // Internal link suggestions should not block editing.
      }
    };

    void loadRelatedArticles();

    return () => {
      active = false;
    };
  }, [articleId]);

  const persistDraft = useCallback(() => {
    if (!draftReady || typeof window === 'undefined' || !articleId) return;
    if (currentFormSnapshot === savedFormSnapshot) {
      localStorage.removeItem(draftStorageKey);
      localStorage.removeItem(legacyDraftStorageKey);
      return;
    }
    const hasAnyContent = Boolean(
      formData.title.trim() ||
      formData.summary.trim() ||
      formData.content.trim() ||
      formData.author.trim() ||
      formData.seoSlug.trim() ||
      formData.seoTitle.trim() ||
      formData.seoDescription.trim() ||
      formData.ogImage.trim() ||
      formData.canonicalUrl.trim() ||
      formData.focusKeyword.trim() ||
      formData.secondaryKeywords.trim() ||
      formData.featuredImageAlt.trim() ||
      formData.featuredImageCaption.trim() ||
      formData.imageCredit.trim() ||
      formData.authorProfileUrl.trim() ||
      formData.majorUpdateNote.trim() ||
      imagePreview.trim()
    );
    if (!hasAnyContent) return;

    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      editorSessionId: draftEditorSessionId,
      formData,
      imagePreview: imagePreview.startsWith('data:') ? '' : imagePreview,
      contentMode,
      focusMode: isFocusMode,
    };
    localStorage.setItem(draftStorageKey, JSON.stringify(payload));
    setDraftSavedAt(payload.savedAt);
  }, [
    articleId,
    contentMode,
    currentFormSnapshot,
    draftEditorSessionId,
    draftReady,
    draftStorageKey,
    formData,
    imagePreview,
    isFocusMode,
    legacyDraftStorageKey,
    savedFormSnapshot,
  ]);

  const restorePendingDraft = useCallback(() => {
    if (!pendingDraftRecovery || typeof window === 'undefined') return;

    applyLocalDraftRecovery(pendingDraftRecovery);
    localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        version: 1,
        savedAt: pendingDraftRecovery.savedAt || new Date().toISOString(),
        editorSessionId: draftEditorSessionId,
        formData: pendingDraftRecovery.formData,
        imagePreview: pendingDraftRecovery.imagePreview.startsWith('data:')
          ? ''
          : pendingDraftRecovery.imagePreview,
        contentMode: pendingDraftRecovery.contentMode,
        focusMode: pendingDraftRecovery.focusMode,
      })
    );
    if (pendingDraftRecovery.recoveryStorageKey !== draftStorageKey) {
      localStorage.removeItem(pendingDraftRecovery.recoveryStorageKey);
    }
    setPendingDraftRecovery(null);
    setDraftReady(true);
  }, [
    applyLocalDraftRecovery,
    draftEditorSessionId,
    draftStorageKey,
    pendingDraftRecovery,
  ]);

  const discardPendingDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (pendingDraftRecovery?.recoveryStorageKey) {
      localStorage.removeItem(pendingDraftRecovery.recoveryStorageKey);
    }
    localStorage.removeItem(draftStorageKey);
    localStorage.removeItem(legacyDraftStorageKey);
    setPendingDraftRecovery(null);
    setDraftSavedAt('');
    setDraftRestored(false);
    setDraftReady(true);
  }, [draftStorageKey, legacyDraftStorageKey, pendingDraftRecovery]);

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(draftStorageKey);
    localStorage.removeItem(legacyDraftStorageKey);
    setPendingDraftRecovery(null);
    setDraftSavedAt('');
    setDraftRestored(false);
    setDraftReady(true);
  }, [draftStorageKey, legacyDraftStorageKey]);

  useEffect(() => {
    if (!draftReady || typeof window === 'undefined') return;
    const timeoutId = window.setTimeout(persistDraft, LOCAL_AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [draftReady, persistDraft]);

  useEffect(() => {
    if (!draftReady || typeof window === 'undefined') return;
    const onBeforeUnload = () => persistDraft();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [draftReady, persistDraft]);

  useEffect(() => {
    const handleKeyboardSave = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      persistDraft();
      void saveServerDraft();
    };
    window.addEventListener('keydown', handleKeyboardSave);
    return () => window.removeEventListener('keydown', handleKeyboardSave);
  }, [persistDraft, saveServerDraft]);

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = event.target;
    const nextValue = name === 'seoSlug' ? normalizeDraftArticleSlug(value) : value;
    if (name === 'seoSlug') {
      setIsSeoSlugTouched(true);
    }
    setFormData((current) => {
      const next = {
        ...current,
        [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : nextValue,
      };

      if (name === 'title') {
        if (!current.seoTitle.trim()) next.seoTitle = String(nextValue).slice(0, 160);
        if (!current.featuredImageAlt.trim()) {
          next.featuredImageAlt = String(nextValue).slice(0, 220);
        }
        if (!current.focusKeyword.trim()) {
          next.focusKeyword = suggestArticleFocusKeyword(String(nextValue)).slice(0, 120);
        }
        if (!isSeoSlugTouched) {
          next.seoSlug = normalizeArticleSlug(String(nextValue));
        }
      }

      if (name === 'summary' && !current.seoDescription.trim()) {
        next.seoDescription = String(nextValue).slice(0, 320);
      }

      if (name === 'seoTitle' && !isSeoSlugTouched) {
        next.seoSlug = normalizeArticleSlug(String(nextValue));
      }

      if (name === 'isBreaking') {
        const checked = (event.target as HTMLInputElement).checked;
        next.editorial = {
          ...current.editorial,
          storyType: checked
            ? 'breaking'
            : current.editorial.storyType === 'breaking'
              ? 'standard'
              : current.editorial.storyType,
        };
      }

      return next;
    });
  };

  const handleAuthorPhotoUpload = useCallback(async (file: File) => {
    setError('');
    setIsUploadingAuthorPhoto(true);
    try {
      const url = await uploadAuthorProfileImage(file);
      setFormData((current) => ({ ...current, authorAvatarUrl: url }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload profile photo');
    } finally {
      setIsUploadingAuthorPhoto(false);
    }
  }, []);

  const updateEditorialField = <Key extends keyof ArticleEditorialMeta>(
    key: Key,
    value: ArticleEditorialMeta[Key]
  ) => {
    setFormData((current) => ({
      ...current,
      editorial: { ...current.editorial, [key]: value },
    }));
  };

  const handleContentChange = useCallback((content: string) => {
    setFormData((current) => {
      const plainContent = stripArticleHtml(content);
      const combinedText = `${current.title} ${current.summary} ${plainContent}`;
      const focusKeyword =
        current.focusKeyword.trim() || suggestArticleFocusKeyword(combinedText).slice(0, 120);

      return {
        ...current,
        content,
        ...(!current.seoDescription.trim() && !current.summary.trim() && plainContent
          ? { seoDescription: plainContent.slice(0, 320) }
          : {}),
        ...(!current.focusKeyword.trim() && focusKeyword ? { focusKeyword } : {}),
        ...(!current.secondaryKeywords.trim()
          ? {
              secondaryKeywords: suggestArticleSecondaryKeywords(
                combinedText,
                focusKeyword
              ).slice(0, 180),
            }
          : {}),
      };
    });
  }, []);

  const applyTranslation = (field: 'title' | 'summary' | 'content', value: string) => {
    if (field === 'content') {
      handleContentChange(value);
      setContentMode('write');
      return;
    }
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const runArticleAssist = async () => {
    setIsAssistLoading(true);
    setAssistError('');
    try {
      const response = await fetch('/api/admin/articles/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(buildAssistPayload()),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: ArticleAssistResult;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Article assist failed');
      }

      setRejectedAssistPatchKeys(new Set());
      setAssistResult(payload.data);
    } catch (assistError) {
      setAssistError(
        assistError instanceof Error ? assistError.message : 'Article assist failed'
      );
    } finally {
      setIsAssistLoading(false);
    }
  };

  const applyAssistPatch = (patch: ArticleAssistPatch) => {
    if (patch.field === 'seoSlug') {
      setIsSeoSlugTouched(true);
    }

    setFormData((current) => {
      if (!(patch.field in current)) return current;
      const currentValue = current[patch.field as keyof ArticleFormState];
      if (typeof currentValue !== 'string') return current;

      return {
        ...current,
        [patch.field]: patch.suggestedValue,
      };
    });

    setRejectedAssistPatchKeys((current) => {
      const next = new Set(current);
      next.add(getArticleAssistPatchKey(patch));
      return next;
    });
  };

  const applyAssistPatches = (patches: ArticleAssistPatch[]) => {
    if (!patches.length) return;

    if (patches.some((patch) => patch.field === 'seoSlug')) {
      setIsSeoSlugTouched(true);
    }

    setFormData((current) => {
      let next = current;

      patches.forEach((patch) => {
        if (!(patch.field in next)) return;
        const currentValue = next[patch.field as keyof ArticleFormState];
        if (typeof currentValue !== 'string') return;

        next = {
          ...next,
          [patch.field]: patch.suggestedValue,
        };
      });

      return next;
    });

    setRejectedAssistPatchKeys((current) => {
      const next = new Set(current);
      patches.forEach((patch) => next.add(getArticleAssistPatchKey(patch)));
      return next;
    });
  };

  const rejectAssistPatch = (patch: ArticleAssistPatch) => {
    setRejectedAssistPatchKeys((current) => {
      const next = new Set(current);
      next.add(getArticleAssistPatchKey(patch));
      return next;
    });
  };

  const focusWorkbenchField = useCallback((field: ArticleAssistField) => {
    if (typeof document === 'undefined') return;
    const fieldSelectors: Partial<Record<ArticleAssistField, string>> = {
      title: '[name="title"]',
      summary: '[name="summary"]',
      content:
        '[data-article-field="content"] [contenteditable="true"], [data-article-field="content"] textarea, [data-article-field="content"]',
      category: '[name="category"]',
      author: '[name="author"]',
      image: '[data-article-field="image"], input[accept="image/*"]',
      seoTitle: '[name="seoTitle"]',
      seoDescription: '[name="seoDescription"]',
      seoSlug: '[name="seoSlug"]',
      focusKeyword: '[name="focusKeyword"]',
      secondaryKeywords: '[name="secondaryKeywords"]',
      featuredImageAlt: '[name="featuredImageAlt"]',
      featuredImageCaption: '[name="featuredImageCaption"]',
      imageCredit: '[name="imageCredit"]',
      canonicalUrl: '[name="canonicalUrl"]',
      authorProfileUrl: '[name="authorProfileUrl"]',
      isBreaking: '[name="isBreaking"]',
      isTrending: '[name="isTrending"]',
      sourceInfo: '[name="sourceInfo"]',
      breakingAudio: `[data-article-field="breakingAudio"], input[accept="${MANUAL_AUDIO_ACCEPT}"], [name="isBreaking"]`,
    };
    const selector = fieldSelectors[field] || `[name="${field}"]`;
    const element = document.querySelector<HTMLElement>(selector);
    const details = element?.closest('details') as HTMLDetailsElement | null;
    if (details) details.open = true;
    if (typeof element?.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const focusTarget = element?.matches('input, textarea, select, button, [contenteditable="true"]')
      ? element
      : element?.querySelector<HTMLElement>('input, textarea, select, button, [contenteditable="true"]');
    window.setTimeout(() => focusTarget?.focus(), 0);
  }, []);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setImageQualityNote('');
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    try {
      const prepared = await prepareArticleImageFile(file);
      setImageFile(prepared.file);
      setImagePreview(prepared.previewDataUrl);
      setFormData((current) => ({
        ...current,
        featuredImageAlt: current.featuredImageAlt.trim()
          ? current.featuredImageAlt
          : current.title.trim().slice(0, 220),
        featuredImageCaption: current.featuredImageCaption.trim()
          ? current.featuredImageCaption
          : current.summary.trim().slice(0, 300),
      }));

      const notes: string[] = [];
      if (prepared.wasResized) {
        notes.push(
          `Image optimized to ${prepared.width}x${prepared.height} for better cross-device clarity.`
        );
      }
      const hints = getArticleImageHints(prepared.width, prepared.height);
      if (hints.length) notes.push(...hints);
      setImageQualityNote(notes.join(' '));
    } catch {
      setError('Failed to process image. Please try a different file.');
    }
  };

  const uploadImage = async () => {
    if (!imageFile) return imagePreview;

    setIsLoadingImage(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', imageFile);
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: uploadFormData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to upload image');
      return data.data.url as string;
    } catch {
      setError('Failed to upload image. Please try again.');
      throw new Error('upload-failed');
    } finally {
      setIsLoadingImage(false);
    }
  };

  const handleRestoreRevision = async (revisionId: string) => {
    const shouldRestore = window.confirm(
      'Restore this revision? Current unsaved changes will be replaced.'
    );
    if (!shouldRestore) return;

    setRestoringRevisionId(revisionId);
    setError('');
    setSuccess('');
    try {
      await pauseAndWaitForServerDraft();
      const response = await fetch(
        `/api/admin/articles/${encodeURIComponent(articleId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
        { method: 'POST', headers: { ...getAuthHeader() } }
      );
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.data) {
        setError(data?.error || 'Failed to restore revision');
        return;
      }

      const article = data.data as {
        _id?: string;
        version?: number;
        updatedAt?: string;
        title?: string;
        summary?: string;
        content?: string;
        category?: string;
        author?: string;
        image?: string;
        slug?: string;
        isBreaking?: boolean;
        isTrending?: boolean;
        editorial?: unknown;
        sourceType?: 'story' | 'direct';
        sourceStoryId?: string;
        sourceStoryTitle?: string;
        seo?: ArticleSeo;
        reporterMeta?: ArticleReporterMeta;
        copyEditorMeta?: ArticleCopyEditorMeta;
        breakingTts?: BreakingTtsMetadata | null;
        workflow?: unknown;
      };
      const restoredVersion = Number(article.version);
      if (
        !Number.isInteger(restoredVersion) ||
        restoredVersion < 1 ||
        !article.updatedAt
      ) {
        setError('Revision restored, but its server version was missing. Reload before editing.');
        return;
      }

      const restoredForm: ArticleFormState = {
        title: article.title || '',
        summary: article.summary || '',
        content: article.content || '',
        category: article.category || 'National',
        author: article.author || '',
        locationTag: article.reporterMeta?.locationTag || '',
        sourceInfo: article.reporterMeta?.sourceInfo || '',
        sourceConfidential: Boolean(article.reporterMeta?.sourceConfidential),
        reporterNotes: article.reporterMeta?.reporterNotes || '',
        proofreadComplete: Boolean(article.copyEditorMeta?.proofreadComplete),
        factCheckStatus: article.copyEditorMeta?.factCheckStatus || 'pending',
        headlineStatus: article.copyEditorMeta?.headlineStatus || 'pending',
        imageOptimizationStatus:
          article.copyEditorMeta?.imageOptimizationStatus || 'pending',
        copyEditorNotes: article.copyEditorMeta?.copyEditorNotes || '',
        returnForChangesReason:
          article.copyEditorMeta?.returnForChangesReason || '',
        isBreaking: Boolean(article.isBreaking),
        isTrending: Boolean(article.isTrending),
        editorial: normalizeArticleEditorialMeta(article.editorial),
        seoSlug: article.slug || normalizeArticleSlug(article.seo?.metaTitle || article.title || ''),
        seoTitle: article.seo?.metaTitle || '',
        seoDescription: article.seo?.metaDescription || '',
        ogImage: article.seo?.ogImage || '',
        canonicalUrl: article.seo?.canonicalUrl || '',
        focusKeyword: article.seo?.focusKeyword || '',
        secondaryKeywords: article.seo?.secondaryKeywords || '',
        featuredImageAlt: article.seo?.featuredImageAlt || '',
        featuredImageCaption: article.seo?.featuredImageCaption || '',
        imageCredit: article.seo?.imageCredit || '',
        authorProfileUrl: article.seo?.authorProfileUrl || '',
        authorDisplayName: (article.seo?.authorDisplayName ?? article.author) || '',
        authorDisplayNameSet: article.seo?.authorDisplayNameSet ?? Boolean(article.seo?.authorDisplayName),
        authorAvatarUrl: article.seo?.authorAvatarUrl || '',
        authorProgramName: article.seo?.authorProgramName || '',
        includeInNewsSitemap: article.seo?.includeInNewsSitemap !== false,
        majorUpdateNote: article.seo?.majorUpdateNote || '',
        sourceType: article.sourceType === 'story' ? 'story' : 'direct',
        sourceStoryId: article.sourceStoryId || '',
        sourceStoryTitle: article.sourceStoryTitle || '',
      };
      const restoredWorkflow = normalizeWorkflowState(article.workflow);

      setFormData(restoredForm);
      setIsSeoSlugTouched(true);
      setImagePreview(article.image || '');
      setImageFile(null);
      setImageQualityNote('');
      setContentMode('write');
      setBreakingTtsInfo(normalizeBreakingTtsMetadata(article.breakingTts));
      setSavedArticleListenSignature(buildArticleListenSignature(restoredForm));
      setSavedBreakingRecordingScript(buildBreakingRecordingScriptFromForm(restoredForm, articleId));
      setSavedFormSnapshot(buildSavedFormSnapshot(restoredForm, article.image || ''));
      setWorkflow(restoredWorkflow);
      setWorkflowPriority(restoredWorkflow.priority);
      setWorkflowAssigneeId(restoredWorkflow.assignedTo?.id || '');
      setWorkflowScheduledFor(toDateTimeInputValue(restoredWorkflow.scheduledFor));
      setWorkflowDueAt(toDateTimeInputValue(restoredWorkflow.dueAt));
      setWorkflowRejectionReason(restoredWorkflow.rejectionReason || '');
      setWorkflowComment('');
      clearDraft();
      adoptServerDraft({
        id: String(article._id || articleId),
        version: restoredVersion,
        updatedAt: article.updatedAt,
      });
      setDraftSavedAt(article.updatedAt);
      setSuccess('Revision restored successfully.');
      await fetchArticleTtsStatus();
      await fetchRevisions();
      await fetchArticleActivity();
    } catch {
      setError('Failed to restore revision. Please try again.');
    } finally {
      setRestoringRevisionId('');
    }
  };

  const handleUploadBreakingTts = async (file: File | null) => {
    if (!articleId || !file) return;

    if (!formData.isBreaking) {
      setError('Mark this article as breaking news before uploading breaking audio.');
      return;
    }

    if (breakingTtsNeedsSave) {
      setError('Save the headline or location changes before uploading breaking audio.');
      return;
    }

    setIsUploadingBreakingTts(true);
    setError('');
    setSuccess('');

    try {
      const uploaded = await uploadBreakingTtsAudioDirect({
        articleId,
        file,
        expectedVersion: serverDraftVersion || 1,
        authHeaders: getAuthHeader(),
      });
      const breakingTts = normalizeBreakingTtsMetadata(uploaded.breakingTts);
      if (!breakingTts) {
        throw new Error('Breaking audio uploaded, but the ready metadata was not returned.');
      }

      setBreakingTtsInfo(breakingTts);
      setSavedBreakingRecordingScript(currentBreakingRecordingScript);
      adoptServerDraft({
        id: articleId,
        version: uploaded.version,
        updatedAt: uploaded.updatedAt,
      });
      setSuccess('Manual breaking news audio uploaded successfully.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Failed to upload breaking news audio. Please try again.'
      );
    } finally {
      setIsUploadingBreakingTts(false);
    }
  };

  const handleUploadArticleTts = async (file: File | null) => {
    if (!articleId || !file) return;

    if (articleTtsNeedsSave) {
      setError('Save article title, summary, or content changes before uploading listen audio.');
      return;
    }

    setIsRegeneratingArticleTts(true);
    setError('');
    setSuccess('');

    try {
      const uploaded = await uploadArticleTtsAudioDirect({
        articleId,
        file,
        authHeaders: getAuthHeader(),
      });
      const ttsAsset = uploaded.ttsAsset && typeof uploaded.ttsAsset === 'object'
        ? (uploaded.ttsAsset as ManagedTtsAsset)
        : null;

      setArticleTtsEligible(true);
      setArticleTtsReady(Boolean(ttsAsset?.audioUrl || uploaded.asset.mediaUrl));
      setArticleTtsInfo(ttsAsset || {
        status: 'ready',
        provider: 'manual',
        audioUrl: uploaded.asset.mediaUrl,
        mimeType: uploaded.asset.mediaMimeType,
      });
      setSuccess('Manual article listen audio uploaded successfully.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Failed to upload article listen audio. Please try again.'
      );
    } finally {
      setIsRegeneratingArticleTts(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      if (pendingDraftRecovery) {
        setError('Restore or discard the browser recovery copy before saving this article.');
        setIsSaving(false);
        return;
      }
      if (serverDraftStatus === 'conflict') {
        setError(serverDraftMessage || 'Resolve the server version conflict before saving.');
        setIsSaving(false);
        return;
      }
      if (!formData.title || !formData.summary || !formData.content || !formData.author || !imagePreview) {
        setError('Please fill in all required fields');
        setIsSaving(false);
        return;
      }

      if (formData.canonicalUrl.trim() && !isValidAbsoluteHttpUrl(formData.canonicalUrl.trim())) {
        setError('Canonical URL must start with http:// or https://');
        setIsSaving(false);
        return;
      }

      if (formData.seoSlug.trim() && !isValidArticleSlug(formData.seoSlug.trim())) {
        setError('SEO slug must use lowercase letters, numbers, and hyphens only');
        setIsSaving(false);
        return;
      }

      if (
        formData.authorProfileUrl.trim() &&
        !formData.authorProfileUrl.trim().startsWith('/') &&
        !isValidAbsoluteHttpUrl(formData.authorProfileUrl.trim())
      ) {
        setError('Author profile URL must be a local path or start with http:// or https://');
        setIsSaving(false);
        return;
      }

      if (
        formData.ogImage.trim() &&
        !formData.ogImage.trim().startsWith('/') &&
        !isValidAbsoluteHttpUrl(formData.ogImage.trim())
      ) {
        setError('OG image must be an absolute URL or local path starting with /');
        setIsSaving(false);
        return;
      }

      let imageUrl = imagePreview;
      if (imageFile) imageUrl = await uploadImage();
      const resolvedOgImage =
        formData.ogImage.trim() || resolveArticleOgImageUrl({ image: imageUrl });
      const synchronizedDraft = await saveServerDraft();
      const expectedVersion = synchronizedDraft?.version || serverDraftVersion;

      const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          ...(expectedVersion > 0 ? { expectedVersion } : {}),
          title: formData.title,
          slug: formData.seoSlug,
          summary: formData.summary,
          content: formData.content,
          category: formData.category,
          author: formData.author,
          reporterMeta: {
            locationTag: formData.locationTag,
            sourceInfo: formData.sourceInfo,
            sourceConfidential: formData.sourceConfidential,
            reporterNotes: formData.reporterNotes,
          },
          copyEditorMeta: {
            proofreadComplete: formData.proofreadComplete,
            factCheckStatus: formData.factCheckStatus,
            headlineStatus: formData.headlineStatus,
            imageOptimizationStatus: formData.imageOptimizationStatus,
            copyEditorNotes: formData.copyEditorNotes,
            returnForChangesReason: formData.returnForChangesReason,
          },
          isBreaking: formData.isBreaking,
          isTrending: formData.isTrending,
          editorial: formData.editorial,
          image: imageUrl,
          seo: {
            metaTitle: formData.seoTitle,
            metaDescription: formData.seoDescription,
            ogImage: resolvedOgImage,
            canonicalUrl: formData.canonicalUrl,
            focusKeyword: formData.focusKeyword,
            secondaryKeywords: formData.secondaryKeywords,
            featuredImageAlt: formData.featuredImageAlt,
            featuredImageCaption: formData.featuredImageCaption,
            imageCredit: formData.imageCredit,
            authorProfileUrl: formData.authorProfileUrl,
            authorDisplayName: formData.authorDisplayName,
            authorDisplayNameSet: formData.authorDisplayNameSet,
            authorAvatarUrl: formData.authorAvatarUrl,
            authorProgramName: formData.authorProgramName,
            includeInNewsSitemap: formData.includeInNewsSitemap,
            majorUpdateNote: formData.majorUpdateNote,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update article');
        setIsSaving(false);
        return;
      }

      setImageFile(null);
      clearDraft();
      setSuccess('Article updated successfully.');
      await fetchArticle();
      await fetchRevisions();
      await fetchArticleActivity();
      await fetchArticleTtsStatus();
    } catch {
      setError('Failed to update article. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleWorkflowAction = async (action: ContentTransitionAction) => {
    setError('');
    setSuccess('');

    if (pendingDraftRecovery) {
      setError('Restore or discard the browser recovery copy before changing workflow status.');
      return;
    }

    if (hasUnsavedChanges) {
      setError('Save article changes before moving the workflow.');
      return;
    }

    if (action === 'assign' && !workflowAssigneeId.trim()) {
      setError('Select an assignee before assigning this article.');
      return;
    }

    if (action === 'reject' && !workflowRejectionReason.trim()) {
      setError('Add a rejection reason before rejecting this article.');
      return;
    }

    if (action === 'schedule' && !workflowScheduledFor.trim()) {
      setError('Choose a publish time before scheduling this article.');
      return;
    }

    if (action === 'publish' && formData.isBreaking && (!breakingTtsInfo?.audioUrl || breakingTtsNeedsSave)) {
      setError(
        breakingTtsNeedsSave
          ? 'Save the headline or location changes and upload matching breaking audio before publishing.'
          : 'Upload breaking news audio before publishing this breaking article.'
      );
      return;
    }

    const scheduledFor = parseWorkflowActionDate(workflowScheduledFor);
    const dueAt = parseWorkflowActionDate(workflowDueAt);

    if (workflowScheduledFor && !scheduledFor) {
      setError('Scheduled publish time is invalid.');
      return;
    }

    if (workflowDueAt && !dueAt) {
      setError('Due date is invalid.');
      return;
    }

    setRunningWorkflowAction(action);
    try {
      const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          action,
          ...(serverDraftVersion > 0 ? { expectedVersion: serverDraftVersion } : {}),
          assignedToId: workflowAssigneeId || undefined,
          scheduledFor: scheduledFor || undefined,
          dueAt: dueAt || undefined,
          priority: workflowPriority,
          rejectionReason: workflowRejectionReason.trim() || undefined,
          comment: workflowComment.trim() || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
        error?: string;
        message?: string;
        currentVersion?: number;
        data?: {
          _id?: string;
          version?: number;
          updatedAt?: string;
        };
      };

      if (!response.ok || !data.success) {
        if (response.status === 409 && data.code === 'ARTICLE_VERSION_CONFLICT') {
          setError(
            data.error ||
              'This article changed in another session. Reload before changing workflow.'
          );
          return;
        }
        setError(data.error || 'Failed to update workflow');
        return;
      }

      if (Number.isInteger(data.data?.version) && Number(data.data?.version) > 0) {
        adoptServerDraft({
          id: data.data?._id || articleId,
          version: Number(data.data?.version),
          updatedAt: data.data?.updatedAt || new Date().toISOString(),
        });
      }

      setWorkflowComment('');
      if (action !== 'reject') {
        setWorkflowRejectionReason('');
      }
      setSuccess(data.message || `${ACTION_LABELS[action]} completed.`);
      await fetchArticle();
      await fetchRevisions();
      await fetchArticleActivity();
      await fetchArticleTtsStatus();
    } catch {
      setError('Failed to update workflow. Please try again.');
    } finally {
      setRunningWorkflowAction('');
    }
  };

  const normalizedSeo = useMemo(
    () =>
      normalizeArticleSeo({
        metaTitle: formData.seoTitle,
        metaDescription: formData.seoDescription,
        ogImage: formData.ogImage,
        canonicalUrl: formData.canonicalUrl,
        focusKeyword: formData.focusKeyword,
        secondaryKeywords: formData.secondaryKeywords,
        featuredImageAlt: formData.featuredImageAlt,
        featuredImageCaption: formData.featuredImageCaption,
        imageCredit: formData.imageCredit,
        authorProfileUrl: formData.authorProfileUrl,
        includeInNewsSitemap: formData.includeInNewsSitemap,
        majorUpdateNote: formData.majorUpdateNote,
      }),
    [formData]
  );
  const googlePreview = useMemo(
    () =>
      buildArticleGooglePreview({
        id: articleId,
        slug: formData.seoSlug,
        title: formData.title,
        summary: formData.summary,
        image: imagePreview,
        seo: normalizedSeo,
      }),
    [articleId, formData.seoSlug, formData.title, formData.summary, imagePreview, normalizedSeo]
  );
  const previewPath = buildArticlePublicPath({
    id: articleId,
    slug: formData.seoSlug || undefined,
  });

  const workflowMetaItems = [
    {
      label: 'Created By',
      value: workflow.createdBy?.name || workflow.createdBy?.email || 'Unknown',
    },
    {
      label: 'Assigned To',
      value: workflow.assignedTo?.name || workflow.assignedTo?.email || 'Unassigned',
    },
    {
      label: 'Reviewed By',
      value: workflow.reviewedBy?.name || workflow.reviewedBy?.email || 'Not started',
    },
    {
      label: 'Priority',
      value: <CmsWorkflowPriorityBadge priority={workflowPriority} />,
    },
    {
      label: 'Submitted',
      value: workflow.submittedAt ? formatDraftTimestamp(workflow.submittedAt) : 'Not submitted',
    },
    {
      label: 'Scheduled',
      value: workflow.scheduledFor ? formatDraftTimestamp(workflow.scheduledFor) : 'Not scheduled',
    },
    {
      label: 'Published',
      value: workflow.publishedAt ? formatDraftTimestamp(workflow.publishedAt) : 'Not published',
    },
    {
      label: 'Due',
      value: workflow.dueAt ? formatDraftTimestamp(workflow.dueAt) : 'No due date',
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 text-spanish-red animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading article...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <Link
        href="/admin/articles"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Articles
      </Link>

      <WorkflowRail
        status={workflow.status}
        assignee={workflow.assignedTo?.name || workflow.assignedTo?.email}
        dueAt={workflow.dueAt}
        hasUnsavedChanges={hasUnsavedChanges}
        blockerCount={hasUnsavedChanges ? 1 : 0}
        primaryAction={availableWorkflowActions[0] ? ACTION_LABELS[availableWorkflowActions[0]] : 'Review workflow'}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <CmsEditorCanvas className="max-w-[1560px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm xl:p-8">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">Edit Article</h1>
                <CmsWorkflowStatusBadge status={workflow.status} />
                {hasUnsavedChanges ? (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    Unsaved changes
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-gray-600">Update your article details, workflow, and desk status</p>
            </div>
          </div>

          {error ? (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          {success ? (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex gap-2">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>{success}</span>
            </div>
          ) : null}

          {isFocusMode ? (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Focus writing mode is on. Workflow, SEO, audio, and revision tools are hidden so you can stay inside the article copy.
            </div>
          ) : null}

          {!isFocusMode ? (
            <div className="sticky top-0 z-20 mb-5 flex items-center gap-2 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-950/95 p-2 shadow-lg shadow-black/10 backdrop-blur dark:border-white/10">
              {[
                { label: 'Write', field: 'content' as ArticleAssistField, Icon: FileText },
                { label: 'SEO', field: 'seoTitle' as ArticleAssistField, Icon: Search },
                { label: 'Media', field: 'image' as ArticleAssistField, Icon: ImageIcon },
                { label: 'Audio', field: 'breakingAudio' as ArticleAssistField, Icon: FileAudio },
              ].map(({ label, field, Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => focusWorkbenchField(field)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={runArticleAssist}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-spanish-red px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Ready</span>
              </button>
            </div>
          ) : null}

          {pendingDraftRecovery ? (
            <div className="mb-6">
              <ArticleDraftRecoveryNotice
                savedAtLabel={
                  pendingDraftRecovery.savedAt
                    ? formatDraftTimestamp(pendingDraftRecovery.savedAt)
                    : ''
                }
                onRestore={restorePendingDraft}
                onDiscard={discardPendingDraft}
              />
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="admin-article-workspace space-y-8">
            <CmsEditorColumns stacked={isFocusMode}>
              <CmsEditorMain>
                <div data-article-field="title">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Article Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                    required
                  />
                </div>

                <div data-article-field="summary">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Summary <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="summary"
                    value={formData.summary}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                    required
                  />
                </div>

                <div data-article-field="content">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Article Content <span className="text-red-500">*</span>
                  </label>
                  <div className="mb-3 grid gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="font-semibold">Headings</p>
                      <p className="mt-1">Use H2 and H3 to split dense reporting into readable sections.</p>
                    </div>
                    <div>
                      <p className="font-semibold">Inline Images</p>
                      <p className="mt-1">Upload inline article images with caption and source credit from the toolbar.</p>
                    </div>
                    <div>
                      <p className="font-semibold">Resources & Tables</p>
                      <p className="mt-1">Drop in source cards, quotes, and tables when the article needs evidence or comparisons.</p>
                    </div>
                    <div>
                      <p className="font-semibold">Permalink</p>
                      <p className="mt-1">Canonical URL in SEO Settings controls the preferred permalink for this published article.</p>
                    </div>
                  </div>
                  <p className="mb-2 text-xs text-gray-500">
                    Tip: Paste a YouTube link on its own line or use the YouTube button in the toolbar.
                  </p>
                  <ArticleEditorStudio
                    articleId={articleId}
                    currentUserRole={session?.user?.role}
                    onLockChange={(hasLock) => setIsLockedByOther(!hasLock)}
                    title={formData.title}
                    summary={formData.summary}
                    content={formData.content}
                    mode={contentMode}
                    focusMode={isFocusMode}
                    showSidebar={false}
                    previewVariant="article"
                    author={formData.author}
                    authorAvatarUrl={formData.authorAvatarUrl}
                    authorProgramName={formData.authorProgramName}
                    image={imagePreview}
                    imageAlt={formData.featuredImageAlt}
                    imageCaption={formData.featuredImageCaption}
                    imageCredit={formData.imageCredit}
                    category={formData.category}
                    onModeChange={setContentMode}
                    onFocusModeChange={setIsFocusMode}
                    onContentChange={handleContentChange}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>

                    {canCreateCategories ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowCreateCategory((current) => !current)}
                          className="text-sm text-spanish-red font-medium hover:underline"
                        >
                          {showCreateCategory ? 'Cancel' : '+ Create new category'}
                        </button>

                        {showCreateCategory ? (
                          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                            {createCategoryError ? (
                              <div className="text-sm text-red-600">{createCategoryError}</div>
                            ) : null}
                            <input
                              value={newCategoryName}
                              onChange={(event) => setNewCategoryName(event.target.value)}
                              placeholder="Category name"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                            <input
                              value={newCategorySlug}
                              onChange={(event) => setNewCategorySlug(event.target.value)}
                              placeholder="Optional slug (auto-generated if blank)"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isCreatingCategory}
                                onClick={async () => {
                                  setCreateCategoryError('');
                                  if (!newCategoryName.trim()) {
                                    setCreateCategoryError('Please provide a category name');
                                    return;
                                  }
                                  setIsCreatingCategory(true);
                                  try {
                                    const response = await fetch('/api/admin/categories', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        ...getAuthHeader(),
                                      },
                                      body: JSON.stringify({
                                        name: newCategoryName.trim(),
                                        slug: newCategorySlug.trim() || undefined,
                                      }),
                                    });
                                    const data = await response.json();
                                    if (!response.ok) {
                                      throw new Error(data?.error || 'Failed to create category');
                                    }
                                    const created = data.data as { name: string };
                                    setCategories((current) => [
                                      created.name,
                                      ...current.filter((item) => item !== created.name),
                                    ]);
                                    setFormData((current) => ({ ...current, category: created.name }));
                                    setNewCategoryName('');
                                    setNewCategorySlug('');
                                    setShowCreateCategory(false);
                                  } catch (requestError: unknown) {
                                    setCreateCategoryError(
                                      requestError instanceof Error
                                        ? requestError.message
                                        : 'Failed to create category'
                                    );
                                  } finally {
                                    setIsCreatingCategory(false);
                                  }
                                }}
                                className="px-4 py-2 bg-spanish-red text-white rounded-md disabled:opacity-50"
                              >
                                {isCreatingCategory ? 'Creating...' : 'Create'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCreateCategory(false);
                                  setNewCategoryName('');
                                  setNewCategorySlug('');
                                  setCreateCategoryError('');
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-md"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div data-article-field="author">
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Staff author <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="author"
                      value={formData.author}
                      onChange={(event) => {
                        const selectedMember = staffAuthorOptions.find(
                          (member) => member.name === event.target.value
                        );
                        setFormData((current) => ({
                          ...current,
                          author: event.target.value,
                          authorProfileUrl: selectedMember?.profileUrl || '',
                          authorDisplayName: selectedMember?.name || '',
                          authorDisplayNameSet: Boolean(selectedMember),
                          authorAvatarUrl: selectedMember?.image || '',
                        }));
                      }}
                      className="w-full bg-white px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                      required
                    >
                      <option value="">Choose a newsroom staff profile</option>
                      {formData.author &&
                      !staffAuthorOptions.some((member) => member.name === formData.author) ? (
                        <option value={formData.author}>{formData.author} (legacy byline)</option>
                      ) : null}
                      {staffAuthorOptions.map((member) => (
                        <option key={member.id} value={member.name}>
                          {member.name} ({member.role.replace(/_/g, ' ')})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Select an authenticated newsroom identity. The photo, public name, and program can be changed or removed for this article.
                    </p>
                    <div className="mt-3 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[auto_1fr]">
                      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-[10px] font-bold text-gray-500">
                        {formData.authorAvatarUrl ? <img src={formData.authorAvatarUrl} alt="Author profile" className="h-full w-full object-cover" /> : <span>Photo</span>}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-semibold text-gray-700">Public author name<input name="authorDisplayName" value={formData.authorDisplayName} onChange={(event) => setFormData((current) => ({ ...current, authorDisplayName: event.target.value, authorDisplayNameSet: true }))} placeholder="Leave blank to hide" maxLength={120} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
                        <label className="block text-xs font-semibold text-gray-700">Program name<input name="authorProgramName" value={formData.authorProgramName} onChange={(event) => setFormData((current) => ({ ...current, authorProgramName: event.target.value }))} placeholder="Optional" maxLength={120} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
                        <div className="sm:col-span-2">
                          <span className="block text-xs font-semibold text-gray-700">Profile photo</span>
                          <label htmlFor="edit-author-profile-photo-upload" className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2.5 transition hover:border-spanish-red hover:bg-red-50/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-spanish-red">
                              <Upload className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-gray-900">{isUploadingAuthorPhoto ? 'Uploading photo...' : 'Choose a profile photo'}</span>
                              <span className="block text-[11px] font-normal text-gray-500">JPG, PNG, or WEBP · Maximum 5MB</span>
                            </span>
                          </label>
                          <input
                            id="edit-author-profile-photo-upload"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={isUploadingAuthorPhoto}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (file) void handleAuthorPhotoUpload(file);
                            }}
                            className="sr-only"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <button type="button" onClick={() => setFormData((current) => ({ ...current, authorAvatarUrl: '' }))} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Remove photo</button>
                          <button type="button" onClick={() => setFormData((current) => ({ ...current, authorDisplayName: '', authorDisplayNameSet: true }))} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Remove author name</button>
                          <button type="button" onClick={() => setFormData((current) => ({ ...current, authorProgramName: '' }))} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Remove program</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div id="workflow-actions" className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Reporter Submission</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Origin, location, and handoff notes that should travel with the article.
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        Location Tag
                      </label>
                      <input
                        type="text"
                        name="locationTag"
                        value={formData.locationTag}
                        onChange={handleInputChange}
                        placeholder="Indore, Madhya Pradesh"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        Reporter Notes
                      </label>
                      <textarea
                        name="reporterNotes"
                        value={formData.reporterNotes}
                        onChange={handleInputChange}
                        rows={3}
                        placeholder="Context for copy edit, verification, or publishing handoff."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Source Info
                    </label>
                    <textarea
                      name="sourceInfo"
                      value={formData.sourceInfo}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="Source background, documents, interview trail, or bureau reference."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      name="sourceConfidential"
                      checked={formData.sourceConfidential}
                      onChange={handleInputChange}
                      className="w-4 h-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                    />
                    <span className="text-sm text-gray-700">
                      Source is confidential and should stay internal to the desk
                    </span>
                  </label>
                </div>

                {canEditCopyDeskMeta ? (
                  <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Copy Editor Review</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Proofing and quality checks before the article moves toward approval or publish.
                      </p>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-3">
                      <input
                        type="checkbox"
                        name="proofreadComplete"
                        checked={formData.proofreadComplete}
                        onChange={handleInputChange}
                        className="w-4 h-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                      />
                      <span className="text-sm text-gray-700">
                        Proofread is complete and ready for desk review
                      </span>
                    </label>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Fact Check
                        </label>
                        <select
                          name="factCheckStatus"
                          value={formData.factCheckStatus}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                        >
                          {FACT_CHECK_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Headline
                        </label>
                        <select
                          name="headlineStatus"
                          value={formData.headlineStatus}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                        >
                          {HEADLINE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Image
                        </label>
                        <select
                          name="imageOptimizationStatus"
                          value={formData.imageOptimizationStatus}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                        >
                          {IMAGE_OPTIMIZATION_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        Copy Editor Notes
                      </label>
                      <textarea
                        name="copyEditorNotes"
                        value={formData.copyEditorNotes}
                        onChange={handleInputChange}
                        rows={3}
                        placeholder="Headline, language, verification, or image feedback for the desk."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        Return For Changes Reason
                      </label>
                      <textarea
                        name="returnForChangesReason"
                        value={formData.returnForChangesReason}
                        onChange={handleInputChange}
                        rows={3}
                        placeholder={
                          isReporterView
                            ? 'Visible to desk roles when changes are requested.'
                            : 'Explain what should go back to the reporter before approval.'
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                      />
                    </div>
                  </div>
                ) : null}
              </CmsEditorMain>

              {!isFocusMode ? (
              <CmsEditorSidebar>
                <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Workflow</p>
                      <p className="mt-1 text-sm text-gray-700">
                        Move this article through the newsroom queue without leaving the edit screen.
                      </p>
                    </div>
                    <CmsWorkflowStatusBadge status={workflow.status} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {workflowMetaItems.map((item) => (
                      <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {item.label}
                        </p>
                        <p className="mt-1 text-sm font-medium text-gray-900 capitalize">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className={`rounded-lg border p-4 ${getWorkflowFeedbackToneClass(workflowFeedback.tone)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{workflowFeedback.badge}</p>
                        <p className="mt-1 text-sm leading-6">{workflowFeedback.summary}</p>
                      </div>
                      {workflowFeedback.readyToResubmit ? (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700">
                          Ready to resubmit
                        </span>
                      ) : workflowFeedback.waitingOnDesk ? (
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                          With desk
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-6">
                      <span className="font-semibold">Next action:</span> {workflowFeedback.nextAction}
                    </p>
                    {workflowFeedback.highlightedNote ? (
                      <div className="mt-3 rounded-lg border border-white/70 bg-white/80 p-3 text-sm text-gray-700">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {workflowFeedback.highlightedNoteLabel || 'Desk feedback'}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{workflowFeedback.highlightedNote}</p>
                        {workflowFeedback.highlightedBy ? (
                          <p className="mt-2 text-xs text-gray-500">
                            From {workflowFeedback.highlightedBy}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {canUseWorkflowDesk ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-900">Assignee</label>
                        <select
                          value={workflowAssigneeId}
                          onChange={(event) => setWorkflowAssigneeId(event.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                        >
                          <option value="">
                            {isLoadingAssignableUsers ? 'Loading team...' : 'Select assignee'}
                          </option>
                          {assignableUsers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name} ({formatNewsroomRoleLabel(member.role)})
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          Use this when sending a submitted article to a desk owner.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-900">Priority</label>
                        <select
                          value={workflowPriority}
                          onChange={(event) => setWorkflowPriority(event.target.value as WorkflowPriority)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 capitalize focus:border-spanish-red focus:outline-none"
                        >
                          {WORKFLOW_PRIORITIES.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-900">Due Date</label>
                        <input
                          type="datetime-local"
                          value={workflowDueAt}
                          onChange={(event) => setWorkflowDueAt(event.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-900">Schedule Publish Time</label>
                        <input
                          type="datetime-local"
                          value={workflowScheduledFor}
                          onChange={(event) => setWorkflowScheduledFor(event.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                        />
                        <p className="text-xs text-gray-500">
                          Only required when using the schedule action.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {availableWorkflowActions.includes('reject') || workflow.rejectionReason ? (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-900">Rejection Reason</label>
                      <textarea
                        value={workflowRejectionReason}
                        onChange={(event) => setWorkflowRejectionReason(event.target.value)}
                        rows={3}
                        placeholder="Explain what needs to change before this article can continue."
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                      />
                    </div>
                  ) : null}

                  {availableWorkflowActions.length > 0 ? (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-900">Workflow Note</label>
                      <textarea
                        value={workflowComment}
                        onChange={(event) => setWorkflowComment(event.target.value)}
                        rows={3}
                        placeholder="Add an editorial note, approval note, or handoff context."
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                      />
                    </div>
                  ) : null}

                  {workflowPublishHint || hasUnsavedChanges ? (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
                      {hasUnsavedChanges ? (
                        <p>Save article changes before running workflow actions.</p>
                      ) : null}
                      {workflowPublishHint ? <p>{workflowPublishHint}</p> : null}
                    </div>
                  ) : null}

                  {availableWorkflowActions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {availableWorkflowActions.map((action) => {
                        const isRunning = runningWorkflowAction === action;
                        const needsAssignee = action === 'assign' && !workflowAssigneeId.trim();
                        const needsReason = action === 'reject' && !workflowRejectionReason.trim();
                        const needsSchedule = action === 'schedule' && !workflowScheduledFor.trim();
                        const disabled =
                          Boolean(runningWorkflowAction) ||
                          hasUnsavedChanges ||
                          needsAssignee ||
                          needsReason ||
                          needsSchedule;
                        const toneClass =
                          action === 'reject'
                            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : action === 'publish'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : action === 'approve'
                                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

                        return (
                          <button
                            key={action}
                            type="button"
                            onClick={() => void handleWorkflowAction(action)}
                            disabled={disabled}
                            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
                          >
                            {isRunning ? <Loader className="h-4 w-4 animate-spin" /> : null}
                            {ACTION_LABELS[action]}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">
                      No workflow transition is available for your role from the current state.
                    </p>
                  )}

                  {recentWorkflowComments.length > 0 ? (
                    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                      <p className="text-sm font-semibold text-gray-900">Recent Workflow Notes</p>
                      <div className="space-y-3">
                        {recentWorkflowComments.map((comment) => (
                          <div key={comment.id || `${comment.createdAt || 'comment'}-${comment.body || ''}`} className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                              <span className="font-semibold text-gray-700">
                                {comment.author?.name || comment.author?.email || 'Team'}
                              </span>
                              <span>{formatNewsroomRoleLabel(comment.author?.role)}</span>
                              {comment.createdAt ? (
                                <span>{formatDraftTimestamp(comment.createdAt)}</span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-gray-700">{comment.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <ArticleWorkbenchAssistant
                  result={assistResult}
                  isLoading={isAssistLoading}
                  error={assistError}
                  rejectedPatchKeys={rejectedAssistPatchKeys}
                  onRun={runArticleAssist}
                  onApplyPatch={applyAssistPatch}
                  onApplyAll={applyAssistPatches}
                  onRejectPatch={rejectAssistPatch}
                  onFocusField={focusWorkbenchField}
                  title="Packaging assistant"
                />
                <ArticleTranslationReview
                  title={formData.title}
                  summary={formData.summary}
                  content={formData.content}
                  reporterNotes={formData.reporterNotes}
                  sourcePackage={[formData.sourceStoryTitle, formData.sourceInfo].filter(Boolean).join('\n')}
                  onApply={applyTranslation}
                />

                {formData.sourceType === 'story' && formData.sourceStoryId ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Source Story Link
                        </p>
                        <p className="mt-1 font-semibold">
                          {formData.sourceStoryTitle || 'Linked story package'}
                        </p>
                        <p className="mt-1 text-emerald-800/80">
                          This article stays connected to the story package reporters submitted.
                        </p>
                      </div>
                      <Link
                        href={`/admin/stories/${formData.sourceStoryId}/edit`}
                        className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        Open Source Story
                      </Link>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-medium">Draft & Revision Tools</p>
                  <p className="mt-1 text-blue-800">
                    Server autosave runs {SERVER_AUTOSAVE_DEBOUNCE_MS / 1000} seconds after changes;
                    the browser copy updates after {LOCAL_AUTOSAVE_DEBOUNCE_MS / 1000} second.
                    {serverDraftSavedAt || draftSavedAt
                      ? ` Last saved: ${formatDraftTimestamp(serverDraftSavedAt || draftSavedAt)}.`
                      : ' No draft save yet.'}
                  </p>
                  <p
                    className={`mt-1 text-xs font-semibold ${
                      serverDraftStatus === 'conflict'
                        ? 'text-red-700'
                        : serverDraftStatus === 'offline' || serverDraftStatus === 'error'
                          ? 'text-amber-700'
                          : 'text-blue-700'
                    }`}
                    aria-live="polite"
                  >
                    {serverDraftStatus === 'saving'
                      ? 'Saving to server…'
                      : serverDraftStatus === 'saved'
                        ? `Saved on server${serverDraftVersion ? ` · version ${serverDraftVersion}` : ''}`
                        : serverDraftStatus === 'conflict'
                          ? 'Conflict detected'
                          : serverDraftStatus === 'offline'
                            ? 'Offline · browser fallback retained'
                            : serverDraftStatus === 'error'
                              ? 'Server save failed · browser fallback retained'
                              : 'Server draft ready'}
                    {serverDraftMessage ? ` — ${serverDraftMessage}` : ''}
                  </p>
                  {draftRestored ? (
                    <p className="mt-1 text-blue-800">
                      Browser fallback restored and queued for versioned server save.
                    </p>
                  ) : null}
                  {hasUnsavedChanges ? (
                    <p className="mt-1 text-blue-800">
                      Save article edits before running workflow actions like assign, approve, or publish.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        persistDraft();
                        void saveServerDraft();
                      }}
                      className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                    >
                      Save now (Ctrl+S)
                    </button>
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                    >
                      Discard Local Draft
                    </button>
                  </div>
                </div>

                <details className="rounded-lg border border-gray-200 bg-gray-50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900">
                    SEO Settings
                  </summary>
                  <div className="space-y-3 border-t border-gray-200 p-4">
                  <input
                    type="text"
                    name="seoSlug"
                    value={formData.seoSlug}
                    onChange={handleInputChange}
                    placeholder="SEO slug"
                    maxLength={200}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <p className="-mt-2 break-all text-xs text-gray-500">{previewPath}</p>
                  <input
                    type="text"
                    name="seoTitle"
                    value={formData.seoTitle}
                    onChange={handleInputChange}
                    placeholder="Meta title (max 160)"
                    maxLength={160}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <textarea
                    name="seoDescription"
                    value={formData.seoDescription}
                    onChange={handleInputChange}
                    placeholder="Meta description (max 320)"
                    rows={3}
                    maxLength={320}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <input
                    type="text"
                    name="ogImage"
                    value={formData.ogImage}
                    onChange={handleInputChange}
                    placeholder="OG image URL or /local-path"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <p className="-mt-2 text-xs text-gray-500">
                    Leave empty to auto-use featured image as 1200x630 OG preview.
                  </p>
                  <input
                    type="text"
                    name="focusKeyword"
                    value={formData.focusKeyword}
                    onChange={handleInputChange}
                    placeholder="Focus keyword"
                    maxLength={120}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <input
                    type="text"
                    name="secondaryKeywords"
                    value={formData.secondaryKeywords}
                    onChange={handleInputChange}
                    placeholder="Secondary keywords"
                    maxLength={240}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <input
                    type="url"
                    name="canonicalUrl"
                    value={formData.canonicalUrl}
                    onChange={handleInputChange}
                    placeholder="Canonical URL"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <div className="-mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>
                      Leave empty to use the default public article permalink. Override it only when
                      the article needs a preferred external URL.
                    </span>
                    {defaultPermalink ? (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((current) => ({
                            ...current,
                            canonicalUrl: defaultPermalink,
                          }))
                        }
                        className="rounded-full border border-gray-300 bg-white px-3 py-1 font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Use Default Permalink
                      </button>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      name="includeInNewsSitemap"
                      checked={formData.includeInNewsSitemap}
                      onChange={handleInputChange}
                      className="w-4 h-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                    />
                    <span className="text-sm text-gray-700">Include in Google News sitemap</span>
                  </label>
                  <textarea
                    name="majorUpdateNote"
                    value={formData.majorUpdateNote}
                    onChange={handleInputChange}
                    placeholder="Major update note"
                    rows={2}
                    maxLength={240}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-spanish-red transition-colors"
                  />
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Google Preview</p>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-blue-700">{googlePreview.title}</p>
                    <p className="mt-1 break-all text-xs text-green-700">{googlePreview.url}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-gray-600">{googlePreview.description || 'Meta description or summary will appear here.'}</p>
                  </div>
                  </div>
                </details>

                <div data-article-field="image" className="rounded-lg border border-gray-200 bg-white p-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Featured Image <span className="text-red-500">*</span>
                  </label>
                  <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-spanish-red hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">Click to change image</span>
                    </div>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                  <p className="mt-2 text-xs text-gray-500">{ARTICLE_IMAGE_UPLOAD_GUIDE}</p>
                  {imageQualityNote ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">{imageQualityNote}</p>
                  ) : null}
                  {imagePreview ? (
                    <div className="mt-4 rounded-lg overflow-hidden border border-gray-200">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="aspect-[16/9] w-full bg-zinc-950 object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    <input
                      type="text"
                      name="featuredImageAlt"
                      value={formData.featuredImageAlt}
                      onChange={handleInputChange}
                      placeholder="Featured image alt text"
                      maxLength={220}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-spanish-red focus:outline-none"
                    />
                    <textarea
                      name="featuredImageCaption"
                      value={formData.featuredImageCaption}
                      onChange={handleInputChange}
                      placeholder="Featured image caption"
                      rows={2}
                      maxLength={300}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-spanish-red focus:outline-none"
                    />
                    <input
                      type="text"
                      name="imageCredit"
                      value={formData.imageCredit}
                      onChange={handleInputChange}
                      placeholder="Image credit/source"
                      maxLength={180}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-spanish-red focus:outline-none"
                    />
                  </div>
                  <ArticleFeaturedImageReaderPreview
                    image={imagePreview}
                    title={formData.title}
                    summary={formData.summary}
                    caption={formData.featuredImageCaption}
                    credit={formData.imageCredit}
                    alt={formData.featuredImageAlt}
                    category={formData.category}
                  />
                </div>

                <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Homepage placement & article status</p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">Choose where this published story receives priority. The homepage automatically fills any unused positions.</p>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
                    <input
                      type="checkbox"
                      name="isBreaking"
                      checked={formData.isBreaking}
                      onChange={handleInputChange}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                    />
                    <span><span className="block text-sm font-semibold text-gray-900">Breaking News / Live Updates</span><span className="mt-0.5 block text-xs leading-5 text-gray-600">Prioritizes this story in Live Updates and enables the breaking-news banner. Breaking audio is required before publication.</span></span>
                  </label>
                  {formData.isBreaking ? (
                    <div className="grid gap-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-red-700">Breaking reason</span>
                        <textarea
                          name="breakingReason"
                          value={formData.editorial.breakingReason}
                          onChange={(event) => updateEditorialField('breakingReason', event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Why does this story require a breaking banner?"
                          className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:border-spanish-red focus:outline-none"
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Starts at</span>
                          <input type="datetime-local" name="breakingStartsAt" value={formData.editorial.breakingStartsAt} onChange={(event) => updateEditorialField('breakingStartsAt', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-spanish-red focus:outline-none" />
                        </label>
                        <label className="block space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expires at</span>
                          <input type="datetime-local" name="breakingExpiresAt" value={formData.editorial.breakingExpiresAt} onChange={(event) => updateEditorialField('breakingExpiresAt', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-spanish-red focus:outline-none" />
                        </label>
                      </div>
                      <p className="text-xs text-gray-600">The public breaking flag is automatically hidden before its start and after its expiry. The server records the approving editor.</p>
                    </div>
                  ) : null}
                  {formData.isBreaking ? (
                    <div data-article-field="breakingAudio" className="space-y-3 rounded-lg border border-red-200 bg-white p-3 dark:border-red-500/30 dark:bg-zinc-900">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-red-50 p-2 text-spanish-red dark:bg-red-500/15 dark:text-red-100">
                          <Volume2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              Breaking News Audio
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                breakingTtsStatus === 'ready'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : breakingTtsNeedsSave
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {breakingTtsStatus === 'ready' && !breakingTtsNeedsSave
                                ? 'Ready'
                                : breakingTtsNeedsSave
                                  ? 'Save changes'
                                  : 'Required before publish'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                            {breakingTtsNeedsSave
                              ? 'Save the changed headline or location before replacing the audio.'
                              : 'Record the script below exactly, then upload the matching audio file.'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Recording Script
                        </p>
                        <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-900 dark:border-gray-700 dark:bg-zinc-950 dark:text-gray-100">
                          {currentBreakingRecordingScript}
                        </div>
                      </div>

                      {breakingTtsInfo?.audioUrl ? (
                        <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-zinc-950">
                          <div className="flex items-center gap-2">
                            <FileAudio className="h-4 w-4 text-spanish-red" />
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                              Saved breaking audio
                            </p>
                          </div>
                          <audio controls preload="metadata" src={breakingTtsInfo.audioUrl} className="w-full" />
                          <a
                            href={breakingTtsInfo.audioUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs text-spanish-red hover:underline"
                          >
                            {breakingTtsInfo.audioUrl}
                          </a>
                          {breakingTtsInfo.generatedAt ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Uploaded: {formatBreakingTtsTimestamp(breakingTtsInfo.generatedAt)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <label
                          className={`inline-flex items-center gap-2 rounded-md border border-spanish-red bg-white px-3 py-2 text-xs font-semibold text-spanish-red hover:bg-red-50 dark:bg-transparent dark:text-red-100 dark:hover:bg-red-500/15 ${
                            breakingTtsNeedsSave || isUploadingBreakingTts
                              ? 'pointer-events-none cursor-not-allowed opacity-50'
                              : 'cursor-pointer'
                          }`}
                        >
                          {isUploadingBreakingTts ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {breakingTtsInfo?.audioUrl ? 'Replace Breaking Audio' : 'Upload Breaking Audio'}
                          <input
                            type="file"
                            accept={MANUAL_AUDIO_ACCEPT}
                            disabled={breakingTtsNeedsSave || isUploadingBreakingTts}
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              event.currentTarget.value = '';
                              void handleUploadBreakingTts(file);
                            }}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
                    <input
                      type="checkbox"
                      name="isTrending"
                      checked={formData.isTrending}
                      onChange={handleInputChange}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                    />
                    <span><span className="block text-sm font-semibold text-gray-900">Feature in Popular News</span><span className="mt-0.5 block text-xs leading-5 text-gray-600">Pins this story near the top of Popular News until the trending expiry.</span></span>
                  </label>
                  {formData.isTrending ? (
                    <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Trending reason</span>
                        <textarea name="trendingReason" value={formData.editorial.trendingReason} onChange={(event) => updateEditorialField('trendingReason', event.target.value)} rows={2} maxLength={500} placeholder="Cite the audience or editorial signal." className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-spanish-red focus:outline-none" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Trending expires at</span>
                        <input type="datetime-local" name="trendingExpiresAt" value={formData.editorial.trendingExpiresAt} onChange={(event) => updateEditorialField('trendingExpiresAt', event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-spanish-red focus:outline-none" />
                      </label>
                      <p className="text-xs text-gray-600">The public trending flag is automatically hidden after expiry.</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">Publish timing</p>
                  <p>Timezone: Asia/Calcutta</p>
                  <p>Scheduled: {workflow.scheduledFor ? formatDraftTimestamp(workflow.scheduledFor) : 'Not scheduled'}</p>
                  <p>Published: {workflow.publishedAt ? formatDraftTimestamp(workflow.publishedAt) : 'Not published'}</p>
                  <p>Updated: {formData.majorUpdateNote ? formData.majorUpdateNote : 'No major update note'}</p>
                </div>

            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-spanish-red" />
                    <p className="text-sm font-semibold text-gray-900">Article Listen Audio</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        articleTtsStatus === 'ready'
                          ? 'bg-emerald-100 text-emerald-700'
                          : articleTtsStatus === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : articleTtsStatus === 'stale'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {articleTtsStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">
                    {articleTtsNeedsSave
                      ? 'Save the title, summary, or content changes first. Listen audio follows the last saved article text.'
                      : articleTtsStatus === 'ready'
                        ? 'Manual listen audio is ready for readers.'
                        : articleTtsStatus === 'failed'
                          ? 'The last listen-audio upload failed. Upload a new file.'
                          : articleTtsStatus === 'stale'
                            ? 'The saved listen-audio asset needs a fresh upload.'
                            : articleTtsStatus === 'disabled'
                              ? 'Save article title, summary, and content before uploading listen audio.'
                              : 'No manual listen audio is uploaded for this article yet.'}
                  </p>
                  {articleTtsInfo?.generatedAt ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Last generated: {formatBreakingTtsTimestamp(articleTtsInfo.generatedAt)}
                    </p>
                  ) : null}
                  {articleTtsInfo?.voice || articleTtsInfo?.model ? (
                    <p className="mt-1 text-xs text-gray-500">
                      {[articleTtsInfo.voice, articleTtsInfo.model, articleTtsInfo.storageMode]
                        .filter(Boolean)
                        .join(' | ')}
                    </p>
                  ) : null}
                  {articleTtsInfo?.charCount ? (
                    <p className="mt-1 text-xs text-gray-500">
                      {articleTtsInfo.charCount.toLocaleString()} characters | {articleTtsInfo.chunkCount || 1} chunk(s)
                    </p>
                  ) : null}
                  {articleTtsInfo?.lastError ? (
                    <p className="mt-1 text-xs text-amber-700">{articleTtsInfo.lastError}</p>
                  ) : null}
                </div>
                <label
                  className={`inline-flex items-center gap-2 rounded-md border border-spanish-red bg-white px-3 py-2 text-xs font-semibold text-spanish-red hover:bg-red-50 ${
                    articleTtsNeedsSave ||
                    !articleTtsEligible ||
                    isLoadingArticleTts ||
                    isRegeneratingArticleTts
                      ? 'pointer-events-none cursor-not-allowed opacity-50'
                      : 'cursor-pointer'
                  }`}
                >
                  {isLoadingArticleTts || isRegeneratingArticleTts ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {articleTtsInfo?.audioUrl ? 'Replace Audio' : 'Upload Audio'}
                  <input
                    type="file"
                    accept={MANUAL_AUDIO_ACCEPT}
                    disabled={
                      articleTtsNeedsSave ||
                      !articleTtsEligible ||
                      isLoadingArticleTts ||
                      isRegeneratingArticleTts
                    }
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      event.currentTarget.value = '';
                      void handleUploadArticleTts(file);
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
              {articleTtsInfo?.audioUrl ? (
                <div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-2">
                  <p className="text-xs font-medium text-gray-700">Saved audio</p>
                  <audio controls preload="metadata" src={articleTtsInfo.audioUrl} className="w-full" />
                  <a
                    href={articleTtsInfo.audioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-xs text-spanish-red hover:underline"
                  >
                    {articleTtsInfo.audioUrl}
                  </a>
                </div>
              ) : null}
            </div>

            <CmsWorkflowActivityTimeline
              description="Live audit trail for saves, workflow moves, and revision restores."
              items={articleActivity}
              isLoading={isLoadingActivity}
              onRefresh={fetchArticleActivity}
              emptyMessage="No article activity yet. Save or move workflow to start the timeline."
              fallbackMessage="Article activity recorded."
              actionLabel={formatActivityActionLabel}
              formatTimestamp={formatDraftTimestamp}
              formatStatusLabel={(status) => formatWorkflowStatus(status as WorkflowStatus)}
              formatActorRole={(role) => formatNewsroomRoleLabel(role as AdminRole)}
            />

            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Revision History</p>
                <button
                  type="button"
                  onClick={() => void fetchRevisions()}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  {isLoadingRevisions ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              {isLoadingRevisions ? (
                <p className="text-sm text-gray-600">Loading revisions...</p>
              ) : null}
              {!isLoadingRevisions && revisions.length === 0 ? (
                <p className="text-sm text-gray-600">No revisions yet. Save article to create one.</p>
              ) : null}
              {!isLoadingRevisions && revisions.length > 0 ? (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {revisions.map((revision, index) => {
                    const revisionId = revision._id || `${revision.savedAt || 'revision'}-${index}`;
                    const isRestoring = restoringRevisionId === revisionId;
                    return (
                      <div key={revisionId} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {revision.title?.trim() || 'Untitled revision'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDraftTimestamp(revision.savedAt || '') || 'Unknown save time'}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!revision._id || isRestoring}
                            onClick={() => revision._id && void handleRestoreRevision(revision._id)}
                            className="shrink-0 rounded-md border border-spanish-red px-3 py-1.5 text-xs font-semibold text-spanish-red hover:bg-red-50 disabled:opacity-50"
                          >
                            {isRestoring ? 'Restoring...' : 'Restore'}
                          </button>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                          {revision.summary?.trim() || 'No summary in this revision.'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isSaving || isLoadingImage || isLockedByOther}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-spanish-red text-white font-medium rounded-lg hover:bg-guardsman-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving || isLoadingImage ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : isLockedByOther ? (
                  <>
                    <Upload className="w-5 h-5" />
                    Locked by Editor
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Save Changes
                  </>
                )}
              </button>
              <Link href="/admin/articles">
                <button
                  type="button"
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </Link>
            </div>

            <ArticleEditorSidebar
              title={formData.title}
              summary={formData.summary}
              content={formData.content}
              slug={formData.seoSlug}
              image={imagePreview}
              seo={normalizedSeo}
              category={formData.category}
              relatedArticles={relatedArticles}
              className="space-y-3"
            />
            </CmsEditorSidebar>
              ) : null}
          </CmsEditorColumns>
          {isFocusMode ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Save & Return To Desk Tools</p>
              <p className="mt-1 text-xs text-gray-600">
                Exit focus when you want to review workflow, revisions, audio, SEO, or publishing settings.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={isSaving || isLoadingImage || isLockedByOther}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-spanish-red py-3 text-white font-medium transition-colors hover:bg-guardsman-red disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving || isLoadingImage ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : isLockedByOther ? (
                    <>
                      <Upload className="w-5 h-5" />
                      Locked by Editor
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Save Changes
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFocusMode(false)}
                  className="w-full rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
                >
                  Exit Focus
                </button>
                <Link href="/admin/articles" className="w-full sm:w-auto">
                  <button
                    type="button"
                    className="w-full rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </Link>
              </div>
            </div>
          ) : null}
          </form>
        </div>
        </CmsEditorCanvas>
      </motion.div>
    </div>
  );
}
