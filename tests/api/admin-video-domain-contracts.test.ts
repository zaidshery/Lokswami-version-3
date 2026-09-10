import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const connectDBMock = vi.fn();
const createStoredVideoMock = vi.fn();
const getStoredVideoByIdMock = vi.fn();
const updateStoredVideoMock = vi.fn();
const deleteStoredVideoMock = vi.fn();
const listAllStoredVideosMock = vi.fn();
const getPublicArticleBySlugMock = vi.fn();
const recordVideoActivityMock = vi.fn();
const notifyWorkflowEventMock = vi.fn();
const listVideoActivityMock = vi.fn();

const mockVideoFind = vi.fn();
const mockVideoFindById = vi.fn();
const mockVideoFindByIdAndUpdate = vi.fn();
const mockVideoFindByIdAndDelete = vi.fn();
const mockVideoSave = vi.fn();
const mockUserFindOne = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock.mockImplementation(async () => {
    if (process.env.TEST_MONGO_FAIL === 'true') {
      throw new Error('Mongo connection failed');
    }
    return {};
  }),
}));

vi.mock('@/lib/models/Video', () => {
  const VideoMock = vi.fn(function VideoMock(data: Record<string, unknown>) {
    const saved = {
      _id: '507f1f77bcf86cd799439011',
      ...data,
      toObject: () => ({ _id: '507f1f77bcf86cd799439011', ...data }),
    };
    mockVideoSave.mockResolvedValue(saved);
    return { ...data, save: mockVideoSave };
  });
  (VideoMock as unknown as Record<string, unknown>).find = mockVideoFind;
  (VideoMock as unknown as Record<string, unknown>).findById = mockVideoFindById;
  (VideoMock as unknown as Record<string, unknown>).findByIdAndUpdate = mockVideoFindByIdAndUpdate;
  (VideoMock as unknown as Record<string, unknown>).findByIdAndDelete = mockVideoFindByIdAndDelete;
  return { default: VideoMock };
});

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: mockUserFindOne,
  },
}));

vi.mock('@/lib/storage/videosFile', () => ({
  createStoredVideo: createStoredVideoMock,
  deleteStoredVideo: deleteStoredVideoMock,
  getStoredVideoById: getStoredVideoByIdMock,
  listAllStoredVideos: listAllStoredVideosMock,
  updateStoredVideo: updateStoredVideoMock,
}));

vi.mock('@/lib/server/publicArticles', () => ({
  getPublicArticleBySlug: getPublicArticleBySlugMock,
}));

vi.mock('@/lib/server/videoActivity', () => ({
  buildVideoActivityMessage: vi.fn(() => 'activity message'),
  recordVideoActivity: recordVideoActivityMock,
  listVideoActivity: listVideoActivityMock,
}));

vi.mock('@/lib/server/workflowNotificationEvents', () => ({
  notifyWorkflowEvent: notifyWorkflowEventMock,
}));

const originalMongoUri = process.env.MONGODB_URI;

const superAdmin = {
  id: 'user-admin',
  name: 'Admin User',
  email: 'admin@lokswami.com',
  role: 'admin' as const,
};

const editorUser = {
  id: 'user-editor',
  name: 'Editor User',
  email: 'editor@lokswami.com',
  role: 'senior_editor' as const,
};

const reporterUser = {
  id: 'user-reporter',
  name: 'Reporter User',
  email: 'reporter@lokswami.com',
  role: 'reporter' as const,
};

function createJsonRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

function sampleVideo(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    title: 'Sample Video Report',
    description: 'Detailed description of sample video',
    thumbnail: 'https://images.unsplash.com/sample.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    playbackUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 120,
    category: 'National',
    isShort: false,
    isPublished: true,
    publishedAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    workflow: { status: 'published', priority: 'normal' },
    ...overrides,
  };
}

function mockMongoFindById(row: Record<string, unknown> | null) {
  mockVideoFindById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(row),
  });
}

function mockMongoUpdate(row: Record<string, unknown> | null) {
  mockVideoFindByIdAndUpdate.mockResolvedValue(
    row
      ? {
          ...row,
          toObject: () => row,
        }
      : null
  );
}

describe('Phase 2.3: Admin Video Domain Contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDBMock.mockImplementation(async () => {
      if (process.env.TEST_MONGO_FAIL === 'true') {
        throw new Error('Mongo connection failed');
      }
      return {};
    });
    delete process.env.TEST_MONGO_FAIL;
    delete process.env.MONGODB_URI;
    getAdminSessionMock.mockResolvedValue(superAdmin);
    getPublicArticleBySlugMock.mockResolvedValue({ article: { id: 'art-1' } });
    listVideoActivityMock.mockResolvedValue([{ id: 'act-1', action: 'created' }]);
  });

  afterEach(() => {
    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
  });

  describe('GET /api/admin/videos (List)', () => {
    it('returns unauthorized 401 when session is missing', async () => {
      getAdminSessionMock.mockResolvedValueOnce(null);
      const { GET } = await import('@/app/api/admin/videos/route');
      const response = await GET(createJsonRequest('/api/admin/videos', 'GET'));
      expect(response.status).toBe(401);
    });

    it('filters and paginates in file store mode', async () => {
      listAllStoredVideosMock.mockResolvedValue([
        sampleVideo({ _id: 'v-1', title: 'Video Alpha', category: 'National', isShort: false }),
        sampleVideo({ _id: 'v-2', title: 'Short Beta', category: 'Indore', isShort: true, shortsRank: 5 }),
        sampleVideo({ _id: 'v-3', title: 'Draft Gamma', category: 'National', isPublished: false, workflow: { status: 'draft' } }),
      ]);

      const { GET } = await import('@/app/api/admin/videos/route');
      const resCategory = await GET(createJsonRequest('/api/admin/videos?category=Indore', 'GET'));
      expect(resCategory.status).toBe(200);
      const jsonCat = await resCategory.json();
      expect(jsonCat.data).toHaveLength(1);
      expect(jsonCat.data[0]._id).toBe('v-2');

      const resShorts = await GET(createJsonRequest('/api/admin/videos?type=shorts&sort=shorts', 'GET'));
      const jsonShorts = await resShorts.json();
      expect(jsonShorts.data).toHaveLength(1);
      expect(jsonShorts.data[0]._id).toBe('v-2');

      const resUnbounded = await GET(createJsonRequest('/api/admin/videos?limit=all', 'GET'));
      const jsonUnbounded = await resUnbounded.json();
      expect(jsonUnbounded.data).toHaveLength(3);
      expect(jsonUnbounded.pagination.pages).toBe(1);
    });
  });

  describe('POST /api/admin/videos (Create)', () => {
    it('blocks non-admin users from creating videos', async () => {
      getAdminSessionMock.mockResolvedValueOnce(editorUser);
      const { POST } = await import('@/app/api/admin/videos/route');
      const response = await POST(
        createJsonRequest('/api/admin/videos', 'POST', {
          title: 'Editor direct publish attempt',
          description: 'Description here',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          category: 'National',
          intent: 'publish',
        })
      );
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Forbidden');
    });

    it('validates required fields, category, duration, and video URL', async () => {
      const { POST } = await import('@/app/api/admin/videos/route');

      const missingFields = await POST(
        createJsonRequest('/api/admin/videos', 'POST', { title: 'No url' })
      );
      expect(missingFields.status).toBe(400);

      const invalidCategory = await POST(
        createJsonRequest('/api/admin/videos', 'POST', {
          title: 'Valid title',
          description: 'Valid desc',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          category: 'NonExistentCategory',
        })
      );
      expect(invalidCategory.status).toBe(400);
      expect(await invalidCategory.json()).toEqual(expect.objectContaining({ error: 'Invalid category' }));

      const invalidUrl = await POST(
        createJsonRequest('/api/admin/videos', 'POST', {
          title: 'Valid title',
          description: 'Valid desc',
          videoUrl: 'http://insecure.com/video.avi',
          category: 'National',
        })
      );
      expect(invalidUrl.status).toBe(400);
      expect(await invalidUrl.json()).toEqual(
        expect.objectContaining({ error: expect.stringMatching(/valid YouTube URL or an HTTPS MP4/i) })
      );
    });

    it('creates draft successfully in file store and logs activity', async () => {
      createStoredVideoMock.mockResolvedValueOnce({
        _id: 'file-v1',
        title: 'Draft in file store',
        category: 'National',
        isShort: false,
        isPublished: false,
        workflow: { status: 'draft', priority: 'normal' },
      });

      const { POST } = await import('@/app/api/admin/videos/route');
      const response = await POST(
        createJsonRequest('/api/admin/videos', 'POST', {
          title: 'Draft in file store',
          description: 'Description here',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          category: 'National',
          intent: 'draft',
        })
      );

      expect(response.status).toBe(201);
      expect(createStoredVideoMock).toHaveBeenCalledTimes(1);
      expect(recordVideoActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({ videoId: 'file-v1', action: 'created', toStatus: 'draft' })
      );
    });

    it('creates a submitted video in the file store', async () => {
      createStoredVideoMock.mockImplementationOnce(async (input) => ({
        _id: 'file-submitted',
        ...input,
      }));

      const { POST } = await import('@/app/api/admin/videos/route');
      const response = await POST(
        createJsonRequest('/api/admin/videos', 'POST', {
          title: 'Submitted report',
          description: 'Ready for review',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          category: 'National',
          intent: 'submit',
        })
      );

      expect(response.status).toBe(201);
      expect(createStoredVideoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isPublished: false,
          workflow: expect.objectContaining({ status: 'submitted' }),
        })
      );
    });

    it('pins Mongo once and never falls through to the file store during create', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
      const { POST } = await import('@/app/api/admin/videos/route');
      const response = await POST(
        createJsonRequest('/api/admin/videos', 'POST', {
          title: 'Mongo draft',
          description: 'Stored only in Mongo',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          category: 'National',
          intent: 'draft',
        })
      );

      expect(response.status).toBe(201);
      expect(connectDBMock).toHaveBeenCalledTimes(1);
      expect(mockVideoSave).toHaveBeenCalledTimes(1);
      expect(createStoredVideoMock).not.toHaveBeenCalled();
    });
  });

  describe('ID Route: /api/admin/videos/[id]', () => {
    it('returns 400 Invalid video ID in Mongo mode for non-ObjectId', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
      const { GET, PUT, PATCH, DELETE } = await import('@/app/api/admin/videos/[id]/route');

      const badId = 'not-an-objectid';
      const context = { params: Promise.resolve({ id: badId }) };

      const getRes = await GET(createJsonRequest(`/api/admin/videos/${badId}`, 'GET'), context);
      expect(getRes.status).toBe(400);
      expect(await getRes.json()).toEqual({ success: false, error: 'Invalid video ID' });

      const putRes = await PUT(
        createJsonRequest(`/api/admin/videos/${badId}`, 'PUT', { title: 'new title' }),
        context
      );
      expect(putRes.status).toBe(400);

      const patchRes = await PATCH(
        createJsonRequest(`/api/admin/videos/${badId}`, 'PATCH', { action: 'archive' }),
        context
      );
      expect(patchRes.status).toBe(400);

      const delRes = await DELETE(createJsonRequest(`/api/admin/videos/${badId}`, 'DELETE'), context);
      expect(delRes.status).toBe(400);
    });

    it('allows non-ObjectId in file store mode', async () => {
      const stringId = 'custom-file-id-123';
      const context = { params: Promise.resolve({ id: stringId }) };
      getStoredVideoByIdMock.mockResolvedValueOnce(sampleVideo({ _id: stringId }));

      const { GET } = await import('@/app/api/admin/videos/[id]/route');
      const response = await GET(createJsonRequest(`/api/admin/videos/${stringId}`, 'GET'), context);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data._id).toBe(stringId);
    });

    it('returns 404 when video is not found', async () => {
      getStoredVideoByIdMock.mockResolvedValueOnce(null);
      const context = { params: Promise.resolve({ id: 'missing-id' }) };

      const { GET } = await import('@/app/api/admin/videos/[id]/route');
      const response = await GET(createJsonRequest('/api/admin/videos/missing-id', 'GET'), context);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ success: false, error: 'Video not found' });
    });

    it('updates video metadata and auto-resolves YouTube thumbnail', async () => {
      const existing = sampleVideo({ _id: 'v-exist', thumbnail: '' });
      getStoredVideoByIdMock.mockResolvedValueOnce(existing);
      updateStoredVideoMock.mockImplementationOnce(async (_id, updates) => ({
        ...existing,
        ...updates,
      }));

      const context = { params: Promise.resolve({ id: 'v-exist' }) };
      const { PUT } = await import('@/app/api/admin/videos/[id]/route');
      const response = await PUT(
        createJsonRequest('/api/admin/videos/v-exist', 'PUT', {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          thumbnail: '',
        }),
        context
      );

      expect(response.status).toBe(200);
      expect(updateStoredVideoMock).toHaveBeenCalledWith(
        'v-exist',
        expect.objectContaining({
          thumbnail: expect.stringContaining('i.ytimg.com/vi/dQw4w9WgXcQ'),
        })
      );
    });

    it('applies legacy isPublished compatibility correctly', async () => {
      const draftVideo = sampleVideo({
        _id: 'v-draft',
        isPublished: false,
        workflow: { status: 'draft', priority: 'normal' },
      });
      getStoredVideoByIdMock.mockResolvedValueOnce(draftVideo);
      updateStoredVideoMock.mockImplementationOnce(async (_id, updates) => ({
        ...draftVideo,
        ...updates,
      }));

      const context = { params: Promise.resolve({ id: 'v-draft' }) };
      const { PUT } = await import('@/app/api/admin/videos/[id]/route');

      // Legacy isPublished: true on a standard video
      const res = await PUT(
        createJsonRequest('/api/admin/videos/v-draft', 'PUT', { isPublished: true }),
        context
      );
      expect(res.status).toBe(200);
      expect(updateStoredVideoMock).toHaveBeenCalledWith(
        'v-draft',
        expect.objectContaining({
          isPublished: true,
          workflow: expect.objectContaining({ status: 'published' }),
        })
      );
    });

    it('keeps legacy isPublished false compatible with unpublishing', async () => {
      const publishedVideo = sampleVideo({ _id: 'v-published' });
      getStoredVideoByIdMock.mockResolvedValueOnce(publishedVideo);
      updateStoredVideoMock.mockImplementationOnce(async (_id, updates) => ({
        ...publishedVideo,
        ...updates,
      }));

      const { PUT } = await import('@/app/api/admin/videos/[id]/route');
      const response = await PUT(
        createJsonRequest('/api/admin/videos/v-published', 'PUT', { isPublished: false }),
        { params: Promise.resolve({ id: 'v-published' }) }
      );

      expect(response.status).toBe(200);
      expect(updateStoredVideoMock).toHaveBeenCalledWith(
        'v-published',
        expect.objectContaining({
          isPublished: false,
          workflow: expect.objectContaining({ status: 'draft' }),
        })
      );
    });

    it('pins Mongo once for update and does not cross to file storage when the write fails', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
      mockMongoFindById(sampleVideo());
      mockVideoFindByIdAndUpdate.mockRejectedValueOnce(new Error('Mongo write failed'));

      const { PUT } = await import('@/app/api/admin/videos/[id]/route');
      const response = await PUT(
        createJsonRequest('/api/admin/videos/507f1f77bcf86cd799439011', 'PUT', {
          title: 'Mongo-only update',
        }),
        { params: Promise.resolve({ id: '507f1f77bcf86cd799439011' }) }
      );

      expect(response.status).toBe(500);
      expect(connectDBMock).toHaveBeenCalledTimes(1);
      expect(updateStoredVideoMock).not.toHaveBeenCalled();
    });

    it('requires MongoDB for assignment in file store mode and returns 503 if unavailable', async () => {
      getStoredVideoByIdMock.mockResolvedValueOnce(sampleVideo({ _id: 'v-assign' }));
      const context = { params: Promise.resolve({ id: 'v-assign' }) };

      const { PATCH } = await import('@/app/api/admin/videos/[id]/route');
      const response = await PATCH(
        createJsonRequest('/api/admin/videos/v-assign', 'PATCH', {
          action: 'assign',
          assignedToId: 'user-editor',
        }),
        context
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual(
        expect.objectContaining({ error: expect.stringMatching(/assignments require mongodb-backed users/i) })
      );
    });

    it('does not re-probe Mongo after a mutation has pinned the file store', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
      process.env.TEST_MONGO_FAIL = 'true';
      getStoredVideoByIdMock.mockResolvedValueOnce(sampleVideo({ _id: 'v-assign-file' }));
      const { PATCH } = await import('@/app/api/admin/videos/[id]/route');
      const response = await PATCH(
        createJsonRequest('/api/admin/videos/v-assign-file', 'PATCH', {
          action: 'assign',
          assignedToId: 'copy@example.com',
        }),
        { params: Promise.resolve({ id: 'v-assign-file' }) }
      );

      expect(response.status).toBe(503);
      expect(connectDBMock).toHaveBeenCalledTimes(1);
      expect(updateStoredVideoMock).not.toHaveBeenCalled();
    });

    it('successfully archives a video via workflow PATCH', async () => {
      const existing = sampleVideo({ _id: 'v-archive' });
      getStoredVideoByIdMock.mockResolvedValueOnce(existing);
      updateStoredVideoMock.mockImplementationOnce(async (_id, updates) => ({
        ...existing,
        ...updates,
      }));

      const context = { params: Promise.resolve({ id: 'v-archive' }) };
      const { PATCH } = await import('@/app/api/admin/videos/[id]/route');
      const response = await PATCH(
        createJsonRequest('/api/admin/videos/v-archive', 'PATCH', { action: 'archive' }),
        context
      );

      expect(response.status).toBe(200);
      expect(updateStoredVideoMock).toHaveBeenCalledWith(
        'v-archive',
        expect.objectContaining({
          isPublished: false,
          workflow: expect.objectContaining({ status: 'archived' }),
        })
      );
    });

    it('supports urgent fast publish and preserves the workflow 400 contract', async () => {
      const draft = sampleVideo({
        _id: 'v-fast',
        isPublished: false,
        workflow: { status: 'draft', priority: 'urgent' },
      });
      getStoredVideoByIdMock.mockResolvedValue(draft);
      updateStoredVideoMock.mockImplementation(async (_id, updates) => ({ ...draft, ...updates }));
      const { PATCH } = await import('@/app/api/admin/videos/[id]/route');
      const context = { params: Promise.resolve({ id: 'v-fast' }) };

      const invalid = await PATCH(
        createJsonRequest('/api/admin/videos/v-fast', 'PATCH', {
          action: 'fast_publish',
          comment: 'short',
        }),
        context
      );
      expect(invalid.status).toBe(400);

      const published = await PATCH(
        createJsonRequest('/api/admin/videos/v-fast', 'PATCH', {
          action: 'fast_publish',
          comment: 'Urgent verified newsroom reason',
        }),
        context
      );
      expect(published.status).toBe(200);
      expect(updateStoredVideoMock).toHaveBeenCalledWith(
        'v-fast',
        expect.objectContaining({
          isPublished: true,
          workflow: expect.objectContaining({ status: 'published' }),
        })
      );
    });

    it('assigns through Mongo while keeping the selected video store pinned', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
      const current = sampleVideo({
        workflow: { status: 'submitted', priority: 'normal' },
        isPublished: false,
      });
      mockMongoFindById(current);
      mockUserFindOne.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: '507f191e810c19729de860ea',
            name: 'Copy Editor',
            email: 'copy@example.com',
            role: 'copy_editor',
          }),
        }),
      });
      mockMongoUpdate({
        ...current,
        workflow: { status: 'assigned', priority: 'normal' },
      });

      const { PATCH } = await import('@/app/api/admin/videos/[id]/route');
      const response = await PATCH(
        createJsonRequest('/api/admin/videos/507f1f77bcf86cd799439011', 'PATCH', {
          action: 'assign',
          assignedToId: '507f191e810c19729de860ea',
        }),
        { params: Promise.resolve({ id: '507f1f77bcf86cd799439011' }) }
      );

      expect(response.status).toBe(200);
      expect(connectDBMock).toHaveBeenCalledTimes(1);
      expect(mockVideoFindByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(updateStoredVideoMock).not.toHaveBeenCalled();
    });

    it('deletes video successfully with RBAC check', async () => {
      // Reporter cannot delete
      getAdminSessionMock.mockResolvedValueOnce(reporterUser);
      const context = { params: Promise.resolve({ id: 'v-del' }) };
      const { DELETE } = await import('@/app/api/admin/videos/[id]/route');

      const forbiddenRes = await DELETE(createJsonRequest('/api/admin/videos/v-del', 'DELETE'), context);
      expect(forbiddenRes.status).toBe(403);

      // SuperAdmin can delete
      getAdminSessionMock.mockResolvedValueOnce(superAdmin);
      deleteStoredVideoMock.mockResolvedValueOnce(true);
      const successRes = await DELETE(createJsonRequest('/api/admin/videos/v-del', 'DELETE'), context);
      expect(successRes.status).toBe(200);
      expect(await successRes.json()).toEqual({ success: true, message: 'Video deleted successfully' });
    });

    it('deletes from pinned Mongo storage without trying the file store', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
      mockVideoFindByIdAndDelete.mockResolvedValueOnce(sampleVideo());
      const { DELETE } = await import('@/app/api/admin/videos/[id]/route');
      const response = await DELETE(
        createJsonRequest('/api/admin/videos/507f1f77bcf86cd799439011', 'DELETE'),
        { params: Promise.resolve({ id: '507f1f77bcf86cd799439011' }) }
      );

      expect(response.status).toBe(200);
      expect(connectDBMock).toHaveBeenCalledTimes(1);
      expect(deleteStoredVideoMock).not.toHaveBeenCalled();
    });
  });

  describe('Activity Route: /api/admin/videos/[id]/activity', () => {
    it('returns activity list for authorized user', async () => {
      getStoredVideoByIdMock.mockResolvedValueOnce(sampleVideo({ _id: 'v-act' }));
      const context = { params: Promise.resolve({ id: 'v-act' }) };

      const { GET } = await import('@/app/api/admin/videos/[id]/activity/route');
      const response = await GET(createJsonRequest('/api/admin/videos/v-act/activity', 'GET'), context);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toEqual([{ id: 'act-1', action: 'created' }]);
    });

    it('returns 400 on invalid ObjectId when Mongo is active', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
      const context = { params: Promise.resolve({ id: 'invalid-id' }) };

      const { GET } = await import('@/app/api/admin/videos/[id]/activity/route');
      const response = await GET(createJsonRequest('/api/admin/videos/invalid-id/activity', 'GET'), context);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ success: false, error: 'Invalid video ID' });
    });
  });
});
