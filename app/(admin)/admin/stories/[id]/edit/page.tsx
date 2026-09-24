'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Download,
  Image as ImageIcon,
  Loader2,
  Play,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
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
import { getStoryEditCapabilities } from '@/lib/auth/storyEditing';
import {
  isAdminRole,
  isCopyEditorRole,
  isReporterDeskRole,
  type AdminRole,
} from '@/lib/auth/roles';
import {
  countStoryMediaAssets,
  createStoryMediaAsset,
  derivePrimaryStoryMedia,
  normalizeStoryMediaAssets,
  validateStoryMediaAssets,
  STORY_MAX_IMAGE_COUNT,
  STORY_MAX_VIDEO_COUNT,
  type StoryMediaAsset,
} from '@/lib/content/storyMedia';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import { formatUiDateTime } from '@/lib/utils/dateFormat';
import {
  formatStoryVideoSize,
  getStoryVideoDisplayName,
  uploadFileToSignedUrl,
  validateStoryVideoFile,
} from '@/lib/utils/storyVideoUploadClient';
import { getAllowedWorkflowTransitions } from '@/lib/workflow/transitions';
import type { WorkflowPriority, WorkflowStatus } from '@/lib/workflow/types';
import {
  CmsEditorCanvas,
  CmsEditorColumns,
  CmsEditorMain,
  CmsEditorSidebar,
} from '@/components/admin/CmsEditorLayout';
import { AdminMediaImage } from '@/components/admin/AdminMediaImage';
import { CmsWorkflowActivityTimeline } from '@/components/admin/CmsWorkflowActivityTimeline';
import WorkflowRail from '@/components/admin/WorkflowRail';
import { CmsWorkflowStatusBadge } from '@/components/admin/CmsWorkflowStatusBadge';
import ArticleEditorStudio, {
  type ArticleEditorStudioMode,
} from '@/components/forms/ArticleEditorStudio';

interface StoryFormData {
  title: string;
  caption: string;
  thumbnail: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: string;
  linkUrl: string;
  linkLabel: string;
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
  durationSeconds: string;
  priority: string;
  views: string;
}

type StoryReporterMeta = {
  locationTag?: string;
  sourceInfo?: string;
  sourceConfidential?: boolean;
  reporterNotes?: string;
};

type StoryCopyEditorMeta = {
  proofreadComplete?: boolean;
  factCheckStatus?: StoryFormData['factCheckStatus'];
  headlineStatus?: StoryFormData['headlineStatus'];
  imageOptimizationStatus?: StoryFormData['imageOptimizationStatus'];
  copyEditorNotes?: string;
  returnForChangesReason?: string;
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

type StoryActivityItem = {
  id?: string;
  action?: string;
  fromStatus?: WorkflowStatus | null;
  toStatus?: WorkflowStatus | null;
  actor?: WorkflowActor | null;
  message?: string;
  createdAt?: string | null;
  source?: 'audit' | 'derived';
};

type AssignableUserOption = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

type PreviewAssetState = {
  asset: StoryMediaAsset;
  title: string;
};

type LinkedArticleStatus = 'not_created' | 'draft' | 'submitted' | 'published' | string;

type ArticleBuilderForm = {
  title: string;
  summary: string;
  content: string;
  image: string;
  category: string;
  author: string;
};

const categories = ['General', ...NEWS_CATEGORIES.map((category) => category.nameEn)];
const THUMBNAIL_MAX_SIZE = 5 * 1024 * 1024;
const SPACES_STORAGE_PROVIDER = 'do-spaces';
const WORKFLOW_PRIORITIES: WorkflowPriority[] = ['low', 'normal', 'high', 'urgent'];

function isAllowedImageFile(file: File) {
  const mime = file.type.trim().toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'image/webp'
  );
}

function truncateMediaLabel(value: string, maxLength = 16) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}...`;
}

function getMediaAssetLabel(asset: StoryMediaAsset) {
  const fallback =
    asset.kind === 'video'
      ? getStoryVideoDisplayName(asset.url)
      : `image-${asset.order + 1}`;

  return asset.originalFileName || fallback;
}

type StoryMediaTileProps = {
  asset: StoryMediaAsset;
  kindLabel: string;
  onPreview: () => void;
  replaceLabel?: string;
  removeLabel?: string;
  replaceInputId?: string;
  accept?: string;
  onReplace?: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onRemove?: () => void;
};

function StoryMediaTile({
  asset,
  kindLabel,
  onPreview,
  replaceLabel,
  removeLabel,
  replaceInputId,
  accept,
  onReplace,
  onRemove,
}: StoryMediaTileProps) {
  const label = getMediaAssetLabel(asset);
  const sizeLabel = formatStoryVideoSize(asset.sizeBytes);
  const canEditTile = Boolean(
    replaceLabel && removeLabel && replaceInputId && accept && onReplace && onRemove
  );

  return (
    <div className="w-[88px] shrink-0 sm:w-24">
      <button
        type="button"
        onClick={onPreview}
        className="group relative block aspect-square w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
        title={label}
      >
        {asset.kind === 'image' ? (
          <AdminMediaImage
            src={asset.url}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            <video
              src={asset.url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full bg-black object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/15">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
                <Play className="h-4 w-4 fill-current" />
              </span>
            </div>
          </>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2 pb-2 pt-6 text-left">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-white/90">
            {kindLabel}
          </span>
          <span className="block truncate text-[10px] text-white/80">{sizeLabel}</span>
        </div>
      </button>

      <div className="mt-2 space-y-1">
        <p className="truncate text-[11px] font-medium text-gray-700" title={label}>
          {truncateMediaLabel(label)}
        </p>
        {canEditTile ? (
          <div className="flex items-center gap-1">
            <label
              htmlFor={replaceInputId}
              className="flex-1 cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-[10px] font-semibold text-gray-700 transition-colors hover:bg-gray-100"
            >
              {replaceLabel}
            </label>
            <input
              id={replaceInputId}
              type="file"
              accept={accept}
              className="hidden"
              onChange={onReplace}
            />
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
              aria-label={removeLabel}
              title={removeLabel}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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

const initialFormData: StoryFormData = {
  title: '',
  caption: '',
  thumbnail: '',
  mediaType: 'image',
  mediaUrl: '',
  mediaKey: '',
  mediaSizeBytes: 0,
  mediaMimeType: '',
  storageProvider: '',
  linkUrl: '',
  linkLabel: '',
  category: 'General',
  author: 'Desk',
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
  durationSeconds: '6',
  priority: '0',
  views: '0',
};

const initialArticleBuilderForm: ArticleBuilderForm = {
  title: '',
  summary: '',
  content: '',
  image: '',
  category: 'General',
  author: 'Desk',
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

function buildFormSnapshot(
  formData: StoryFormData,
  thumbnailPreview: string,
  mediaAssets: StoryMediaAsset[]
) {
  return JSON.stringify({
    ...formData,
    thumbnailPreview: thumbnailPreview.trim(),
    mediaAssets,
  });
}

function formatDateTime(value: string | null | undefined) {
  return value ? formatUiDateTime(value, '') : '';
}

function formatWorkflowStatus(status: WorkflowStatus) {
  return status.replace(/_/g, ' ');
}

function formatActivityActionLabel(action: string | undefined) {
  return String(action || 'activity')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

function parseDownloadFileNameFromDisposition(value: string | null) {
  const header = String(value || '').trim();
  if (!header) return '';

  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]).trim();
    } catch {
      return utfMatch[1].trim();
    }
  }

  const asciiMatch = header.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1]?.trim() || '';
}

function getInitialStoryMediaAssets(story: Record<string, unknown>) {
  const normalized = normalizeStoryMediaAssets(story.mediaAssets);
  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackThumbnail = String(story.thumbnail || '').trim();
  const fallbackMediaUrl = String(story.mediaUrl || '').trim();
  const fallbackMediaType = story.mediaType === 'video' ? 'video' : 'image';
  const assets: StoryMediaAsset[] = [];

  if (fallbackThumbnail) {
    assets.push(
      createStoryMediaAsset({
        id: 'legacy-image',
        kind: 'image',
        url: fallbackThumbnail,
        key: '',
        mimeType: '',
        sizeBytes: 0,
        storageProvider: '',
        originalFileName: '',
        order: 0,
        createdAt: new Date(0).toISOString(),
      })
    );
  }

  if (fallbackMediaUrl && fallbackMediaType === 'video') {
    assets.push(
      createStoryMediaAsset({
        id: 'legacy-video',
        kind: 'video',
        url: fallbackMediaUrl,
        key: String(story.mediaKey || ''),
        mimeType: String(story.mediaMimeType || '').toLowerCase(),
        sizeBytes: Number.isFinite(Number(story.mediaSizeBytes))
          ? Math.max(0, Number(story.mediaSizeBytes))
          : 0,
        storageProvider: String(story.storageProvider || ''),
        originalFileName: '',
        order: assets.length,
        createdAt: new Date(0).toISOString(),
      })
    );
  }

  return assets;
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

function parseWorkflowActionDate(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export default function EditStoryPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params?.id) ? params.id[0] || '' : params?.id || '';
  const storyId = decodeURIComponent(routeId);

  const [formData, setFormData] = useState<StoryFormData>(initialFormData);
  const [mediaAssets, setMediaAssets] = useState<StoryMediaAsset[]>([]);
  const [usesMediaCollection, setUsesMediaCollection] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [savedFormSnapshot, setSavedFormSnapshot] = useState('');
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [storyVersion, setStoryVersion] = useState(1);
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
  const [storyActivity, setStoryActivity] = useState<StoryActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [downloadingAsset, setDownloadingAsset] = useState<'' | 'thumbnail' | 'media'>('');
  const [previewAsset, setPreviewAsset] = useState<PreviewAssetState | null>(null);
  const [linkedArticleId, setLinkedArticleId] = useState('');
  const [linkedArticleStatus, setLinkedArticleStatus] = useState<LinkedArticleStatus>('not_created');
  const [articleBuilderForm, setArticleBuilderForm] =
    useState<ArticleBuilderForm>(initialArticleBuilderForm);
  const [articleBuilderIntent, setArticleBuilderIntent] = useState<'' | 'draft' | 'submit'>('');
  const [articleBuilderMode, setArticleBuilderMode] =
    useState<ArticleEditorStudioMode>('split');
  const [articleBuilderFocusMode, setArticleBuilderFocusMode] = useState(false);

  const mediaCounts = useMemo(() => countStoryMediaAssets(mediaAssets), [mediaAssets]);
  const imageAssets = useMemo(
    () => mediaAssets.filter((asset) => asset.kind === 'image'),
    [mediaAssets]
  );
  const videoAssets = useMemo(
    () => mediaAssets.filter((asset) => asset.kind === 'video'),
    [mediaAssets]
  );
  const primaryMedia = useMemo(
    () => derivePrimaryStoryMedia(mediaAssets, formData.thumbnail.trim()),
    [formData.thumbnail, mediaAssets]
  );
  const previewThumbnail = useMemo(
    () => thumbnailPreview || (usesMediaCollection ? primaryMedia.thumbnail : formData.thumbnail.trim()),
    [formData.thumbnail, primaryMedia.thumbnail, thumbnailPreview, usesMediaCollection]
  );

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

  const storyEditCapabilities = useMemo(
    () => getStoryEditCapabilities(permissionUser, workflowPermissionRecord),
    [permissionUser, workflowPermissionRecord]
  );
  const canUseWorkflowDesk = canManageWorkflowAssignments(permissionUser?.role);
  const canSaveStory = storyEditCapabilities.canSaveStory;
  const canEditCommonFields = storyEditCapabilities.canEditCommonFields;
  const canEditLinkFields = storyEditCapabilities.canEditLinkFields;
  const canEditMediaFields = storyEditCapabilities.canEditMediaFields;
  const canEditReporterFields = storyEditCapabilities.canEditReporterFields;
  const canEditCopyDeskMeta = storyEditCapabilities.canEditCopyDeskFields;
  const canEditAdminFields = storyEditCapabilities.canEditAdminFields;
  const canReplaceStoryVideo = storyEditCapabilities.canReplaceStoryVideo;
  const canUseManualVideoUrl = storyEditCapabilities.canUseManualVideoUrl;
  const canDownloadStoryAssets = storyEditCapabilities.canDownloadStoryAssets;
  const isReporterView = isReporterDeskRole(permissionUser?.role);
  const isCopyEditorView = isCopyEditorRole(permissionUser?.role);
  const isCopyEditorSharedSubmittedStory =
    isCopyEditorView && workflow.status === 'submitted' && !workflow.assignedTo;
  const canBuildLinkedArticle =
    !isReporterView &&
    !linkedArticleId &&
    (canEditCopyDeskMeta || canEditAdminFields);
  const showStoryEditFields = !isCopyEditorView || canEditAdminFields;
  const hasUnsavedChanges =
    Boolean(thumbnailFile) ||
    buildFormSnapshot(formData, previewThumbnail, mediaAssets) !== savedFormSnapshot;
  const showCopyDeskSection = canEditCopyDeskMeta || Boolean(
    formData.copyEditorNotes.trim() ||
      formData.returnForChangesReason.trim() ||
      formData.proofreadComplete ||
      formData.factCheckStatus !== 'pending' ||
      formData.headlineStatus !== 'pending' ||
      formData.imageOptimizationStatus !== 'pending'
  );

  const availableWorkflowActions = useMemo(() => {
    if (!permissionUser) return [] as ContentTransitionAction[];

    const actions = getAllowedWorkflowTransitions(workflow.status)
      .map((status) => STATUS_TO_ACTION[status])
      .filter((action): action is ContentTransitionAction => Boolean(action))
      .filter((action) =>
        canTransitionContent(permissionUser, workflowPermissionRecord, action)
      );

    if (
      workflow.status === 'submitted' &&
      canTransitionContent(permissionUser, workflowPermissionRecord, 'start_review') &&
      !actions.includes('start_review')
    ) {
      return ['start_review' as ContentTransitionAction, ...actions];
    }

    return actions;
  }, [permissionUser, workflow.status, workflowPermissionRecord]);

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
      value: workflowPriority,
    },
    {
      label: 'Submitted',
      value: workflow.submittedAt ? formatDateTime(workflow.submittedAt) : 'Not submitted',
    },
    {
      label: 'Scheduled',
      value: workflow.scheduledFor ? formatDateTime(workflow.scheduledFor) : 'Not scheduled',
    },
    {
      label: 'Published',
      value: workflow.publishedAt ? formatDateTime(workflow.publishedAt) : 'Not published',
    },
    {
      label: 'Due',
      value: workflow.dueAt ? formatDateTime(workflow.dueAt) : 'No due date',
    },
  ];

  const recentWorkflowComments = useMemo(
    () =>
      [...workflow.comments]
        .filter((comment) => comment.body?.trim())
        .slice(-5)
        .reverse(),
    [workflow.comments]
  );

  const fetchStory = useCallback(async () => {
    if (!storyId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/stories/${encodeURIComponent(storyId)}`, {
        headers: {
          ...getAuthHeader(),
        },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load story');
      }

      const story = data.data as Record<string, unknown>;
      const loadedVersion = Number(story.version);
      const nextForm = {
        title: String(story.title || ''),
        caption: String(story.caption || ''),
        thumbnail: String(story.thumbnail || ''),
        mediaType: story.mediaType === 'video' ? 'video' : 'image',
        mediaUrl: String(story.mediaUrl || ''),
        mediaKey: String(story.mediaKey || ''),
        mediaSizeBytes: Number(story.mediaSizeBytes || 0),
        mediaMimeType: String(story.mediaMimeType || ''),
        storageProvider: String(story.storageProvider || ''),
        linkUrl: String(story.linkUrl || ''),
        linkLabel: String(story.linkLabel || ''),
        category: String(story.category || 'General'),
        author: String(story.author || 'Desk'),
        locationTag: String((story.reporterMeta as StoryReporterMeta | undefined)?.locationTag || ''),
        sourceInfo: String((story.reporterMeta as StoryReporterMeta | undefined)?.sourceInfo || ''),
        sourceConfidential: Boolean(
          (story.reporterMeta as StoryReporterMeta | undefined)?.sourceConfidential
        ),
        reporterNotes: String(
          (story.reporterMeta as StoryReporterMeta | undefined)?.reporterNotes || ''
        ),
        proofreadComplete: Boolean(
          (story.copyEditorMeta as StoryCopyEditorMeta | undefined)?.proofreadComplete
        ),
        factCheckStatus:
          (story.copyEditorMeta as StoryCopyEditorMeta | undefined)?.factCheckStatus ||
          'pending',
        headlineStatus:
          (story.copyEditorMeta as StoryCopyEditorMeta | undefined)?.headlineStatus ||
          'pending',
        imageOptimizationStatus:
          (story.copyEditorMeta as StoryCopyEditorMeta | undefined)?.imageOptimizationStatus ||
          'pending',
        copyEditorNotes: String(
          (story.copyEditorMeta as StoryCopyEditorMeta | undefined)?.copyEditorNotes || ''
        ),
        returnForChangesReason: String(
          (story.copyEditorMeta as StoryCopyEditorMeta | undefined)
            ?.returnForChangesReason || ''
        ),
        durationSeconds: String(story.durationSeconds ?? 6),
        priority: String(story.priority ?? 0),
        views: String(story.views ?? 0),
      } satisfies StoryFormData;
      const nextWorkflow = normalizeWorkflowState(story.workflow);
      const nextMediaAssets = getInitialStoryMediaAssets(story);
      const nextPrimaryMedia = derivePrimaryStoryMedia(
        nextMediaAssets,
        String(story.thumbnail || '')
      );
      const nextLinkedArticleId = String(story.linkedArticleId || '').trim();
      const nextLinkedArticleStatus = String(
        story.linkedArticleStatus || 'not_created'
      ) as LinkedArticleStatus;

      setFormData(nextForm);
      setStoryVersion(
        Number.isInteger(loadedVersion) && loadedVersion > 0 ? loadedVersion : 1
      );
      setMediaAssets(nextMediaAssets);
      setUsesMediaCollection(nextMediaAssets.length > 0);
      setThumbnailFile(null);
      setVideoUploadProgress(0);
      setThumbnailPreview('');
      setSavedFormSnapshot(
        buildFormSnapshot(
          nextForm,
          nextPrimaryMedia.thumbnail,
          nextMediaAssets
        )
      );
      setLinkedArticleId(nextLinkedArticleId);
      setLinkedArticleStatus(nextLinkedArticleStatus);
      setArticleBuilderForm({
        title: nextForm.title,
        summary: nextForm.caption.slice(0, 500),
        content: nextForm.caption,
        image: nextPrimaryMedia.thumbnail || nextForm.thumbnail,
        category: nextForm.category,
        author: nextForm.author || 'Desk',
      });
      setWorkflow(nextWorkflow);
      setWorkflowPriority(nextWorkflow.priority);
      setWorkflowAssigneeId(nextWorkflow.assignedTo?.id || '');
      setWorkflowScheduledFor(toDateTimeInputValue(nextWorkflow.scheduledFor));
      setWorkflowDueAt(toDateTimeInputValue(nextWorkflow.dueAt));
      setWorkflowRejectionReason(nextWorkflow.rejectionReason || '');
      setWorkflowComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load story');
    } finally {
      setIsLoading(false);
    }
  }, [storyId]);

  const fetchStoryActivity = useCallback(async () => {
    if (!storyId) {
      setStoryActivity([]);
      return;
    }

    setIsLoadingActivity(true);
    try {
      const response = await fetch(`/api/admin/stories/${encodeURIComponent(storyId)}/activity`, {
        headers: {
          ...getAuthHeader(),
        },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: StoryActivityItem[];
      };

      if (!response.ok || !data.success || !Array.isArray(data.data)) {
        setStoryActivity([]);
        return;
      }

      setStoryActivity(data.data);
    } catch {
      setStoryActivity([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }, [storyId]);

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

      setAssignableUsers(data.data);
    } catch {
      setAssignableUsers([]);
    } finally {
      setIsLoadingAssignableUsers(false);
    }
  }, [canUseWorkflowDesk]);

  useEffect(() => {
    void fetchStory();
    void fetchStoryActivity();
  }, [fetchStory, fetchStoryActivity]);

  useEffect(() => {
    void fetchAssignableUsers();
  }, [fetchAssignableUsers]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const nextValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

      if (name === 'mediaType' && nextValue !== 'video' && !usesMediaCollection) {
        setVideoUploadProgress(0);
        return {
          ...prev,
          mediaType: 'image',
          mediaUrl: '',
          mediaKey: '',
          mediaSizeBytes: 0,
          mediaMimeType: '',
          storageProvider: '',
        };
      }

      if (name === 'mediaUrl') {
        return {
          ...prev,
          mediaUrl: String(nextValue || '').trim(),
          mediaKey: '',
          mediaSizeBytes: 0,
          mediaMimeType: '',
          storageProvider: '',
        };
      }

      return {
        ...prev,
        [name]: nextValue,
      };
    });
  };

  const handleArticleBuilderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setArticleBuilderForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const replaceMediaAsset = (assetId: string, nextAsset: StoryMediaAsset) => {
    setUsesMediaCollection(true);
    setMediaAssets((current) =>
      current.map((asset) =>
        asset.id === assetId ? { ...nextAsset, id: asset.id, order: asset.order } : asset
      )
    );
    setPreviewAsset((current) =>
      current?.asset.id === assetId
        ? {
            asset: { ...nextAsset, id: assetId },
            title: nextAsset.kind === 'video' ? 'Story video preview' : 'Story photo preview',
          }
        : current
    );
  };

  const removeMediaAsset = (assetId: string) => {
    setUsesMediaCollection(true);
    setMediaAssets((current) =>
      current
        .filter((asset) => asset.id !== assetId)
        .map((asset, index) => ({
          ...asset,
          order: index,
        }))
    );
    setPreviewAsset((current) => (current?.asset.id === assetId ? null : current));
  };

  const uploadImageFile = async (file: File, order: number) => {
    const body = new FormData();
    body.append('file', file);
    body.append('purpose', 'image');

    const response = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
      },
      body,
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to upload image.');
    }

    return createStoryMediaAsset({
      kind: 'image',
      url: String(data.data?.url || ''),
      key: String(data.data?.publicId || ''),
      mimeType: file.type || 'image/jpeg',
      sizeBytes: file.size,
      storageProvider: String(data.data?.storageProvider || SPACES_STORAGE_PROVIDER),
      originalFileName: file.name,
      order,
    });
  };

  const handleThumbnailFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (canEditMediaFields) {
      if (imageAssets.length + files.length > STORY_MAX_IMAGE_COUNT) {
        setError(`You can upload up to ${STORY_MAX_IMAGE_COUNT} images per story.`);
        e.target.value = '';
        return;
      }

      for (const file of files) {
        if (!isAllowedImageFile(file)) {
          setError('Photos must be JPG, PNG, or WEBP files.');
          e.target.value = '';
          return;
        }

        if (file.size > THUMBNAIL_MAX_SIZE) {
          setError('Image size must be less than 5MB.');
          e.target.value = '';
          return;
        }
      }

      setError('');
      setIsUploadingImages(true);
      setUsesMediaCollection(true);
      void (async () => {
        try {
          const nextAssets: StoryMediaAsset[] = [];
          for (const file of files) {
            const uploaded = await uploadImageFile(file, imageAssets.length + nextAssets.length);
            nextAssets.push(uploaded);
          }
          setMediaAssets((current) => [...current, ...nextAssets]);
          setSuccess('Images uploaded successfully. Save the story to persist the updated gallery.');
        } catch (uploadError) {
          setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload image.');
        } finally {
          setIsUploadingImages(false);
          e.target.value = '';
        }
      })();
      return;
    }

    if (!canEditCommonFields) {
      setError('This story package is read-only at the current workflow stage.');
      e.target.value = '';
      return;
    }

    const [file] = files;
    if (!file) return;

    if (!isAllowedImageFile(file)) {
      setError('Thumbnail must be an image file');
      e.target.value = '';
      return;
    }

    if (file.size > THUMBNAIL_MAX_SIZE) {
      setError('Thumbnail image size must be less than 5MB');
      e.target.value = '';
      return;
    }

    setError('');
    setThumbnailFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setThumbnailPreview((event.target?.result as string) || '');
    };
    reader.readAsDataURL(file);
  };

  const replaceImageAsset = async (assetId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditMediaFields) {
      setError('Only reporters on editable drafts or admins can replace uploaded images.');
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAllowedImageFile(file)) {
      setError('Photos must be JPG, PNG, or WEBP files.');
      e.target.value = '';
      return;
    }

    if (file.size > THUMBNAIL_MAX_SIZE) {
      setError('Image size must be less than 5MB.');
      e.target.value = '';
      return;
    }

    setError('');
    setIsUploadingImages(true);
    try {
      const assetIndex = imageAssets.findIndex((asset) => asset.id === assetId);
      const uploaded = await uploadImageFile(file, assetIndex >= 0 ? imageAssets[assetIndex].order : 0);
      replaceMediaAsset(assetId, uploaded);
      setSuccess('Image replaced successfully. Save the story to keep the new file.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to replace image.');
    } finally {
      setIsUploadingImages(false);
      e.target.value = '';
    }
  };

  const uploadThumbnail = async () => {
    if (!canEditCommonFields) {
      throw new Error('This story package is read-only at the current workflow stage.');
    }

    if (!thumbnailFile) return formData.thumbnail.trim();

    setIsUploadingThumbnail(true);
    try {
      const body = new FormData();
      body.append('file', thumbnailFile);
      body.append('purpose', 'story-thumbnail');

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
        },
        body,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload thumbnail');
      }

      return String(data.data?.url || '');
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const uploadStoryVideo = async (file: File, order: number) => {
    if (!canReplaceStoryVideo) {
      throw new Error('Only reporters on editable drafts or admins can replace the uploaded story video.');
    }

    setIsUploadingVideo(true);
    setVideoUploadProgress(0);
    setError('');

    try {
      const initResponse = await fetch('/api/admin/uploads/story-video/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          storyId,
          fileName: file.name,
          fileType: file.type || 'video/mp4',
          fileSize: file.size,
        }),
      });
      const initPayload = (await initResponse.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          mediaKey?: string;
          uploadUrl?: string;
          uploadHeaders?: Record<string, string>;
        };
      };

      if (!initResponse.ok || !initPayload.success || !initPayload.data?.uploadUrl || !initPayload.data.mediaKey) {
        throw new Error(initPayload.error || 'Failed to initialize video upload.');
      }

      await uploadFileToSignedUrl({
        file,
        uploadUrl: initPayload.data.uploadUrl,
        uploadHeaders: initPayload.data.uploadHeaders,
        onProgress: setVideoUploadProgress,
      });

      const completeResponse = await fetch('/api/admin/uploads/story-video/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          mediaKey: initPayload.data.mediaKey,
          expectedSize: file.size,
          expectedFileType: file.type || 'video/mp4',
          expectedFileName: file.name,
        }),
      });
      const completePayload = (await completeResponse.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          mediaUrl?: string;
          mediaKey?: string;
          mediaSizeBytes?: number;
          mediaMimeType?: string;
          storageProvider?: string;
        };
      };

      if (!completeResponse.ok || !completePayload.success || !completePayload.data?.mediaUrl) {
        throw new Error(completePayload.error || 'Failed to verify uploaded video.');
      }

      const uploadedAsset = createStoryMediaAsset({
        kind: 'video',
        url: String(completePayload.data?.mediaUrl || ''),
        key: String(completePayload.data?.mediaKey || ''),
        mimeType: String(completePayload.data?.mediaMimeType || 'video/mp4'),
        sizeBytes: Number(completePayload.data?.mediaSizeBytes || file.size),
        storageProvider: String(completePayload.data?.storageProvider || SPACES_STORAGE_PROVIDER),
        originalFileName: file.name,
        order,
      });
      setSuccess('Video uploaded successfully. Save the story to persist the new video.');
      return uploadedAsset;
    } catch (uploadError) {
      setVideoUploadProgress(0);
      throw uploadError;
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canReplaceStoryVideo) {
      setError('Only reporters on editable drafts or admins can replace the uploaded story video.');
      e.target.value = '';
      return;
    }

    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (videoAssets.length + files.length > STORY_MAX_VIDEO_COUNT) {
      setError(`You can upload up to ${STORY_MAX_VIDEO_COUNT} videos per story.`);
      e.target.value = '';
      return;
    }

    for (const file of files) {
      const validationError = validateStoryVideoFile(file);
      if (validationError) {
        setError(validationError);
        e.target.value = '';
        return;
      }
    }

    try {
      const nextAssets: StoryMediaAsset[] = [];
      for (const file of files) {
        const uploaded = await uploadStoryVideo(file, videoAssets.length + nextAssets.length);
        nextAssets.push(uploaded);
      }
      setMediaAssets((current) => [...current, ...nextAssets]);
      setUsesMediaCollection(true);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload video.');
    } finally {
      e.target.value = '';
    }
  };

  const replaceVideoAsset = async (assetId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canReplaceStoryVideo) {
      setError('Only reporters on editable drafts or admins can replace the uploaded story video.');
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateStoryVideoFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = '';
      return;
    }

    try {
      const assetIndex = videoAssets.findIndex((asset) => asset.id === assetId);
      const uploaded = await uploadStoryVideo(file, assetIndex >= 0 ? videoAssets[assetIndex].order : 0);
      replaceMediaAsset(assetId, uploaded);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload video.');
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadAsset = useCallback(
    async (asset: 'thumbnail' | 'media') => {
      if (!canDownloadStoryAssets) {
        setError('You can only download story assets that belong to your workflow scope.');
        return;
      }

      setDownloadingAsset(asset);
      setError('');

      try {
        const response = await fetch(
          `/api/admin/stories/${encodeURIComponent(storyId)}/download?asset=${asset}`,
          {
            headers: {
              ...getAuthHeader(),
            },
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'Failed to download the selected story asset.');
        }

        const blob = await response.blob();
        const fileName =
          parseDownloadFileNameFromDisposition(response.headers.get('content-disposition')) ||
          `story-${storyId}-${asset}`;
        const blobUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(blobUrl);

        setSuccess(
          asset === 'thumbnail' ? 'Thumbnail downloaded successfully.' : 'Story media downloaded successfully.'
        );
      } catch (downloadError) {
        setError(
          downloadError instanceof Error
            ? downloadError.message
            : 'Failed to download the selected story asset.'
        );
      } finally {
        setDownloadingAsset('');
      }
    },
    [canDownloadStoryAssets, storyId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      if (!canSaveStory) {
        setError('This story is read-only in the current workflow stage.');
        setIsSaving(false);
        return;
      }

      if (!formData.title.trim()) {
        setError('Story title is required');
        setIsSaving(false);
        return;
      }

      if (isUploadingVideo || isUploadingImages || isUploadingThumbnail) {
        setError('Please wait for all uploads to finish.');
        setIsSaving(false);
        return;
      }

      const shouldUseMediaCollection = canEditMediaFields && usesMediaCollection;
      const mediaValidationError = validateStoryMediaAssets(mediaAssets);
      if (mediaValidationError) {
        setError(mediaValidationError);
        setIsSaving(false);
        return;
      }

      const thumbnail = shouldUseMediaCollection ? primaryMedia.thumbnail : await uploadThumbnail();
      if (!thumbnail) {
        setError('Please provide a story thumbnail');
        setIsSaving(false);
        return;
      }

      const durationSeconds = Number.parseInt(formData.durationSeconds, 10);
      const priority = Number.parseInt(formData.priority, 10);
      const views = Number.parseInt(formData.views, 10);

      if (!Number.isFinite(durationSeconds) || durationSeconds < 2 || durationSeconds > 180) {
        setError('Duration must be between 2 and 180 seconds');
        setIsSaving(false);
        return;
      }

      if (!Number.isFinite(priority)) {
        setError('Priority must be a valid number');
        setIsSaving(false);
        return;
      }

      if (!Number.isFinite(views) || views < 0) {
        setError('Views must be a valid non-negative number');
        setIsSaving(false);
        return;
      }

      if (!shouldUseMediaCollection && formData.mediaType === 'video' && !formData.mediaUrl.trim()) {
        setError(
          canUseManualVideoUrl
            ? 'Please upload a story video or provide a video URL.'
            : 'Please upload a story video before saving.'
        );
        setIsSaving(false);
        return;
      }

      const payload: Record<string, unknown> = { expectedVersion: storyVersion };

      if (canEditCommonFields) {
        payload.title = formData.title.trim();
        payload.caption = formData.caption.trim();
        payload.thumbnail = thumbnail.trim();
        payload.category = formData.category;
        payload.durationSeconds = durationSeconds;
      }

      if (canEditMediaFields) {
        if (shouldUseMediaCollection) {
          payload.mediaAssets = mediaAssets;
        } else {
          payload.mediaType = formData.mediaType;
          payload.mediaUrl = formData.mediaUrl.trim();
          payload.mediaKey = formData.mediaKey;
          payload.mediaSizeBytes = formData.mediaSizeBytes;
          payload.mediaMimeType = formData.mediaMimeType;
          payload.storageProvider = formData.storageProvider;
        }
      }

      if (canEditLinkFields) {
        payload.linkUrl = formData.linkUrl.trim();
        payload.linkLabel = formData.linkLabel.trim();
      }

      if (canEditReporterFields) {
        payload.reporterMeta = {
          locationTag: formData.locationTag,
          sourceInfo: formData.sourceInfo,
          sourceConfidential: formData.sourceConfidential,
          reporterNotes: formData.reporterNotes,
        };
      }

      if (canEditCopyDeskMeta) {
        payload.copyEditorMeta = {
          proofreadComplete: formData.proofreadComplete,
          factCheckStatus: formData.factCheckStatus,
          headlineStatus: formData.headlineStatus,
          imageOptimizationStatus: formData.imageOptimizationStatus,
          copyEditorNotes: formData.copyEditorNotes,
          returnForChangesReason: formData.returnForChangesReason,
        };
      }

      if (canEditAdminFields) {
        payload.author = formData.author.trim() || 'Desk';
        payload.priority = priority;
        payload.views = views;
      }

      const response = await fetch(`/api/admin/stories/${storyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(
          response.status === 409 && data.code === 'STORY_VERSION_CONFLICT'
            ? 'This story was updated elsewhere. Refresh before saving again.'
            : data.error || 'Failed to update story'
        );
      }

      if (Number.isInteger(data.data?.version) && data.data.version > 0) {
        setStoryVersion(data.data.version);
      }

      setSuccess(
        [
          'Story updated successfully.',
          data.usage?.alertTriggered ? data.usage.message : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      await fetchStory();
      await fetchStoryActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update story');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateLinkedArticle = async (intent: 'draft' | 'submit') => {
    setError('');
    setSuccess('');

    if (!canBuildLinkedArticle) {
      setError(
        isCopyEditorSharedSubmittedStory
          ? 'Claim this story before writing the linked article.'
          : 'You do not have permission to create an article from this story right now.'
      );
      return;
    }

    if (hasUnsavedChanges) {
      setError('Save story changes before creating the linked article.');
      return;
    }

    const title = articleBuilderForm.title.trim();
    const summary = articleBuilderForm.summary.trim();
    const content = articleBuilderForm.content.trim();
    const image = articleBuilderForm.image.trim();
    const category = articleBuilderForm.category.trim();
    const author = articleBuilderForm.author.trim();

    if (!title || !summary || !content || !image || !category || !author) {
      setError('Fill the article headline, summary, body, image, category, and author before submitting.');
      return;
    }

    setArticleBuilderIntent(intent);
    try {
      const response = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          intent,
          title,
          summary,
          content,
          image,
          category,
          author,
          sourceStoryId: storyId,
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
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          _id?: string;
          workflow?: {
            status?: string;
          };
        };
      };

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to create the linked article.');
        return;
      }

      setLinkedArticleId(data.data?._id || '');
      setLinkedArticleStatus(intent === 'draft' ? 'draft' : 'submitted');
      setSuccess(
        intent === 'draft'
          ? 'Linked article draft created from this story.'
          : 'Linked article submitted to the admin desk for final approval and publishing.'
      );
      await fetchStory();
      await fetchStoryActivity();
    } catch {
      setError('Failed to create the linked article. Please try again.');
    } finally {
      setArticleBuilderIntent('');
    }
  };

  const handleWorkflowAction = async (action: ContentTransitionAction) => {
    setError('');
    setSuccess('');

    if (hasUnsavedChanges) {
      setError('Save story changes before moving the workflow.');
      return;
    }

    if (action === 'assign' && !workflowAssigneeId.trim()) {
      setError('Select an assignee before assigning this story.');
      return;
    }

    if (
      (action === 'reject' || action === 'request_changes') &&
      !workflowRejectionReason.trim()
    ) {
      setError(
        action === 'reject'
          ? 'Add a rejection reason before rejecting this story.'
          : 'Add a clear change reason before sending this story back.'
      );
      return;
    }

    if (action === 'schedule' && !workflowScheduledFor.trim()) {
      setError('Choose a publish time before scheduling this story.');
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
      const response = await fetch(`/api/admin/stories/${encodeURIComponent(storyId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          action,
          expectedVersion: storyVersion,
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
        error?: string;
        code?: string;
        message?: string;
        data?: { version?: number };
      };

      if (!response.ok || !data.success) {
        setError(
          response.status === 409 && data.code === 'STORY_VERSION_CONFLICT'
            ? 'This story was updated elsewhere. Refresh before saving again.'
            : data.error || 'Failed to update workflow'
        );
        return;
      }

      if (Number.isInteger(data.data?.version) && Number(data.data?.version) > 0) {
        setStoryVersion(Number(data.data?.version));
      }

      setWorkflowComment('');
      if (action !== 'reject') {
        setWorkflowRejectionReason('');
      }
      setSuccess(data.message || `${ACTION_LABELS[action]} completed.`);
      await fetchStory();
      await fetchStoryActivity();
    } catch {
      setError('Failed to update workflow. Please try again.');
    } finally {
      setRunningWorkflowAction('');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="flex h-[50vh] items-center justify-center rounded-xl border border-gray-200 bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-spanish-red" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Link
        href="/admin/stories"
        className="mb-6 inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to Stories
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
        <CmsEditorCanvas>
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">
                  {isCopyEditorView ? 'Create Article From Story' : 'Edit Story'}
                </h1>
                <CmsWorkflowStatusBadge status={workflow.status} />
                {hasUnsavedChanges ? (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    Unsaved changes
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-gray-600">
                {isCopyEditorView
                  ? 'Review the reporter package, write the article, and send it to admin approval.'
                  : 'Refine story visuals, workflow, and desk status'}
              </p>
            </div>
          </div>

          {error ? (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
              <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{success}</p>
            </div>
          ) : null}

          {!canSaveStory ? (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              {isCopyEditorSharedSubmittedStory
                ? 'This story is submitted and waiting for a copy editor to claim it. You can review and download the reporter resources now, then use Claim Story to start review.'
                : 'This story is read-only right now. Reporters can edit drafts or stories returned for changes, copy editors can edit assigned review items, and admins can edit at any stage.'}
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <CmsEditorColumns sidebarWidth="quarter" stacked={articleBuilderFocusMode}>
            <CmsEditorMain className="space-y-4">

            <div className={showStoryEditFields ? 'space-y-4' : 'hidden'}>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">
                Story Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                disabled={!canEditCommonFields}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Video Script</label>
              <textarea
                name="caption"
                value={formData.caption}
                onChange={handleInputChange}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                disabled={!canEditCommonFields}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {canEditAdminFields && !usesMediaCollection ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    Story Type
                  </label>
                  <select
                    name="mediaType"
                    value={formData.mediaType}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditAdminFields}
                  >
                    <option value="image">Image Story</option>
                    <option value="video">Video Story</option>
                  </select>
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Category
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  disabled={!canEditCommonFields}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!canEditMediaFields ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">Thumbnail URL</label>
                  <input
                    type="url"
                    name="thumbnail"
                    value={formData.thumbnail}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditCommonFields}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    Replace Thumbnail (image)
                  </label>
                  <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-5 transition-colors hover:border-primary-600 hover:bg-gray-50">
                    <span className="flex flex-col items-center gap-1 text-center">
                      <ImageIcon className="h-5 w-5 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Click to upload</span>
                      <span className="text-xs text-gray-500">JPG, PNG, or WEBP up to 5MB</span>
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleThumbnailFileChange}
                      className="hidden"
                      disabled={!canEditCommonFields || isUploadingThumbnail}
                    />
                  </label>
                </div>
              </>
            ) : (
              <div id="workflow-actions" className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-900">Story Images</label>
                    <p className="mt-1 text-xs text-gray-500">
                      Upload JPG, PNG, or WEBP files with no image count limit. The first image becomes the cover thumbnail.
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200">
                    Images: {mediaCounts.images} • No limit
                  </span>
                </div>

                <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-5 transition-colors hover:border-primary-600 hover:bg-white">
                  <span className="flex flex-col items-center gap-1 text-center">
                    <ImageIcon className="h-5 w-5 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {isUploadingImages ? 'Uploading image...' : 'Add photos'}
                    </span>
                    <span className="text-xs text-gray-500">
                      Reporters can review, replace, or delete images before saving.
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleThumbnailFileChange}
                    className="hidden"
                    disabled={!canEditMediaFields || isUploadingImages || mediaCounts.images >= STORY_MAX_IMAGE_COUNT}
                  />
                </label>

                {imageAssets.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {imageAssets.map((asset) => (
                      <StoryMediaTile
                        key={asset.id}
                        asset={asset}
                        kindLabel="Image"
                        replaceLabel="Replace"
                        removeLabel="Delete"
                        replaceInputId={`replace-image-${asset.id}`}
                        accept="image/*"
                        onPreview={() =>
                          setPreviewAsset({
                            asset,
                            title: asset.order === 0 ? 'Cover image preview' : 'Story photo preview',
                          })
                        }
                        onReplace={(event) => void replaceImageAsset(asset.id, event)}
                        onRemove={() => removeMediaAsset(asset.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white p-4 text-xs text-gray-500">
                    Uploaded images will appear here so the reporter can review, replace, or remove them.
                  </div>
                )}

                {canDownloadStoryAssets && previewThumbnail ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadAsset('thumbnail')}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={downloadingAsset === 'thumbnail'}
                  >
                    {downloadingAsset === 'thumbnail' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {downloadingAsset === 'thumbnail' ? 'Downloading...' : 'Download Cover Image'}
                  </button>
                ) : null}
              </div>
            )}

            {!canEditMediaFields && imageAssets.length > 0 ? (
              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-900">Story Images</label>
                    <p className="mt-1 text-xs text-gray-500">
                      This gallery is read-only at your current workflow stage.
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200">
                    Images: {mediaCounts.images} • No limit
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {imageAssets.map((asset) => (
                    <StoryMediaTile
                      key={asset.id}
                      asset={asset}
                      kindLabel="Image"
                      onPreview={() =>
                        setPreviewAsset({
                          asset,
                          title: asset.order === 0 ? 'Cover image preview' : 'Story photo preview',
                        })
                      }
                    />
                  ))}
                </div>
                {canDownloadStoryAssets && previewThumbnail ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadAsset('thumbnail')}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={downloadingAsset === 'thumbnail'}
                  >
                    {downloadingAsset === 'thumbnail' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {downloadingAsset === 'thumbnail' ? 'Downloading...' : 'Download Thumbnail'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {isReporterView || canEditMediaFields || formData.mediaType === 'video' || videoAssets.length > 0 || Boolean(formData.mediaUrl) ? (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Story Videos (MP4)
                    </label>
                    {!isReporterView ? (
                      <p className="text-xs text-gray-500">
                        Uploads go directly to DigitalOcean Spaces. Allowed size: up to 1.9 GB per video with no total story upload limit.
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200">
                    Videos: {mediaCounts.videos} • No limit
                  </span>
                </div>

                <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-5 transition-colors hover:border-primary-600 hover:bg-white">
                  <span className="flex flex-col items-center gap-1 text-center">
                    <Upload className="h-5 w-5 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {isUploadingVideo
                        ? 'Uploading video...'
                        : canReplaceStoryVideo
                          ? 'Add MP4 videos'
                          : 'Uploaded story video'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {canReplaceStoryVideo
                        ? 'Use this for direct reporter uploads from phone or desktop.'
                        : 'Video replacement is limited to reporters on editable drafts and admins.'}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="video/mp4,.mp4"
                    multiple
                    onChange={(event) => void handleVideoFileChange(event)}
                    className="hidden"
                    disabled={
                      isUploadingVideo ||
                      !canReplaceStoryVideo ||
                      mediaCounts.videos >= STORY_MAX_VIDEO_COUNT
                    }
                  />
                </label>

                {isUploadingVideo ? (
                  <div className="space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-[width] duration-200"
                        style={{ width: `${videoUploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600">
                      Upload progress: {videoUploadProgress}%
                    </p>
                  </div>
                ) : null}

                {videoAssets.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {videoAssets.map((asset) => (
                      <StoryMediaTile
                        key={asset.id}
                        asset={asset}
                        kindLabel="Video"
                        replaceLabel={canReplaceStoryVideo ? 'Replace' : undefined}
                        removeLabel={canReplaceStoryVideo ? 'Delete' : undefined}
                        replaceInputId={canReplaceStoryVideo ? `replace-video-${asset.id}` : undefined}
                        accept={canReplaceStoryVideo ? 'video/mp4,.mp4' : undefined}
                        onPreview={() =>
                          setPreviewAsset({
                            asset,
                            title: 'Story video preview',
                          })
                        }
                        onReplace={
                          canReplaceStoryVideo
                            ? (event) => void replaceVideoAsset(asset.id, event)
                            : undefined
                        }
                        onRemove={canReplaceStoryVideo ? () => removeMediaAsset(asset.id) : undefined}
                      />
                    ))}
                  </div>
                ) : !usesMediaCollection && formData.mediaUrl ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="font-medium">
                      Uploaded video ready: {getStoryVideoDisplayName(formData.mediaUrl)}
                    </p>
                    <p className="mt-1 text-xs text-emerald-800">
                      {formatStoryVideoSize(formData.mediaSizeBytes)} via {formData.storageProvider || 'external storage'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white p-4 text-xs text-gray-500">
                    Uploaded videos will appear here so the reporter can review, replace, or remove them.
                  </div>
                )}

                {canDownloadStoryAssets && (videoAssets.length > 0 || (!usesMediaCollection && formData.mediaUrl)) ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadAsset('media')}
                    className="inline-flex w-fit items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={downloadingAsset === 'media'}
                  >
                    {downloadingAsset === 'media' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {downloadingAsset === 'media' ? 'Downloading...' : 'Download Primary Story Video'}
                  </button>
                ) : null}

                {canUseManualVideoUrl && formData.mediaType === 'video' && !usesMediaCollection ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Video URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      name="mediaUrl"
                      value={formData.mediaUrl}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Admins can still paste a manual video URL during the transition.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {canEditLinkFields || Boolean(formData.linkUrl.trim() || formData.linkLabel.trim()) ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    Link URL
                  </label>
                  <input
                    type="text"
                    name="linkUrl"
                    value={formData.linkUrl}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditLinkFields}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    Link Label
                  </label>
                  <input
                    type="text"
                    name="linkLabel"
                    value={formData.linkLabel}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditLinkFields}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Location Tag
                </label>
                <input
                  type="text"
                  name="locationTag"
                  value={formData.locationTag}
                  onChange={handleInputChange}
                  placeholder="Bhopal, MP"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  disabled={!canEditReporterFields}
                />
              </div>
            </div>

            {!isReporterView ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-900">Author</label>
                  <input
                    type="text"
                    name="author"
                    value={formData.author}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditAdminFields}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    Duration (sec)
                  </label>
                  <input
                    type="number"
                    name="durationSeconds"
                    value={formData.durationSeconds}
                    onChange={handleInputChange}
                    min="2"
                    max="180"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditCommonFields}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">Priority</label>
                  <input
                    type="number"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditAdminFields}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">Views</label>
                  <input
                    type="number"
                    name="views"
                    value={formData.views}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditAdminFields}
                  />
                </div>
              </div>
            ) : null}
            </div>

            {!isReporterView ? (
                <section className="space-y-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Article Draft
                      </p>
                      <h2 className="mt-1 text-lg font-bold text-gray-900">
                        Write article from this story
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Shape the story into a desk-ready article, then save or submit for admin review.
                      </p>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">
                      {linkedArticleId ? linkedArticleStatus : 'Not created'}
                    </span>
                  </div>

                  {linkedArticleId ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      <p className="font-semibold">A linked article already exists for this story.</p>
                      <Link
                        href={`/admin/articles/${linkedArticleId}/edit`}
                        className="mt-3 inline-flex items-center rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800"
                      >
                        Open Linked Article
                      </Link>
                    </div>
                  ) : (
                    <>
                      {!canBuildLinkedArticle ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          {isCopyEditorSharedSubmittedStory
                            ? 'Claim this submitted story first. After claiming, this article builder becomes editable.'
                            : 'Article creation is available after the story is in a desk-editable stage.'}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-900">
                            Headline
                          </label>
                          <input
                            type="text"
                            name="title"
                            value={articleBuilderForm.title}
                            onChange={handleArticleBuilderChange}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                            disabled={!canBuildLinkedArticle}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-900">
                            Summary
                          </label>
                          <textarea
                            name="summary"
                            value={articleBuilderForm.summary}
                            onChange={handleArticleBuilderChange}
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                            disabled={!canBuildLinkedArticle}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-900">
                          Article Body
                        </label>
                        <div className={!canBuildLinkedArticle ? 'pointer-events-none opacity-60' : undefined}>
                          <ArticleEditorStudio
                            title={articleBuilderForm.title}
                            summary={articleBuilderForm.summary}
                            content={articleBuilderForm.content}
                            mode={articleBuilderMode}
                            focusMode={articleBuilderFocusMode}
                            showSidebar={false}
                            previewVariant="article"
                            author={articleBuilderForm.author}
                            image={articleBuilderForm.image}
                            editorClassName="min-h-[520px]"
                            onModeChange={setArticleBuilderMode}
                            onFocusModeChange={setArticleBuilderFocusMode}
                            onContentChange={(content) =>
                              setArticleBuilderForm((current) => ({ ...current, content }))
                            }
                            placeholder="Write the full article from the reporter package. Use the toolbar for formatting."
                          />
                        </div>
                      </div>

                      <details className="rounded-lg border border-gray-200 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                          Publishing Details
                        </summary>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-900">
                              Category
                            </label>
                            <select
                              name="category"
                              value={articleBuilderForm.category}
                              onChange={handleArticleBuilderChange}
                              className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                              disabled={!canBuildLinkedArticle}
                            >
                              {categories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-900">
                              Author
                            </label>
                            <input
                              type="text"
                              name="author"
                              value={articleBuilderForm.author}
                              onChange={handleArticleBuilderChange}
                              className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                              disabled={!canBuildLinkedArticle}
                            />
                          </div>
                        </div>

                        <div className="mt-4">
                          <label className="mb-2 block text-sm font-medium text-gray-900">
                            Lead Image URL
                          </label>
                          <input
                            type="url"
                            name="image"
                            value={articleBuilderForm.image}
                            onChange={handleArticleBuilderChange}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                            disabled={!canBuildLinkedArticle}
                          />
                        </div>
                      </details>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCreateLinkedArticle('draft')}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!canBuildLinkedArticle || Boolean(articleBuilderIntent)}
                        >
                          {articleBuilderIntent === 'draft' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save Article Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCreateLinkedArticle('submit')}
                          className="inline-flex items-center gap-2 rounded-md bg-spanish-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-spanish-red/90 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!canBuildLinkedArticle || Boolean(articleBuilderIntent)}
                        >
                          {articleBuilderIntent === 'submit' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Submit To Admin
                        </button>
                      </div>
                    </>
                  )}
                </section>
            ) : null}

            </CmsEditorMain>

            {!articleBuilderFocusMode ? (
            <CmsEditorSidebar>
              {!isReporterView ? (
                <section className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Reporter Package
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-gray-900">
                      Submitted story resources
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Review the original story, notes, source details, and media before writing the article.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Images
                      </p>
                      <p className="mt-1 font-bold text-gray-900">{mediaCounts.images}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Videos
                      </p>
                      <p className="mt-1 font-bold text-gray-900">{mediaCounts.videos}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Location
                      </p>
                      <p className="mt-1 font-semibold text-gray-900">
                        {formData.locationTag.trim() || 'Not provided'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Source
                      </p>
                      <p className="mt-1 font-semibold text-gray-900">
                        {formData.sourceConfidential ? 'Confidential' : 'Visible to desk'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Reporter Script
                    </p>
                    <div className="min-h-[120px] whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800">
                      {formData.caption.trim() || 'No reporter script was provided.'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Reporter Notes
                      </p>
                      <div className="min-h-[88px] whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800">
                        {formData.reporterNotes.trim() || 'No reporter notes.'}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Source Info
                      </p>
                      <div className="min-h-[88px] whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800">
                        {formData.sourceInfo.trim() || 'No source information.'}
                      </div>
                    </div>
                  </div>

                  {canDownloadStoryAssets ? (
                    <div className="flex flex-wrap gap-2">
                      {previewThumbnail ? (
                        <button
                          type="button"
                          onClick={() => void handleDownloadAsset('thumbnail')}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={downloadingAsset === 'thumbnail'}
                        >
                          {downloadingAsset === 'thumbnail' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Download Thumbnail
                        </button>
                      ) : null}
                      {videoAssets.length > 0 || (!usesMediaCollection && formData.mediaUrl) ? (
                        <button
                          type="button"
                          onClick={() => void handleDownloadAsset('media')}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={downloadingAsset === 'media'}
                        >
                          {downloadingAsset === 'media' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Download Video
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Workflow</p>
                    <p className="mt-1 text-sm text-gray-700">
                      Move this story through the newsroom queue without leaving the editor.
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
                      <p className="mt-1 text-sm font-medium capitalize text-gray-900">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {canUseWorkflowDesk ? (
                  <div className="grid gap-4">
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
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
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
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-900">Schedule Publish Time</label>
                      <input
                        type="datetime-local"
                        value={workflowScheduledFor}
                        onChange={(event) => setWorkflowScheduledFor(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                      />
                    </div>
                  </div>
                ) : null}

                {availableWorkflowActions.includes('reject') ||
                availableWorkflowActions.includes('request_changes') ||
                workflow.rejectionReason ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-900">
                      Change / Rejection Reason
                    </label>
                    <textarea
                      value={workflowRejectionReason}
                      onChange={(event) => setWorkflowRejectionReason(event.target.value)}
                      rows={3}
                      placeholder="Explain what should change before this story can continue."
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
                      placeholder="Add handoff context, review notes, or publish instructions."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                    />
                  </div>
                ) : null}

                {availableWorkflowActions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availableWorkflowActions.map((action) => {
                      const needsAssignee = action === 'assign' && !workflowAssigneeId.trim();
                      const needsReason =
                        (action === 'reject' || action === 'request_changes') &&
                        !workflowRejectionReason.trim();
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
                            : action === 'approve' || action === 'mark_ready_for_approval'
                              ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                              : action === 'start_review' && isCopyEditorSharedSubmittedStory
                                ? 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => void handleWorkflowAction(action)}
                          disabled={disabled}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
                        >
                          {runningWorkflowAction === action ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {action === 'start_review' && isCopyEditorSharedSubmittedStory
                            ? 'Claim Story'
                            : ACTION_LABELS[action]}
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
                        <div
                          key={comment.id || `${comment.createdAt || 'comment'}-${comment.body || ''}`}
                          className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">
                              {comment.author?.name || comment.author?.email || 'Team'}
                            </span>
                            <span>{formatNewsroomRoleLabel(comment.author?.role)}</span>
                            {comment.createdAt ? (
                              <span>{formatDateTime(comment.createdAt)}</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-gray-700">{comment.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Source Information</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Source and handoff details that move with this story through the desk.
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    Source Info
                  </label>
                  <textarea
                    name="sourceInfo"
                    value={formData.sourceInfo}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Source, bureau, agency, or submission background."
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditReporterFields}
                  />
                </div>
                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="sourceConfidential"
                    checked={formData.sourceConfidential}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                    disabled={!canEditReporterFields}
                  />
                  <span className="text-sm text-gray-700">
                    Source is confidential and should remain internal
                  </span>
                </label>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Reporter Notes</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Desk notes, context, verification leads, or packaging hints.
                  </p>
                </div>
                <textarea
                  name="reporterNotes"
                  value={formData.reporterNotes}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="Desk notes, context, verification leads, or packaging hints."
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  disabled={!canEditReporterFields}
                />
              </div>

            {showCopyDeskSection ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Copy Editor Review</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Quality checks before this story goes back to admin approval.
                  </p>
                </div>
                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="proofreadComplete"
                    checked={formData.proofreadComplete}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                    disabled={!canEditCopyDeskMeta}
                  />
                  <span className="text-sm text-gray-700">
                    Proofread is complete and ready for desk review
                  </span>
                </label>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Fact Check
                    </label>
                    <select
                      name="factCheckStatus"
                      value={formData.factCheckStatus}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      disabled={!canEditCopyDeskMeta}
                    >
                      {FACT_CHECK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Headline
                    </label>
                    <select
                      name="headlineStatus"
                      value={formData.headlineStatus}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      disabled={!canEditCopyDeskMeta}
                    >
                      {HEADLINE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Image
                    </label>
                    <select
                      name="imageOptimizationStatus"
                      value={formData.imageOptimizationStatus}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      disabled={!canEditCopyDeskMeta}
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
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    Copy Editor Notes
                  </label>
                  <textarea
                    name="copyEditorNotes"
                    value={formData.copyEditorNotes}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Visual cleanup, headline direction, and fact-check notes."
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditCopyDeskMeta}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
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
                        : 'Explain what must go back to the reporter before approval.'
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    disabled={!canEditCopyDeskMeta}
                  />
                </div>
              </div>
            ) : null}

            <CmsWorkflowActivityTimeline
              items={storyActivity}
              isLoading={isLoadingActivity}
              onRefresh={fetchStoryActivity}
              emptyMessage="No story activity yet. Save or move workflow to start the timeline."
              fallbackMessage="Story activity recorded."
              actionLabel={formatActivityActionLabel}
              formatTimestamp={formatDateTime}
              formatStatusLabel={(status) => formatWorkflowStatus(status as WorkflowStatus)}
              formatActorRole={(role) => formatNewsroomRoleLabel(role as AdminRole)}
            />

            {canSaveStory ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSaving || isUploadingThumbnail || isUploadingImages || isUploadingVideo}
                    className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving || isUploadingThumbnail || isUploadingImages || isUploadingVideo ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {isUploadingThumbnail || isUploadingImages || isUploadingVideo ? 'Uploading...' : 'Saving...'}
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
                        Save Changes
                      </>
                    )}
                  </button>

                  <Link
                    href="/admin/stories"
                    className="rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    Cancel
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                Viewer mode: you can review the story and timeline, but editing is disabled.
              </div>
            )}
            </CmsEditorSidebar>
            ) : null}
            </CmsEditorColumns>
          </form>
        </div>
        </CmsEditorCanvas>
      </motion.div>

      {previewAsset ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{previewAsset.title}</p>
                <p className="truncate text-xs text-gray-500" title={getMediaAssetLabel(previewAsset.asset)}>
                  {getMediaAssetLabel(previewAsset.asset)} - {formatStoryVideoSize(previewAsset.asset.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl bg-gray-950">
              {previewAsset.asset.kind === 'image' ? (
                <AdminMediaImage
                  src={previewAsset.asset.url}
                  alt={getMediaAssetLabel(previewAsset.asset)}
                  className="max-h-[75vh] w-full object-contain"
                />
              ) : (
                <video
                  src={previewAsset.asset.url}
                  controls
                  autoPlay
                  preload="metadata"
                  className="max-h-[75vh] w-full bg-black"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

