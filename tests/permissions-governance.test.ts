import { describe, expect, it } from 'vitest';
import {
  canCommentOnContent,
  canCreateContent,
  canCreateEpaper,
  canDeleteEpaper,
  canDispatchSocialPosts,
  canEditContent,
  canEditEpaper,
  canManageEpaperAssignments,
  canManageLeadershipReports,
  canManageNewsroomSettings,
  canManagePolls,
  canManageSettings,
  canManageTeam,
  canManageUsers,
  canPrepareEpaperForPublish,
  canPublishEpaper,
  canReadContent,
  canRunGlobalAiOps,
  canTransitionContent,
  canViewPage,
} from '@/lib/auth/permissions';

describe('governance permission helpers', () => {
  const baseContent = {
    workflowStatus: 'draft' as const,
    createdById: 'reporter-1',
    assignedToId: 'copy-editor-1',
    legacyAuthorName: 'Reporter One',
  };

  const superAdmin = {
    id: 'super-1',
    email: 'boss@example.com',
    name: 'Boss',
    role: 'super_admin' as const,
  };

  const admin = {
    id: 'admin-1',
    email: 'desk@example.com',
    name: 'Desk',
    role: 'admin' as const,
  };

  const copyEditor = {
    id: 'copy-editor-1',
    email: 'copy@example.com',
    name: 'Copy Editor',
    role: 'copy_editor' as const,
  };

  const reporter = {
    id: 'reporter-1',
    email: 'reporter@example.com',
    name: 'Reporter One',
    role: 'reporter' as const,
  };

  it('locks governance pages to super admin only', () => {
    expect(canViewPage(superAdmin.role, 'audit_log')).toBe(true);
    expect(canViewPage(superAdmin.role, 'permission_review')).toBe(true);
    expect(canViewPage(superAdmin.role, 'operations_diagnostics')).toBe(true);

    expect(canViewPage(admin.role, 'audit_log')).toBe(false);
    expect(canViewPage(copyEditor.role, 'permission_review')).toBe(false);
    expect(canViewPage(reporter.role, 'operations_diagnostics')).toBe(false);
  });

  it('keeps leadership controls narrower than normal analytics access', () => {
    expect(canViewPage(superAdmin.role, 'analytics')).toBe(true);
    expect(canViewPage(superAdmin.role, 'business_value')).toBe(true);
    expect(canViewPage(superAdmin.role, 'polls')).toBe(true);
    expect(canViewPage(superAdmin.role, 'settings')).toBe(true);
    expect(canViewPage(superAdmin.role, 'revenue')).toBe(true);
    expect(canViewPage(admin.role, 'analytics')).toBe(true);
    expect(canViewPage(admin.role, 'business_value')).toBe(false);
    expect(canViewPage(admin.role, 'polls')).toBe(true);
    expect(canViewPage(admin.role, 'settings')).toBe(false);
    expect(canViewPage(admin.role, 'revenue')).toBe(false);
    expect(canViewPage(copyEditor.role, 'polls')).toBe(false);
    expect(canViewPage(reporter.role, 'polls')).toBe(false);
    expect(canViewPage(admin.role, 'newsroom_settings')).toBe(true);
    expect(canManageLeadershipReports(superAdmin.role)).toBe(true);
    expect(canManageLeadershipReports(admin.role)).toBe(false);
    expect(canManageSettings(superAdmin.role)).toBe(true);
    expect(canManageSettings(admin.role)).toBe(false);
    expect(canManageTeam(superAdmin.role)).toBe(true);
    expect(canManageTeam(admin.role)).toBe(false);
  });

  it('restricts control-plane actions to super admin without changing shell visibility', () => {
    const elevatedChecks = [
      canManageTeam,
      canManageSettings,
      canManageNewsroomSettings,
      canRunGlobalAiOps,
      canManagePolls,
      canManageUsers,
      canDispatchSocialPosts,
      canManageLeadershipReports,
    ];

    for (const check of elevatedChecks) {
      expect(check(superAdmin.role)).toBe(true);
      expect(check(admin.role)).toBe(false);
      expect(check(copyEditor.role)).toBe(false);
      expect(check(reporter.role)).toBe(false);
    }

    expect(canViewPage(admin.role, 'team')).toBe(true);
    expect(canViewPage(admin.role, 'polls')).toBe(true);
    expect(canViewPage(admin.role, 'newsroom_settings')).toBe(true);
    expect(canViewPage(admin.role, 'ai_ops')).toBe(true);
  });

  it('routes newsroom control panels to the correct desks', () => {
    expect(canViewPage(admin.role, 'work_queue')).toBe(true);
    expect(canViewPage(copyEditor.role, 'work_queue')).toBe(true);
    expect(canViewPage(reporter.role, 'work_queue')).toBe(true);
    expect(canViewPage(reporter.role, 'notifications')).toBe(true);
    expect(canViewPage(admin.role, 'assignments')).toBe(true);
    expect(canViewPage(admin.role, 'content_queue')).toBe(true);
    expect(canViewPage(admin.role, 'push_alerts')).toBe(true);
    expect(canViewPage(copyEditor.role, 'review_queue')).toBe(false);
    expect(canViewPage(copyEditor.role, 'copy_desk')).toBe(true);
    expect(canViewPage(reporter.role, 'articles')).toBe(false);
    expect(canViewPage(reporter.role, 'article_create')).toBe(true);
    expect(canViewPage(reporter.role, 'copy_desk')).toBe(false);
    expect(canViewPage(reporter.role, 'push_alerts')).toBe(false);
  });

  it('limits content creation by role', () => {
    expect(canCreateContent(reporter.role, 'article')).toBe(true);
    expect(canCreateContent(reporter.role, 'story')).toBe(true);
    expect(canCreateContent(reporter.role, 'video')).toBe(false);
    expect(canCreateContent(copyEditor.role, 'article')).toBe(true);
    expect(canCreateContent(copyEditor.role, 'story')).toBe(false);
    expect(canCreateContent(admin.role, 'video')).toBe(true);
  });

  it('routes social outbox access to desk roles only', () => {
    expect(canViewPage(admin.role, 'social_posts')).toBe(true);
    expect(canViewPage(copyEditor.role, 'social_posts')).toBe(true);
    expect(canViewPage(reporter.role, 'social_posts')).toBe(false);
  });

  it('lets reporters work only on their own content transitions', () => {
    expect(canReadContent(reporter, baseContent)).toBe(true);
    expect(canEditContent(reporter, baseContent)).toBe(true);
    expect(
      canEditContent(reporter, { ...baseContent, workflowStatus: 'submitted' })
    ).toBe(false);
    expect(canTransitionContent(reporter, baseContent, 'submit')).toBe(true);
    expect(
      canTransitionContent(reporter, { ...baseContent, workflowStatus: 'submitted' }, 'submit')
    ).toBe(false);
    expect(canTransitionContent(reporter, { ...baseContent, createdById: reporter.id }, 'approve')).toBe(false);
  });

  it('lets copy editors work only on assigned review items', () => {
    const assignedContent = { ...baseContent, workflowStatus: 'assigned' as const };
    const submittedQueueContent = {
      ...baseContent,
      workflowStatus: 'submitted' as const,
      assignedToId: '',
    };

    expect(canReadContent(copyEditor, assignedContent)).toBe(true);
    expect(canReadContent(copyEditor, submittedQueueContent)).toBe(true);
    expect(canEditContent(copyEditor, submittedQueueContent)).toBe(false);
    expect(canTransitionContent(copyEditor, submittedQueueContent, 'start_review')).toBe(true);
    expect(canEditContent(copyEditor, assignedContent)).toBe(true);
    expect(
      canEditContent(copyEditor, { ...assignedContent, workflowStatus: 'ready_for_approval' })
    ).toBe(false);
    expect(canTransitionContent(copyEditor, assignedContent, 'start_review')).toBe(true);
    expect(canTransitionContent(copyEditor, assignedContent, 'move_to_copy_edit')).toBe(true);
    expect(canTransitionContent(copyEditor, assignedContent, 'request_changes')).toBe(true);
    expect(canTransitionContent(copyEditor, assignedContent, 'mark_ready_for_approval')).toBe(true);
    expect(canTransitionContent(copyEditor, assignedContent, 'approve')).toBe(false);
    expect(canTransitionContent(copyEditor, assignedContent, 'reject')).toBe(false);
    expect(canTransitionContent(copyEditor, assignedContent, 'schedule')).toBe(false);
    expect(canTransitionContent(copyEditor, assignedContent, 'publish')).toBe(false);
    expect(
      canEditContent(copyEditor, { ...assignedContent, assignedToId: 'someone-else' })
    ).toBe(false);
    expect(
      canTransitionContent(
        copyEditor,
        { ...submittedQueueContent, assignedToId: 'someone-else' },
        'start_review'
      )
    ).toBe(false);
  });

  it('lets copy editors reopen, revise, and submit only their own direct-article drafts', () => {
    const ownDraft = {
      ...baseContent,
      workflowStatus: 'draft' as const,
      createdById: copyEditor.id,
      assignedToId: '',
      legacyAuthorName: copyEditor.name,
    };
    const ownChangesRequested = {
      ...ownDraft,
      workflowStatus: 'changes_requested' as const,
    };
    const anotherEditorsDraft = {
      ...ownDraft,
      createdById: 'copy-editor-2',
      legacyAuthorName: 'Another Copy Editor',
    };
    const legacyNameOnlyDraft = {
      ...ownDraft,
      createdById: '',
      legacyAuthorName: copyEditor.name,
    };

    expect(canReadContent(copyEditor, ownDraft)).toBe(true);
    expect(canEditContent(copyEditor, ownDraft)).toBe(true);
    expect(canCommentOnContent(copyEditor, ownDraft)).toBe(true);
    expect(canTransitionContent(copyEditor, ownDraft, 'submit')).toBe(true);
    expect(canReadContent(copyEditor, ownChangesRequested)).toBe(true);
    expect(canEditContent(copyEditor, ownChangesRequested)).toBe(true);
    expect(canTransitionContent(copyEditor, ownChangesRequested, 'submit')).toBe(true);

    expect(canReadContent(copyEditor, anotherEditorsDraft)).toBe(false);
    expect(canEditContent(copyEditor, anotherEditorsDraft)).toBe(false);
    expect(canCommentOnContent(copyEditor, anotherEditorsDraft)).toBe(false);
    expect(canTransitionContent(copyEditor, anotherEditorsDraft, 'submit')).toBe(false);
    expect(canReadContent(copyEditor, legacyNameOnlyDraft)).toBe(false);
    expect(canEditContent(copyEditor, legacyNameOnlyDraft)).toBe(false);
    expect(canCommentOnContent(copyEditor, legacyNameOnlyDraft)).toBe(false);
    expect(canTransitionContent(copyEditor, ownDraft, 'publish')).toBe(false);
  });

  it('keeps admin and super admin fully operational on workflow actions', () => {
    expect(canTransitionContent(admin, baseContent, 'publish')).toBe(true);
    expect(canTransitionContent(admin, baseContent, 'fast_publish')).toBe(true);
    expect(canTransitionContent(copyEditor, baseContent, 'fast_publish')).toBe(false);
    expect(canTransitionContent(superAdmin, baseContent, 'archive')).toBe(true);
    expect(canEditContent(admin, baseContent)).toBe(true);
    expect(canEditContent(superAdmin, baseContent)).toBe(true);
  });

  it('restricts the complete e-paper lifecycle to super admin', () => {
    const lifecycleChecks = [
      canCreateEpaper,
      canEditEpaper,
      canPrepareEpaperForPublish,
      canManageEpaperAssignments,
      canPublishEpaper,
      canDeleteEpaper,
    ];

    for (const check of lifecycleChecks) {
      expect(check(superAdmin.role)).toBe(true);
      expect(check(admin.role)).toBe(false);
      expect(check(copyEditor.role)).toBe(false);
      expect(check(reporter.role)).toBe(false);
    }
  });
});
