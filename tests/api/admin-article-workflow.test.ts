import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const getStoredArticleByIdMock = vi.fn();
const updateStoredArticleMock = vi.fn();
const isArticleVersionConflictErrorMock = vi.fn();
const connectDBMock = vi.fn();
const recordArticleActivityMock = vi.fn();
const notifyWorkflowEventMock = vi.fn();
const resolveReusableBreakingTtsMock = vi.fn();
const userFindOneMock = vi.fn();
const articleFindByIdMock = vi.fn();
const articleFindOneAndUpdateMock = vi.fn();
const epaperFindByIdMock = vi.fn();
const epaperArticleFindByIdMock = vi.fn();
const epaperArticleFindByIdAndUpdateMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    exists: vi.fn(),
    findById: articleFindByIdMock,
    findOneAndUpdate: articleFindOneAndUpdateMock,
    findOneAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    findById: epaperFindByIdMock,
    findByIdAndUpdate: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/lib/models/EPaperArticle', () => ({
  default: {
    findById: epaperArticleFindByIdMock,
    findByIdAndUpdate: epaperArticleFindByIdAndUpdateMock,
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    }),
  },
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: userFindOneMock,
  },
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  deleteStoredArticle: vi.fn(),
  getStoredArticleById: getStoredArticleByIdMock,
  isArticleVersionConflictError: isArticleVersionConflictErrorMock,
  listAllStoredArticles: vi.fn(),
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

vi.mock('@/lib/server/workflowNotificationEvents', () => ({
  notifyWorkflowEvent: notifyWorkflowEventMock,
}));

vi.mock('@/lib/server/epaperWorkflowPolicy', () => ({
  assertEpaperDraftEditable: vi.fn(),
  invalidateEpaperQa: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/epaperWorkflowAutomation', () => ({
  applyEpaperWorkflowAutomation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/newsroomStoryLinks', () => ({
  clearStoryLinkedArticle: vi.fn(),
  syncStoryLinkedArticle: vi.fn(),
}));

function createJsonRequest(
  method: 'GET' | 'PATCH' | 'PUT' | 'DELETE',
  body?: Record<string, unknown>,
  searchParams?: Record<string, string>,
  articleId = 'article-1'
) {
  const url = new URL(`http://localhost/api/admin/articles/${articleId}`);
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
const READY_SUMMARY =
  'This is a comprehensive summary that contains all required context and details to pass editorial readiness blockers.';
const READY_CONTENT =
  '<p>This article contains enough thorough journalism, background information, verified facts, and quotes to pass all readiness checks before editorial approval or publication.</p>';

function createBaseTestArticle(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'article-1',
    id: 'article-1',
    version: 3,
    title: 'Ready editorial headline',
    slug: 'ready-editorial-headline',
    summary: READY_SUMMARY,
    content: READY_CONTENT,
    category: 'National',
    author: 'Chief Correspondent',
    image: 'https://cdn.example.com/ready.jpg',
    isBreaking: false,
    isTrending: false,
    updatedAt: '2026-09-09T10:00:00.000Z',
    workflow: {
      status: 'draft',
      priority: 'normal',
      assignedTo: null,
      comments: [],
      createdBy: {
        id: 'editor-1',
        name: 'Editor In Charge',
        email: 'editor@example.com',
        role: 'copy_editor',
      },
    },
    reporterMeta: {
      sourceInfo: 'Staff reporting',
      locationTag: 'New Delhi',
    },
    editorial: {
      factCheckStatus: 'verified',
      toneTag: 'objective',
      flagApprovedBy: '',
    },
    ...overrides,
  };
}

describe('Admin Article Workflow Characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    resolveReusableBreakingTtsMock.mockReturnValue(null);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin Boss',
      role: 'admin',
    });
  });

  afterEach(() => {
    delete process.env.MONGODB_URI;
  });

  it('pins CAS version conflict 409 response structure', async () => {
    const article = createBaseTestArticle({ version: 4, updatedAt: '2026-09-09T12:00:00.000Z' });
    getStoredArticleByIdMock.mockResolvedValue(article);

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'submit',
        expectedVersion: 3, // Stale version!
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      code: 'ARTICLE_VERSION_CONFLICT',
      error: 'This draft changed in another session. Reload or compare changes before saving.',
      currentVersion: 4,
      updatedAt: '2026-09-09T12:00:00.000Z',
    });
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
    expect(recordArticleActivityMock).not.toHaveBeenCalled();
    expect(notifyWorkflowEventMock).not.toHaveBeenCalled();
  });

  it('pins readiness failure on publish with 400 blocker message', async () => {
    const unreadyArticle = createBaseTestArticle({
      summary: '',
      image: '',
      workflow: { status: 'approved' },
    });
    getStoredArticleByIdMock.mockResolvedValue(unreadyArticle);

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'publish',
        expectedVersion: 3,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('Article is not ready:');
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('pins breaking article publish blocked without breaking TTS audio', async () => {
    const breakingArticle = createBaseTestArticle({
      isBreaking: true,
      breakingTts: null,
      workflow: { status: 'approved' },
    });
    getStoredArticleByIdMock.mockResolvedValue(breakingArticle);
    resolveReusableBreakingTtsMock.mockReturnValue(null);

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'publish',
        expectedVersion: 3,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      error: 'Upload breaking news audio before publishing this breaking article.',
    });
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('pins assignment requiring MongoDB-backed users (503 without Mongo)', async () => {
    delete process.env.MONGODB_URI;
    const article = createBaseTestArticle({ workflow: { status: 'in_review' } });
    getStoredArticleByIdMock.mockResolvedValue(article);

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'assign',
        assignedToId: 'user-2',
        expectedVersion: 3,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      error: 'Assignments require MongoDB-backed users.',
    });
  });

  it('pins assignment rejecting invalid assignee or reader role with 400', async () => {
    const article = createBaseTestArticle({ _id: MONGO_ARTICLE_ID, workflow: { status: 'in_review' } });

    // Assignee is a reader, which is forbidden
    userFindOneMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'reader-1',
          name: 'Reader Person',
          email: 'reader@example.com',
          role: 'reader',
        }),
      }),
    });

    process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami-test';
    connectDBMock.mockResolvedValue(undefined);
    articleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(article),
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'assign',
        assignedToId: 'reader-1',
        expectedVersion: 3,
      }, {}, MONGO_ARTICLE_ID),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      error: 'Valid assignedToId is required',
    });
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('pins successful submit transition and side-effect order', async () => {
    const article = createBaseTestArticle({ workflow: { status: 'draft' } });
    getStoredArticleByIdMock.mockResolvedValue(article);
    updateStoredArticleMock.mockResolvedValue({
      ...article,
      version: 4,
      workflow: { ...article.workflow, status: 'submitted' },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'submit',
        expectedVersion: 3,
        comment: 'Ready for copy desk review',
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({
        workflow: expect.objectContaining({ status: 'submitted' }),
      }),
      { skipRevision: true, expectedVersion: 3 }
    );
    expect(recordArticleActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article-1',
        action: 'submit',
        fromStatus: 'draft',
        toStatus: 'submitted',
      })
    );
    expect(notifyWorkflowEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'article',
        contentId: 'article-1',
        action: 'submit',
      })
    );
  });

  it('pins fast_publish validation and error contract', async () => {
    const article = createBaseTestArticle({ workflow: { status: 'draft' } });
    getStoredArticleByIdMock.mockResolvedValue(article);

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    // fast_publish without reason/comment should fail fast-publish check
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'fast_publish',
        expectedVersion: 3,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBeTruthy();
    expect(updateStoredArticleMock).not.toHaveBeenCalled();
  });

  it('pins archive transition on existing article', async () => {
    const article = createBaseTestArticle({ workflow: { status: 'published' } });
    getStoredArticleByIdMock.mockResolvedValue(article);
    updateStoredArticleMock.mockResolvedValue({
      ...article,
      version: 4,
      workflow: { ...article.workflow, status: 'archived' },
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
    const response = await PATCH(
      createJsonRequest('PATCH', {
        action: 'archive',
        expectedVersion: 3,
      }),
      { params: Promise.resolve({ id: 'article-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(updateStoredArticleMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({
        workflow: expect.objectContaining({ status: 'archived' }),
      }),
      { skipRevision: true, expectedVersion: 3 }
    );
  });

  it('pins kind=epaper GET returning mapped epaper article', async () => {
    connectDBMock.mockResolvedValue(undefined);
    epaperArticleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: MONGO_ARTICLE_ID,
        epaperId: '507f1f77bcf86cd799439022',
        pageNumber: 2,
        title: 'E-Paper Headline',
        slug: 'epaper-headline',
        excerpt: 'Excerpt text',
        contentHtml: '<p>Content</p>',
        coverImagePath: '/uploads/epaper/cover.jpg',
        hotspot: { x: 10, y: 20, w: 30, h: 40 },
        createdAt: new Date('2026-09-09T00:00:00.000Z'),
        updatedAt: new Date('2026-09-09T00:00:00.000Z'),
      }),
    });

    const { GET } = await import('@/app/api/admin/articles/[id]/route');
    const response = await GET(
      createJsonRequest('GET', undefined, { kind: 'epaper' }, MONGO_ARTICLE_ID),
      { params: Promise.resolve({ id: MONGO_ARTICLE_ID }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual(
      expect.objectContaining({
        _id: MONGO_ARTICLE_ID,
        epaperId: '507f1f77bcf86cd799439022',
        title: 'E-Paper Headline',
        hotspot: { x: 10, y: 20, w: 30, h: 40 },
      })
    );
  });
});
