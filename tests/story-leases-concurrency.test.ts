import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireOrRenewStoryLock,
  getActiveStoryLock,
  releaseStoryLock,
  takeOverStoryLock,
  assertStoryLeaseNotHeldByOther,
  StoryEditLeaseConflictError,
  deleteStoryLock,
} from '@/lib/server/storyLockService';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  getActiveStoredStoryLock,
  acquireOrRenewStoredStoryLock,
  releaseStoredStoryLock,
  } from '@/lib/storage/storyLocksFile';

const {
  connectDBMock,
  mockFindOne,
  mockFindOneAndUpdate,
  mockFindOneAndDelete,
  mockDeleteMany,
  mockDeleteOne,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(),
  mockFindOne: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockFindOneAndDelete: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockDeleteOne: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/StoryLock', () => ({
  default: {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
    findOneAndDelete: mockFindOneAndDelete,
    deleteMany: mockDeleteMany,
    deleteOne: mockDeleteOne,
  },
}));

vi.mock('@/lib/storage/storyLocksFile', () => ({
  getActiveStoredStoryLock: vi.fn(),
  acquireOrRenewStoredStoryLock: vi.fn(),
  releaseStoredStoryLock: vi.fn(),
  }));

describe('Story Edit Leases & Concurrency (Phase 3.7C)', () => {
  const editorA: AdminSessionIdentity = {
    id: 'editor-a',
    email: 'editor.a@example.com',
    username: 'editor.a',
    name: 'Editor Alpha',
    role: 'copy_editor',
  };

  const editorB: AdminSessionIdentity = {
    id: 'editor-b',
    email: 'editor.b@example.com',
    username: 'editor.b',
    name: 'Editor Beta',
    role: 'reporter',
  };

  const adminEditor: AdminSessionIdentity = {
    id: 'admin-1',
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin Boss',
    role: 'admin',
  };

  const storyId = 'story-lock-1';

  beforeEach(() => {
    vi.clearAllMocks();
    connectDBMock.mockResolvedValue(undefined);
  });

  describe('TASK 6 & 18: File Storage Lock Concurrency', () => {
    it('allows Editor A to acquire lock when unheld', async () => {
      const now = new Date();
      vi.mocked(getActiveStoredStoryLock).mockResolvedValueOnce(null);
      vi.mocked(acquireOrRenewStoredStoryLock).mockResolvedValueOnce({
        storyId,
        userId: editorA.id,
        userName: editorA.name,
        userRole: editorA.role,
        lockedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60000).toISOString(),
      });

      const result = await acquireOrRenewStoryLock(storyId, editorA);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lock.userId).toBe(editorA.id);
        expect(result.lock.isCurrentUser).toBe(true);
      }
    });

    it('denies Editor B when active lock is held by Editor A (409 Conflict)', async () => {
      const now = new Date();
      vi.mocked(getActiveStoredStoryLock).mockResolvedValueOnce({
        storyId,
        userId: editorA.id,
        userName: editorA.name,
        userRole: editorA.role,
        lockedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 50000).toISOString(),
      });

      const result = await acquireOrRenewStoryLock(storyId, editorB);

      expect(result.success).toBe(false);
      if (!result.success && result.status === 409) {
        expect(result.code).toBe('STORY_EDIT_LEASE_CONFLICT');
        expect(result.holder.userId).toBe(editorA.id);
      }
    });

    it('allows same holder (Editor A) to renew/heartbeat the lease', async () => {
      const now = new Date();
      vi.mocked(getActiveStoredStoryLock).mockResolvedValueOnce({
        storyId,
        userId: editorA.id,
        userName: editorA.name,
        userRole: editorA.role,
        lockedAt: new Date(now.getTime() - 25000).toISOString(),
        expiresAt: new Date(now.getTime() + 35000).toISOString(),
      });

      vi.mocked(acquireOrRenewStoredStoryLock).mockResolvedValueOnce({
        storyId,
        userId: editorA.id,
        userName: editorA.name,
        userRole: editorA.role,
        lockedAt: new Date(now.getTime() - 25000).toISOString(),
        expiresAt: new Date(now.getTime() + 60000).toISOString(),
      });

      const result = await acquireOrRenewStoryLock(storyId, editorA);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lock.userId).toBe(editorA.id);
      }
    });

    it('allows Editor A to explicitly release their lock', async () => {
      vi.mocked(releaseStoredStoryLock).mockResolvedValueOnce(true);

      const result = await releaseStoryLock(storyId, editorA);
      expect(result.success).toBe(true);
      expect(releaseStoredStoryLock).toHaveBeenCalledWith(storyId, editorA.id, false);
    });

    it('allows Admin to take over an active lease held by Editor A', async () => {
      const now = new Date();
      vi.mocked(acquireOrRenewStoredStoryLock).mockResolvedValueOnce({
        storyId,
        userId: adminEditor.id,
        userName: adminEditor.name,
        userRole: adminEditor.role,
        lockedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60000).toISOString(),
      });

      const result = await takeOverStoryLock(storyId, adminEditor);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lock.userId).toBe(adminEditor.id);
      }
    });

    it('rejects takeover by non-admin roles (e.g. Editor B)', async () => {
      const result = await takeOverStoryLock(storyId, editorB);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(403);
      }
      expect(acquireOrRenewStoredStoryLock).not.toHaveBeenCalled();
    });
  });

  describe('TASK 7 & 18: Lease Mutation Guard & CAS Authority', () => {
    it('assertStoryLeaseNotHeldByOther succeeds when user owns the lock', async () => {
      const now = new Date();
      vi.mocked(getActiveStoredStoryLock).mockResolvedValueOnce({
        storyId,
        userId: editorA.id,
        userName: editorA.name,
        userRole: editorA.role,
        lockedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 50000).toISOString(),
      });

      // Editor A owns it -> no error
      await expect(assertStoryLeaseNotHeldByOther(storyId, editorA)).resolves.toBeUndefined();
    });

    it('assertStoryLeaseNotHeldByOther succeeds when story is not locked', async () => {
      vi.mocked(getActiveStoredStoryLock).mockResolvedValueOnce(null);

      // No lock -> no error
      await expect(assertStoryLeaseNotHeldByOther(storyId, editorB)).resolves.toBeUndefined();
    });

    it('assertStoryLeaseNotHeldByOther throws StoryEditLeaseConflictError when locked by other', async () => {
      const now = new Date();
      vi.mocked(getActiveStoredStoryLock).mockResolvedValueOnce({
        storyId,
        userId: editorA.id,
        userName: editorA.name,
        userRole: editorA.role,
        lockedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 50000).toISOString(),
      });

      // Editor B tries to mutate -> throws lease conflict!
      await expect(assertStoryLeaseNotHeldByOther(storyId, editorB)).rejects.toThrow(
        StoryEditLeaseConflictError
      );
    });

    it('deleteStoryLock cleans up lease in file store and Mongo', async () => {
      mockFindOneAndDelete.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      await deleteStoryLock(storyId);
      expect(releaseStoredStoryLock).toHaveBeenCalledWith(storyId, undefined, true);
    });
  });
});
