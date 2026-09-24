import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const getStoredStoryByIdMock = vi.fn();
const updateStoredStoryMock = vi.fn();
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
  createStoredStory: vi.fn(),
  deleteStoredStory: vi.fn(),
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
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function createPutRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/stories/story-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
      })
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
    };
    const UserModel = (await import('@/lib/models/User')).default as unknown as {
      findOne: ReturnType<typeof vi.fn>;
    };
    StoryModel.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(currentStory) });
    StoryModel.findByIdAndUpdate.mockResolvedValue(updatedStory);
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
});
