import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowMeta } from '@/lib/workflow/types';

const createWorkflowNotificationMock = vi.fn();
const connectDBMock = vi.fn();
const leanMock = vi.fn();
const selectMock = vi.fn(() => ({ lean: leanMock }));
const findMock = vi.fn(() => ({ select: selectMock }));
const readUsersFileMock = vi.fn();

vi.mock('@/lib/storage/workflowNotifications', () => ({
  createWorkflowNotification: createWorkflowNotificationMock,
}));
vi.mock('@/lib/db/mongoose', () => ({ default: connectDBMock }));
vi.mock('@/lib/models/User', () => ({ default: { find: findMock } }));
vi.mock('@/lib/storage/usersFile', () => ({
  readUsersFile: readUsersFileMock,
}));

const admin = { id: 'admin-1', name: 'Desk', email: 'desk@example.com', role: 'admin' as const };
const reporter = { id: 'reporter-1', name: 'Reporter', email: 'reporter@example.com', role: 'reporter' as const };
const copyEditor = { id: 'copy-1', name: 'Copy', email: 'copy@example.com', role: 'copy_editor' as const };
const editorTwo = { id: 'copy-2', name: 'Second Editor', email: 'copy2@example.com', role: 'copy_editor' as const };

describe('workflow notification events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    createWorkflowNotificationMock.mockImplementation(async (input) => input);
    readUsersFileMock.mockResolvedValue([]);
  });

  it('notifies confirmed assignee on assign action with bilingual copy', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'story',
      contentId: 'story-1',
      title: 'City update',
      href: '/admin/stories/story-1/edit',
      action: 'assign',
      workflow,
      actor: admin,
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledOnce();
    expect(createWorkflowNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'copy@example.com',
        eventType: 'assigned',
        message: expect.stringContaining('assigned'),
        messageHi: expect.any(String),
        href: '/admin/stories/story-1/edit',
        dedupeKey: expect.stringContaining('story:story-1:assign:'),
      })
    );
  });

  it('notifies new assignee AND displaced previous assignee on reassignment', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: editorTwo });

    await notifyWorkflowEvent({
      contentType: 'article',
      contentId: 'art-1',
      title: 'Budget story',
      href: '/admin/articles/art-1/edit',
      action: 'assign',
      workflow,
      actor: admin,
      previousAssignee: copyEditor,
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);

    // First call: new assignee
    expect(createWorkflowNotificationMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        recipientEmail: 'copy2@example.com',
        eventType: 'assigned',
        message: expect.stringContaining('assigned'),
        messageHi: expect.any(String),
      })
    );

    // Second call: displaced previous assignee
    expect(createWorkflowNotificationMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        recipientEmail: 'copy@example.com',
        eventType: 'reassigned',
        message: expect.stringContaining('reassigned'),
        messageHi: expect.any(String),
        dedupeKey: expect.stringContaining('article:art-1:reassigned:'),
      })
    );
  });

  it('notifies creator when review starts', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'story',
      contentId: 'story-review-1',
      title: 'Metro report',
      href: '/admin/stories/story-review-1/edit',
      action: 'start_review',
      workflow,
      actor: copyEditor,
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledOnce();
    expect(createWorkflowNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'reporter@example.com',
        eventType: 'review_started',
        message: expect.stringContaining('review'),
        messageHi: expect.any(String),
        href: '/admin/stories/story-review-1/edit',
      })
    );
  });

  it('notifies creator and assignee when changes are requested', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'article',
      contentId: 'art-changes-1',
      title: 'Health policy',
      href: '/admin/articles/art-changes-1/edit',
      action: 'request_changes',
      workflow,
      actor: admin,
      rejectionReason: 'Add hospital sources',
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);
    const emails = createWorkflowNotificationMock.mock.calls.map((call) => call[0].recipientEmail);
    expect(emails).toContain('reporter@example.com');
    expect(emails).toContain('copy@example.com');
    expect(createWorkflowNotificationMock.mock.calls[0][0].message).toContain('Add hospital sources');
  });

  it('notifies active admins for ready-for-approval handoff and excludes actor (Mongo path)', async () => {
    process.env.MONGODB_URI = 'mongodb://example.test/newsroom';
    leanMock.mockResolvedValue([
      { _id: { toString: () => 'admin-1' }, email: 'desk@example.com' },
      { _id: { toString: () => 'admin-2' }, email: 'chief@example.com' },
    ]);

    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    await notifyWorkflowEvent({
      contentType: 'article',
      contentId: 'article-1',
      title: 'Approval item',
      href: '/admin/articles/article-1/edit',
      action: 'mark_ready_for_approval',
      workflow: createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor }),
      actor: admin,
    });

    expect(findMock).toHaveBeenCalledWith(expect.objectContaining({ isActive: { $ne: false } }));
    expect(createWorkflowNotificationMock).toHaveBeenCalledOnce();
    expect(createWorkflowNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'chief@example.com',
        eventType: 'ready_for_approval',
      })
    );
  });

  it('resolves active admin recipients from file fallback when Mongo is unconfigured', async () => {
    delete process.env.MONGODB_URI;
    readUsersFileMock.mockResolvedValue([
      { _id: 'admin-1', email: 'desk@example.com', role: 'admin', isActive: true },
      { _id: 'admin-fallback-2', email: 'super@example.com', role: 'super_admin', isActive: true },
      { _id: 'reporter-1', email: 'reporter@example.com', role: 'reporter', isActive: true },
      { _id: 'admin-inactive', email: 'inactive@example.com', role: 'admin', isActive: false },
    ]);

    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    await notifyWorkflowEvent({
      contentType: 'article',
      contentId: 'article-fallback-1',
      title: 'Fallback approval',
      href: '/admin/articles/article-fallback-1/edit',
      action: 'mark_ready_for_approval',
      workflow: createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor }),
      actor: admin, // admin-1 is actor, should be excluded
    });

    expect(readUsersFileMock).toHaveBeenCalled();
    expect(createWorkflowNotificationMock).toHaveBeenCalledOnce();
    expect(createWorkflowNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'super@example.com',
        eventType: 'ready_for_approval',
      })
    );
  });

  it('notifies creator and assignee when item is approved', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'story',
      contentId: 'story-appr-1',
      title: 'Sports final',
      href: '/admin/stories/story-appr-1/edit',
      action: 'approve',
      workflow,
      actor: admin,
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);
    const emails = createWorkflowNotificationMock.mock.calls.map((call) => call[0].recipientEmail);
    expect(emails).toContain('reporter@example.com');
    expect(emails).toContain('copy@example.com');
    expect(createWorkflowNotificationMock.mock.calls[0][0].eventType).toBe('approved');
  });

  it('notifies creator and assignee with reason when rejected', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'story',
      contentId: 'story-rej-1',
      title: 'Unverified claim',
      href: '/admin/stories/story-rej-1/edit',
      action: 'reject',
      workflow,
      actor: admin,
      rejectionReason: 'Needs legal vetting',
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);
    const notification = createWorkflowNotificationMock.mock.calls[0][0];
    expect(notification.eventType).toBe('rejected');
    expect(notification.message).toContain('Needs legal vetting');
    expect(notification.messageHi).toContain('Needs legal vetting');
  });

  it('notifies creator and assignee with scheduled date when scheduled', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'article',
      contentId: 'art-sched-1',
      title: 'Evening feature',
      href: '/admin/articles/art-sched-1/edit',
      action: 'schedule',
      workflow,
      actor: admin,
      scheduledFor: '2026-09-25T18:00',
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);
    const notification = createWorkflowNotificationMock.mock.calls[0][0];
    expect(notification.eventType).toBe('scheduled');
    expect(notification.message).toContain('2026-09-25');
  });

  it('notifies creator and assignee when published', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'video',
      contentId: 'vid-pub-1',
      title: 'Election analysis',
      href: '/admin/videos/vid-pub-1/edit',
      action: 'publish',
      workflow,
      actor: admin,
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);
    const notification = createWorkflowNotificationMock.mock.calls[0][0];
    expect(notification.eventType).toBe('published');
  });

  it('notifies creator and assignee with comment when fast_published', async () => {
    const { notifyWorkflowEvent } = await import('@/lib/server/workflowNotificationEvents');
    const workflow = createWorkflowMeta({ createdBy: reporter, assignedTo: copyEditor });

    await notifyWorkflowEvent({
      contentType: 'story',
      contentId: 'story-fast-1',
      title: 'Breaking alert',
      href: '/admin/stories/story-fast-1/edit',
      action: 'fast_publish',
      workflow,
      actor: admin,
      comment: 'Urgent breaking coverage exception',
    });

    expect(createWorkflowNotificationMock).toHaveBeenCalledTimes(2);
    const notification = createWorkflowNotificationMock.mock.calls[0][0];
    expect(notification.eventType).toBe('fast_published');
    expect(notification.message).toContain('Urgent breaking coverage exception');
  });
});
