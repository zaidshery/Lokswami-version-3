import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();
const createStoredArticleMock = vi.fn();
const updateStoredArticleMock = vi.fn();
const connectDBMock = vi.fn();
const ensureBreakingTtsForArticleMock = vi.fn();
const recordArticleActivityMock = vi.fn();
const getPrimaryArticleForStoryMock = vi.fn();
const getStoryRecordForArticleLinkingMock = vi.fn();
const syncStoryLinkedArticleMock = vi.fn();
const validateStoryForArticleCreationMock = vi.fn();
const articleExistsMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  createStoredArticle: createStoredArticleMock,
  getStoredArticleById: vi.fn(),
  listAllStoredArticles: listAllStoredArticlesMock,
  updateStoredArticle: updateStoredArticleMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    exists: articleExistsMock,
    find: vi.fn(),
  },
}));

vi.mock('@/lib/server/breakingTts', () => ({
  ensureBreakingTtsForArticle: ensureBreakingTtsForArticleMock,
}));

vi.mock('@/lib/server/articleActivity', () => ({
  buildArticleActivityMessage: vi.fn(() => 'Article activity recorded.'),
  recordArticleActivity: recordArticleActivityMock,
}));

vi.mock('@/lib/server/newsroomStoryLinks', () => ({
  getPrimaryArticleForStory: getPrimaryArticleForStoryMock,
  getStoryRecordForArticleLinking: getStoryRecordForArticleLinkingMock,
  syncStoryLinkedArticle: syncStoryLinkedArticleMock,
  validateStoryForArticleCreation: validateStoryForArticleCreationMock,
}));

const READY_SUMMARY =
  'This summary gives readers the important facts, location, and context needed before publication.';
const READY_CONTENT =
  'This article body contains enough verified newsroom copy to satisfy publication readiness checks, including useful context, supporting background, and next steps for readers.';

describe('/api/admin/articles route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    validateStoryForArticleCreationMock.mockReturnValue(null);
    getPrimaryArticleForStoryMock.mockResolvedValue(null);
    syncStoryLinkedArticleMock.mockResolvedValue(undefined);
  });

  it('returns 401 when no admin session exists', async () => {
    getAdminSessionMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/admin/articles/route');
    const response = await GET(
      new Request('http://localhost/api/admin/articles') as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expect(listAllStoredArticlesMock).not.toHaveBeenCalled();
  });

  it('returns file-store data for authorized admins when MongoDB is not configured', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'article-1',
        title: 'First article',
        category: 'General',
        author: 'Desk',
        updatedAt: '2026-04-13T09:00:00.000Z',
        publishedAt: '2026-04-13T09:00:00.000Z',
        workflow: {
          status: 'published',
          createdBy: { id: 'admin-1', name: 'Desk', email: 'desk@example.com', role: 'admin' },
        },
      },
    ]);

    const { GET } = await import('@/app/api/admin/articles/route');
    const response = await GET(
      new Request('http://localhost/api/admin/articles?limit=all') as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listAllStoredArticlesMock).toHaveBeenCalledTimes(1);
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(payload).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          _id: 'article-1',
          title: 'First article',
        }),
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 1,
        pages: 1,
      },
    });
  });

  it('lists a copy editor own draft without exposing another editor draft', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-1',
      email: 'copy@example.com',
      name: 'Copy Editor',
      role: 'copy_editor',
    });
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'own-draft',
        title: 'Own direct article',
        category: 'General',
        author: 'Copy Editor',
        updatedAt: '2026-07-14T08:00:00.000Z',
        workflow: {
          status: 'draft',
          createdBy: {
            id: 'copy-1',
            email: 'copy@example.com',
            name: 'Copy Editor',
            role: 'copy_editor',
          },
        },
      },
      {
        _id: 'other-draft',
        title: 'Another editor draft',
        category: 'General',
        author: 'Another Copy Editor',
        updatedAt: '2026-07-14T09:00:00.000Z',
        workflow: {
          status: 'draft',
          createdBy: {
            id: 'copy-2',
            email: 'copy2@example.com',
            name: 'Another Copy Editor',
            role: 'copy_editor',
          },
        },
      },
      {
        _id: 'shared-submitted',
        title: 'Shared submitted article',
        category: 'General',
        author: 'Desk',
        updatedAt: '2026-07-14T08:30:00.000Z',
        workflow: {
          status: 'submitted',
          createdBy: {
            id: 'admin-1',
            email: 'desk@example.com',
            name: 'Desk',
            role: 'admin',
          },
        },
      },
    ]);

    const { GET } = await import('@/app/api/admin/articles/route');
    const response = await GET(
      new Request('http://localhost/api/admin/articles?limit=all') as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([
      expect.objectContaining({
        _id: 'shared-submitted',
        title: 'Shared submitted article',
      }),
      expect.objectContaining({ _id: 'own-draft', title: 'Own direct article' }),
    ]);
    expect(payload.pagination.total).toBe(2);
  });

  it('prevents reporters from opening the article list API', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });

    const { GET } = await import('@/app/api/admin/articles/route');
    const response = await GET(
      new Request('http://localhost/api/admin/articles?limit=all') as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      success: false,
      error: 'Forbidden',
    });
    expect(listAllStoredArticlesMock).not.toHaveBeenCalled();
  });

  it('allows reporters to submit a short article handoff to copy editors', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });

    createStoredArticleMock.mockImplementation(async (article) => ({
      _id: 'reporter-article-1',
      ...article,
    }));

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'submit',
          title: 'Short reporter title',
          content: '<p>Reporter body for copy editing.</p>',
          image: 'https://cdn.example.com/photo.jpg',
          author: 'Impersonated Author',
          category: 'Politics',
          isBreaking: true,
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(createStoredArticleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Short reporter title',
        author: 'Reporter',
        category: 'General',
        isBreaking: false,
        summary: 'Reporter body for copy editing.',
        workflow: expect.objectContaining({
          status: 'submitted',
          createdBy: expect.objectContaining({ id: 'reporter-1' }),
        }),
      })
    );
    expect(recordArticleActivityMock).toHaveBeenCalled();
    expect(ensureBreakingTtsForArticleMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown article intent without mutation or activity', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk',
      role: 'admin',
    });

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'publish-now-without-validation',
          title: 'Unsafe intent',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ success: false, error: 'Invalid article intent' });
    expect(createStoredArticleMock).not.toHaveBeenCalled();
    expect(recordArticleActivityMock).not.toHaveBeenCalled();
  });

  it('allows copy editors to create linked articles from claimed story reviews', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'copy-1',
      email: 'copy@example.com',
      name: 'Copy Editor',
      role: 'copy_editor',
    });
    getStoryRecordForArticleLinkingMock.mockResolvedValue({
      _id: 'story-1',
      title: 'Reporter Story Title',
      workflow: {
        status: 'in_review',
        assignedTo: {
          id: 'copy-1',
          email: 'copy@example.com',
          name: 'Copy Editor',
          role: 'copy_editor',
        },
      },
    });
    createStoredArticleMock.mockResolvedValue({
      _id: 'article-2',
      title: 'Desk article',
      sourceType: 'story',
      sourceStoryId: 'story-1',
      sourceStoryTitle: 'Reporter Story Title',
      workflow: { status: 'submitted', createdBy: { id: 'copy-1' } },
    });

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'submit',
          title: 'Desk article',
          summary: READY_SUMMARY,
          content: READY_CONTENT,
          image: 'https://cdn.example.com/story.jpg',
          category: 'General',
          author: 'Copy Editor',
          sourceStoryId: 'story-1',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(getStoryRecordForArticleLinkingMock).toHaveBeenCalledWith({
      useFileStore: true,
      storyId: 'story-1',
    });
    expect(createStoredArticleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'story',
        sourceStoryId: 'story-1',
        sourceStoryTitle: 'Reporter Story Title',
      })
    );
    expect(syncStoryLinkedArticleMock).toHaveBeenCalledWith({
      useFileStore: true,
      storyId: 'story-1',
      articleId: 'article-2',
      articleStatus: 'submitted',
    });
    expect(payload).toEqual({
      success: true,
      data: expect.objectContaining({
        _id: 'article-2',
        sourceType: 'story',
      }),
    });
  });

  it('persists article SEO fields and a unique slug on create', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk Admin',
      role: 'admin',
    });
    listAllStoredArticlesMock.mockResolvedValue([
      {
        _id: 'existing-1',
        slug: 'indore-metro-update',
        previousSlugs: [],
      },
      {
        _id: 'existing-2',
        slug: 'another-current-slug',
        previousSlugs: ['indore-metro-update-2'],
      },
    ]);
    createStoredArticleMock.mockResolvedValue({
      _id: 'article-3',
      slug: 'indore-metro-update-3',
      title: 'Indore Metro update',
      workflow: { status: 'published', createdBy: { id: 'admin-1' } },
    });

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'publish',
          title: 'Indore Metro update',
          slug: 'indore-metro-update',
          summary: READY_SUMMARY,
          content: READY_CONTENT,
          image: 'https://cdn.example.com/story.jpg',
          category: 'General',
          author: 'Desk Admin',
          seo: {
            focusKeyword: 'Indore Metro',
            featuredImageAlt: 'Metro construction',
            authorProfileUrl: 'https://lokswami.com/authors/desk',
            includeInNewsSitemap: true,
          },
        }),
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(201);
    expect(createStoredArticleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'indore-metro-update-3',
        seo: expect.objectContaining({
          focusKeyword: 'Indore Metro',
          featuredImageAlt: 'Metro construction',
          authorProfileUrl: 'https://lokswami.com/authors/desk',
          includeInNewsSitemap: true,
        }),
      })
    );
  });

  it('checks Mongo create ownership across current and historical slugs', async () => {
    process.env.MONGODB_URI = 'mongodb://example.test/lokswami';
    connectDBMock.mockResolvedValue(undefined);
    articleExistsMock.mockResolvedValue(false);
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk Admin',
      role: 'admin',
    });

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'draft',
          title: 'Historical slug check',
          slug: 'historical-slug-check',
          seo: { canonicalUrl: 'https://example.com/external' },
        }),
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(400);
    expect(articleExistsMock).toHaveBeenCalledWith({
      $or: [
        { slug: 'historical-slug-check' },
        { previousSlugs: 'historical-slug-check' },
      ],
    });
    expect(createStoredArticleMock).not.toHaveBeenCalled();
    delete process.env.MONGODB_URI;
  });

  it('rejects an external canonical override before creating an article', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk Admin',
      role: 'admin',
    });
    listAllStoredArticlesMock.mockResolvedValue([]);

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'draft',
          title: 'Canonical governance',
          slug: 'canonical-governance',
          seo: { canonicalUrl: 'https://example.com/canonical-governance' },
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/public site origin/i);
    expect(createStoredArticleMock).not.toHaveBeenCalled();
  });

  it('rejects submit and publish requests with readiness blockers', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk Admin',
      role: 'admin',
    });

    const { POST } = await import('@/app/api/admin/articles/route');
    for (const intent of ['submit', 'publish'] as const) {
      const response = await POST(
        new Request('http://localhost/api/admin/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent,
            title: 'Short',
            summary: 'Too short',
            content: 'Too short.',
            image: '',
            category: '',
            author: '',
          }),
        }) as unknown as NextRequest
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toContain('Article is not ready:');
      expect(payload.error).toContain('Headline');
      expect(payload.error).toContain('Featured image');
    }
    expect(createStoredArticleMock).not.toHaveBeenCalled();
  });

  it('keeps draft creation loose while preserving format validation', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk Admin',
      role: 'admin',
    });
    listAllStoredArticlesMock.mockResolvedValue([]);
    createStoredArticleMock.mockResolvedValue({
      _id: 'draft-1',
      slug: 'article',
      title: '',
      workflow: { status: 'draft', createdBy: { id: 'admin-1' } },
    });

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'draft',
          content: '<h2>Draft context</h2><p>Draft reporting.</p>',
          editorial: {
            storyType: 'analysis',
            evidenceType: 'official',
            sourceAttribution: 'Municipal release reviewed by the desk',
          },
          media: {
            focalPointX: 35,
            focalPointY: 65,
            variants: { landscape16x9: '/uploads/draft-16x9.webp' },
          },
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(createStoredArticleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'article',
        workflow: expect.objectContaining({ status: 'draft' }),
        contentJson: expect.objectContaining({
          version: 1,
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'heading' }),
            expect.objectContaining({ type: 'paragraph' }),
          ]),
        }),
        editorial: expect.objectContaining({
          storyType: 'analysis',
          evidenceType: 'official',
        }),
        media: expect.objectContaining({
          focalPointX: 35,
          focalPointY: 65,
          variants: expect.objectContaining({ landscape16x9: '/uploads/draft-16x9.webp' }),
        }),
      })
    );
    expect(payload).toEqual({
      success: true,
      data: expect.objectContaining({ _id: 'draft-1' }),
    });
  });

  it('prevents duplicate primary linked articles for the same story', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'admin-1',
      email: 'desk@example.com',
      name: 'Desk Admin',
      role: 'admin',
    });
    getStoryRecordForArticleLinkingMock.mockResolvedValue({
      _id: 'story-1',
      title: 'Reporter Story Title',
      workflow: { status: 'approved' },
    });
    getPrimaryArticleForStoryMock.mockResolvedValue({ _id: 'article-1' });

    const { POST } = await import('@/app/api/admin/articles/route');
    const response = await POST(
      new Request('http://localhost/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'draft',
          title: 'Desk article',
          summary: READY_SUMMARY,
          content: READY_CONTENT,
          image: 'https://cdn.example.com/story.jpg',
          category: 'General',
          author: 'Desk Admin',
          sourceStoryId: 'story-1',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      success: false,
      error: 'A primary linked article already exists for this story.',
    });
    expect(createStoredArticleMock).not.toHaveBeenCalled();
  });
});
