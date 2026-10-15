import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectDBMock = vi.fn();
const findOneAndUpdateMock = vi.fn();
const findMock = vi.fn();
const readFileMock = vi.fn();
const writeJsonFileAtomicallyMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({ default: connectDBMock }));
vi.mock('@/lib/models/WorkflowNotification', () => ({
  default: {
    findOneAndUpdate: findOneAndUpdateMock,
    find: findMock,
  },
}));
vi.mock('fs/promises', () => ({
  default: {
    readFile: readFileMock,
  },
  readFile: readFileMock,
}));
vi.mock('@/lib/storage/atomicStorage', () => ({
  writeJsonFileAtomically: writeJsonFileAtomicallyMock,
}));

describe('Workflow Notification Storage & Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
  });

  describe('Deduplication in file fallback mode', () => {
    it('suppresses duplicates when a record with the same dedupeKey exists', async () => {
      const existingNotification = {
        id: 'notif-existing',
        recipientId: 'user-1',
        recipientEmail: 'reporter@lokswami.com',
        eventType: 'assigned',
        contentType: 'story',
        contentId: 'story-123',
        publicationType: null,
        title: 'Story 123',
        message: 'Assigned',
        messageHi: 'असाइन किया गया',
        href: '/admin/stories/story-123/edit',
        dedupeKey: 'story:story-123:assign:reporter@lokswami.com:2026-09-21',
        readAt: null,
        createdAt: '2026-09-21T10:00:00.000Z',
      };

      readFileMock.mockResolvedValue(JSON.stringify([existingNotification]));

      const { createWorkflowNotification } = await import('@/lib/storage/workflowNotifications');

      const result = await createWorkflowNotification({
        recipientId: 'user-1',
        recipientEmail: 'reporter@lokswami.com',
        eventType: 'assigned',
        contentType: 'story',
        contentId: 'story-123',
        publicationType: null,
        title: 'Story 123',
        message: 'Assigned',
        messageHi: 'असाइन किया गया',
        href: '/admin/stories/story-123/edit',
        dedupeKey: 'story:story-123:assign:reporter@lokswami.com:2026-09-21',
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe('notif-existing');
      // No file write should have been triggered because it already exists
      expect(writeJsonFileAtomicallyMock).not.toHaveBeenCalled();
    });

    it('creates new notification when dedupeKey is distinct', async () => {
      readFileMock.mockResolvedValue('[]');
      writeJsonFileAtomicallyMock.mockResolvedValue(undefined);

      const { createWorkflowNotification } = await import('@/lib/storage/workflowNotifications');

      const result = await createWorkflowNotification({
        recipientId: 'user-1',
        recipientEmail: 'reporter@lokswami.com',
        eventType: 'review_started',
        contentType: 'story',
        contentId: 'story-123',
        publicationType: null,
        title: 'Story 123',
        message: 'Review started',
        messageHi: 'समीक्षा शुरू',
        href: '/admin/stories/story-123/edit',
        dedupeKey: 'story:story-123:start_review:reporter@lokswami.com:2026-09-21',
      });

      expect(result).toBeDefined();
      expect(result?.eventType).toBe('review_started');
      expect(writeJsonFileAtomicallyMock).toHaveBeenCalledOnce();
      expect(writeJsonFileAtomicallyMock).toHaveBeenCalledWith(
        expect.stringContaining('workflow-notifications.json'),
        expect.arrayContaining([
          expect.objectContaining({
            dedupeKey: 'story:story-123:start_review:reporter@lokswami.com:2026-09-21',
          }),
        ])
      );
    });
  });

  describe('Deduplication in MongoDB mode', () => {
    it('uses findOneAndUpdate with upsert:true on dedupeKey', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami_test';

      const mongoLeanMock = vi.fn().mockResolvedValue({
        _id: 'mongo-id-1',
        recipientId: 'user-1',
        recipientEmail: 'reporter@lokswami.com',
        eventType: 'assigned',
        contentType: 'article',
        contentId: 'art-1',
        publicationType: null,
        title: 'Article 1',
        message: 'Assigned',
        messageHi: 'असाइन किया गया',
        href: '/admin/articles/art-1/edit',
        dedupeKey: 'article:art-1:assign:reporter@lokswami.com:2026-09-21',
        readAt: null,
        createdAt: '2026-09-21T10:00:00.000Z',
      });

      findOneAndUpdateMock.mockReturnValue({ lean: mongoLeanMock });

      const { createWorkflowNotification } = await import('@/lib/storage/workflowNotifications');

      const result = await createWorkflowNotification({
        recipientId: 'user-1',
        recipientEmail: 'reporter@lokswami.com',
        eventType: 'assigned',
        contentType: 'article',
        contentId: 'art-1',
        publicationType: null,
        title: 'Article 1',
        message: 'Assigned',
        messageHi: 'असाइन किया गया',
        href: '/admin/articles/art-1/edit',
        dedupeKey: 'article:art-1:assign:reporter@lokswami.com:2026-09-21',
      });

      expect(connectDBMock).toHaveBeenCalled();
      expect(findOneAndUpdateMock).toHaveBeenCalledWith(
        { dedupeKey: 'article:art-1:assign:reporter@lokswami.com:2026-09-21' },
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            dedupeKey: 'article:art-1:assign:reporter@lokswami.com:2026-09-21',
          }),
        }),
        { upsert: true, new: true }
      );
      expect(result?.id).toBe('mongo-id-1');
    });
  });
});
