import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRevisions } from '@/app/api/admin/stories/[id]/revisions/route';
import { POST as restoreRevision } from '@/app/api/admin/stories/[id]/revisions/[revisionId]/restore/route';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  StoryForbiddenError,
  StoryVersionConflictError,
  StoryEditLeaseConflictError,
} from '@/lib/server/storyEditorialService';

const {
  getAdminSessionFromReqMock,
  getStoryRevisionsMock,
  restoreStoryRevisionMock,
} = vi.hoisted(() => ({
  getAdminSessionFromReqMock: vi.fn(),
  getStoryRevisionsMock: vi.fn(),
  restoreStoryRevisionMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/server/storyEditorialService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/storyEditorialService')>();
  return {
    ...actual,
    StoryEditorialService: {
      ...actual.StoryEditorialService,
      getStoryRevisions: getStoryRevisionsMock,
      restoreStoryRevision: restoreStoryRevisionMock,
    },
  };
});

describe('Story Revisions API Routes (Phase 3.7C)', () => {
  const adminUser: AdminSessionIdentity = {
    id: 'admin-1',
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin User',
    role: 'admin',
  };

  const storyId = 'story-rev-1';
  const revisionId = 'rev-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/stories/[id]/revisions', () => {
    it('returns 401 when unauthenticated', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/revisions`);
      const res = await getRevisions(req, { params: Promise.resolve({ id: storyId }) });

      expect(res.status).toBe(401);
    });

    it('returns 200 with list of revisions for authorized editor', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(adminUser);
      getStoryRevisionsMock.mockResolvedValue([
        { _id: 'rev-2', version: 2, title: 'Rev 2', savedAt: '2026-09-02T00:00:00Z' },
        { _id: 'rev-1', version: 1, title: 'Rev 1', savedAt: '2026-09-01T00:00:00Z' },
      ]);

      const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/revisions`);
      const res = await getRevisions(req, { params: Promise.resolve({ id: storyId }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0]._id).toBe('rev-2');
    });

    it('returns 403 when forbidden', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(adminUser);
      getStoryRevisionsMock.mockRejectedValue(new StoryForbiddenError('Forbidden'));

      const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/revisions`);
      const res = await getRevisions(req, { params: Promise.resolve({ id: storyId }) });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/admin/stories/[id]/revisions/[revisionId]/restore', () => {
    it('returns 400 when expectedVersion is missing or invalid', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(adminUser);

      const req = new NextRequest(
        `http://localhost/api/admin/stories/${storyId}/revisions/${revisionId}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      const res = await restoreRevision(req, {
        params: Promise.resolve({ id: storyId, revisionId }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('expectedVersion');
    });

    it('returns 409 STORY_VERSION_CONFLICT on version mismatch', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(adminUser);
      restoreStoryRevisionMock.mockRejectedValue(new StoryVersionConflictError(3));

      const req = new NextRequest(
        `http://localhost/api/admin/stories/${storyId}/revisions/${revisionId}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 2 }),
        }
      );
      const res = await restoreRevision(req, {
        params: Promise.resolve({ id: storyId, revisionId }),
      });
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.code).toBe('STORY_VERSION_CONFLICT');
      expect(data.currentVersion).toBe(3);
    });

    it('returns 409 STORY_EDIT_LEASE_CONFLICT when lease is held by another user', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(adminUser);
      restoreStoryRevisionMock.mockRejectedValue(
        new StoryEditLeaseConflictError({
          userId: 'other-user',
          userName: 'Other User',
          userRole: 'copy_editor',
          lockedAt: '2026-09-24T12:00:00Z',
          expiresAt: '2026-09-24T12:01:00Z',
        })
      );

      const req = new NextRequest(
        `http://localhost/api/admin/stories/${storyId}/revisions/${revisionId}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 2 }),
        }
      );
      const res = await restoreRevision(req, {
        params: Promise.resolve({ id: storyId, revisionId }),
      });
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.code).toBe('STORY_EDIT_LEASE_CONFLICT');
    });

    it('returns 200 with restored story on success', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(adminUser);
      restoreStoryRevisionMock.mockResolvedValue({
        story: {
          _id: storyId,
          version: 3,
          title: 'Restored Title',
        },
      });

      const req = new NextRequest(
        `http://localhost/api/admin/stories/${storyId}/revisions/${revisionId}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: 2 }),
        }
      );
      const res = await restoreRevision(req, {
        params: Promise.resolve({ id: storyId, revisionId }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.version).toBe(3);
      expect(data.data.title).toBe('Restored Title');
    });
  });
});
