import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { matchesArticleAuthorScope } from '@/lib/auth/articleAuthorScope';
import {
  isCopyEditorRole,
  isReporterDeskRole,
  isSuperAdminRole,
  normalizeAdminRole,
  type AdminRole,
} from '@/lib/auth/roles';
import type { WorkflowContentType, WorkflowStatus } from '@/lib/workflow/types';

export const ADMIN_PAGE_KEYS = [
  'dashboard',
  'work_queue',
  'notifications',
  'my_work',
  'review_queue',
  'assignments',
  'content_queue',
  'push_alerts',
  'copy_desk',
  'articles',
  'article_create',
  'article_edit',
  'stories',
  'story_create',
  'story_edit',
  'videos',
  'video_create',
  'video_edit',
  'social_posts',
  'epapers',
  'epaper_create',
  'epaper_edit',
  'epaper_page_edit',
  'media',
  'polls',
  'categories',
  'contact_messages',
  'ai_ops',
  'settings',
  'newsroom_settings',
  'revenue',
  'team',
  'users',
  'analytics',
  'business_value',
  'audit_log',
  'permission_review',
  'operations_center',
  'operations_diagnostics',
] as const;

export const CONTENT_TRANSITION_ACTIONS = [
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
] as const;

export type AdminPageKey = (typeof ADMIN_PAGE_KEYS)[number];
export type ContentTransitionAction = (typeof CONTENT_TRANSITION_ACTIONS)[number];

export type PermissionUser = Pick<AdminSessionIdentity, 'id' | 'email' | 'name' | 'role'>;

export type PermissionContentRecord = {
  workflowStatus?: WorkflowStatus | null;
  createdById?: string | null;
  assignedToId?: string | null;
  legacyAuthorName?: string | null;
  workflow?: {
    status?: WorkflowStatus | null;
    createdBy?: { id?: string | null } | null;
    assignedTo?: { id?: string | null } | null;
  } | null;
};

export const PAGE_ACCESS: Record<AdminPageKey, readonly AdminRole[]> = {
  dashboard: ['super_admin', 'admin', 'reporter', 'copy_editor'],
  work_queue: ['super_admin', 'admin', 'reporter', 'copy_editor'],
  notifications: ['super_admin', 'admin', 'reporter', 'copy_editor'],
  my_work: ['admin', 'reporter', 'copy_editor'],
  review_queue: ['super_admin', 'admin'],
  assignments: ['super_admin', 'admin'],
  content_queue: ['super_admin', 'admin'],
  push_alerts: ['super_admin', 'admin'],
  copy_desk: ['super_admin', 'admin', 'copy_editor'],
  articles: ['super_admin', 'admin', 'copy_editor'],
  article_create: ['super_admin', 'admin', 'reporter', 'copy_editor'],
  article_edit: ['super_admin', 'admin', 'copy_editor'],
  stories: ['super_admin', 'admin', 'reporter', 'copy_editor'],
  story_create: ['super_admin', 'admin', 'reporter'],
  story_edit: ['super_admin', 'admin', 'reporter', 'copy_editor'],
  videos: ['super_admin', 'admin', 'copy_editor'],
  video_create: ['super_admin', 'admin'],
  video_edit: ['super_admin', 'admin', 'copy_editor'],
  social_posts: ['super_admin', 'admin', 'copy_editor'],
  epapers: ['super_admin', 'admin', 'copy_editor'],
  epaper_create: ['super_admin', 'admin'],
  epaper_edit: ['super_admin', 'admin', 'copy_editor'],
  epaper_page_edit: ['super_admin', 'admin', 'copy_editor'],
  media: ['super_admin', 'admin', 'reporter', 'copy_editor'],
  polls: ['super_admin', 'admin'],
  categories: ['super_admin', 'admin'],
  contact_messages: ['super_admin', 'admin'],
  ai_ops: ['super_admin', 'admin'],
  settings: ['super_admin'],
  newsroom_settings: ['super_admin', 'admin'],
  revenue: ['super_admin'],
  team: ['super_admin', 'admin'],
  users: ['super_admin', 'admin'],
  analytics: ['super_admin', 'admin'],
  business_value: ['super_admin'],
  audit_log: ['super_admin'],
  permission_review: ['super_admin'],
  operations_center: ['super_admin', 'admin'],
  operations_diagnostics: ['super_admin'],
};

export const PAGE_LABELS: Record<AdminPageKey, string> = {
  dashboard: 'Dashboard',
  work_queue: 'Work Queue',
  notifications: 'Notifications',
  my_work: 'My Work',
  review_queue: 'Review Queue',
  assignments: 'Assignments',
  content_queue: 'Content Queue',
  push_alerts: 'Push Alerts',
  copy_desk: 'Copy Desk',
  articles: 'Articles',
  article_create: 'Create Article',
  article_edit: 'Edit Article',
  stories: 'Stories',
  story_create: 'Create Story',
  story_edit: 'Edit Story',
  videos: 'Videos',
  video_create: 'Create Video',
  video_edit: 'Edit Video',
  social_posts: 'Social Posts',
  epapers: 'E-Papers',
  epaper_create: 'Create E-Paper',
  epaper_edit: 'Edit E-Paper',
  epaper_page_edit: 'Edit E-Paper Page',
  media: 'Media',
  polls: 'Polls',
  categories: 'Categories',
  contact_messages: 'Contact Messages',
  ai_ops: 'AI Ops',
  settings: 'Settings',
  newsroom_settings: 'Newsroom Settings',
  revenue: 'Revenue & Ads Control',
  team: 'Team',
  users: 'Users & Subscribers',
  analytics: 'Analytics',
  business_value: 'Business Value',
  audit_log: 'Audit Log',
  permission_review: 'Permission Review',
  operations_center: 'Operations Center',
  operations_diagnostics: 'Operations Diagnostics',
};

const REPORTER_EDITABLE_WORKFLOW_STATUSES: WorkflowStatus[] = ['draft', 'changes_requested'];
const COPY_EDITOR_EDITABLE_WORKFLOW_STATUSES: WorkflowStatus[] = [
  'assigned',
  'in_review',
  'copy_edit',
];
const COPY_EDITOR_OWN_EDITABLE_WORKFLOW_STATUSES: WorkflowStatus[] = [
  'draft',
  'changes_requested',
];
const COPY_EDITOR_SHARED_QUEUE_STATUSES: WorkflowStatus[] = ['submitted'];

function matchesActor(user: PermissionUser, actorId: string | null | undefined): boolean {
  if (!actorId) return false;

  const normalizedActorId = actorId.trim().toLowerCase();
  if (!normalizedActorId) return false;

  return (
    normalizedActorId === user.id.trim().toLowerCase() ||
    normalizedActorId === user.email.trim().toLowerCase()
  );
}

function resolveCreatedById(content: PermissionContentRecord): string {
  return content.workflow?.createdBy?.id?.trim() || content.createdById?.trim() || '';
}

function resolveAssignedToId(content: PermissionContentRecord): string {
  return content.workflow?.assignedTo?.id?.trim() || content.assignedToId?.trim() || '';
}

function resolveLegacyAuthorName(content: PermissionContentRecord): string {
  return content.legacyAuthorName?.trim() || '';
}

function isExplicitContentOwner(
  user: PermissionUser | null | undefined,
  content: PermissionContentRecord
): boolean {
  if (!user) return false;
  return matchesActor(user, resolveCreatedById(content));
}

export function resolveWorkflowStatus(content: PermissionContentRecord): WorkflowStatus | null {
  return content.workflow?.status || content.workflowStatus || null;
}

export function isOwnContent(
  user: PermissionUser | null | undefined,
  content: PermissionContentRecord
): boolean {
  if (!user) return false;
  return (
    matchesActor(user, resolveCreatedById(content)) ||
    matchesArticleAuthorScope(resolveLegacyAuthorName(content), user)
  );
}

export function isAssignedContent(
  user: PermissionUser | null | undefined,
  content: PermissionContentRecord
): boolean {
  if (!user) return false;
  return matchesActor(user, resolveAssignedToId(content));
}

export function canViewPage(
  role: AdminRole | null | undefined,
  page: AdminPageKey
): boolean {
  const normalizedRole = normalizeAdminRole(role);
  if (!normalizedRole) return false;
  return PAGE_ACCESS[page].includes(normalizedRole);
}

export function canManageTeam(role: AdminRole | null | undefined): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canManageTargetAdminRole(
  actorRole: AdminRole | null | undefined,
  targetRole: AdminRole | null | undefined
): boolean {
  if (!actorRole || !targetRole) {
    return false;
  }

  if (isSuperAdminRole(actorRole)) {
    return true;
  }

  if (actorRole !== 'admin') {
    return false;
  }

  return targetRole === 'admin' || targetRole === 'reporter' || targetRole === 'copy_editor';
}

export function getAssignableAdminRoles(
  actorRole: AdminRole | null | undefined
): AdminRole[] {
  if (isSuperAdminRole(actorRole)) {
    return ['super_admin', 'admin', 'reporter', 'copy_editor'];
  }

  if (actorRole === 'admin') {
    return ['admin', 'reporter', 'copy_editor'];
  }

  return [];
}

export function canManageSettings(role: AdminRole | null | undefined): boolean {
  return isSuperAdminRole(role);
}

export function canManageNewsroomSettings(role: AdminRole | null | undefined): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canRunGlobalAiOps(role: AdminRole | null | undefined): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canManageLeadershipReports(
  role: AdminRole | null | undefined
): boolean {
  return isSuperAdminRole(role);
}

export function canManageWorkflowAssignments(
  role: AdminRole | null | undefined
): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canManageContactInbox(
  role: AdminRole | null | undefined
): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canReadContent(
  user: PermissionUser | null | undefined,
  content: PermissionContentRecord,
  _options: { allowViewerRead?: boolean } = {}
): boolean {
  void _options;
  if (!user) return false;

  const workflowStatus = resolveWorkflowStatus(content);

  switch (user.role) {
    case 'super_admin':
    case 'admin':
      return true;
    case 'reporter':
      return isOwnContent(user, content) || isAssignedContent(user, content);
    case 'copy_editor':
      return (
        isExplicitContentOwner(user, content) ||
        isAssignedContent(user, content) ||
        Boolean(
          workflowStatus && COPY_EDITOR_SHARED_QUEUE_STATUSES.includes(workflowStatus)
        )
      );
    default:
      return false;
  }
}

export function canEditContent(
  user: PermissionUser | null | undefined,
  content: PermissionContentRecord
): boolean {
  if (!user) return false;

  const workflowStatus = resolveWorkflowStatus(content);

  switch (user.role) {
    case 'super_admin':
    case 'admin':
      return true;
    case 'reporter':
      return (
        Boolean(workflowStatus && REPORTER_EDITABLE_WORKFLOW_STATUSES.includes(workflowStatus)) &&
        (isOwnContent(user, content) || isAssignedContent(user, content))
      );
    case 'copy_editor':
      return (
        Boolean(
          workflowStatus &&
            (
              (COPY_EDITOR_OWN_EDITABLE_WORKFLOW_STATUSES.includes(workflowStatus) &&
                isExplicitContentOwner(user, content)) ||
              (COPY_EDITOR_EDITABLE_WORKFLOW_STATUSES.includes(workflowStatus) &&
                isAssignedContent(user, content))
            )
        )
      );
    default:
      return false;
  }
}

export function canCommentOnContent(
  user: PermissionUser | null | undefined,
  content: PermissionContentRecord
): boolean {
  if (!user) return false;

  switch (user.role) {
    case 'super_admin':
    case 'admin':
      return true;
    case 'reporter':
      return isOwnContent(user, content) || isAssignedContent(user, content);
    case 'copy_editor':
      return isExplicitContentOwner(user, content) || isAssignedContent(user, content);
    default:
      return false;
  }
}

export function canCreateContent(
  role: AdminRole | null | undefined,
  contentType: WorkflowContentType
): boolean {
  if (!role) return false;

  if (isSuperAdminRole(role) || role === 'admin') {
    return true;
  }

  if (role === 'copy_editor') {
    return contentType === 'article';
  }

  if (isReporterDeskRole(role)) {
    return contentType === 'story' || contentType === 'article';
  }

  return false;
}

export function canDeleteContent(
  user: PermissionUser | null | undefined
): boolean {
  if (!user) return false;
  return isSuperAdminRole(user.role) || user.role === 'admin';
}

export function canCreateEpaper(role: AdminRole | null | undefined): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canEditEpaper(role: AdminRole | null | undefined): boolean {
  return role === 'admin' || role === 'copy_editor' || isSuperAdminRole(role);
}

export function canPrepareEpaperForPublish(
  role: AdminRole | null | undefined
): boolean {
  return canEditEpaper(role);
}

export function canManageEpaperAssignments(
  role: AdminRole | null | undefined
): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canPublishEpaper(role: AdminRole | null | undefined): boolean {
  return role === 'admin' || isSuperAdminRole(role);
}

export function canDeleteEpaper(role: AdminRole | null | undefined): boolean {
  return canPublishEpaper(role);
}

export function canTransitionContent(
  user: PermissionUser | null | undefined,
  content: PermissionContentRecord,
  action: ContentTransitionAction
): boolean {
  if (!user) return false;

  const workflowStatus = resolveWorkflowStatus(content);

  if (isSuperAdminRole(user.role) || user.role === 'admin') {
    return true;
  }

  if (isCopyEditorRole(user.role)) {
    if (
      action === 'submit' &&
      Boolean(
        workflowStatus &&
          COPY_EDITOR_OWN_EDITABLE_WORKFLOW_STATUSES.includes(workflowStatus)
      ) &&
      isExplicitContentOwner(user, content)
    ) {
      return true;
    }

    if (action === 'start_review' && workflowStatus === 'submitted') {
      return !resolveAssignedToId(content);
    }

    return (
      (
        action === 'start_review' ||
        action === 'move_to_copy_edit' ||
        action === 'request_changes' ||
        action === 'mark_ready_for_approval'
      ) &&
      isAssignedContent(user, content)
    );
  }

  if (isReporterDeskRole(user.role)) {
    return (
      action === 'submit' &&
      Boolean(workflowStatus && REPORTER_EDITABLE_WORKFLOW_STATUSES.includes(workflowStatus)) &&
      (isOwnContent(user, content) || isAssignedContent(user, content))
    );
  }

  return false;
}

export function canTakeOverArticleLock(role: AdminRole | null | undefined): boolean {
  const normalizedRole = normalizeAdminRole(role);
  return normalizedRole === 'admin' || isSuperAdminRole(normalizedRole);
}
