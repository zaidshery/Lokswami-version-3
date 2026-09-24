import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStoryVersionMatch,
  extractExpectedStoryVersion,
  parseExpectedStoryVersion,
  resolveStoryVersion,
  StoryEditorialService,
  StoryExpectedVersionError,
  StoryForbiddenError,
  StoryNotFoundError,
  StoryValidationError,
  StoryVersionConflictError,
  updateStoryWithCas,
  deleteStoryWithCas,
} from '@/lib/server/storyEditorialService';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

const {
  connectDBMock,
  getStoredStoryByIdMock,
  updateStoredStoryMock,
  deleteStoredStoryMock,
  recordStoryActivityMock,
  notifyWorkflowEventMock,
  getStoryVideoMonthlyUsageSummaryMock,
  mockFindById,
  mockFindOneAndUpdate,
  mockFindOneAndDelete,
  mockFindByIdAndDelete,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(),
  getStoredStoryByIdMock: vi.fn(),
  updateStoredStoryMock: vi.fn(),
  deleteStoredStoryMock: vi.fn(),
  recordStoryActivityMock: vi.fn(),
  notifyWorkflowEventMock: vi.fn(),
  getStoryVideoMonthlyUsageSummaryMock: vi.fn(),
  mockFindById: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockFindOneAndDelete: vi.fn(),
  mockFindByIdAndDelete: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
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
    deleteStoredStory: deleteStoredStoryMock,
    getStoredStoryById: getStoredStoryByIdMock,
    updateStoredStory: updateStoredStoryMock,
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
    findOneAndDelete: mockFindOneAndDelete,
    findByIdAndDelete: mockFindByIdAndDelete,
  },
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

describe('Story Version & CAS Concurrency (Phase 3.7B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getStoryVideoMonthlyUsageSummaryMock.mockResolvedValue({});
  });

  describe('TASK 2 — Canonical Story Version Semantics', () => {
    it('resolves valid integer versions and defaults legacy/missing to 1', () => {
      expect(resolveStoryVersion(1)).toBe(1);
      expect(resolveStoryVersion(5)).toBe(5);
      expect(resolveStoryVersion(undefined)).toBe(1);
      expect(resolveStoryVersion(null)).toBe(1);
      expect(resolveStoryVersion(0)).toBe(1);
      expect(resolveStoryVersion(-3)).toBe(1);
      expect(resolveStoryVersion('2')).toBe(1);
      expect(resolveStoryVersion(1.5)).toBe(1);
    });

    it('parses expectedStoryVersion correctly', () => {
      expect(parseExpectedStoryVersion(1)).toBe(1);
      expect(parseExpectedStoryVersion('2')).toBe(2);
      expect(parseExpectedStoryVersion('invalid')).toBe(null);
      expect(parseExpectedStoryVersion(0)).toBe(null);
      expect(parseExpectedStoryVersion(-1)).toBe(null);
      expect(parseExpectedStoryVersion(null)).toBe(null);
      expect(parseExpectedStoryVersion(undefined)).toBe(null);
    });

    it('extracts expectedStoryVersion identifying provided vs missing vs malformed', () => {
      expect(extractExpectedStoryVersion(undefined)).toEqual({ provided: false, version: null });
      expect(extractExpectedStoryVersion(null)).toEqual({ provided: false, version: null });
      expect(extractExpectedStoryVersion('')).toEqual({ provided: false, version: null });
      expect(extractExpectedStoryVersion(3)).toEqual({ provided: true, version: 3 });
      expect(extractExpectedStoryVersion('4')).toEqual({ provided: true, version: 4 });
      expect(extractExpectedStoryVersion('abc')).toEqual({ provided: true, version: null });
      expect(extractExpectedStoryVersion(0)).toEqual({ provided: true, version: null });
      expect(extractExpectedStoryVersion(-5)).toEqual({ provided: true, version: null });
    });

    it('builds MongoDB version predicate handling version 1 and legacy unversioned records', () => {
      expect(buildStoryVersionMatch(1)).toEqual({
        $or: [{ version: 1 }, { version: { $exists: false } }],
      });
      expect(buildStoryVersionMatch(2)).toEqual({ version: 2 });
      expect(buildStoryVersionMatch(10)).toEqual({ version: 10 });
    });

    it('initializes new Story with canonical version 1 in resolveStoryVersion', () => {
      const createdRecord = {
        _id: 'story-new-1',
        title: 'New Story',
      };
      expect(resolveStoryVersion((createdRecord as { version?: unknown }).version)).toBe(1);
      expect(resolveStoryVersion(1)).toBe(1);
    });
  });

  describe('TASK 5 & 6 — MongoDB CAS & Legacy Compatibility', () => {
    beforeEach(() => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami';
      connectDBMock.mockResolvedValue(undefined);
    });

    it('successfully updates Mongo story with CAS and increments version atomically', async () => {
      const storyId = '507f1f77bcf86cd799439011';
      const updatedRecord = {
        _id: storyId,
        title: 'Updated Title',
        version: 3,
        updatedAt: new Date(),
      };

      mockFindOneAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedRecord),
      });

      const result = await updateStoryWithCas(
        storyId,
        { title: 'Updated Title' },
        2,
        'mongo'
      );

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { _id: storyId, version: 2 },
        expect.objectContaining({
          $set: expect.objectContaining({ title: 'Updated Title' }),
          $inc: { version: 1 },
        }),
        { new: true, runValidators: true }
      );
      expect(result.version).toBe(3);
    });

    it('upgrades legacy story without version field atomically to version 2', async () => {
      const storyId = '507f1f77bcf86cd799439011';
      const updatedRecord = {
        _id: storyId,
        title: 'Legacy Upgraded',
        version: 2,
        updatedAt: new Date(),
      };

      mockFindOneAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedRecord),
      });

      const result = await updateStoryWithCas(
        storyId,
        { title: 'Legacy Upgraded' },
        1,
        'mongo'
      );

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: storyId,
          $or: [{ version: 1 }, { version: { $exists: false } }],
        },
        expect.objectContaining({
          $set: expect.objectContaining({ title: 'Legacy Upgraded', version: 2 }),
        }),
        { new: true, runValidators: true }
      );
      expect(result.version).toBe(2);
    });

    it('throws StoryVersionConflictError when expectedVersion is stale in Mongo', async () => {
      const storyId = '507f1f77bcf86cd799439011';
      // Atomic query matches 0 documents because version in DB has moved to 3
      mockFindOneAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      // Verification findById shows current version is 3
      mockFindById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ _id: storyId, version: 3 }),
        }),
      });

      await expect(
        updateStoryWithCas(storyId, { title: 'Stale Update' }, 2, 'mongo')
      ).rejects.toThrow(StoryVersionConflictError);
    });

    it('throws StoryNotFoundError when document does not exist in Mongo', async () => {
      const storyId = '507f1f77bcf86cd799439011';
      mockFindOneAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      mockFindById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        updateStoryWithCas(storyId, { title: 'Update' }, 1, 'mongo')
      ).rejects.toThrow(StoryNotFoundError);
    });
  });

  describe('TASK 7 — File Fallback CAS Parity', () => {
    it('delegates to updateStoredStory with expectedVersion and returns incremented version', async () => {
      const storyId = 'story-1';
      const updatedStory = {
        _id: storyId,
        title: 'Updated in File',
        version: 2,
      };
      updateStoredStoryMock.mockResolvedValue(updatedStory);

      const result = await updateStoryWithCas(
        storyId,
        { title: 'Updated in File' },
        1,
        'file'
      );

      expect(updateStoredStoryMock).toHaveBeenCalledWith(
        storyId,
        { title: 'Updated in File' },
        { expectedVersion: 1 }
      );
      expect(result.version).toBe(2);
    });

    it('propagates StoryVersionConflictError on stale expectedVersion in file store', async () => {
      const storyId = 'story-1';
      const error = new StoryVersionConflictError(3);
      updateStoredStoryMock.mockRejectedValue(error);

      await expect(
        updateStoryWithCas(storyId, { title: 'Stale File Update' }, 1, 'file')
      ).rejects.toThrow(StoryVersionConflictError);
    });
  });

  describe('TASK 15 — Competing Writes Concurrency Test', () => {
    it('simulates two competing writers: exactly one wins and exactly one conflicts', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami';
      connectDBMock.mockResolvedValue(undefined);

      const storyId = '507f1f77bcf86cd799439011';
      let dbVersion = 1;

      // Simulate atomic Mongo findOneAndUpdate behavior
      mockFindOneAndUpdate.mockImplementation((filter, update) => ({
        lean: vi.fn().mockImplementation(async () => {
          const matchVersion1 = filter.$or ? dbVersion === 1 : filter.version === dbVersion;
          if (matchVersion1) {
            dbVersion = 2; // Writer 1 updates version
            return { _id: storyId, version: 2, title: update.$set.title };
          }
          // Writer 2 fails match because version is now 2
          return null;
        }),
      }));

      mockFindById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockImplementation(async () => ({ _id: storyId, version: dbVersion })),
        }),
      });

      // Both writers start with expectedVersion: 1
      const writer1 = updateStoryWithCas(storyId, { title: 'Writer 1' }, 1, 'mongo');
      const writer2 = updateStoryWithCas(storyId, { title: 'Writer 2' }, 1, 'mongo');

      const results = await Promise.allSettled([writer1, writer2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const winner = (fulfilled[0] as PromiseFulfilledResult<{ version: unknown }>).value;
      expect(winner.version).toBe(2);

      const loser = (rejected[0] as PromiseRejectedResult).reason;
      expect(loser).toBeInstanceOf(StoryVersionConflictError);
      expect((loser as StoryVersionConflictError).currentVersion).toBe(2);
    });
  });

  describe('TASK 8 & 11 — Editorial Service Boundary & Workflow Races', () => {
    const adminUser: AdminSessionIdentity = {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin',
    };

    const reporterUser: AdminSessionIdentity = {
      id: 'reporter-1',
      name: 'Reporter User',
      email: 'reporter@example.com',
      username: 'reporter',
      role: 'reporter',
    };

    it('rejects ordinary Story edit when expectedVersion is missing or malformed', async () => {
      await expect(
        StoryEditorialService.updateStoryEditorial(
          'story-1',
          { title: 'New Title' }, // missing expectedVersion
          adminUser,
          'file'
        )
      ).rejects.toThrow(StoryExpectedVersionError);

      await expect(
        StoryEditorialService.updateStoryEditorial(
          'story-1',
          { title: 'New Title', expectedVersion: 'not-an-int' },
          adminUser,
          'file'
        )
      ).rejects.toThrow(StoryExpectedVersionError);
    });

    it('rejects ordinary Story edit attempting to mutate publication invariants (3.7A)', async () => {
      await expect(
        StoryEditorialService.updateStoryEditorial(
          'story-1',
          { title: 'New Title', isPublished: true, expectedVersion: 1 },
          adminUser,
          'file'
        )
      ).rejects.toThrow(StoryValidationError);

      expect(getStoredStoryByIdMock).not.toHaveBeenCalled();
      expect(updateStoredStoryMock).not.toHaveBeenCalled();
    });

    it('prevents a stale editor save from overwriting a newer workflow transition (Workflow Race)', async () => {
      // Story was transitioned to review (version moved from 5 to 6)
      const storyInReview = {
        _id: 'story-1',
        title: 'Story in Review',
        version: 6,
        workflow: {
          status: 'in_review',
          assignedTo: { id: 'copy-1', name: 'Copy', email: 'c@e.com', role: 'copy_editor' },
        },
      };

      getStoredStoryByIdMock.mockResolvedValue(storyInReview);

      // Editor attempts save with stale expectedVersion 5
      await expect(
        StoryEditorialService.updateStoryEditorial(
          'story-1',
          { title: 'Stale Editor Save', expectedVersion: 5 },
          adminUser,
          'file'
        )
      ).rejects.toThrow(StoryVersionConflictError);

      // Persistence was not called
      expect(updateStoredStoryMock).not.toHaveBeenCalled();
      // No activity was recorded
      expect(recordStoryActivityMock).not.toHaveBeenCalled();
    });

    it('produces NO activity and NO notification on CAS conflict during workflow action', async () => {
      const currentStory = {
        _id: 'story-1',
        title: 'Story Title',
        version: 2,
        workflow: {
          status: 'submitted',
        },
      };

      getStoredStoryByIdMock.mockResolvedValue(currentStory);

      // Workflow action called with stale expectedVersion: 1
      await expect(
        StoryEditorialService.applyStoryWorkflowAction(
          'story-1',
          { action: 'start_review', expectedVersion: 1 },
          adminUser,
          'file'
        )
      ).rejects.toThrow(StoryVersionConflictError);

      expect(updateStoredStoryMock).not.toHaveBeenCalled();
      expect(recordStoryActivityMock).not.toHaveBeenCalled();
      expect(notifyWorkflowEventMock).not.toHaveBeenCalled();
    });

    it('enforces RBAC: non-permitted users cannot perform CAS edits or transitions', async () => {
      const unassignedStory = {
        _id: 'story-1',
        title: 'Other Story',
        version: 1,
        workflow: {
          status: 'in_review',
          createdBy: { id: 'other-reporter', name: 'Other', email: 'o@e.com', role: 'reporter' },
        },
      };

      getStoredStoryByIdMock.mockResolvedValue(unassignedStory);

      // Reporter cannot edit another reporter's story in review
      await expect(
        StoryEditorialService.updateStoryEditorial(
          'story-1',
          { title: 'Hacked Edit', expectedVersion: 1 },
          reporterUser,
          'file'
        )
      ).rejects.toThrow(StoryForbiddenError);

      expect(updateStoredStoryMock).not.toHaveBeenCalled();
    });
  });

  describe('TASK 12 — Media and Asset Preservation', () => {
    it('preserves existing story media assets and video production metadata on text edit', async () => {
      const adminUser: AdminSessionIdentity = {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@example.com',
        username: 'admin',
        role: 'admin',
      };

      const existingStory = {
        _id: 'story-1',
        title: 'Original Title',
        caption: 'Original Caption',
        mediaType: 'video',
        mediaKey: 'raw-videos/clip1.mp4',
        mediaSizeBytes: 1048576,
        mediaMimeType: 'video/mp4',
        storageProvider: 'digitalocean_spaces',
        mediaAssets: [
          {
            id: 'asset-1',
            type: 'video',
            url: 'https://spaces.example.com/clip1.mp4',
            isPrimary: true,
          },
        ],
        videoProduction: {
          status: 'ready_to_publish',
          masterExportUrl: 'https://spaces.example.com/master.mp4',
        },
        version: 1,
        workflow: {
          status: 'draft',
        },
      };

      getStoredStoryByIdMock.mockResolvedValue(existingStory);
      updateStoredStoryMock.mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({
        ...existingStory,
        ...updates,
        version: 2,
      }));

      // Edit only the title
      const result = await StoryEditorialService.updateStoryEditorial(
        'story-1',
        { title: 'New Story Title', expectedVersion: 1 },
        adminUser,
        'file'
      );

      expect(updateStoredStoryMock).toHaveBeenCalledWith(
        'story-1',
        expect.objectContaining({
          title: 'New Story Title',
        }),
        { expectedVersion: 1 }
      );
      // Untouched media and video fields must not be overwritten or cleared
      expect(result.story.title).toBe('New Story Title');
      expect(result.story.mediaKey).toBe('raw-videos/clip1.mp4');
      expect(result.story.mediaType).toBe('video');
      expect(result.story.storageProvider).toBe('digitalocean_spaces');
      expect((result.story.videoProduction as { status?: string })?.status).toBe('ready_to_publish');
      expect((result.story.videoProduction as { masterExportUrl?: string })?.masterExportUrl).toBe('https://spaces.example.com/master.mp4');
      expect(result.story.version).toBe(2);
    });
  });

  describe('DELETE with CAS', () => {
    const adminUser: AdminSessionIdentity = {
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin',
    };

    it('successfully deletes story with expectedVersion in file store', async () => {
      deleteStoredStoryMock.mockResolvedValue(true);

      const success = await StoryEditorialService.deleteStoryEditorial(
        'story-1',
        2,
        adminUser,
        'file'
      );

      expect(deleteStoredStoryMock).toHaveBeenCalledWith('story-1', { expectedVersion: 2 });
      expect(success).toBe(true);
    });

    it('rejects deletion on stale expectedVersion in file store', async () => {
      deleteStoredStoryMock.mockRejectedValue(new StoryVersionConflictError(3));

      await expect(
        StoryEditorialService.deleteStoryEditorial('story-1', 2, adminUser, 'file')
      ).rejects.toThrow(StoryVersionConflictError);
    });
  });
});
