import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const getStoredArticleByIdMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();
const updateStoredArticleMock = vi.fn();
const deleteStoredArticleMock = vi.fn();
const connectDBMock = vi.fn();
const recordArticleActivityMock = vi.fn();
const resolveReusableBreakingTtsMock = vi.fn();
const articleExistsMock = vi.fn();
const articleFindByIdMock = vi.fn();
const articleFindOneAndUpdateMock = vi.fn();
const articleFindOneAndDeleteMock = vi.fn();
const articleFindByIdAndUpdateMock = vi.fn();
const articleFindByIdAndDeleteMock = vi.fn();
const isArticleVersionConflictErrorMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    exists: articleExistsMock,
    findById: articleFindByIdMock,
    findOneAndUpdate: articleFindOneAndUpdateMock,
    findOneAndDelete: articleFindOneAndDeleteMock,
    findByIdAndUpdate: articleFindByIdAndUpdateMock,
    findByIdAndDelete: articleFindByIdAndDeleteMock,
  },
}));

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

vi.mock('@/lib/models/EPaperArticle', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  deleteStoredArticle: deleteStoredArticleMock,
  getStoredArticleById: getStoredArticleByIdMock,
  isArticleVersionConflictError: isArticleVersionConflictErrorMock,
  listAllStoredArticles: listAllStoredArticlesMock,
  updateStoredArticle: updateStoredArticleMock,
}));

vi.mock('@/lib/server/breakingTts', () => ({
  deleteStoredBreakingAudio: vi.fn(),
  ensureBreakingTtsForArticle: vi.fn(),
  resolveReusableBreakingTts: resolveReusableBreakingTtsMock,
}));

vi.mock('@/lib/server/articleActivity', () => ({
  buildArticleActivityMessage: vi.fn(() => 'Article activity recorded.'),
  recordArticleActivity: recordArticleActivityMock,
}));

vi.mock('@/lib/server/newsroomStoryLinks', () => ({
  clearStoryLinkedArticle: vi.fn(),
  syncStoryLinkedArticle: vi.fn(),
}));

function createJsonRequest(
  method: 'GET' | 'PATCH' | 'PUT' | 'DELETE',
  body?: Record<string, unknown>,
  searchParams?: Record<string, string>
) {
  const url = new URL('http://localhost/api/admin/articles/article-1');
  Object.entries(searchParams || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const request = new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest & { nextUrl: URL };

  Object.defineProperty(request, 'nextUrl', {
    value: new URL(request.url),
  });

  return request;
}

const MONGO_ARTICLE_ID = '507f1f77bcf86cd799439011';

function createFullArticleInput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Updated title',
    slug: 'updated-title',
    summary: 'Updated summary',
    content: '<p>Updated content</p>',
    image: 'https://cdn.example.com/updated.jpg',
    category: 'General',
    author: 'Desk',
    ...overrides,
  };
}

function createMongoArticleDocument(overrides: Record<string, unknown> = {}) {
  const data = {
    _id: MONGO_ARTICLE_ID,
    version: 2,
    title: 'Updated title',
    slug: 'updated-title',
    previousSlugs: [],
    isBreaking: false,
    breakingTts: null,
    workflow: { status: 'draft' },
    ...overrides,
  };

  return {
    ...data,
    save: vi.fn().mockResolvedValue(undefined),
    toObject: vi.fn(() => ({ ...data })),
  };
}

function createReadyWorkflowArticle(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'article-1',
    version: 4,
    title: 'Ready article',
    summary:
      'This ready summary includes the essential facts, location, and context for readers.',
    content:
      'This ready article contains verified newsroom copy with enough context to pass editorial readiness. It explains what happened, where it happened, why it matters, and what readers should expect next.',
    image: 'https://cdn.example.com/image.jpg',
    category: 'General',
    author: 'Desk',
    workflow: {
      status: 'approved',
      priority: 'normal',
      createdBy: {
        id: 'admin-1',
        name: 'Desk',
        email: 'desk@example.com',
        role: 'admin',
      },
    },
    ...overrides,
  };
}

describe('/api/admin/articles/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    listAllStoredArticlesMock.mockResolvedValue([]);
    resolveReusableBreakingTtsMock.mockReturnValue(null);
    isArticleVersionConflictErrorMock.mockReturnValue(false);
  });

  it('lets a reporter reopen their own changes-requested article', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 2,
      title: 'Returned report',
      workflow: {
        status: 'changes_requested',
        createdBy: {
          id: 'reporter-1',
          email: 'reporter@example.com',
          name: 'Reporter',
          role: 'reporter',
        },
      },
    });

    const { GET } = await import('@/app/api/admin/articles/[id]/route');
    const response = await GET(createJsonRequest('GET'), {
      params: Promise.resolve({ id: 'article-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual(
      expect.objectContaining({ _id: 'article-1', title: 'Returned report' })
    );
  });

  it('keeps another reporter article private', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      title: 'Another reporter article',
      workflow: {
        status: 'changes_requested',
        createdBy: {
          id: 'reporter-2',
          email: 'reporter2@example.com',
          name: 'Other Reporter',
          role: 'reporter',
        },
      },
    });

    const { GET } = await import('@/app/api/admin/articles/[id]/route');
    const response = await GET(createJsonRequest('GET'), {
      params: Promise.resolve({ id: 'article-1' }),
    });

    expect(response.status).toBe(403);
  });

  it('lets a copy editor reopen their explicitly owned direct-article draft', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-1',
      email: 'copy@example.com',
      name: 'Copy Editor',
      role: 'copy_editor',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 2,
      title: 'Copy desk draft',
      slug: 'copy-desk-draft',
      workflow: {
        status: 'draft',
        createdBy: {
          id: 'copy-1',
          email: 'copy@example.com',
          name: 'Copy Editor',
          role: 'copy_editor',
        },
      },
    });

    const { GET } = await import('@/app/api/admin/articles/[id]/route');
    const response = await GET(createJsonRequest('GET'), {
      params: Promise.resolve({ id: 'article-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual(
      expect.objectContaining({ _id: 'article-1', title: 'Copy desk draft' })
    );
  });

  it('keeps another copy editor draft private from detail reads and autosave', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-1',
      email: 'copy@example.com',
      name: 'Copy Editor',
      role: 'copy_editor',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 2,
      title: 'Private draft',
      slug: 'private-draft',
      workflow: {
        status: 'draft',
        createdBy: {
          id: 'copy-2',
          email: 'copy2@example.com',
          name: 'Another Copy Editor',
          role: 'copy_editor',
        },
      },
    });

    const { GET, PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const readResponse = await GET(createJsonRequest('GET'), {
      params: Promise.resolve({ id: 'article-1' }),
    });
    const patchResponse = await PATCH(
      createJsonRequest('PATCH', {
        title: 'Unauthorized change',
        autosave: true,
        expectedVersion: 2,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(readResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('lets a reporter save permitted corrections without changing desk metadata', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 2,
      title: 'Returned report',
      slug: 'returned-report',
      summary: 'Original summary',
      content: '<p>Original content</p>',
      image: 'https://cdn.example.com/original.jpg',
      category: 'Politics',
      author: 'Reporter',
      isBreaking: false,
      workflow: {
        status: 'changes_requested',
        createdBy: {
          id: 'reporter-1',
          email: 'reporter@example.com',
          name: 'Reporter',
          role: 'reporter',
        },
      },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      version: 3,
      title: 'Corrected title',
      workflow: { status: 'changes_requested' },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        title: 'Corrected title',
        category: 'Forged desk category',
        isBreaking: true,
        seo: { metaTitle: 'Forged SEO' },
        copyEditorMeta: { proofreadComplete: true },
        expectedVersion: 2,
      }),
      {
        params: Promise.resolve({ id: 'article-1' }),
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.title).toBe('Corrected title');
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ title: 'Corrected title' }),
      expect.any(Object)
    );
    const updates = updateStoredArticleMock.mock.calls[0]?.[1];
    expect(updates).not.toHaveProperty('category');
    expect(updates).not.toHaveProperty('isBreaking');
    expect(updates).not.toHaveProperty('seo');
    expect(updates).not.toHaveProperty('copyEditorMeta');
  });

  it('lets a reporter resubmit their corrected changes-requested article', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });
    const current = createReadyWorkflowArticle({
      workflow: {
        status: 'changes_requested',
        priority: 'normal',
        createdBy: {
          id: 'reporter-1',
          email: 'reporter@example.com',
          name: 'Reporter',
          role: 'reporter',
        },
      },
    });
    getStoredArticleByIdMock.mockResolvedValue(current);
    updateStoredArticleMock.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({
        ...current,
        version: 5,
        ...updates,
      })
    );

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', { action: 'submit', expectedVersion: 4 }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workflow.status).toBe('submitted');
    expect(recordArticleActivityMock).toHaveBeenCalledTimes(1);
  });

  it.each(['assign', 'approve', 'reject', 'schedule', 'publish', 'fast_publish'])(
    'prevents a reporter from invoking the privileged %s action',
    async (action) => {
      getAdminSessionMock.mockResolvedValue({
        id: 'reporter-1',
        email: 'reporter@example.com',
        name: 'Reporter',
        role: 'reporter',
      });
      getStoredArticleByIdMock.mockResolvedValue(
        createReadyWorkflowArticle({
          workflow: {
            status: 'changes_requested',
            createdBy: {
              id: 'reporter-1',
              email: 'reporter@example.com',
              name: 'Reporter',
              role: 'reporter',
            },
          },
        })
      );

      const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
      const response = await PATCH(
        createJsonRequest('PATCH', {
          action,
          expectedVersion: 4,
          assignedToId: 'reporter-1',
          scheduledFor: '2099-01-01T00:00:00.000Z',
          rejectionReason: 'Desk-only reason',
          comment: 'Urgent desk-only exception',
        }),
        { params: Promise.resolve({ id: 'article-1' }) }
      );

      expect(response.status).toBe(403);
      expect(updateStoredArticleMock).not.toHaveBeenCalled();
      expect(recordArticleActivityMock).not.toHaveBeenCalled();
    }
  );

  it.each(['not-a-date', '2000-01-01T00:00:00.000Z'])(
    'rejects an invalid or past Article schedule without side effects: %s',
    async (scheduledFor) => {
      getAdminSessionMock.mockResolvedValue({
        id: 'admin-1',
        email: 'desk@example.com',
        name: 'Desk',
        role: 'admin',
      });
      getStoredArticleByIdMock.mockResolvedValue(
        createReadyWorkflowArticle({ workflow: { status: 'approved', priority: 'normal' } })
      );

      const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
      const response = await PATCH(
        createJsonRequest('PATCH', {
          action: 'schedule',
          expectedVersion: 4,
          scheduledFor,
        }),
        { params: Promise.resolve({ id: 'article-1' }) }
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe('scheduledFor must be a valid future date.');
      expect(updateStoredArticleMock).not.toHaveBeenCalled();
      expect(recordArticleActivityMock).not.toHaveBeenCalled();
    }
  );

  it('accepts a valid future Article schedule through the workflow action', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    const current = createReadyWorkflowArticle({
      workflow: { status: 'approved', priority: 'normal' },
    });
    getStoredArticleByIdMock.mockResolvedValue(current);
    updateStoredArticleMock.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({
        ...current,
        version: 5,
        ...updates,
      })
    );

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'schedule',
        expectedVersion: 4,
        scheduledFor: '2099-01-01T00:00:00.000Z',
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workflow.status).toBe('scheduled');
    expect(recordArticleActivityMock).toHaveBeenCalledTimes(1);
  });

  it('allows a copy editor to autosave their own direct-article draft', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-1',
      email: 'copy@example.com',
      name: 'Copy Editor',
      role: 'copy_editor',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 2,
      title: 'Copy desk draft',
      slug: 'copy-desk-draft',
      previousSlugs: [],
      updatedAt: '2026-07-14T08:30:00.000Z',
      workflow: {
        status: 'draft',
        createdBy: {
          id: 'copy-1',
          email: 'copy@example.com',
          name: 'Copy Editor',
          role: 'copy_editor',
        },
      },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      version: 3,
      title: 'Updated copy desk draft',
      workflow: { status: 'draft' },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        title: 'Updated copy desk draft',
        autosave: true,
        expectedVersion: 2,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ title: 'Updated copy desk draft' }),
      { skipRevision: true, expectedVersion: 2 }
    );
  });

  it('rejects a stale autosave instead of overwriting a newer draft', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 4,
      title: 'Newer server title',
      slug: 'newer-server-title',
      previousSlugs: [],
      updatedAt: '2026-07-13T08:30:00.000Z',
      workflow: {
        status: 'draft',
        createdBy: {
          id: 'admin-1',
          email: 'desk@example.com',
          name: 'Desk',
          role: 'admin',
        },
      },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        title: 'Stale browser title',
        autosave: true,
        expectedVersion: 3,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual(
      expect.objectContaining({
        success: false,
        code: 'ARTICLE_VERSION_CONFLICT',
        currentVersion: 4,
        updatedAt: '2026-07-13T08:30:00.000Z',
      })
    );
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('autosaves a current draft without creating a revision snapshot', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 4,
      title: 'Draft title',
      slug: 'draft-title',
      previousSlugs: [],
      updatedAt: '2026-07-13T08:30:00.000Z',
      workflow: {
        status: 'draft',
        createdBy: {
          id: 'admin-1',
          email: 'desk@example.com',
          name: 'Desk',
          role: 'admin',
        },
      },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      version: 5,
      title: 'Updated draft title',
      workflow: { status: 'draft' },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        title: 'Updated draft title',
        autosave: true,
        expectedVersion: 4,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ title: 'Updated draft title' }),
      { skipRevision: true, expectedVersion: 4 }
    );
  });

  it('rejects a stale full edit instead of overwriting a newer article', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 5,
      title: 'Newer server title',
      slug: 'newer-server-title',
      previousSlugs: [],
      updatedAt: '2026-07-13T09:30:00.000Z',
      workflow: { status: 'draft' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', {
        expectedVersion: 4,
        title: 'Stale browser title',
        summary: 'Stale browser summary',
        content: 'Stale browser content',
        image: 'https://cdn.example.com/stale.jpg',
        category: 'General',
        author: 'Desk',
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual(
      expect.objectContaining({
        success: false,
        code: 'ARTICLE_VERSION_CONFLICT',
        currentVersion: 5,
        updatedAt: '2026-07-13T09:30:00.000Z',
      })
    );
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('uses the current version as a compare-and-swap guard for a full edit', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 5,
      title: 'Current title',
      slug: 'current-title',
      previousSlugs: [],
      updatedAt: '2026-07-13T09:30:00.000Z',
      workflow: { status: 'draft' },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      version: 6,
      title: 'Guarded title',
      isBreaking: false,
      breakingTts: null,
      workflow: { status: 'draft' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', {
        expectedVersion: 5,
        title: 'Guarded title',
        summary: 'Guarded summary',
        content: 'Guarded content',
        image: 'https://cdn.example.com/guarded.jpg',
        category: 'General',
        author: 'Desk',
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenNthCalledWith(
      1,
      'article-1',
      expect.objectContaining({ title: 'Guarded title' }),
      { expectedVersion: 5 }
    );
  });

  it('patches a legacy Mongo article with no stored version using logical version 1', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    articleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: MONGO_ARTICLE_ID,
        title: 'Legacy title',
        slug: 'legacy-title',
        previousSlugs: [],
        updatedAt: '2026-07-13T09:30:00.000Z',
        workflow: {
          status: 'draft',
          createdBy: {
            id: 'admin-1',
            email: 'desk@example.com',
            name: 'Desk',
            role: 'admin',
          },
        },
      }),
    });
    articleFindOneAndUpdateMock.mockResolvedValue(
      createMongoArticleDocument({ title: 'Updated legacy title' })
    );

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        title: 'Updated legacy title',
        autosave: true,
        expectedVersion: 1,
      }),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.version).toBe(2);
    expect(articleFindOneAndUpdateMock).toHaveBeenCalledWith(
      {
        _id: MONGO_ARTICLE_ID,
        $or: [{ version: 1 }, { version: { $exists: false } }],
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          title: 'Updated legacy title',
          version: 2,
        }),
      }),
      { new: true, runValidators: true }
    );
    const mongoUpdate = articleFindOneAndUpdateMock.mock.calls[0]?.[1];
    expect(mongoUpdate).not.toHaveProperty('$inc');
  });

  it('replaces a legacy Mongo article with no stored version using logical version 1', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    articleExistsMock.mockResolvedValue(false);
    articleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: MONGO_ARTICLE_ID,
        title: 'Legacy title',
        slug: 'legacy-title',
        previousSlugs: [],
        updatedAt: '2026-07-13T09:30:00.000Z',
        workflow: {
          status: 'draft',
          createdBy: {
            id: 'admin-1',
            email: 'desk@example.com',
            name: 'Desk',
            role: 'admin',
          },
        },
      }),
    });
    articleFindOneAndUpdateMock.mockResolvedValue(
      createMongoArticleDocument({ title: 'Replaced legacy title' })
    );

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', {
        expectedVersion: 1,
        title: 'Replaced legacy title',
        summary: 'Updated legacy summary',
        content: 'Updated legacy article content',
        image: 'https://cdn.example.com/legacy.jpg',
        category: 'General',
        author: 'Desk',
      }),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.version).toBe(2);
    expect(articleFindOneAndUpdateMock).toHaveBeenCalledWith(
      {
        _id: MONGO_ARTICLE_ID,
        $or: [{ version: 1 }, { version: { $exists: false } }],
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          title: 'Replaced legacy title',
          version: 2,
        }),
      }),
      { new: true, runValidators: true }
    );
    const mongoUpdate = articleFindOneAndUpdateMock.mock.calls[0]?.[1];
    expect(mongoUpdate).not.toHaveProperty('$inc');
  });

  it('lets a reporter replace permitted fields on their rejected article without privilege expansion', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 2,
      title: 'Rejected report',
      slug: 'rejected-report',
      previousSlugs: [],
      summary: 'Original summary',
      content: '<p>Original content</p>',
      image: 'https://cdn.example.com/original.jpg',
      category: 'Politics',
      author: 'Reporter',
      isBreaking: false,
      isTrending: false,
      workflow: {
        status: 'rejected',
        createdBy: {
          id: 'reporter-1',
          email: 'reporter@example.com',
          name: 'Reporter',
          role: 'reporter',
        },
      },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      version: 3,
      title: 'Corrected rejected report',
      workflow: { status: 'rejected' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', {
        title: 'Updated title',
        summary: 'Updated summary',
        content: 'Updated content',
        image: 'https://cdn.example.com/updated.jpg',
        category: 'Forged category',
        author: 'Forged author',
        isBreaking: true,
        expectedVersion: 2,
      }),
      {
        params: Promise.resolve({ id: 'article-1' }),
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    const updates = updateStoredArticleMock.mock.calls[0]?.[1];
    expect(updates).toEqual(
      expect.objectContaining({
        title: 'Updated title',
        summary: 'Updated summary',
        content: 'Updated content',
        image: 'https://cdn.example.com/updated.jpg',
      })
    );
    expect(updates).not.toHaveProperty('category');
    expect(updates).not.toHaveProperty('author');
    expect(updates).not.toHaveProperty('isBreaking');
    expect(deleteStoredArticleMock).not.toHaveBeenCalled();
  });

  it('publishes an approved article through the workflow action route', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue(createReadyWorkflowArticle());
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      version: 5,
      title: 'Ready article',
      workflow: { status: 'published' },
      publishedAt: '2026-05-12T10:00:00.000Z',
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', { action: 'publish', expectedVersion: 4 }),
      {
      params: Promise.resolve({ id: 'article-1' }),
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: expect.objectContaining({
        _id: 'article-1',
        workflow: { status: 'published' },
      }),
      message: 'Article moved to published.',
    });
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({
        workflow: expect.objectContaining({
          status: 'published',
        }),
        publishedAt: expect.any(String),
      }),
      { skipRevision: true, expectedVersion: 4 }
    );
    expect(recordArticleActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article-1',
        action: 'publish',
        fromStatus: 'approved',
        toStatus: 'published',
      })
    );
  });

  it('rejects a stale workflow action before updating the file store', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue(createReadyWorkflowArticle());

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', { action: 'publish', expectedVersion: 3 }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual(
      expect.objectContaining({
        code: 'ARTICLE_VERSION_CONFLICT',
        currentVersion: 4,
      })
    );
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
    expect(recordArticleActivityMock).not.toHaveBeenCalled();
  });

  it('returns 409 when a file-store workflow action loses its queued version claim', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue(createReadyWorkflowArticle());
    const conflict = Object.assign(new Error('stale workflow'), { currentVersion: 5 });
    updateStoredArticleMock.mockRejectedValue(conflict);
    isArticleVersionConflictErrorMock.mockReturnValue(true);

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', { action: 'publish', expectedVersion: 4 }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual(
      expect.objectContaining({
        code: 'ARTICLE_VERSION_CONFLICT',
        currentVersion: 5,
      })
    );
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ workflow: expect.objectContaining({ status: 'published' }) }),
      { skipRevision: true, expectedVersion: 4 }
    );
    expect(recordArticleActivityMock).not.toHaveBeenCalled();
  });

  it('atomically advances a legacy Mongo workflow action from logical version 1 to 2', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    articleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        createReadyWorkflowArticle({ _id: MONGO_ARTICLE_ID, version: undefined })
      ),
    });
    articleFindOneAndUpdateMock.mockResolvedValue(
      createMongoArticleDocument({ workflow: { status: 'published' }, version: 2 })
    );

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', { action: 'publish', expectedVersion: 1 }),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.version).toBe(2);
    expect(articleFindOneAndUpdateMock).toHaveBeenCalledWith(
      {
        _id: MONGO_ARTICLE_ID,
        $or: [{ version: 1 }, { version: { $exists: false } }],
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          workflow: expect.objectContaining({ status: 'published' }),
          version: 2,
        }),
      }),
      { new: true, runValidators: true }
    );
    expect(articleFindOneAndUpdateMock.mock.calls[0]?.[1]).not.toHaveProperty('$inc');
    expect(recordArticleActivityMock).toHaveBeenCalledTimes(1);
  });

  it('returns 409 without activity when a Mongo workflow action loses its CAS', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    articleFindByIdMock
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(
          createReadyWorkflowArticle({ _id: MONGO_ARTICLE_ID, version: 7 })
        ),
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          _id: MONGO_ARTICLE_ID,
          version: 8,
          updatedAt: '2026-07-14T10:00:00.000Z',
        }),
      });
    articleFindOneAndUpdateMock.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', { action: 'publish', expectedVersion: 7 }),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual(
      expect.objectContaining({
        code: 'ARTICLE_VERSION_CONFLICT',
        currentVersion: 8,
      })
    );
    expect(articleFindOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: MONGO_ARTICLE_ID, version: 7 },
      expect.objectContaining({ $inc: { version: 1 } }),
      { new: true, runValidators: true }
    );
    expect(recordArticleActivityMock).not.toHaveBeenCalled();
  });

  it('blocks publishing breaking articles without ready manual breaking audio', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      title: 'Breaking article',
      summary: 'Ready summary',
      content: 'Ready content',
      image: 'https://cdn.example.com/image.jpg',
      category: 'General',
      author: 'Desk',
      isBreaking: true,
      breakingTts: null,
      workflow: {
        status: 'approved',
        priority: 'normal',
        createdBy: {
          id: 'admin-1',
          name: 'Desk',
          email: 'desk@example.com',
          role: 'admin',
        },
      },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(createJsonRequest('PATCH', { action: 'publish' }), {
      params: Promise.resolve({ id: 'article-1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: 'Upload breaking news audio before publishing this breaking article.',
    });
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('returns 409 when a queued file-store delete loses its version claim', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      version: 4,
      workflow: { status: 'draft' },
      updatedAt: '2026-07-14T09:00:00.000Z',
    });
    deleteStoredArticleMock.mockRejectedValue(
      Object.assign(new Error('stale delete'), { currentVersion: 5 })
    );
    isArticleVersionConflictErrorMock.mockReturnValue(true);

    const { DELETE } = await import('@/app/api/admin/articles/[id]/route');
    const response = await DELETE(
      createJsonRequest('DELETE', undefined, { expectedVersion: '4' }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual(
      expect.objectContaining({
        code: 'ARTICLE_VERSION_CONFLICT',
        currentVersion: 5,
      })
    );
    expect(deleteStoredArticleMock).toHaveBeenCalledWith('article-1', {
      expectedVersion: 4,
    });
  });

  it('rejects a stale Mongo delete before removing the article', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    articleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: MONGO_ARTICLE_ID,
        version: 4,
        workflow: { status: 'draft' },
        updatedAt: '2026-07-14T09:00:00.000Z',
      }),
    });

    const { DELETE } = await import('@/app/api/admin/articles/[id]/route');
    const response = await DELETE(
      createJsonRequest('DELETE', undefined, { expectedVersion: '3' }),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual(
      expect.objectContaining({
        code: 'ARTICLE_VERSION_CONFLICT',
        currentVersion: 4,
      })
    );
    expect(articleFindOneAndDeleteMock).not.toHaveBeenCalled();
  });

  it('atomically deletes a legacy Mongo article at logical version 1', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    const legacyArticle = {
      _id: MONGO_ARTICLE_ID,
      workflow: { status: 'draft' },
      updatedAt: '2026-07-14T09:00:00.000Z',
    };
    articleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(legacyArticle),
    });
    articleFindOneAndDeleteMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(legacyArticle),
    });

    const { DELETE } = await import('@/app/api/admin/articles/[id]/route');
    const response = await DELETE(
      createJsonRequest('DELETE', undefined, { expectedVersion: '1' }),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );

    expect(response.status).toBe(200);
    expect(articleFindOneAndDeleteMock).toHaveBeenCalledWith({
      _id: MONGO_ARTICLE_ID,
      $or: [{ version: 1 }, { version: { $exists: false } }],
    });
  });

  it('records the old slug when replacing an article slug', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      title: 'Old title',
      summary: 'Old summary',
      content: 'Old content',
      image: 'https://cdn.example.com/old.jpg',
      category: 'General',
      author: 'Desk',
      slug: 'old-title',
      previousSlugs: [],
      workflow: { status: 'published' },
    });
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'article-1',
        slug: 'old-title',
        previousSlugs: [],
      },
    ]);
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      slug: 'new-title',
      previousSlugs: ['old-title'],
      isBreaking: false,
      workflow: { status: 'published' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', {
        title: 'New title',
        slug: 'new-title',
        summary: 'Updated summary',
        content: 'Updated content',
        image: 'https://cdn.example.com/updated.jpg',
        category: 'General',
        author: 'Desk',
      }),
      {
        params: Promise.resolve({ id: 'article-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({
        slug: 'new-title',
        previousSlugs: ['old-title'],
      })
    );
  });

  it('allows a file-store full save carrying an unchanged historical external canonical', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1', email: 'desk@example.com', name: 'Desk', role: 'admin',
    });
    const historicalCanonical = 'https://example.com/historical-story';
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      ...createFullArticleInput(),
      seo: { canonicalUrl: historicalCanonical },
      workflow: { status: 'published' },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      slug: 'updated-title',
      seo: { canonicalUrl: historicalCanonical },
      workflow: { status: 'published' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', createFullArticleInput({
        summary: 'Unrelated summary edit',
        seo: { canonicalUrl: `  ${historicalCanonical}  ` },
      })),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({
        summary: 'Unrelated summary edit',
        seo: expect.objectContaining({ canonicalUrl: historicalCanonical }),
      })
    );
  });

  it('allows a Mongo full save carrying an unchanged historical external canonical', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1', email: 'desk@example.com', name: 'Desk', role: 'admin',
    });
    const historicalCanonical = 'https://example.com/historical-story';
    articleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: MONGO_ARTICLE_ID,
        ...createFullArticleInput(),
        seo: { canonicalUrl: historicalCanonical },
        workflow: { status: 'published' },
      }),
    });
    articleFindByIdAndUpdateMock.mockResolvedValue(createMongoArticleDocument({
      seo: { canonicalUrl: historicalCanonical },
      workflow: { status: 'published' },
    }));

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', createFullArticleInput({
        seo: { canonicalUrl: historicalCanonical },
      })),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );

    expect(response.status).toBe(200);
    expect(articleFindByIdAndUpdateMock).toHaveBeenCalledWith(
      MONGO_ARTICLE_ID,
      expect.objectContaining({
        $set: expect.objectContaining({
          seo: expect.objectContaining({ canonicalUrl: historicalCanonical }),
        }),
      }),
      { new: true, runValidators: true }
    );
  });

  it('allows a slug change when the carried canonical still names the old slug', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1', email: 'desk@example.com', name: 'Desk', role: 'admin',
    });
    const oldCanonical = 'https://lokswami.com/main/article/old-title';
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      ...createFullArticleInput({ slug: 'old-title' }),
      previousSlugs: [],
      seo: { canonicalUrl: oldCanonical },
      workflow: { status: 'published' },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1',
      slug: 'new-title',
      previousSlugs: ['old-title'],
      seo: { canonicalUrl: oldCanonical },
      workflow: { status: 'published' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', createFullArticleInput({
        slug: 'new-title',
        seo: { canonicalUrl: oldCanonical },
      })),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({
        slug: 'new-title',
        previousSlugs: ['old-title'],
        seo: expect.objectContaining({ canonicalUrl: oldCanonical }),
      })
    );
  });

  it.each([
    ['https://example.com/updated-title', /public site origin/i],
    ['https://lokswami.com/main/article/another-article', /current public slug/i],
    ['https://lokswami.com/main/article/updated-title?ref=other', /clean, queryless/i],
  ])('rejects a newly changed invalid canonical %s', async (canonicalUrl, errorPattern) => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1', email: 'desk@example.com', name: 'Desk', role: 'admin',
    });
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      ...createFullArticleInput(),
      seo: { canonicalUrl: 'https://example.com/historical-story' },
      workflow: { status: 'published' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PUT(
      createJsonRequest('PUT', createFullArticleInput({ seo: { canonicalUrl } })),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(errorPattern);
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('preserves omission and allows explicit clearing as distinct full-save operations', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1', email: 'desk@example.com', name: 'Desk', role: 'admin',
    });
    const historicalCanonical = 'https://example.com/historical-story';
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      ...createFullArticleInput(),
      seo: { canonicalUrl: historicalCanonical },
      workflow: { status: 'published' },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1', slug: 'updated-title', workflow: { status: 'published' },
    });

    const { PUT } = await import('@/app/api/admin/articles/[id]/route');
    const omittedResponse = await PUT(
      createJsonRequest('PUT', createFullArticleInput({ seo: { metaTitle: 'Updated SEO' } })),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    expect(omittedResponse.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenLastCalledWith(
      'article-1',
      expect.objectContaining({
        seo: expect.objectContaining({ canonicalUrl: historicalCanonical }),
      })
    );

    const clearedResponse = await PUT(
      createJsonRequest('PUT', createFullArticleInput({ seo: { canonicalUrl: '' } })),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    expect(clearedResponse.status).toBe(200);
    expect(updateStoredArticleMock).toHaveBeenLastCalledWith(
      'article-1',
      expect.objectContaining({ seo: expect.objectContaining({ canonicalUrl: '' }) })
    );
  });

  it('allows an unchanged historical canonical through PATCH but validates a changed value', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1', email: 'desk@example.com', name: 'Desk', role: 'admin',
    });
    const historicalCanonical = 'https://example.com/historical-story';
    getStoredArticleByIdMock.mockResolvedValue({
      _id: 'article-1',
      title: 'Current title',
      slug: 'current-title',
      previousSlugs: [],
      seo: { canonicalUrl: historicalCanonical },
      workflow: { status: 'published' },
    });
    updateStoredArticleMock.mockResolvedValue({
      _id: 'article-1', slug: 'current-title', workflow: { status: 'published' },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const unchanged = await PATCH(
      createJsonRequest('PATCH', { seo: { canonicalUrl: historicalCanonical } }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    expect(unchanged.status).toBe(200);

    const changed = await PATCH(
      createJsonRequest('PATCH', { seo: { canonicalUrl: 'https://example.com/changed' } }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    expect(changed.status).toBe(400);
  });
});
