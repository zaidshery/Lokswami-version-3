import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const connectDBMock = vi.fn();
const listAllStoredStoriesMock = vi.fn();
const createStoredStoryMock = vi.fn();
const listAllStoredVideosMock = vi.fn();
const storyFindMock = vi.fn();
const videoFindMock = vi.fn();
const recordStoryActivityMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/storage/storiesFile', () => ({
  createStoredStory: createStoredStoryMock,
  listAllStoredStories: listAllStoredStoriesMock,
}));

vi.mock('@/lib/server/storyActivity', () => ({
  buildStoryActivityMessage: vi.fn(() => 'Story activity recorded.'),
  recordStoryActivity: recordStoryActivityMock,
}));

vi.mock('@/lib/server/storyVideoUsage', () => ({
  getStoryVideoMonthlyUsageSummary: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/storage/videosFile', () => ({
  createStoredVideo: vi.fn(),
  listAllStoredVideos: listAllStoredVideosMock,
}));

vi.mock('@/lib/models/Story', () => ({
  default: {
    find: storyFindMock,
  },
}));

vi.mock('@/lib/models/Video', () => ({
  default: {
    find: videoFindMock,
  },
}));

const originalMongoUri = process.env.MONGODB_URI;

const reporter = {
  id: 'reporter-1',
  email: 'reporter@example.com',
  name: 'Reporter One',
  role: 'reporter' as const,
};

const copyEditor = {
  id: 'copy-1',
  email: 'copy@example.com',
  name: 'Copy Editor',
  role: 'copy_editor' as const,
};

const admin = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin One',
  role: 'admin' as const,
};

const otherReporter = {
  id: 'reporter-2',
  email: 'other@example.com',
  name: 'Other Reporter',
  role: 'reporter' as const,
};

function mockMongoRows(findMock: ReturnType<typeof vi.fn>, rows: unknown[]) {
  const lean = vi.fn().mockResolvedValue(rows);
  const sort = vi.fn().mockReturnValue({ lean });
  findMock.mockReturnValue({ sort });
}

function request(path: string) {
  return new Request(`http://localhost${path}`) as unknown as NextRequest;
}

function postRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('admin story and video list file-store visibility parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    connectDBMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
  });

  it('gives reporters the same own-or-assigned story page from file and Mongo stores', async () => {
    const rows = [
      {
        _id: 'story-hidden',
        title: 'Another reporter draft',
        thumbnail: '/hidden.jpg',
        category: 'General',
        author: 'Other Reporter',
        isPublished: false,
        updatedAt: '2026-07-13T12:00:00.000Z',
        workflow: { status: 'draft', createdBy: otherReporter },
      },
      {
        _id: 'story-owned',
        title: 'Owned reporter draft',
        thumbnail: '/owned.jpg',
        category: 'General',
        author: 'Reporter One',
        isPublished: false,
        updatedAt: '2026-07-13T11:00:00.000Z',
        workflow: { status: 'draft', createdBy: reporter },
      },
      {
        _id: 'story-assigned',
        title: 'Assigned reporter draft',
        thumbnail: '/assigned.jpg',
        category: 'General',
        author: 'Other Reporter',
        isPublished: false,
        updatedAt: '2026-07-13T10:00:00.000Z',
        workflow: {
          status: 'draft',
          createdBy: otherReporter,
          assignedTo: reporter,
        },
      },
    ];
    getAdminSessionMock.mockResolvedValue(reporter);
    listAllStoredStoriesMock.mockResolvedValue(rows);
    mockMongoRows(storyFindMock, rows);

    const { GET } = await import('@/app/api/admin/stories/route');
    const fileResponse = await GET(request('/api/admin/stories?limit=2&page=1'));
    const filePayload = await fileResponse.json();

    process.env.MONGODB_URI = 'mongodb://parity-test';
    const mongoResponse = await GET(request('/api/admin/stories?limit=2&page=1'));
    const mongoPayload = await mongoResponse.json();

    expect(fileResponse.status).toBe(200);
    expect(filePayload).toEqual(mongoPayload);
    expect(filePayload.data.map((story: { _id: string }) => story._id)).toEqual([
      'story-owned',
      'story-assigned',
    ]);
    expect(filePayload.pagination).toEqual({
      total: 2,
      page: 1,
      limit: 2,
      pages: 1,
    });
    expect(listAllStoredStoriesMock).toHaveBeenCalledTimes(1);
    expect(storyFindMock).toHaveBeenCalledTimes(1);
  });

  it('gives copy editors the same shared-or-assigned video page from file and Mongo stores', async () => {
    const rows = [
      {
        _id: 'video-hidden',
        title: 'Unsubmitted video',
        description: 'Private draft',
        category: 'General',
        isPublished: false,
        isShort: false,
        updatedAt: '2026-07-13T12:00:00.000Z',
        workflow: { status: 'draft', createdBy: otherReporter },
      },
      {
        _id: 'video-shared',
        title: 'Submitted video',
        description: 'Ready for the shared copy queue',
        category: 'General',
        isPublished: false,
        isShort: false,
        updatedAt: '2026-07-13T11:00:00.000Z',
        workflow: { status: 'submitted', createdBy: otherReporter },
      },
      {
        _id: 'video-assigned',
        title: 'Assigned video',
        description: 'Claimed by the copy editor',
        category: 'General',
        isPublished: false,
        isShort: false,
        updatedAt: '2026-07-13T10:00:00.000Z',
        workflow: {
          status: 'in_review',
          createdBy: otherReporter,
          assignedTo: copyEditor,
        },
      },
    ];
    getAdminSessionMock.mockResolvedValue(copyEditor);
    listAllStoredVideosMock.mockResolvedValue(rows);
    mockMongoRows(videoFindMock, rows);

    const { GET } = await import('@/app/api/admin/videos/route');
    const fileResponse = await GET(request('/api/admin/videos?limit=2&page=1'));
    const filePayload = await fileResponse.json();

    process.env.MONGODB_URI = 'mongodb://parity-test';
    const mongoResponse = await GET(request('/api/admin/videos?limit=2&page=1'));
    const mongoPayload = await mongoResponse.json();

    expect(fileResponse.status).toBe(200);
    expect(filePayload).toEqual(mongoPayload);
    expect(filePayload.data.map((video: { _id: string }) => video._id)).toEqual([
      'video-shared',
      'video-assigned',
    ]);
    expect(filePayload.pagination).toEqual({
      total: 2,
      page: 1,
      limit: 2,
      pages: 1,
    });
    expect(listAllStoredVideosMock).toHaveBeenCalledTimes(1);
    expect(videoFindMock).toHaveBeenCalledTimes(1);
  });

  it.each(['isPublished', 'publishedAt', 'scheduledFor', 'workflow'])(
    'rejects direct Story publication field %s on create without side effects',
    async (field) => {
      getAdminSessionMock.mockResolvedValue(admin);

      const { POST } = await import('@/app/api/admin/stories/route');
      const response = await POST(
        postRequest({
          title: 'Unsafe story create',
          thumbnail: '/story.jpg',
          [field]: field === 'isPublished' ? true : 'forged',
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload).toEqual({
        success: false,
        error: 'Publication state can only be changed through workflow actions.',
      });
      expect(createStoredStoryMock).not.toHaveBeenCalled();
      expect(recordStoryActivityMock).not.toHaveBeenCalled();
    }
  );

  it('rejects an unknown Story create intent without side effects', async () => {
    getAdminSessionMock.mockResolvedValue(admin);

    const { POST } = await import('@/app/api/admin/stories/route');
    const response = await POST(
      postRequest({
        intent: 'publish-without-workflow',
        title: 'Unsafe story intent',
        thumbnail: '/story.jpg',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ success: false, error: 'Invalid story intent' });
    expect(createStoredStoryMock).not.toHaveBeenCalled();
    expect(recordStoryActivityMock).not.toHaveBeenCalled();
  });

  it('defaults a missing Story create intent to an unpublished draft', async () => {
    getAdminSessionMock.mockResolvedValue(admin);
    createStoredStoryMock.mockImplementation(async (story) => ({
      _id: 'story-draft-1',
      ...story,
    }));

    const { POST } = await import('@/app/api/admin/stories/route');
    const response = await POST(
      postRequest({
        title: 'Safe draft story',
        thumbnail: '/story.jpg',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data).toEqual(
      expect.objectContaining({
        isPublished: false,
        workflow: expect.objectContaining({ status: 'draft' }),
      })
    );
    expect(createStoredStoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isPublished: false,
        workflow: expect.objectContaining({ status: 'draft' }),
      })
    );
    expect(recordStoryActivityMock).toHaveBeenCalledTimes(1);
  });
});
