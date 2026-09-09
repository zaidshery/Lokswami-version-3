import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialService } from '@/lib/server/content/editorialService';
import { EditorialRevisionService } from '@/lib/server/content/editorialRevisionService';
import * as newsroomRepo from '@/lib/server/content/newsroomArticleRepository';
import * as storyLinks from '@/lib/server/newsroomStoryLinks';

const mocks = vi.hoisted(() => ({
  getAdminSessionMock: vi.fn(),
  connectDBMock: vi.fn(),

  // Mongoose model mocks
  articleFindByIdMock: vi.fn(),
  articleFindByIdAndUpdateMock: vi.fn(),
  articleFindOneAndUpdateMock: vi.fn(),
  articleFindByIdAndDeleteMock: vi.fn(),
  articleFindOneAndDeleteMock: vi.fn(),
  articleCreateMock: vi.fn(),
  articleExistsMock: vi.fn(),
  epaperFindByIdMock: vi.fn(),
  epaperArticleFindByIdMock: vi.fn(),

  // File store mocks
  getStoredArticleByIdMock: vi.fn(),
  listAllStoredArticlesMock: vi.fn(),
  createStoredArticleMock: vi.fn(),
  updateStoredArticleMock: vi.fn(),
  deleteStoredArticleMock: vi.fn(),
  restoreStoredArticleRevisionMock: vi.fn(),

  // Story links mocks
  clearStoryLinkedArticleMock: vi.fn(),
  syncStoryLinkedArticleMock: vi.fn(),
  getStoryRecordForArticleLinkingMock: vi.fn(),
  getPrimaryArticleForStoryMock: vi.fn(),
  validateStoryForArticleCreationMock: vi.fn(),

  // Audio / activity mocks
  ensureBreakingTtsForArticleMock: vi.fn(),
  deleteStoredBreakingAudioMock: vi.fn(),
  recordArticleActivityMock: vi.fn(),
}));

const {
  getAdminSessionMock,
  connectDBMock,
  articleFindByIdMock,
  articleFindByIdAndUpdateMock,
  articleFindOneAndUpdateMock,
  articleFindByIdAndDeleteMock,
  articleFindOneAndDeleteMock,
  articleCreateMock,
  articleExistsMock,
  epaperFindByIdMock,
  epaperArticleFindByIdMock,
  getStoredArticleByIdMock,
  listAllStoredArticlesMock,
  createStoredArticleMock,
  updateStoredArticleMock,
  deleteStoredArticleMock,
  restoreStoredArticleRevisionMock,
  clearStoryLinkedArticleMock,
  syncStoryLinkedArticleMock,
  getStoryRecordForArticleLinkingMock,
  getPrimaryArticleForStoryMock,
  validateStoryForArticleCreationMock,
  ensureBreakingTtsForArticleMock,
  deleteStoredBreakingAudioMock,
  recordArticleActivityMock,
} = mocks;

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: mocks.getAdminSessionMock,
  getAdminSessionFromReq: mocks.getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: mocks.connectDBMock,
}));

vi.mock('@/lib/models/Article', () => {
  const MockArticleModel = function (this: any, data: any) {
    Object.assign(this, data);
    this.save = vi.fn().mockResolvedValue(this);
    this.toObject = vi.fn(() => ({ ...this }));
  } as any;
  MockArticleModel.findById = mocks.articleFindByIdMock;
  MockArticleModel.findByIdAndUpdate = mocks.articleFindByIdAndUpdateMock;
  MockArticleModel.findOneAndUpdate = mocks.articleFindOneAndUpdateMock;
  MockArticleModel.findByIdAndDelete = mocks.articleFindByIdAndDeleteMock;
  MockArticleModel.findOneAndDelete = mocks.articleFindOneAndDeleteMock;
  MockArticleModel.create = mocks.articleCreateMock;
  MockArticleModel.exists = mocks.articleExistsMock;
  return { default: MockArticleModel };
});

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    findById: mocks.epaperFindByIdMock,
  },
}));

vi.mock('@/lib/models/EPaperArticle', () => ({
  default: {
    findById: mocks.epaperArticleFindByIdMock,
  },
}));

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  getStoredArticleById: mocks.getStoredArticleByIdMock,
  listAllStoredArticles: mocks.listAllStoredArticlesMock,
  createStoredArticle: mocks.createStoredArticleMock,
  updateStoredArticle: mocks.updateStoredArticleMock,
  deleteStoredArticle: mocks.deleteStoredArticleMock,
  restoreStoredArticleRevision: mocks.restoreStoredArticleRevisionMock,
  isArticleVersionConflictError: vi.fn(() => false),
}));

vi.mock('@/lib/server/newsroomStoryLinks', () => ({
  clearStoryLinkedArticle: mocks.clearStoryLinkedArticleMock,
  syncStoryLinkedArticle: mocks.syncStoryLinkedArticleMock,
  getStoryRecordForArticleLinking: mocks.getStoryRecordForArticleLinkingMock,
  getPrimaryArticleForStory: mocks.getPrimaryArticleForStoryMock,
  validateStoryForArticleCreation: mocks.validateStoryForArticleCreationMock,
}));

vi.mock('@/lib/server/breakingTts', () => ({
  ensureBreakingTtsForArticle: mocks.ensureBreakingTtsForArticleMock,
  deleteStoredBreakingAudio: mocks.deleteStoredBreakingAudioMock,
  resolveReusableBreakingTts: vi.fn(() => null),
}));

vi.mock('@/lib/server/articleActivity', () => ({
  recordArticleActivity: mocks.recordArticleActivityMock,
  buildArticleActivityMessage: vi.fn(() => 'Article activity recorded.'),
}));

function createJsonRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  urlStr: string,
  body?: Record<string, unknown>,
  searchParams?: Record<string, string>
) {
  const url = new URL(urlStr);
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

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const INVALID_OBJECT_ID = 'not-a-valid-object-id';

const defaultAdminSession = {
  id: 'admin-1',
  name: 'Editor In Chief',
  email: 'chief@example.com',
  role: 'admin',
};

function createReadyArticleData(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'article-1',
    version: 1,
    title: 'Ready Article',
    slug: 'ready-article',
    summary: 'This ready summary includes the essential facts, location, and context for readers.',
    content:
      'This ready article contains verified newsroom copy with enough context to pass editorial readiness. It explains what happened, where it happened, why it matters, and what readers should expect next.',
    image: 'https://cdn.example.com/image.jpg',
    category: 'General',
    author: 'Desk',
    sourceStoryId: 'story-200',
    workflow: {
      status: 'draft',
      priority: 'normal',
      createdBy: defaultAdminSession,
    },
    ...overrides,
  };
}

describe('Phase 2.2.1 Compatibility Hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getAdminSessionMock.mockResolvedValue(defaultAdminSession);
    listAllStoredArticlesMock.mockResolvedValue([]);
    validateStoryForArticleCreationMock.mockReturnValue(null);
    getPrimaryArticleForStoryMock.mockResolvedValue(null);
    syncStoryLinkedArticleMock.mockResolvedValue(undefined);
    clearStoryLinkedArticleMock.mockResolvedValue(undefined);
    connectDBMock.mockResolvedValue(undefined);
  });

  describe('Blocker 2: Invalid Article ID HTTP Contract Restoration', () => {
    beforeEach(() => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami';
      getAdminSessionMock.mockResolvedValue(defaultAdminSession);
    });

    it('returns 400 { success: false, error: "Invalid article ID" } on Mongo GET with invalid ObjectId', async () => {
      const { GET } = await import('@/app/api/admin/articles/[id]/route');
      const req = createJsonRequest('GET', `http://localhost/api/admin/articles/${INVALID_OBJECT_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: INVALID_OBJECT_ID }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Invalid article ID' });
    });

    it('returns 400 { success: false, error: "Invalid article ID" } on Mongo PUT with invalid ObjectId', async () => {
      const { PUT } = await import('@/app/api/admin/articles/[id]/route');
      const req = createJsonRequest('PUT', `http://localhost/api/admin/articles/${INVALID_OBJECT_ID}`, {
        title: 'Title',
        content: '<p>Content</p>',
        summary: 'Summary',
        category: 'General',
        author: 'Desk',
      });
      const res = await PUT(req, { params: Promise.resolve({ id: INVALID_OBJECT_ID }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Invalid article ID' });
    });

    it('returns 400 { success: false, error: "Invalid article ID" } on Mongo PATCH with invalid ObjectId', async () => {
      const { PATCH } = await import('@/app/api/admin/articles/[id]/route');
      const req = createJsonRequest('PATCH', `http://localhost/api/admin/articles/${INVALID_OBJECT_ID}`, {
        title: 'Title updated',
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: INVALID_OBJECT_ID }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Invalid article ID' });
    });

    it('returns 400 { success: false, error: "Invalid article ID" } on Mongo DELETE with invalid ObjectId', async () => {
      const { DELETE } = await import('@/app/api/admin/articles/[id]/route');
      const req = createJsonRequest('DELETE', `http://localhost/api/admin/articles/${INVALID_OBJECT_ID}`);
      const res = await DELETE(req, { params: Promise.resolve({ id: INVALID_OBJECT_ID }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Invalid article ID' });
    });

    it('returns 400 { success: false, error: "Invalid article ID" } on Mongo revisions GET with invalid ObjectId', async () => {
      const { GET } = await import('@/app/api/admin/articles/[id]/revisions/route');
      const req = createJsonRequest('GET', `http://localhost/api/admin/articles/${INVALID_OBJECT_ID}/revisions`);
      const res = await GET(req, { params: Promise.resolve({ id: INVALID_OBJECT_ID }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Invalid article ID' });
    });

    it('returns 400 { success: false, error: "Invalid article ID" } on Mongo revision restore with invalid ObjectId', async () => {
      const { POST } = await import('@/app/api/admin/articles/[id]/revisions/[revisionId]/restore/route');
      const req = createJsonRequest(
        'POST',
        `http://localhost/api/admin/articles/${INVALID_OBJECT_ID}/revisions/rev-1/restore`
      );
      const res = await POST(req, { params: Promise.resolve({ id: INVALID_OBJECT_ID, revisionId: 'rev-1' }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Invalid article ID' });
    });

    it('returns 400 { success: false, error: "Invalid article ID" } on Mongo activity GET with invalid ObjectId', async () => {
      const { GET } = await import('@/app/api/admin/articles/[id]/activity/route');
      const req = createJsonRequest('GET', `http://localhost/api/admin/articles/${INVALID_OBJECT_ID}/activity`);
      const res = await GET(req, { params: Promise.resolve({ id: INVALID_OBJECT_ID }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Invalid article ID' });
    });

    it('allows non-ObjectId file article IDs in file fallback mode', async () => {
      delete process.env.MONGODB_URI;
      getStoredArticleByIdMock.mockResolvedValue({
        _id: 'article-1',
        title: 'File Article',
        summary: 'Summary text',
        content: '<p>Content</p>',
        category: 'General',
        author: 'Desk',
        workflow: { status: 'draft', createdBy: defaultAdminSession },
      });

      const { GET } = await import('@/app/api/admin/articles/[id]/route');
      const req = createJsonRequest('GET', 'http://localhost/api/admin/articles/article-1');
      const res = await GET(req, { params: Promise.resolve({ id: 'article-1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data._id).toBe('article-1');
    });
  });

  describe('Blocker 3: Create publishedAt Parity', () => {
    it('sets article.publishedAt as a valid non-empty timestamp for a draft in File mode while workflow.publishedAt remains null', async () => {
      delete process.env.MONGODB_URI;
      createStoredArticleMock.mockImplementation(async (doc) => ({
        ...doc,
        _id: 'article-draft-file',
      }));

      const created = await EditorialService.createDraft(
        {
          title: 'Draft File Article',
          summary: 'A short summary for draft file article.',
          content: '<p>Some draft content</p>',
          category: 'General',
          author: 'Desk',
          intent: 'draft',
        },
        defaultAdminSession as any
      );

      expect(created).toBeDefined();
      expect(created.workflow).toBeDefined();
      expect((created.workflow as any).status).toBe('draft');
      expect((created.workflow as any).publishedAt).toBeNull();
      // article.publishedAt must be a valid ISO string
      expect(typeof created.publishedAt).toBe('string');
      expect(created.publishedAt).not.toBe('');
      expect(new Date(created.publishedAt as string).toISOString()).toBe(created.publishedAt);
    });

    it('sets article.publishedAt as a valid non-empty timestamp for a draft in Mongo mode while workflow.publishedAt remains null', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami';
      articleExistsMock.mockResolvedValue(null);

      // Verify the document passed to createNewsroomArticle
      const createSpy = vi.spyOn(newsroomRepo, 'createNewsroomArticle').mockImplementation(async (doc) => ({
        ...doc,
        _id: VALID_OBJECT_ID,
        version: 1,
      } as any));

      const created = await EditorialService.createDraft(
        {
          title: 'Draft Mongo Article',
          summary: 'A short summary for draft mongo article.',
          content: '<p>Some draft content</p>',
          category: 'General',
          author: 'Desk',
          intent: 'draft',
        },
        defaultAdminSession as any
      );

      expect(created).toBeDefined();
      expect(created.workflow).toBeDefined();
      expect((created.workflow as any).status).toBe('draft');
      expect((created.workflow as any).publishedAt).toBeNull();
      expect(typeof created.publishedAt).toBe('string');
      expect(created.publishedAt).not.toBe('');
      expect(new Date(created.publishedAt as string).toISOString()).toBe(created.publishedAt);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publishedAt: expect.any(String),
          workflow: expect.objectContaining({
            status: 'draft',
            publishedAt: null,
          }),
        }),
        'mongo'
      );
      createSpy.mockRestore();
    });
  });

  describe('Blocker 1 & Section E: Persistence Source Pinning Invariants', () => {
    it('1. createDraft resolves Article store exactly once for one logical operation', async () => {
      delete process.env.MONGODB_URI;
      const resolveStoreSpy = vi.spyOn(newsroomRepo, 'resolveNewsroomArticleStore');
      createStoredArticleMock.mockImplementation(async (doc) => ({
        ...doc,
        _id: 'article-1',
      }));

      await EditorialService.createDraft(
        {
          title: 'Store Pinning Test',
          summary: 'Summary text here.',
          content: '<p>Content</p>',
          category: 'General',
          author: 'Desk',
          intent: 'draft',
        },
        defaultAdminSession as any
      );

      expect(resolveStoreSpy).toHaveBeenCalledTimes(1);
      resolveStoreSpy.mockRestore();
    });

    it('2. fullUpdate keeps the same source for read, slug check, CAS update, and story-link sync', async () => {
      delete process.env.MONGODB_URI;
      const resolveStoreSpy = vi.spyOn(newsroomRepo, 'resolveNewsroomArticleStore');
      const findArticleSpy = vi.spyOn(newsroomRepo, 'findArticleById');
      const checkSlugSpy = vi.spyOn(newsroomRepo, 'checkSlugConflict');
      const updateCasSpy = vi.spyOn(newsroomRepo, 'updateNewsroomArticleWithCas');

      getStoredArticleByIdMock.mockResolvedValue({
        _id: 'article-1',
        title: 'Original Title',
        slug: 'original-title',
        summary: 'Original summary',
        content: '<p>Original content</p>',
        image: 'https://cdn.example.com/image.jpg',
        category: 'General',
        author: 'Desk',
        version: 1,
        sourceStoryId: 'story-100',
        workflow: { status: 'published', createdBy: defaultAdminSession },
      });

      updateStoredArticleMock.mockResolvedValue({
        _id: 'article-1',
        title: 'Updated Title',
        slug: 'updated-title',
        summary: 'Updated summary',
        content: '<p>Updated content</p>',
        image: 'https://cdn.example.com/image.jpg',
        category: 'General',
        author: 'Desk',
        version: 2,
        sourceStoryId: 'story-100',
        workflow: { status: 'published', createdBy: defaultAdminSession },
      });

      await EditorialService.fullUpdate(
        'article-1',
        {
          title: 'Updated Title',
          slug: 'updated-title',
          summary: 'Updated summary',
          content: '<p>Updated content</p>',
          image: 'https://cdn.example.com/image.jpg',
          category: 'General',
          author: 'Desk',
        },
        defaultAdminSession as any
      );

      expect(resolveStoreSpy).toHaveBeenCalledTimes(1);
      expect(findArticleSpy).toHaveBeenCalledWith('article-1', 'file');
      expect(checkSlugSpy).toHaveBeenCalledWith('updated-title', 'article-1', 'file');
      expect(updateCasSpy).toHaveBeenCalledWith(
        'article-1',
        expect.any(Object),
        expect.objectContaining({ store: 'file' })
      );
      expect(syncStoryLinkedArticleMock).toHaveBeenCalledWith(
        expect.objectContaining({ useFileStore: true, storyId: 'story-100' })
      );

      resolveStoreSpy.mockRestore();
      findArticleSpy.mockRestore();
      checkSlugSpy.mockRestore();
      updateCasSpy.mockRestore();
    });

    it('3. partialUpdate keeps the same source for read, slug check, CAS update, and story sync', async () => {
      delete process.env.MONGODB_URI;
      const resolveStoreSpy = vi.spyOn(newsroomRepo, 'resolveNewsroomArticleStore');
      const findArticleSpy = vi.spyOn(newsroomRepo, 'findArticleById');
      const updateCasSpy = vi.spyOn(newsroomRepo, 'updateNewsroomArticleWithCas');

      getStoredArticleByIdMock.mockResolvedValue({
        _id: 'article-1',
        title: 'Original Title',
        slug: 'original-title',
        summary: 'Original summary',
        content: '<p>Original content</p>',
        category: 'General',
        author: 'Desk',
        version: 1,
        sourceStoryId: 'story-100',
        workflow: { status: 'draft', createdBy: defaultAdminSession },
      });

      updateStoredArticleMock.mockResolvedValue({
        _id: 'article-1',
        title: 'Original Title',
        slug: 'original-title',
        summary: 'Partially updated summary',
        content: '<p>Original content</p>',
        category: 'General',
        author: 'Desk',
        version: 2,
        sourceStoryId: 'story-100',
        workflow: { status: 'draft', createdBy: defaultAdminSession },
      });

      await EditorialService.partialUpdate(
        'article-1',
        { summary: 'Partially updated summary' },
        defaultAdminSession as any
      );

      expect(resolveStoreSpy).toHaveBeenCalledTimes(1);
      expect(findArticleSpy).toHaveBeenCalledWith('article-1', 'file');
      expect(updateCasSpy).toHaveBeenCalledWith(
        'article-1',
        expect.any(Object),
        expect.objectContaining({ store: 'file' })
      );
      expect(syncStoryLinkedArticleMock).toHaveBeenCalledWith(
        expect.objectContaining({ useFileStore: true, storyId: 'story-100' })
      );

      resolveStoreSpy.mockRestore();
      findArticleSpy.mockRestore();
      updateCasSpy.mockRestore();
    });

    it('4. applyWorkflowAction keeps the same source for read, CAS write, and story sync', async () => {
      delete process.env.MONGODB_URI;
      const resolveStoreSpy = vi.spyOn(newsroomRepo, 'resolveNewsroomArticleStore');
      const findArticleSpy = vi.spyOn(newsroomRepo, 'findArticleById');
      const updateCasSpy = vi.spyOn(newsroomRepo, 'updateNewsroomArticleWithCas');

      const readyData = createReadyArticleData();
      getStoredArticleByIdMock.mockResolvedValue(readyData);

      updateStoredArticleMock.mockResolvedValue({
        ...readyData,
        version: 2,
        workflow: { ...readyData.workflow, status: 'submitted' },
      });

      await EditorialService.applyWorkflowAction(
        'article-1',
        { action: 'submit' },
        defaultAdminSession as any
      );

      expect(resolveStoreSpy).toHaveBeenCalledTimes(1);
      expect(findArticleSpy).toHaveBeenCalledWith('article-1', 'file');
      expect(updateCasSpy).toHaveBeenCalledWith(
        'article-1',
        expect.any(Object),
        expect.objectContaining({ store: 'file' })
      );
      expect(syncStoryLinkedArticleMock).toHaveBeenCalledWith(
        expect.objectContaining({ useFileStore: true, storyId: 'story-200' })
      );

      resolveStoreSpy.mockRestore();
      findArticleSpy.mockRestore();
      updateCasSpy.mockRestore();
    });

    it('5. revision restore keeps the same source across read, slug conflict check, and restore', async () => {
      delete process.env.MONGODB_URI;
      const resolveStoreSpy = vi.spyOn(newsroomRepo, 'resolveNewsroomArticleStore');
      const findArticleSpy = vi.spyOn(newsroomRepo, 'findArticleById');
      const restoreRevisionSpy = vi.spyOn(newsroomRepo, 'restoreRevisionInStore');

      getStoredArticleByIdMock.mockResolvedValue({
        _id: 'article-1',
        title: 'Current Title',
        slug: 'current-title',
        revisions: [
          {
            id: 'rev-1',
            title: 'Old Title',
            slug: 'old-title',
            content: '<p>Old Content</p>',
          },
        ],
        workflow: { status: 'draft', createdBy: defaultAdminSession },
      });

      restoreStoredArticleRevisionMock.mockResolvedValue({
        _id: 'article-1',
        title: 'Old Title',
        slug: 'old-title',
        workflow: { status: 'draft', createdBy: defaultAdminSession },
      });

      await EditorialRevisionService.restoreRevision(
        'article-1',
        'rev-1',
        defaultAdminSession as any
      );

      expect(resolveStoreSpy).toHaveBeenCalledTimes(1);
      expect(findArticleSpy).toHaveBeenCalledWith('article-1', 'file');
      expect(restoreRevisionSpy).toHaveBeenCalledWith(
        'article-1',
        'rev-1',
        expect.any(Object),
        expect.any(Object),
        false,
        expect.any(Number),
        'file'
      );

      resolveStoreSpy.mockRestore();
      findArticleSpy.mockRestore();
      restoreRevisionSpy.mockRestore();
    });

    it('6. delete story-link cleanup uses the source of the authoritative delete', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami';
      const resolveStoreSpy = vi.spyOn(newsroomRepo, 'resolveNewsroomArticleStore');
      const deleteCasSpy = vi.spyOn(newsroomRepo, 'deleteNewsroomArticleWithCas').mockResolvedValue({
        _id: VALID_OBJECT_ID,
        title: 'Mongo Article',
        sourceStoryId: 'story-300',
      } as any);

      await EditorialService.deleteArticle(VALID_OBJECT_ID, 1, defaultAdminSession as any);

      expect(resolveStoreSpy).toHaveBeenCalledTimes(1);
      expect(deleteCasSpy).toHaveBeenCalledWith(VALID_OBJECT_ID, 1, 'mongo');
      expect(clearStoryLinkedArticleMock).toHaveBeenCalledWith({
        useFileStore: false,
        storyId: 'story-300',
        articleId: VALID_OBJECT_ID,
      });

      resolveStoreSpy.mockRestore();
      deleteCasSpy.mockRestore();
    });

    it('7. Mongo chosen first + simulated later failure: operation does NOT jump to file fallback', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami';
      articleFindByIdMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: VALID_OBJECT_ID,
          title: 'Mongo Article',
          slug: 'mongo-article',
          workflow: { status: 'draft', createdBy: defaultAdminSession },
          version: 1,
        }),
      });

      // Simulate Mongo write failure on CAS update
      articleFindByIdAndUpdateMock.mockImplementation(() => {
        throw new Error('Mongo connection lost mid-mutation');
      });

      await expect(
        EditorialService.partialUpdate(
          VALID_OBJECT_ID,
          { summary: 'New summary' },
          defaultAdminSession as any
        )
      ).rejects.toThrow('Mongo connection lost mid-mutation');

      // Crucial: File store MUST NOT have been called as a fallback!
      expect(updateStoredArticleMock).not.toHaveBeenCalled();
    });

    it('8. File chosen first + simulated Mongo recovery: operation does NOT jump into Mongo midway', async () => {
      delete process.env.MONGODB_URI;
      const initialRecord = {
        _id: 'article-file-1',
        title: 'File Article',
        slug: 'file-article',
        workflow: { status: 'draft', createdBy: defaultAdminSession },
        version: 1,
      };

      const spy = vi.spyOn(newsroomRepo, 'findArticleById').mockImplementation(async () => {
        // Mid-operation simulate Mongo URI suddenly reappearing
        process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami';
        return initialRecord as any;
      });

      updateStoredArticleMock.mockResolvedValue({
        ...initialRecord,
        summary: 'Updated in file',
        version: 2,
      });

      const updated = await EditorialService.partialUpdate(
        'article-file-1',
        { summary: 'Updated in file' },
        defaultAdminSession as any
      );

      // Operation MUST remain file-backed!
      expect(updateStoredArticleMock).toHaveBeenCalledWith(
        'article-file-1',
        expect.objectContaining({ summary: 'Updated in file' })
      );
      expect(articleFindByIdAndUpdateMock).not.toHaveBeenCalled();
      expect(updated.summary).toBe('Updated in file');

      spy.mockRestore();
      delete process.env.MONGODB_URI;
    });

    it('9. File-backed unknown normal article GET returns historical 404 and does NOT query Mongo EPaper', async () => {
      delete process.env.MONGODB_URI;
      getStoredArticleByIdMock.mockResolvedValue(null);

      const { GET } = await import('@/app/api/admin/articles/[id]/route');
      const req = createJsonRequest('GET', 'http://localhost/api/admin/articles/missing-file-article');
      const res = await GET(req, { params: Promise.resolve({ id: 'missing-file-article' }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ success: false, error: 'Article not found' });
      // Must NOT attempt Mongo EPaper fallback!
      expect(epaperArticleFindByIdMock).not.toHaveBeenCalled();
      expect(epaperFindByIdMock).not.toHaveBeenCalled();
    });

    it('10. Explicit kind=epaper continues working normally', async () => {
      delete process.env.MONGODB_URI;
      epaperArticleFindByIdMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: VALID_OBJECT_ID,
          title: 'Epaper Title',
          pageNumber: 1,
          hotspot: { x: 0, y: 0, w: 10, h: 10 },
        }),
      });

      const { GET } = await import('@/app/api/admin/articles/[id]/route');
      const req = createJsonRequest(
        'GET',
        `http://localhost/api/admin/articles/${VALID_OBJECT_ID}`,
        undefined,
        { kind: 'epaper' }
      );
      const res = await GET(req, { params: Promise.resolve({ id: VALID_OBJECT_ID }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Epaper Title');
    });
  });
});
