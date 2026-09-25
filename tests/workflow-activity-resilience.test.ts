import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildArticleActivityMessage } from '@/lib/server/articleActivity';
import { buildStoryActivityMessage } from '@/lib/server/storyActivity';
import { createWorkflowMeta } from '@/lib/workflow/types';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

const {
  createWorkflowNotificationMock,
  recordContentActivityMock,
} = vi.hoisted(() => ({
  createWorkflowNotificationMock: vi.fn(),
  recordContentActivityMock: vi.fn(),
}));

vi.mock('@/lib/storage/workflowNotifications', () => ({
  createWorkflowNotification: createWorkflowNotificationMock,
}));

vi.mock('@/lib/server/contentActivity', () => ({
  recordContentActivity: recordContentActivityMock,
  listContentActivity: vi.fn().mockResolvedValue([]),
}));

const adminUser: AdminSessionIdentity = {
  id: 'admin-1',
  name: 'Desk Admin',
  email: 'admin@example.com',
  username: 'admin@example.com',
  role: 'admin',
};

const reporterUser: AdminSessionIdentity = {
  id: 'reporter-1',
  name: 'Reporter One',
  email: 'reporter@example.com',
  username: 'reporter@example.com',
  role: 'reporter',
};

describe('Phase 3.7E: Activity & Notification Parity and Side-Effect Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWorkflowNotificationMock.mockImplementation(async (input: unknown) => input);
    recordContentActivityMock.mockResolvedValue(undefined);
  });

  describe('TASK 2: Activity Event & Message Parity', () => {
    it('provides identical message for restore_revision across Article and Story', () => {
      const articleMsg = buildArticleActivityMessage({ action: 'restore_revision' });
      const storyMsg = buildStoryActivityMessage({ action: 'restore_revision' });

      expect(articleMsg).toBe('Revision restored.');
      expect(storyMsg).toBe('Revision restored.');
      expect(storyMsg).toBe(articleMsg);
    });

    it('formats submit, review, changes_requested, approve, reject, schedule, and fast_publish consistently', () => {
      expect(buildArticleActivityMessage({ action: 'submit' })).toBe('Article submitted for review.');
      expect(buildStoryActivityMessage({ action: 'submit' })).toBe('Story submitted for review.');

      expect(buildArticleActivityMessage({ action: 'request_changes', rejectionReason: 'Fix typo' })).toContain('Fix typo');
      expect(buildStoryActivityMessage({ action: 'request_changes', rejectionReason: 'Fix typo' })).toContain('Fix typo');

      expect(buildArticleActivityMessage({ action: 'reject', rejectionReason: 'Legal issues' })).toContain('Legal issues');
      expect(buildStoryActivityMessage({ action: 'reject', rejectionReason: 'Legal issues' })).toContain('Legal issues');

      expect(buildArticleActivityMessage({ action: 'fast_publish' })).toContain('urgently published');
      expect(buildStoryActivityMessage({ action: 'fast_publish' })).toContain('urgently published');
    });
  });

  describe('TASK 4 & TASK 6: notifyWorkflowEvent Resilience and Context Propagation', () => {
    it('does not throw when notification storage fails and returns empty array', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      createWorkflowNotificationMock.mockRejectedValueOnce(new Error('Storage disk full'));

      const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
      const workflow = createWorkflowMeta({ createdBy: reporterUser, assignedTo: null });

      const result = await notifyWorkflowEvent({
        contentType: 'story',
        contentId: 'story-fail-1',
        title: 'Breaking Alert',
        href: '/admin/stories/story-fail-1/edit',
        action: 'approve',
        workflow,
        actor: adminUser,
      });

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create workflow notifications:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('propagates rejectionReason into reject notification message', async () => {
      const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
      const workflow = createWorkflowMeta({ createdBy: reporterUser });

      await notifyWorkflowEvent({
        contentType: 'article',
        contentId: 'art-context-1',
        title: 'Election Special',
        href: '/admin/articles/art-context-1/edit',
        action: 'reject',
        workflow,
        actor: adminUser,
        rejectionReason: 'Needs second source verification',
      });

      expect(createWorkflowNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'rejected',
          message: expect.stringContaining('Needs second source verification'),
        })
      );
    });

    it('propagates UTC schedule time into schedule notification message', async () => {
      const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
      const workflow = createWorkflowMeta({ createdBy: reporterUser });

      await notifyWorkflowEvent({
        contentType: 'story',
        contentId: 'story-sched-1',
        title: 'Evening Roundup',
        href: '/admin/stories/story-sched-1/edit',
        action: 'schedule',
        workflow,
        actor: adminUser,
        scheduledFor: '2026-09-30T15:30:00.000Z',
      });

      expect(createWorkflowNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'scheduled',
          message: expect.stringContaining('2026-09-30 15:30 UTC'),
        })
      );
    });

    it('propagates fast_publish comment into notification message', async () => {
      const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
      const workflow = createWorkflowMeta({ createdBy: reporterUser });

      await notifyWorkflowEvent({
        contentType: 'story',
        contentId: 'story-fast-ctx',
        title: 'Live Breaking',
        href: '/admin/stories/story-fast-ctx/edit',
        action: 'fast_publish',
        workflow,
        actor: adminUser,
        comment: 'Chief editor oral authorization',
      });

      expect(createWorkflowNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'fast_published',
          message: expect.stringContaining('Chief editor oral authorization'),
        })
      );
    });
  });

  describe('TASK 5: Recipient Isolation', () => {
    it('does not send self-notifications to the acting user', async () => {
      const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
      // If admin created and admin approved, admin should not receive self-notification
      const workflow = createWorkflowMeta({ createdBy: adminUser, assignedTo: null });

      const result = await notifyWorkflowEvent({
        contentType: 'article',
        contentId: 'art-self-1',
        title: 'Admin Article',
        href: '/admin/articles/art-self-1/edit',
        action: 'approve',
        workflow,
        actor: adminUser,
      });

      expect(createWorkflowNotificationMock).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('isolates notification to creator and assigned editor only', async () => {
      const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
      const assignedEditor: AdminSessionIdentity = {
        id: 'editor-1',
        name: 'Desk Editor',
        email: 'editor@example.com',
        username: 'editor@example.com',
        role: 'copy_editor',
      };
      const workflow = createWorkflowMeta({
        createdBy: reporterUser,
        assignedTo: assignedEditor,
      });

      await notifyWorkflowEvent({
        contentType: 'article',
        contentId: 'art-isolate-1',
        title: 'Local News',
        href: '/admin/articles/art-isolate-1/edit',
        action: 'approve',
        workflow,
        actor: adminUser,
      });

      expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);
      const recipientEmails = createWorkflowNotificationMock.mock.calls.map(
        (c) => c[0].recipientEmail
      );
      expect(recipientEmails).toContain('reporter@example.com');
      expect(recipientEmails).toContain('editor@example.com');
      expect(recipientEmails).not.toContain('admin@example.com');
    });
  });
});
