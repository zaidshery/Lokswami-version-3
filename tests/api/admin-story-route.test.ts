import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const getStoredStoryByIdMock = vi.fn();
const updateStoredStoryMock = vi.fn();
const deleteStoredStoryMock = vi.fn();
const recordStoryActivityMock = vi.fn();
const getStoryVideoMonthlyUsageSummaryMock = vi.fn();
const connectDBMock = vi.fn();
const notifyWorkflowEventMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/storage/storiesFile', () => ({
  StoryVersionConflictError: class StoryVersionConflictError extends Error {
    currentVersion: number;
    constructor(currentVersion: number) {
      super('This story was updated elsewhere. Refresh before saving again.');
      this.currentVersion = currentVersion;
    }
  },
  createStoredStory: vi.fn(),
  deleteStoredStory: deleteStoredStoryMock,
  getStoredStoryById: getStoredStoryByIdMock,
  listStoredStories: vi.fn(),
  updateStoredStory: updateStoredStoryMock,
}));

vi.mock('@/lib/server/storyActivity', () => ({
  buildStoryActivityMessage: vi.fn(() => 'Story workflow updated.'),
  recordStoryActivity: recordStoryActivityMock,
}));

vi.mock('@/lib/server/storyVideoUsage', () => ({
  getStoryVideoMonthlyUsageSummary: getStoryVideoMonthlyUsageSummaryMock,
}));

vi.mock('@/lib/server/workflowNotificationEvents', () => ({
  notifyWorkflowEvent: notifyWorkflowEventMock,
}));

vi.mock('@/lib/models/Story', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

function createPatchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/stories/story-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 1, ...body }),
  }) as unknown as NextRequest;
}

function createPutRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/stories/story-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 1, ...body }),
  }) as unknown as NextRequest;
}

describe('/api/admin/stories/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getStoryVideoMonthlyUsageSummaryMock.mockResolvedValue({});
  });

  it('lets a copy editor claim an unassigned submitted story and moves it into review', async () => {
    const copyEditor = {
      id: 'copy-editor-1',
      email: 'copy@example.com',
      name: 'Copy Editor',
      role: 'copy_editor',
    };
    const submittedStory = {
      _id: 'story-1',
      title: 'Reporter Story',
      author: 'Reporter One',
      isPublished: false,
      updatedAt: '2026-04-24T10:00:00.000Z',
      workflow: {
        status: 'submitted',
        priority: 'normal',
        createdBy: {
          id: 'reporter-1',
          name: 'Reporter One',
          email: 'reporter@example.com',
          role: 'reporter',
        },
        assignedTo: null,
        reviewedBy: null,
        submittedAt: '2026-04-24T09:55:00.000Z',
        approvedAt: null,
        rejectedAt: null,
        publishedAt: null,
        scheduledFor: null,
        dueAt: null,
        rejectionReason: '',
        comments: [],
      },
    };

    getAdminSessionMock.mockResolvedValue(copyEditor);
    getStoredStoryByIdMock.mockResolvedValue(submittedStory);
    updateStoredStoryMock.mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({
      ...submittedStory,
      ...updates,
    }));

    const { PATCH } = await import('@/app/api/admin/stories/[id]/route');
    const response = await PATCH(createPatchRequest({ action: 'start_review' }), {
      params: Promise.resolve({ id: 'story-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateStoredStoryMock).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({
        isPublished: false,
        workflow: expect.objectContaining({
          status: 'in_review',
          assignedTo: expect.objectContaining({
            id: copyEditor.id,
            email: copyEditor.email,
            role: copyEditor.role,
          }),
          reviewedBy: expect.objectContaining({
            id: copyEditor.id,
          }),
        }),
      }),
      { expectedVersion: 1 }
    );
    expect(recordStoryActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: 'story-1',
        action: 'start_review',
        fromStatus: 'submitted',
        toStatus: 'in_review',
      })
    );
    expect(payload).toEqual({
      success: true,
      data: expect.objectContaining({
        workflow: expect.objectContaining({
          status: 'in_review',
          assignedTo: expect.objectContaining({
            id: copyEditor.id,
          }),
        }),
      }),
      message: 'Story moved to in_review.',
    });
  });

  it('prevents another copy editor from claiming a submitted story already assigned to someone else', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-editor-2',
      email: 'copy2@example.com',
      name: 'Second Copy Editor',
      role: 'copy_editor',
    });
    getStoredStoryByIdMock.mockResolvedValue({
      _id: 'story-1',
      title: 'Reporter Story',
      author: 'Reporter One',
      isPublished: false,
      updatedAt: '2026-04-24T10:00:00.000Z',
      workflow: {
        status: 'submitted',
        createdBy: {
          id: 'reporter-1',
          name: 'Reporter One',
          email: 'reporter@example.com',
          role: 'reporter',
        },
        assignedTo: {
          id: 'copy-editor-1',
          name: 'Copy Editor',
          email: 'copy@example.com',
          role: 'copy_editor',
        },
      },
    });

    const { PATCH } = await import('@/app/api/admin/stories/[id]/route');
    const response = await PATCH(createPatchRequest({ action: 'start_review' }), {
      params: Promise.resolve({ id: 'story-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      success: false,
      error: 'Forbidden',
    });
    expect(updateStoredStoryMock).not.toHaveBeenCalled();
  });

  it('passes the displaced Mongo story assignee to reassignment notifications', async () => {
    const previousAssignee = {
      id: 'copy-editor-1',
      name: 'Copy Editor',
      email: 'copy@example.com',
      role: 'copy_editor',
    };
    const nextAssignee = {
      _id: 'reporter-1',
      name: 'Reporter One',
      email: 'reporter@example.com',
      role: 'reporter',
      isActive: true,
    };
    const currentStory = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Mongo Story',
      author: 'Reporter One',
      isPublished: false,
      workflow: {
        status: 'submitted',
        priority: 'normal',
        createdBy: {
          id: 'reporter-2',
          name: 'Reporter Two',
          email: 'reporter2@example.com',
          role: 'reporter',
        },
        assignedTo: previousAssignee,
        reviewedBy: null,
        submittedAt: '2026-04-24T09:55:00.000Z',
        approvedAt: null,
        rejectedAt: null,
        publishedAt: null,
        scheduledFor: null,
        dueAt: null,
        rejectionReason: '',
        comments: [],
      },
    };
    const updatedStory = {
      ...currentStory,
      workflow: {
        ...currentStory.workflow,
        status: 'assigned',
        assignedTo: {
          id: 'reporter-1',
          name: nextAssignee.name,
          email: nextAssignee.email,
          role: nextAssignee.role,
        },
      },
      toObject: () => updatedStory,
    };

    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    process.env.MONGODB_URI = 'mongodb://test.invalid/lokswami';
    connectDBMock.mockResolvedValue(undefined);
    const StoryModel = (await import('@/lib/models/Story')).default as unknown as {
      findById: ReturnType<typeof vi.fn>;
      findByIdAndUpdate: ReturnType<typeof vi.fn>;
      findOneAndUpdate: ReturnType<typeof vi.fn>;
    };
    const UserModel = (await import('@/lib/models/User')).default as unknown as {
      findOne: ReturnType<typeof vi.fn>;
    };
    StoryModel.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(currentStory) });
    StoryModel.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedStory),
    });
    UserModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(nextAssignee) }),
    });

    const { PATCH } = await import('@/app/api/admin/stories/[id]/route');
    const response = await PATCH(createPatchRequest({
      action: 'assign',
      assignedToId: 'reporter-1',
    }), {
      params: Promise.resolve({ id: '507f1f77bcf86cd799439011' }),
    });

    expect(response.status).toBe(200);
    expect(notifyWorkflowEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assign',
      workflow: expect.objectContaining({
        assignedTo: expect.objectContaining({ id: 'reporter-1' }),
      }),
      previousAssignee,
    }));
  });

  it('allows reporters to submit and update story captions without any length restrictions', async () => {
    const reporter = {
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter One',
      role: 'reporter',
    };
    const draftStory = {
      _id: 'story-1',
      title: 'Reporter Story',
      author: 'Reporter One',
      caption: 'Short',
      thumbnail: 'https://example.com/thumb.jpg',
      mediaType: 'image' as const,
      mediaUrl: 'https://example.com/thumb.jpg',
      isPublished: false,
      updatedAt: '2026-04-24T10:00:00.000Z',
      workflow: {
        status: 'draft',
        createdBy: {
          id: 'reporter-1',
          name: 'Reporter One',
          email: 'reporter@example.com',
          role: 'reporter',
        },
      },
    };
    getAdminSessionMock.mockResolvedValue(reporter);
    getStoredStoryByIdMock.mockResolvedValue(draftStory);
    updateStoredStoryMock.mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({
      ...draftStory,
      ...updates,
    }));

    const longCaption = 'A'.repeat(10000);
    const { PUT } = await import('@/app/api/admin/stories/[id]/route');
    const response = await PUT(createPutRequest({ caption: longCaption }), {
      params: Promise.resolve({ id: 'story-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
  });

  it.each([
    { isPublished: true },
    { publishedAt: '2099-01-01T00:00:00.000Z' },
    { scheduledFor: '2099-01-01T00:00:00.000Z' },
    { workflow: { status: 'published' } },
  ])('rejects publication state in an ordinary Story update: %o', async (forgedFields) => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });

    const { PUT } = await import('@/app/api/admin/stories/[id]/route');
    const response = await PUT(
      createPutRequest({ title: 'Legitimate edit', ...forgedFields }),
      { params: Promise.resolve({ id: 'story-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe(
      'Publication state can only be changed through workflow actions.'
    );
    expect(getStoredStoryByIdMock).not.toHaveBeenCalled();
    expect(updateStoredStoryMock).not.toHaveBeenCalled();
    expect(recordStoryActivityMock).not.toHaveBeenCalled();
    expect(notifyWorkflowEventMock).not.toHaveBeenCalled();
  });

  it.each(['not-a-date', '2000-01-01T00:00:00.000Z'])(
    'rejects an invalid or past Story schedule without side effects: %s',
    async (scheduledFor) => {
      getAdminSessionMock.mockResolvedValue({
        id: 'admin-1',
        email: 'desk@example.com',
        name: 'Desk',
        role: 'admin',
      });
      getStoredStoryByIdMock.mockResolvedValue({
        _id: 'story-1',
        title: 'Ready Story',
        category: 'General',
        thumbnail: 'https://cdn.example.com/story.jpg',
        isPublished: false,
        workflow: {
          status: 'approved',
          priority: 'normal',
          createdBy: {
            id: 'reporter-1',
            email: 'reporter@example.com',
            name: 'Reporter',
            role: 'reporter',
          },
        },
      });

      const { PATCH } = await import('@/app/api/admin/stories/[id]/route');
      const response = await PATCH(
        createPatchRequest({ action: 'schedule', scheduledFor }),
        { params: Promise.resolve({ id: 'story-1' }) }
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe('scheduledFor must be a valid future date.');
      expect(updateStoredStoryMock).not.toHaveBeenCalled();
      expect(recordStoryActivityMock).not.toHaveBeenCalled();
      expect(notifyWorkflowEventMock).not.toHaveBeenCalled();
    }
  );

  it('accepts a valid future Story schedule through the workflow action', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    const current = {
      _id: 'story-1',
      title: 'Ready Story',
      category: 'General',
      thumbnail: 'https://cdn.example.com/story.jpg',
      isPublished: false,
      workflow: {
        status: 'approved',
        priority: 'normal',
        createdBy: {
          id: 'reporter-1',
          email: 'reporter@example.com',
          name: 'Reporter',
          role: 'reporter',
        },
      },
    };
    getStoredStoryByIdMock.mockResolvedValue(current);
    updateStoredStoryMock.mockImplementation(async (_id, updates) => ({
      ...current,
      ...updates,
    }));

    const { PATCH } = await import('@/app/api/admin/stories/[id]/route');
    const response = await PATCH(
      createPatchRequest({
        action: 'schedule',
        scheduledFor: '2099-01-01T00:00:00.000Z',
      }),
      { params: Promise.resolve({ id: 'story-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workflow.status).toBe('scheduled');
    expect(payload.data.isPublished).toBe(false);
    expect(recordStoryActivityMock).toHaveBeenCalledTimes(1);
    expect(notifyWorkflowEventMock).toHaveBeenCalledTimes(1);
  });

  it('rejects PUT request when expectedVersion is missing', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });

    const { PUT } = await import('@/app/api/admin/stories/[id]/route');
    const req = new Request('http://localhost/api/admin/stories/story-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No expected version' }),
    }) as unknown as NextRequest;

    const response = await PUT(req, {
      params: Promise.resolve({ id: 'story-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('A valid expectedVersion is required.');
  });

  it('returns HTTP 409 Conflict with STORY_VERSION_CONFLICT code on stale expectedVersion', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    const current = {
      _id: 'story-1',
      title: 'Current Story',
      version: 5,
      workflow: { status: 'draft' },
    };
    getStoredStoryByIdMock.mockResolvedValue(current);

    const { PUT } = await import('@/app/api/admin/stories/[id]/route');
    const req = new Request('http://localhost/api/admin/stories/story-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Stale Edit', expectedVersion: 4 }),
    }) as unknown as NextRequest;

    const response = await PUT(req, {
      params: Promise.resolve({ id: 'story-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      success: false,
      code: 'STORY_VERSION_CONFLICT',
      error: 'This story was updated elsewhere. Refresh before saving again.',
      currentVersion: 5,
    });
    expect(updateStoredStoryMock).not.toHaveBeenCalled();
    expect(recordStoryActivityMock).not.toHaveBeenCalled();
  });

  it('increments version on successful PUT and returns new version', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    const current = {
      _id: 'story-1',
      title: 'Current Story',
      version: 1,
      thumbnail: 'https://example.com/thumb.jpg',
      workflow: { status: 'draft' },
    };
    getStoredStoryByIdMock.mockResolvedValue(current);
    updateStoredStoryMock.mockImplementation(async (_id, updates) => ({
      ...current,
      ...updates,
      version: 2,
    }));

    const { PUT } = await import('@/app/api/admin/stories/[id]/route');
    const req = new Request('http://localhost/api/admin/stories/story-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Story', expectedVersion: 1 }),
    }) as unknown as NextRequest;

    const response = await PUT(req, {
      params: Promise.resolve({ id: 'story-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.version).toBe(2);
    expect(payload.data.title).toBe('Updated Story');
  });

  it('supports DELETE with expectedVersion and returns 409 on version mismatch', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    const { StoryVersionConflictError } = await import('@/lib/storage/storiesFile');
    deleteStoredStoryMock.mockRejectedValue(new StoryVersionConflictError(3));

    const { DELETE } = await import('@/app/api/admin/stories/[id]/route');
    const req = new Request('http://localhost/api/admin/stories/story-1?expectedVersion=2', {
      method: 'DELETE',
    }) as unknown as NextRequest;

    const response = await DELETE(req, {
      params: Promise.resolve({ id: 'story-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe('STORY_VERSION_CONFLICT');
    expect(payload.currentVersion).toBe(3);
  });
});
