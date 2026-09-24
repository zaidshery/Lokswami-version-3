import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStoryRevisionSnapshot,
  StoryEditorialService,
  StoryExpectedVersionError,
  StoryForbiddenError,
  StoryNotFoundError,
  StoryVersionConflictError,
  updateStoryWithCas,
} from '@/lib/server/storyEditorialService';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

const {
  connectDBMock,
  getStoredStoryByIdMock,
  updateStoredStoryMock,
  recordStoryActivityMock,
  notifyWorkflowEventMock,
  getStoryVideoMonthlyUsageSummaryMock,
  mockFindById,
  mockFindOneAndUpdate,
  assertStoryLeaseNotHeldByOtherMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(),
  getStoredStoryByIdMock: vi.fn(),
  updateStoredStoryMock: vi.fn(),
  recordStoryActivityMock: vi.fn(),
  notifyWorkflowEventMock: vi.fn(),
  getStoryVideoMonthlyUsageSummaryMock: vi.fn(),
  mockFindById: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  assertStoryLeaseNotHeldByOtherMock: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/server/storyLockService', () => ({
  assertStoryLeaseNotHeldByOther: assertStoryLeaseNotHeldByOtherMock,
  deleteStoryLock: vi.fn().mockResolvedValue(true),
  StoryEditLeaseConflictError: class MockStoryEditLeaseConflictError extends Error {
    readonly code = 'STORY_EDIT_LEASE_CONFLICT';
    readonly status = 409;
    constructor(message = 'Locked') {
      super(message);
      this.name = 'StoryEditLeaseConflictError';
    }
  },
}));

vi.mock('@/lib/storage/storiesFile', async () => {
  class MockStoryVersionConflictError extends Error {
    readonly currentVersion: number;
    readonly code = 'STORY_VERSION_CONFLICT';
    constructor(currentVersion: number) {
      super('This story was updated elsewhere. Refresh before saving again.');
      this.name = 'StoryVersionConflictError';
      this.currentVersion = currentVersion;
    }
  }

  return {
    StoryVersionConflictError: MockStoryVersionConflictError,
    isStoryVersionConflictError: (error: unknown): error is MockStoryVersionConflictError =>
      error instanceof MockStoryVersionConflictError,
    createStoredStory: vi.fn(),
    deleteStoredStory: vi.fn(),
    getStoredStoryById: getStoredStoryByIdMock,
    updateStoredStory: updateStoredStoryMock,
    MAX_STORED_STORY_REVISIONS: 30,
  };
});

vi.mock('@/lib/server/storyActivity', () => ({
  buildStoryActivityMessage: vi.fn(() => 'Story activity'),
  recordStoryActivity: recordStoryActivityMock,
}));

vi.mock('@/lib/server/workflowNotificationEvents', () => ({
  notifyWorkflowEvent: notifyWorkflowEventMock,
}));

vi.mock('@/lib/server/storyVideoUsage', () => ({
  getStoryVideoMonthlyUsageSummary: getStoryVideoMonthlyUsageSummaryMock,
}));

vi.mock('@/lib/models/Story', () => ({
  default: {
    findById: mockFindById,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

describe('Story Revisions & Restore (Phase 3.7C)', () => {
  const adminUser: AdminSessionIdentity = {
    id: 'admin-1',
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin User',
    role: 'admin',
  };

  const reporterUser: AdminSessionIdentity = {
    id: 'reporter-1',
    email: 'reporter@example.com',
    username: 'reporter',
    name: 'Reporter User',
    role: 'reporter',
  };

  const otherReporter: AdminSessionIdentity = {
    id: 'reporter-2',
    email: 'other@example.com',
    username: 'other',
    name: 'Other Reporter',
    role: 'reporter',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    connectDBMock.mockResolvedValue(undefined);
    assertStoryLeaseNotHeldByOtherMock.mockResolvedValue(undefined);
    getStoryVideoMonthlyUsageSummaryMock.mockResolvedValue({
      provider: 'digitalocean_spaces',
      totalBytes: 1000,
      totalCount: 1,
      alertTriggered: false,
      message: '',
    });
  });

  describe('TASK 2 & 3: Revision Snapshot & Bounded Retention', () => {
    it('buildStoryRevisionSnapshot captures media assets and video production metadata', () => {
      const mockStory = {
        _id: 'story-1',
        version: 3,
        title: 'Breaking Video Story',
        caption: 'Story caption text',
        thumbnail: 'https://example.com/thumb.jpg',
        mediaType: 'video',
        mediaUrl: 'https://spaces.example.com/video.mp4',
        mediaKey: 'raw-videos/clip1.mp4',
        mediaSizeBytes: 2048,
        mediaMimeType: 'video/mp4',
        storageProvider: 'digitalocean_spaces',
        mediaAssets: [
          {
            id: 'asset-1',
            kind: 'video',
            url: 'https://spaces.example.com/video.mp4',
            key: 'raw-videos/clip1.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 2048,
            storageProvider: 'digitalocean_spaces',
            originalFileName: 'clip1.mp4',
            order: 0,
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        videoProduction: {
          status: 'ready_to_publish',
          masterExportUrl: 'https://spaces.example.com/master.mp4',
          editorNotes: 'Color graded and subtitled',
        },
        category: 'National',
        author: 'Reporter One',
        workflow: {
          status: 'draft',
          priority: 'high',
        },
      };

      const snapshot = buildStoryRevisionSnapshot(mockStory, adminUser, 'Updated video master');

      expect(snapshot.version).toBe(3);
      expect(snapshot.title).toBe('Breaking Video Story');
      expect(snapshot.caption).toBe('Story caption text');
      expect(snapshot.mediaType).toBe('video');
      expect(snapshot.mediaAssets).toHaveLength(1);
      expect(snapshot.mediaAssets[0].key).toBe('raw-videos/clip1.mp4');
      expect(snapshot.videoProduction?.masterExportUrl).toBe('https://spaces.example.com/master.mp4');
      expect(snapshot.savedBy?.email).toBe('admin@example.com');
      expect(snapshot.changeReason).toBe('Updated video master');
      expect(snapshot.workflow?.status).toBe('draft');
      expect(snapshot.workflow?.priority).toBe('high');
    });

    it('creates revision on manual edit and passes snapshot to Mongo update CAS with $slice: -30', async () => {
      const validObjectId = '507f1f77bcf86cd799439011';
      const existingMongoStory = {
        _id: validObjectId,
        version: 2,
        title: 'Original Title',
        caption: 'Original Caption',
        thumbnail: 'https://example.com/thumb.jpg',
        mediaType: 'image',
        category: 'General',
        workflow: { status: 'draft', priority: 'normal', createdBy: { id: adminUser.id } },
        revisions: [],
      };

      mockFindById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(existingMongoStory),
      });

      mockFindOneAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          ...existingMongoStory,
          version: 3,
          title: 'Manual Save Title',
        }),
      });

      const result = await StoryEditorialService.updateStoryEditorial(
        validObjectId,
        { title: 'Manual Save Title', expectedVersion: 2, changeReason: 'Refined headline' },
        adminUser,
        'mongo'
      );

      expect(result.story.version).toBe(3);
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: validObjectId }),
        expect.objectContaining({
          $push: {
            revisions: {
              $each: [
                expect.objectContaining({
                  title: 'Original Title',
                  version: 2,
                  changeReason: 'Refined headline',
                }),
              ],
              $slice: -30,
            },
          },
        }),
        expect.anything()
      );

      expect(recordStoryActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId: validObjectId,
          action: 'saved',
        })
      );
    });

    it('suppresses revision creation and activity log on autosave (skipRevision: true)', async () => {
      const validObjectId = '507f1f77bcf86cd799439011';
      const existingMongoStory = {
        _id: validObjectId,
        version: 2,
        title: 'Original Title',
        caption: 'Original Caption',
        thumbnail: 'https://example.com/thumb.jpg',
        mediaType: 'image',
        category: 'General',
        workflow: { status: 'draft', priority: 'normal', createdBy: { id: adminUser.id } },
        revisions: [],
      };

      mockFindById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(existingMongoStory),
      });

      mockFindOneAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          ...existingMongoStory,
          version: 3,
          title: 'Autosaved Title',
        }),
      });

      const result = await StoryEditorialService.updateStoryEditorial(
        validObjectId,
        { title: 'Autosaved Title', expectedVersion: 2, autosave: true },
        adminUser,
        'mongo'
      );

      expect(result.story.version).toBe(3);
      // On autosave, $push for revisions should NOT be present in Mongo update
      const updateArgs = mockFindOneAndUpdate.mock.calls[0][1];
      expect(updateArgs.$push).toBeUndefined();

      // Activity log must NOT be spammed on routine autosaves
      expect(recordStoryActivityMock).not.toHaveBeenCalled();
    });
  });

  describe('TASK 4: Story Revision API & Ordering', () => {
    it('returns revisions sorted descending by savedAt (newest first)', async () => {
      const storyId = 'story-1';
      const revisions = [
        { _id: 'rev-1', version: 1, title: 'Old Rev', savedAt: '2026-09-01T10:00:00.000Z' },
        { _id: 'rev-3', version: 3, title: 'Newest Rev', savedAt: '2026-09-03T10:00:00.000Z' },
        { _id: 'rev-2', version: 2, title: 'Middle Rev', savedAt: '2026-09-02T10:00:00.000Z' },
      ];

      getStoredStoryByIdMock.mockResolvedValue({
        _id: storyId,
        version: 4,
        title: 'Current Story',
        workflow: { status: 'draft', createdBy: { id: adminUser.id } },
        revisions,
      });

      const result = await StoryEditorialService.getStoryRevisions(storyId, adminUser, 'file');

      expect(result).toHaveLength(3);
      expect(result[0]._id).toBe('rev-3');
      expect(result[1]._id).toBe('rev-2');
      expect(result[2]._id).toBe('rev-1');
    });

    it('enforces RBAC: reporters cannot view revisions for another reporter restricted draft', async () => {
      const storyId = 'story-restricted';
      getStoredStoryByIdMock.mockResolvedValue({
        _id: storyId,
        version: 2,
        title: 'Private Reporter Draft',
        workflow: {
          status: 'draft',
          createdBy: { id: 'reporter-999', email: 'other@example.com' },
        },
        revisions: [{ _id: 'rev-1', version: 1, title: 'Draft v1', savedAt: '2026-09-01T00:00:00Z' }],
      });

      await expect(
        StoryEditorialService.getStoryRevisions(storyId, reporterUser, 'file')
      ).rejects.toThrow(StoryForbiddenError);
    });
  });

  describe('TASK 5: CAS-Protected Restore Semantics', () => {
    it('successfully restores revision, increments version once, creates pre-restore snapshot, and logs activity', async () => {
      const storyId = 'story-1';
      const targetRevision = {
        _id: 'rev-1',
        version: 1,
        title: 'Original Good Title',
        caption: 'Restored Caption',
        thumbnail: 'https://example.com/thumb.jpg',
        mediaType: 'video',
        mediaKey: 'keys/rev1.mp4',
        mediaSizeBytes: 4096,
        mediaMimeType: 'video/mp4',
        storageProvider: 'digitalocean_spaces',
        mediaAssets: [
          {
            id: 'asset-1',
            kind: 'video',
            url: 'https://spaces.example.com/video1.mp4',
            key: 'keys/rev1.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 4096,
            storageProvider: 'digitalocean_spaces',
            originalFileName: 'video1.mp4',
            order: 0,
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        videoProduction: {
          status: 'ready_to_publish',
          masterExportUrl: 'https://spaces.example.com/master1.mp4',
        },
        category: 'Politics',
        author: 'Reporter One',
        savedAt: '2026-09-01T00:00:00.000Z',
      };

      const currentStory = {
        _id: storyId,
        version: 2,
        title: 'Accidentally Ruined Title',
        caption: 'Ruined Caption',
        thumbnail: 'https://example.com/ruined.jpg',
        mediaType: 'image',
        category: 'General',
        workflow: {
          status: 'in_review',
          priority: 'normal',
          createdBy: { id: adminUser.id },
        },
        isPublished: false,
        revisions: [targetRevision],
      };

      getStoredStoryByIdMock.mockResolvedValue(currentStory);
      updateStoredStoryMock.mockImplementation(async (id, updates, options) => {
        expect(options.expectedVersion).toBe(2);
        expect(options.skipRevision).toBe(false);
        expect(options.revisionSnapshot.title).toBe('Accidentally Ruined Title');
        return {
          ...currentStory,
          ...updates,
          version: 3,
        };
      });

      const result = await StoryEditorialService.restoreStoryRevision(
        storyId,
        'rev-1',
        2,
        adminUser,
        'file'
      );

      // Version advanced from 2 to 3
      expect(result.story.version).toBe(3);
      expect(result.story.title).toBe('Original Good Title');
      expect(result.story.caption).toBe('Restored Caption');
      expect(result.story.mediaType).toBe('video');
      expect((result.story.videoProduction as { masterExportUrl?: string })?.masterExportUrl).toBe(
        'https://spaces.example.com/master1.mp4'
      );

      // Workflow status must remain unchanged (in_review, NOT published)
      expect((result.story.workflow as { status?: string })?.status).toBe('in_review');
      expect(result.story.isPublished).toBe(false);

      // Activity log recorded
      expect(recordStoryActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId,
          action: 'saved',
          metadata: expect.objectContaining({ revisionId: 'rev-1', revisionVersion: 1 }),
        })
      );
    });

    it('rejects restore with HTTP 409 when expectedVersion is stale (Restore CAS Race)', async () => {
      const storyId = 'story-1';
      const currentStory = {
        _id: storyId,
        version: 3, // Already updated by another editor to v3
        title: 'Concurrent Edit Title',
        workflow: { status: 'draft', createdBy: { id: adminUser.id } },
        revisions: [
          { _id: 'rev-1', version: 1, title: 'Draft v1', savedAt: '2026-09-01T00:00:00Z' },
        ],
      };

      getStoredStoryByIdMock.mockResolvedValue(currentStory);

      // Client attempts restore with expectedVersion: 2 (stale!)
      await expect(
        StoryEditorialService.restoreStoryRevision(storyId, 'rev-1', 2, adminUser, 'file')
      ).rejects.toThrow(StoryVersionConflictError);

      // No mutation or activity should have happened
      expect(updateStoredStoryMock).not.toHaveBeenCalled();
      expect(recordStoryActivityMock).not.toHaveBeenCalled();
    });

    it('throws StoryNotFoundError when revision ID does not exist', async () => {
      const storyId = 'story-1';
      getStoredStoryByIdMock.mockResolvedValue({
        _id: storyId,
        version: 2,
        title: 'Story',
        workflow: { status: 'draft', createdBy: { id: adminUser.id } },
        revisions: [],
      });

      await expect(
        StoryEditorialService.restoreStoryRevision(storyId, 'non-existent-rev', 2, adminUser, 'file')
      ).rejects.toThrow(StoryNotFoundError);
    });
  });
});
