'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Play,
  Radio,
  Save,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import {
  canManageWorkflowAssignments,
  canTransitionContent,
  type ContentTransitionAction,
} from '@/lib/auth/permissions';
import { isAdminRole, type AdminRole } from '@/lib/auth/roles';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import { formatUiDateTime } from '@/lib/utils/dateFormat';
import {
  buildYouTubeEmbedUrl,
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  isYouTubeLiveUrl,
} from '@/lib/utils/youtube';
import { getAllowedWorkflowTransitions } from '@/lib/workflow/transitions';
import type { WorkflowPriority, WorkflowStatus } from '@/lib/workflow/types';
import {
  CmsEditorCanvas,
  CmsEditorColumns,
  CmsEditorMain,
  CmsEditorSidebar,
} from '@/components/admin/CmsEditorLayout';
import { AdminMediaImage } from '@/components/admin/AdminMediaImage';
import SwipeReadinessChecklist from '@/components/admin/SwipeReadinessChecklist';
import { CmsWorkflowActivityTimeline } from '@/components/admin/CmsWorkflowActivityTimeline';
import WorkflowRail from '@/components/admin/WorkflowRail';
import { CmsWorkflowPriorityBadge, CmsWorkflowStatusBadge } from '@/components/admin/CmsWorkflowStatusBadge';

type WorkflowActor = {
  id?: string;
  name?: string;
  email?: string;
  role?: AdminRole;
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
  comments: Array<{
    id?: string;
    body?: string;
    kind?: string;
    author?: WorkflowActor | null;
    createdAt?: string | null;
  }>;
};

type VideoActivityItem = {
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

type VideoFormData = {
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: string;
  category: string;
  isShort: boolean;
  shortsRank: string;
  views: string;
  slug: string;
  articleId: string;
  aspectRatio: '9:16' | '16:9' | '1:1' | 'unknown';
  captionUrl: string;
  transcript: string;
  instagramUrl: string;
  youtubeUrl: string;
  processingStatus: 'ready' | 'processing' | 'failed';
};

const categories = NEWS_CATEGORIES.map((category) => category.nameEn);
const THUMBNAIL_MAX_SIZE = 10 * 1024 * 1024;
const THUMBNAIL_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';
const WORKFLOW_PRIORITIES: WorkflowPriority[] = ['low', 'normal', 'high', 'urgent'];

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

const initialFormData: VideoFormData = {
  title: '',
  description: '',
  thumbnail: '',
  videoUrl: '',
  duration: '',
  category: 'National',
  isShort: false,
  shortsRank: '0',
  views: '0',
  slug: '',
  articleId: '',
  aspectRatio: 'unknown',
  captionUrl: '',
  transcript: '',
  instagramUrl: '',
  youtubeUrl: '',
  processingStatus: 'ready',
};

function normalizeWorkflowState(input: unknown): WorkflowState {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : {};
  const toActor = (value: unknown): WorkflowActor | null => {
    const actor = typeof value === 'object' && value ? (value as Record<string, unknown>) : null;
    if (!actor) return null;
    const id = typeof actor.id === 'string' ? actor.id : '';
    const email = typeof actor.email === 'string' ? actor.email : '';
    const name = typeof actor.name === 'string' ? actor.name : '';
    if (!id && !email && !name) return null;
    return {
      id,
      email,
      name,
      role: typeof actor.role === 'string' ? (actor.role as AdminRole) : undefined,
    };
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
    comments: Array.isArray(source.comments) ? (source.comments as WorkflowState['comments']) : [],
  };
}

function labelStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}


function toDateTimeInput(value: string | null | undefined) {
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

function parseDateTimeInput(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatDateTime(value: string | null | undefined) {
  return value ? formatUiDateTime(value, '') : '';
}

function isPdfThumbnail(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('data:application/pdf') || normalized.endsWith('.pdf');
}

function isAllowedThumbnailFile(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'application/pdf' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.pdf')
  );
}

function buildSnapshot(formData: VideoFormData, preview: string) {
  return JSON.stringify({ ...formData, preview });
}

export default function EditVideoPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params?.id) ? params.id[0] || '' : params?.id || '';
  const videoId = decodeURIComponent(routeId);

  const [formData, setFormData] = useState<VideoFormData>(initialFormData);
  const [workflow, setWorkflow] = useState<WorkflowState>(EMPTY_WORKFLOW);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [videoActivity, setVideoActivity] = useState<VideoActivityItem[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUserOption[]>([]);
  const [workflowAssigneeId, setWorkflowAssigneeId] = useState('');
  const [workflowComment, setWorkflowComment] = useState('');
  const [workflowRejectionReason, setWorkflowRejectionReason] = useState('');
  const [workflowScheduledFor, setWorkflowScheduledFor] = useState('');
  const [workflowDueAt, setWorkflowDueAt] = useState('');
  const [workflowPriority, setWorkflowPriority] = useState<WorkflowPriority>('normal');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isLoadingAssignableUsers, setIsLoadingAssignableUsers] = useState(false);
  const [runningWorkflowAction, setRunningWorkflowAction] = useState<ContentTransitionAction | ''>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const detectedYouTubeId = useMemo(
    () => extractYouTubeVideoId(formData.videoUrl),
    [formData.videoUrl]
  );
  const isLiveStream = useMemo(
    () => isYouTubeLiveUrl(formData.videoUrl),
    [formData.videoUrl]
  );

  const previewThumbnail = useMemo(() => {
    if (thumbnailPreview) return thumbnailPreview;
    if (formData.thumbnail.trim()) return formData.thumbnail.trim();
    if (detectedYouTubeId) return getYouTubeThumbnail(formData.videoUrl);
    return '';
  }, [formData.thumbnail, thumbnailPreview, detectedYouTubeId, formData.videoUrl]);

  const permissionUser = useMemo(() => {
    const sessionUser = session?.user;
    const email = sessionUser?.email?.trim() || '';
    const role = sessionUser?.role;
    if (!sessionUser || !email || !isAdminRole(role)) return null;
    return {
      id: sessionUser.userId || sessionUser.id || email,
      email,
      name: sessionUser.name?.trim() || email.split('@')[0] || 'Admin',
      role,
    };
  }, [session]);

  const hasUnsavedChanges =
    Boolean(thumbnailFile) || buildSnapshot(formData, previewThumbnail) !== savedSnapshot;
  const canSaveVideo = Boolean(permissionUser);
  const canUseWorkflowDesk = canManageWorkflowAssignments(permissionUser?.role);

  const workflowPermissionRecord = useMemo(() => ({ workflow }), [workflow]);
  const availableWorkflowActions = useMemo(() => {
    if (!permissionUser) return [] as ContentTransitionAction[];
    return getAllowedWorkflowTransitions(workflow.status)
      .map((status) => STATUS_TO_ACTION[status])
      .filter((action): action is ContentTransitionAction => Boolean(action))
      .filter((action) => canTransitionContent(permissionUser, workflowPermissionRecord, action));
  }, [permissionUser, workflow.status, workflowPermissionRecord]);

  const fetchVideo = useCallback(async () => {
    if (!videoId) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/videos/${encodeURIComponent(videoId)}`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load video');
      }

      const video = data.data as Record<string, unknown>;
      const nextForm: VideoFormData = {
        title: String(video.title || ''),
        description: String(video.description || ''),
        thumbnail: String(video.thumbnail || ''),
        videoUrl: String(video.videoUrl || ''),
        duration: String(video.duration || ''),
        category: String(video.category || 'National'),
        isShort: Boolean(video.isShort),
        shortsRank: String(video.shortsRank ?? 0),
        views: String(video.views ?? 0),
        slug: String(video.slug || ''),
        articleId: String(video.articleId || ''),
        aspectRatio: (['9:16', '16:9', '1:1', 'unknown'].includes(String(video.aspectRatio)) ? String(video.aspectRatio) : 'unknown') as VideoFormData['aspectRatio'],
        captionUrl: String(video.captionUrl || ''),
        transcript: String(video.transcript || ''),
        instagramUrl: String(video.instagramUrl || ''),
        youtubeUrl: String(video.youtubeUrl || ''),
        processingStatus: (['ready', 'processing', 'failed'].includes(String(video.processingStatus)) ? String(video.processingStatus) : 'ready') as VideoFormData['processingStatus'],
      };
      const nextWorkflow = normalizeWorkflowState(video.workflow);

      setFormData(nextForm);
      setWorkflow(nextWorkflow);
      setThumbnailFile(null);
      setThumbnailPreview(String(video.thumbnail || ''));
      setSavedSnapshot(buildSnapshot(nextForm, String(video.thumbnail || '')));
      setWorkflowAssigneeId(nextWorkflow.assignedTo?.id || '');
      setWorkflowScheduledFor(toDateTimeInput(nextWorkflow.scheduledFor));
      setWorkflowDueAt(toDateTimeInput(nextWorkflow.dueAt));
      setWorkflowPriority(nextWorkflow.priority);
      setWorkflowRejectionReason(nextWorkflow.rejectionReason || '');
      setWorkflowComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load video');
    } finally {
      setIsLoading(false);
    }
  }, [videoId]);

  const fetchVideoActivity = useCallback(async () => {
    if (!videoId) return;
    setIsLoadingActivity(true);
    try {
      const response = await fetch(`/api/admin/videos/${encodeURIComponent(videoId)}/activity`, {
        headers: { ...getAuthHeader() },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: VideoActivityItem[];
      };
      setVideoActivity(response.ok && data.success && Array.isArray(data.data) ? data.data : []);
    } catch {
      setVideoActivity([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }, [videoId]);

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
      setAssignableUsers(response.ok && data.success && Array.isArray(data.data) ? data.data : []);
    } catch {
      setAssignableUsers([]);
    } finally {
      setIsLoadingAssignableUsers(false);
    }
  }, [canUseWorkflowDesk]);

  useEffect(() => {
    void fetchVideo();
    void fetchVideoActivity();
  }, [fetchVideo, fetchVideoActivity]);

  useEffect(() => {
    void fetchAssignableUsers();
  }, [fetchAssignableUsers]);

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : value,
    }));
  };

  const handleThumbnailFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isAllowedThumbnailFile(file)) {
      setError('Thumbnail file must be JPG, JPEG, PNG, or PDF');
      return;
    }
    if (file.size > THUMBNAIL_MAX_SIZE) {
      setError('Thumbnail size must be less than 10MB');
      return;
    }
    setError('');
    setThumbnailFile(file);
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setThumbnailPreview('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setThumbnailPreview((loadEvent.target?.result as string) || '');
    };
    reader.readAsDataURL(file);
  };

  const uploadThumbnail = async () => {
    if (!thumbnailFile) return formData.thumbnail.trim();
    setIsUploadingThumbnail(true);
    try {
      const body = new FormData();
      body.append('file', thumbnailFile);
      body.append('purpose', 'video-thumbnail');
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { ...getAuthHeader() },
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

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      if (
        !formData.title.trim() ||
        !formData.description.trim() ||
        !formData.videoUrl.trim() ||
        !formData.duration ||
        !formData.category
      ) {
        throw new Error('Please fill in all required fields');
      }

      const isLive = isYouTubeLiveUrl(formData.videoUrl);
      const parsedDuration = Number.parseInt(formData.duration || '0', 10);
      const duration = Number.isFinite(parsedDuration) && parsedDuration >= 0
        ? parsedDuration
        : isLive ? 0 : 60;
      const shortsRank = Number.parseInt(formData.shortsRank || '0', 10);
      const views = Number.parseInt(formData.views || '0', 10);
      if (!Number.isFinite(shortsRank)) throw new Error('Shorts rank must be valid');
      if (!Number.isFinite(views) || views < 0) throw new Error('Views must be valid');

      const youtubeId = extractYouTubeVideoId(formData.videoUrl);
      const isDirectMp4 = /^https:\/\/[^\s]+\.mp4(?:[?#].*)?$/i.test(formData.videoUrl);
      if (!youtubeId && !isDirectMp4) throw new Error('Please enter a valid YouTube URL or HTTPS MP4 playback URL');

      let thumbnail = await uploadThumbnail();
      if (!thumbnail.trim()) thumbnail = getYouTubeThumbnail(formData.videoUrl);
      if (!thumbnail.trim()) throw new Error('Please provide a thumbnail');

      const response = await fetch(`/api/admin/videos/${encodeURIComponent(videoId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          thumbnail: thumbnail.trim(),
          videoUrl: formData.videoUrl.trim(),
          duration,
          category: formData.category,
          isShort: formData.isShort,
          shortsRank: formData.isShort ? shortsRank : 0,
          views,
          slug: formData.slug.trim(),
          articleId: formData.articleId.trim(),
          posterUrl: thumbnail.trim(),
          playbackUrl: formData.videoUrl.trim(),
          aspectRatio: formData.aspectRatio,
          captionUrl: formData.captionUrl.trim(),
          transcript: formData.transcript.trim(),
          processingStatus: formData.processingStatus,
          instagramUrl: formData.instagramUrl.trim(),
          youtubeUrl: formData.youtubeUrl.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update video');
      }

      const nextWorkflow = normalizeWorkflowState(data.data?.workflow);
      const nextThumbnail = String(data.data?.thumbnail || thumbnail.trim());
      const nextForm: VideoFormData = {
        title: String(data.data?.title || formData.title.trim()),
        description: String(data.data?.description || formData.description.trim()),
        thumbnail: nextThumbnail,
        videoUrl: String(data.data?.videoUrl || formData.videoUrl.trim()),
        duration: String(data.data?.duration ?? duration),
        category: String(data.data?.category || formData.category),
        isShort: Boolean(data.data?.isShort ?? formData.isShort),
        shortsRank: String(data.data?.shortsRank ?? (formData.isShort ? shortsRank : 0)),
        views: String(data.data?.views ?? views),
        slug: String(data.data?.slug ?? formData.slug),
        articleId: String(data.data?.articleId ?? formData.articleId),
        aspectRatio: String(data.data?.aspectRatio ?? formData.aspectRatio) as VideoFormData['aspectRatio'],
        captionUrl: String(data.data?.captionUrl ?? formData.captionUrl),
        transcript: String(data.data?.transcript ?? formData.transcript),
        instagramUrl: String(data.data?.instagramUrl ?? formData.instagramUrl),
        youtubeUrl: String(data.data?.youtubeUrl ?? formData.youtubeUrl),
        processingStatus: String(data.data?.processingStatus ?? formData.processingStatus) as VideoFormData['processingStatus'],
      };

      setFormData(nextForm);
      setWorkflow(nextWorkflow);
      setThumbnailFile(null);
      setThumbnailPreview(nextThumbnail);
      setSavedSnapshot(buildSnapshot(nextForm, nextThumbnail));
      setWorkflowAssigneeId(nextWorkflow.assignedTo?.id || '');
      setWorkflowScheduledFor(toDateTimeInput(nextWorkflow.scheduledFor));
      setWorkflowDueAt(toDateTimeInput(nextWorkflow.dueAt));
      setWorkflowPriority(nextWorkflow.priority);
      setWorkflowRejectionReason(nextWorkflow.rejectionReason || '');
      setSuccess('Video updated successfully.');
      await fetchVideoActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update video');
    } finally {
      setIsSaving(false);
    }
  };

  const handleWorkflowAction = async (action: ContentTransitionAction) => {
    setError('');
    setSuccess('');
    setRunningWorkflowAction(action);
    try {
      if (hasUnsavedChanges) {
        throw new Error('Save your video changes before moving workflow.');
      }

      const payload: Record<string, unknown> = {
        action,
        priority: workflowPriority,
        comment: workflowComment.trim(),
      };

      if (action === 'assign') {
        if (!workflowAssigneeId.trim()) throw new Error('Select an assignee first.');
        payload.assignedToId = workflowAssigneeId.trim();
      }

      if (workflowDueAt.trim()) {
        const dueAt = parseDateTimeInput(workflowDueAt);
        if (!dueAt) throw new Error('Due date is invalid.');
        payload.dueAt = dueAt;
      }

      if (action === 'schedule') {
        const scheduledFor = parseDateTimeInput(workflowScheduledFor);
        if (!scheduledFor) throw new Error('Schedule date is required.');
        payload.scheduledFor = scheduledFor;
      }

      if (action === 'reject') {
        if (!workflowRejectionReason.trim()) throw new Error('Rejection reason is required.');
        payload.rejectionReason = workflowRejectionReason.trim();
      }

      const response = await fetch(`/api/admin/videos/${encodeURIComponent(videoId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update workflow');
      }

      const nextWorkflow = normalizeWorkflowState(data.data?.workflow);
      setWorkflow(nextWorkflow);
      setWorkflowAssigneeId(nextWorkflow.assignedTo?.id || '');
      setWorkflowScheduledFor(toDateTimeInput(nextWorkflow.scheduledFor));
      setWorkflowDueAt(toDateTimeInput(nextWorkflow.dueAt));
      setWorkflowPriority(nextWorkflow.priority);
      setWorkflowRejectionReason(nextWorkflow.rejectionReason || '');
      setWorkflowComment('');
      setSuccess(data.message || 'Workflow updated successfully.');
      await fetchVideoActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update workflow');
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
        href="/admin/videos"
        className="mb-6 inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to Videos
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
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Video Desk</h1>
          <p className="mb-6 text-gray-600">
            Update metadata, manage workflow, and keep handoffs visible to the desk.
          </p>

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

          <form onSubmit={handleSave}>
            <CmsEditorColumns>
              <CmsEditorMain className="space-y-4">

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">
                Video Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">Thumbnail URL (optional)</label>
                <input
                  type="url"
                  name="thumbnail"
                  value={formData.thumbnail}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Video / Live Stream URL (YouTube) <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  name="videoUrl"
                  value={formData.videoUrl}
                  onChange={handleInputChange}
                  placeholder="https://www.youtube.com/live/... or watch?v=..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none"
                  required
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {detectedYouTubeId ? (
                    isLiveStream ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        <Radio className="h-3 w-3 animate-pulse" />
                        🔴 YouTube Live Stream Detected ({detectedYouTubeId})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <Play className="h-3 w-3" />
                        ▶️ YouTube Video Detected ({detectedYouTubeId})
                      </span>
                    )
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">
                Replace Thumbnail File (JPG/JPEG/PNG/PDF)
              </label>
              <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-5 transition-colors hover:border-primary-600 hover:bg-gray-50">
                <span className="flex flex-col items-center gap-1 text-center">
                  <ImageIcon className="h-5 w-5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Click to upload thumbnail file</span>
                  <span className="text-xs text-gray-500">JPG/JPEG/PNG/PDF up to 10MB</span>
                </span>
                <input
                  type="file"
                  accept={THUMBNAIL_ACCEPT}
                  onChange={handleThumbnailFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {previewThumbnail ? (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                {isPdfThumbnail(previewThumbnail) ? (
                  <div className="flex h-44 flex-col items-center justify-center gap-2 bg-gray-50 px-4 text-center">
                    <FileText className="h-8 w-8 text-red-600" />
                    <p className="text-sm font-semibold text-gray-800">PDF thumbnail selected</p>
                    <p className="text-xs text-gray-500">
                      {thumbnailFile ? thumbnailFile.name : 'PDF URL provided'}
                    </p>
                  </div>
                ) : (
                  <AdminMediaImage
                    src={previewThumbnail}
                    alt="Thumbnail preview"
                    className="h-48 w-full object-cover"
                  />
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Duration (sec) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="duration"
                  value={formData.duration}
                  onChange={handleInputChange}
                  min="1"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">Category</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">Shorts Rank</label>
                <input
                  type="number"
                  name="shortsRank"
                  value={formData.shortsRank}
                  onChange={handleInputChange}
                  disabled={!formData.isShort}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
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
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary-600 focus:outline-none"
                />
              </div>
            </div>

              </CmsEditorMain>

              <CmsEditorSidebar>
            {/* 📺 Live In-Editor Video Stream Preview */}
            {detectedYouTubeId ? (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 shadow-md">
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
                  <span className="flex items-center gap-1.5">
                    {isLiveStream ? (
                      <span className="flex items-center gap-1 text-red-400">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        LIVE STREAM PREVIEW
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-zinc-200">
                        <Play className="h-3.5 w-3.5 text-red-500 fill-red-500" />
                        YOUTUBE VIDEO PREVIEW
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">{detectedYouTubeId}</span>
                </div>
                <div className="relative aspect-video w-full">
                  <iframe
                    src={buildYouTubeEmbedUrl(detectedYouTubeId, {
                      playsinline: true,
                      controls: true,
                      isLive: isLiveStream,
                    })}
                    title="CMS Live Video Preview"
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : null}

            <div id="workflow-actions" className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Workflow</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Current status, assignee, and review actions.
                  </p>
                </div>
                <CmsWorkflowStatusBadge status={workflow.status} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-2">
                <div><span className="font-semibold text-gray-900">Created by:</span> {workflow.createdBy?.name || workflow.createdBy?.email || 'Unknown'}</div>
                <div><span className="font-semibold text-gray-900">Assigned to:</span> {workflow.assignedTo?.name || 'Unassigned'}</div>
                <div><span className="font-semibold text-gray-900">Reviewer:</span> {workflow.reviewedBy?.name || 'Not started'}</div>
                <div><span className="font-semibold text-gray-900">Priority:</span> <CmsWorkflowPriorityBadge priority={workflowPriority} /></div>
                <div><span className="font-semibold text-gray-900">Submitted:</span> {formatDateTime(workflow.submittedAt) || 'Not yet'}</div>
                <div><span className="font-semibold text-gray-900">Approved:</span> {formatDateTime(workflow.approvedAt) || 'Not yet'}</div>
                <div><span className="font-semibold text-gray-900">Published:</span> {formatDateTime(workflow.publishedAt) || 'Not yet'}</div>
              </div>

              {canUseWorkflowDesk ? (
                <div className="mt-5 grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-900">Assignee</label>
                    <select
                      value={workflowAssigneeId}
                      onChange={(event) => setWorkflowAssigneeId(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                    >
                      <option value="">{isLoadingAssignableUsers ? 'Loading team...' : 'Select assignee'}</option>
                      {assignableUsers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} ({member.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-900">Priority</label>
                      <select
                        value={workflowPriority}
                        onChange={(event) => setWorkflowPriority(event.target.value as WorkflowPriority)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 capitalize focus:border-spanish-red focus:outline-none"
                      >
                        {WORKFLOW_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>{priority}</option>
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
                    <label className="block text-sm font-medium text-gray-900">Schedule Publish</label>
                    <input
                      type="datetime-local"
                      value={workflowScheduledFor}
                      onChange={(event) => setWorkflowScheduledFor(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                    />
                  </div>
                </div>
              ) : null}

              {availableWorkflowActions.includes('reject') || workflow.rejectionReason ? (
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-gray-900">Rejection Reason</label>
                  <textarea
                    value={workflowRejectionReason}
                    onChange={(event) => setWorkflowRejectionReason(event.target.value)}
                    rows={3}
                    placeholder="Explain what should change before this video can continue."
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:border-spanish-red focus:outline-none"
                  />
                </div>
              ) : null}

              {availableWorkflowActions.length > 0 ? (
                <div className="mt-4 space-y-2">
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

              <div className="mt-4 flex flex-wrap gap-2">
                {availableWorkflowActions.length ? availableWorkflowActions.map((action) => {
                  const disabled =
                    Boolean(runningWorkflowAction) ||
                    hasUnsavedChanges ||
                    (action === 'assign' && !workflowAssigneeId.trim()) ||
                    (action === 'reject' && !workflowRejectionReason.trim()) ||
                    (action === 'schedule' && !workflowScheduledFor.trim());
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void handleWorkflowAction(action)}
                      disabled={disabled}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runningWorkflowAction === action ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {ACTION_LABELS[action]}
                    </button>
                  );
                }) : (
                  <p className="text-sm text-gray-600">
                    No workflow transition is available for your role from the current state.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-sm font-medium text-gray-900">Use this video in Shorts mode</span>
                <input
                  type="checkbox"
                  name="isShort"
                  checked={formData.isShort}
                  onChange={handleInputChange}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                />
              </label>
            </div>

            {formData.isShort ? (
              <div className="space-y-4 rounded-lg border border-red-200 bg-red-50/50 p-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Swipe News publishing</h3>
                  <p className="mt-1 text-xs leading-5 text-gray-600">Editors see these values on the public Swipe URL and quick-article sheet. Publish remains blocked until the article, poster, ready media, and 9:16 format are present.</p>
                </div>
                <SwipeReadinessChecklist
                  slug={formData.slug}
                  articleId={formData.articleId}
                  posterReady={Boolean(thumbnailFile || formData.thumbnail.trim())}
                  mediaReady={Boolean(formData.videoUrl.trim())}
                  aspectRatio={formData.aspectRatio}
                  processingStatus={formData.processingStatus}
                />
                <label className="block text-sm font-medium text-gray-900">Swipe slug<input name="slug" value={formData.slug} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
                <label className="block text-sm font-medium text-gray-900">Related published article ID or slug<input name="articleId" value={formData.articleId} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /><span className="mt-1 block text-xs text-gray-600">Controls the public “पूरी खबर पढ़ें” action.</span></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-900">Aspect ratio<select name="aspectRatio" value={formData.aspectRatio} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="9:16">9:16 vertical</option><option value="16:9">16:9 landscape</option><option value="1:1">1:1 square</option><option value="unknown">Unknown</option></select></label>
                  <label className="block text-sm font-medium text-gray-900">Media status<select name="processingStatus" value={formData.processingStatus} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="ready">Ready</option><option value="processing">Processing</option><option value="failed">Failed</option></select></label>
                </div>
                <label className="block text-sm font-medium text-gray-900">Caption file URL<input name="captionUrl" value={formData.captionUrl} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
                <label className="block text-sm font-medium text-gray-900">Transcript<textarea name="transcript" value={formData.transcript} onChange={handleInputChange} rows={4} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-900">Instagram URL<input name="instagramUrl" value={formData.instagramUrl} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
                  <label className="block text-sm font-medium text-gray-900">YouTube URL<input name="youtubeUrl" value={formData.youtubeUrl} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
                </div>
              </div>
            ) : null}

            <CmsWorkflowActivityTimeline
              items={videoActivity}
              isLoading={isLoadingActivity}
              onRefresh={fetchVideoActivity}
              emptyMessage="No video activity yet. Save or move workflow to start the timeline."
              fallbackMessage="Video activity recorded."
              actionLabel={(action) => labelStatus(action || 'activity')}
              formatTimestamp={formatDateTime}
            />

            {canSaveVideo ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSaving || isUploadingThumbnail}
                    className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving || isUploadingThumbnail ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {isUploadingThumbnail ? 'Uploading...' : 'Saving...'}
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
                        Save Changes
                      </>
                    )}
                  </button>

                  <Link
                    href="/admin/videos"
                    className="rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    Cancel
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                Viewer mode: you can review the video and timeline, but editing is disabled.
              </div>
            )}
              </CmsEditorSidebar>
            </CmsEditorColumns>
          </form>
        </div>
        </CmsEditorCanvas>
      </motion.div>
    </div>
  );
}
