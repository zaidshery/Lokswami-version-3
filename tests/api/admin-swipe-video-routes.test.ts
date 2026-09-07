import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const createStoredVideoMock = vi.fn();
const getStoredVideoByIdMock = vi.fn();
const updateStoredVideoMock = vi.fn();
const getPublicArticleBySlugMock = vi.fn();
const recordVideoActivityMock = vi.fn();
const notifyWorkflowEventMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionMock,
}));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/Video', () => ({ default: {} }));
vi.mock('@/lib/models/User', () => ({ default: {} }));
vi.mock('@/lib/storage/videosFile', () => ({
  createStoredVideo: createStoredVideoMock,
  deleteStoredVideo: vi.fn(),
  getStoredVideoById: getStoredVideoByIdMock,
  listAllStoredVideos: vi.fn(),
  updateStoredVideo: updateStoredVideoMock,
}));
vi.mock('@/lib/server/publicArticles', () => ({
  getPublicArticleBySlug: getPublicArticleBySlugMock,
}));
vi.mock('@/lib/server/videoActivity', () => ({
  buildVideoActivityMessage: vi.fn(() => 'activity'),
  recordVideoActivity: recordVideoActivityMock,
}));
vi.mock('@/lib/server/workflowNotificationEvents', () => ({
  notifyWorkflowEvent: notifyWorkflowEventMock,
}));

const originalMongoUri = process.env.MONGODB_URI;
const admin = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin' as const,
};

function request(path: string, method: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function readySwipe(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'video-1',
    title: 'Vertical report',
    description: 'A complete Swipe summary',
    thumbnail: 'https://cdn.example.com/poster.jpg',
    posterUrl: 'https://cdn.example.com/poster.jpg',
    videoUrl: 'https://cdn.example.com/video.mp4',
    playbackUrl: 'https://cdn.example.com/video.mp4',
    mediaProvider: 'spaces-mp4',
    duration: 30,
    category: 'National',
    isShort: true,
    isPublished: false,
    slug: 'vertical-report',
    articleId: 'published-article',
    aspectRatio: '9:16',
    processingStatus: 'ready',
    publishedAt: '2026-09-01T08:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    workflow: { status: 'approved', priority: 'normal' },
    ...overrides,
  };
}

describe('admin Swipe video routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getAdminSessionMock.mockResolvedValue(admin);
    getPublicArticleBySlugMock.mockResolvedValue({ article: { id: 'article-1' } });
    createStoredVideoMock.mockImplementation(async (input: Record<string, unknown>) => ({
      _id: 'created-video',
      createdAt: '2026-09-02T08:00:00.000Z',
      updatedAt: '2026-09-02T08:00:00.000Z',
      ...input,
    }));
  });

  afterEach(() => {
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  it('allows a private Swipe draft without forcing publish-only fields', async () => {
    const { POST } = await import('@/app/api/admin/videos/route');
    const response = await POST(
      request('/api/admin/videos', 'POST', {
        title: 'Draft report',
        description: 'Draft summary',
        videoUrl: 'https://www.youtube.com/shorts/abcdefghijk',
        category: 'National',
        isShort: true,
        intent: 'draft',
        isPublished: false,
      })
    );

    expect(response.status).toBe(201);
    expect(createStoredVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ isShort: true, isPublished: false })
    );
    expect(getPublicArticleBySlugMock).not.toHaveBeenCalled();
  });

  it('blocks publication until Swipe fields and a public article are ready', async () => {
    const { POST } = await import('@/app/api/admin/videos/route');
    const incomplete = await POST(
      request('/api/admin/videos', 'POST', {
        ...readySwipe({ articleId: '', aspectRatio: '16:9' }),
        intent: 'publish',
        isPublished: true,
      })
    );
    expect(incomplete.status).toBe(400);
    expect(createStoredVideoMock).not.toHaveBeenCalled();

    getPublicArticleBySlugMock.mockResolvedValueOnce(null);
    const unpublishedArticle = await POST(
      request('/api/admin/videos', 'POST', {
        ...readySwipe(),
        intent: 'publish',
        isPublished: true,
      })
    );
    expect(unpublishedArticle.status).toBe(400);
    await expect(unpublishedArticle.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/already published/i) })
    );
  });

  it('creates a publish-ready Swipe story and records its workflow activity', async () => {
    const { POST } = await import('@/app/api/admin/videos/route');
    const response = await POST(
      request('/api/admin/videos', 'POST', {
        ...readySwipe(),
        intent: 'publish',
        isPublished: true,
      })
    );

    expect(response.status).toBe(201);
    expect(getPublicArticleBySlugMock).toHaveBeenCalledWith('published-article');
    expect(createStoredVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'vertical-report',
        articleId: 'published-article',
        aspectRatio: '9:16',
        processingStatus: 'ready',
        isPublished: true,
      })
    );
    expect(recordVideoActivityMock).toHaveBeenCalledTimes(1);
  });

  it('blocks an incomplete workflow publish but schedules and publishes a ready record', async () => {
    const { PATCH } = await import('@/app/api/admin/videos/[id]/route');
    getStoredVideoByIdMock.mockResolvedValueOnce(readySwipe({ articleId: '' }));
    const blocked = await PATCH(request('/api/admin/videos/video-1', 'PATCH', { action: 'publish' }), {
      params: Promise.resolve({ id: 'video-1' }),
    });
    expect(blocked.status).toBe(400);
    expect(updateStoredVideoMock).not.toHaveBeenCalled();

    const scheduledVideo = readySwipe({ workflow: { status: 'approved', priority: 'normal' } });
    getStoredVideoByIdMock.mockResolvedValueOnce(scheduledVideo);
    updateStoredVideoMock.mockImplementationOnce(async (_id, updates) => ({
      ...scheduledVideo,
      ...updates,
    }));
    const scheduled = await PATCH(
      request('/api/admin/videos/video-1', 'PATCH', {
        action: 'schedule',
        scheduledFor: '2026-09-20T08:00:00.000Z',
      }),
      { params: Promise.resolve({ id: 'video-1' }) }
    );
    expect(scheduled.status).toBe(200);
    expect(updateStoredVideoMock).toHaveBeenLastCalledWith(
      'video-1',
      expect.objectContaining({ isPublished: false, workflow: expect.objectContaining({ status: 'scheduled' }) })
    );

    const approvedVideo = readySwipe();
    getStoredVideoByIdMock.mockResolvedValueOnce(approvedVideo);
    updateStoredVideoMock.mockImplementationOnce(async (_id, updates) => ({
      ...approvedVideo,
      ...updates,
    }));
    const published = await PATCH(
      request('/api/admin/videos/video-1', 'PATCH', { action: 'publish' }),
      { params: Promise.resolve({ id: 'video-1' }) }
    );
    expect(published.status).toBe(200);
    expect(updateStoredVideoMock).toHaveBeenLastCalledWith(
      'video-1',
      expect.objectContaining({ isPublished: true, workflow: expect.objectContaining({ status: 'published' }) })
    );
    expect(notifyWorkflowEventMock).toHaveBeenCalledTimes(2);
  });

  it('keeps ordinary legacy published-video edits compatible', async () => {
    const legacy = readySwipe({
      isShort: false,
      isPublished: true,
      slug: '',
      articleId: '',
      aspectRatio: 'unknown',
      workflow: { status: 'published', priority: 'normal' },
    });
    getStoredVideoByIdMock.mockResolvedValue(legacy);
    updateStoredVideoMock.mockImplementation(async (_id, updates) => ({ ...legacy, ...updates }));
    const { PUT } = await import('@/app/api/admin/videos/[id]/route');
    const response = await PUT(
      request('/api/admin/videos/video-1', 'PUT', { title: 'Corrected legacy title' }),
      { params: Promise.resolve({ id: 'video-1' }) }
    );

    expect(response.status).toBe(200);
    expect(getPublicArticleBySlugMock).not.toHaveBeenCalled();
    expect(updateStoredVideoMock).toHaveBeenCalledWith(
      'video-1',
      expect.objectContaining({ title: 'Corrected legacy title', isPublished: true })
    );
  });
});
