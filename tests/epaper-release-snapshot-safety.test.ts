import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';

// Mocks for admin session and permissions
const getAdminSessionMock = vi.fn();
vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

// Mocks for DB models
const findByIdMock = vi.fn();
const findByIdAndUpdateMock = vi.fn();
const findOneAndUpdateMock = vi.fn();
const epaperFindByIdMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({
  default: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    findById: vi.fn().mockReturnValue({ lean: () => Promise.resolve(null) }),
  },
}));

const mockQuery = () => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
});

vi.mock('@/lib/models/EPaperArticle', () => ({
  default: {
    findById: findByIdMock,
    findByIdAndUpdate: findByIdAndUpdateMock,
    findOneAndUpdate: findOneAndUpdateMock,
    findOne: vi.fn().mockImplementation(mockQuery),
  },
}));

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    findById: epaperFindByIdMock,
    findByIdAndUpdate: vi.fn().mockResolvedValue(true),
    findOne: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  },
}));

vi.mock('@/lib/server/epaperWorkflowPolicy', () => ({
  assertEpaperDraftEditable: vi.fn(),
  invalidateEpaperQa: vi.fn(),
}));

vi.mock('@/lib/server/epaperWorkflowAutomation', () => ({
  applyEpaperWorkflowAutomation: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/server/ttsAssets', () => ({
  buildEpaperStoryTtsText: vi.fn().mockReturnValue('dummy text'),
  findReadyManualTtsAsset: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/server/epaperActivity', () => ({
  recordEpaperActivity: vi.fn().mockResolvedValue(true),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('GAP-008: E-Paper Release Snapshot Safety', () => {
  const storyId = '665000000000000000000001';
  const epaperId = '665000000000000000000002';
  const adminActor = {
    id: 'admin-1',
    name: 'Chief Editor',
    email: 'editor@lokswami.in',
    role: 'admin',
  };

  const initialReleasedSnapshot = {
    title: 'Approved Public Headline',
    slug: 'approved-headline',
    pageNumber: 1,
    excerpt: 'Approved public excerpt for readers.',
    contentHtml: '<p>Approved public text.</p>',
    coverImagePath: '/covers/p1.jpg',
    pageImagePath: '/epapers/p1.jpg',
    hotspot: { x: 0.1, y: 0.1, w: 0.4, h: 0.3 },
    version: 1,
    releasedAt: '2026-09-01T10:00:00.000Z',
    releasedById: 'admin-1',
    sourceUpdatedAt: '2026-09-01T10:00:00.000Z',
  };

  const currentStoryInDb = {
    _id: storyId,
    epaperId,
    pageNumber: 1,
    title: 'Approved Public Headline',
    slug: 'approved-headline',
    excerpt: 'Approved public excerpt for readers.',
    contentHtml: '<p>Approved public text.</p>',
    coverImagePath: '/covers/p1.jpg',
    hotspot: { x: 0.1, y: 0.1, w: 0.4, h: 0.3 },
    releasedSnapshot: initialReleasedSnapshot,
    updatedAt: '2026-09-01T10:00:00.000Z',
    createdAt: '2026-09-01T09:00:00.000Z',
  };

  const parentEpaper = {
    _id: epaperId,
    status: 'published',
    productionStatus: 'published',
    pageCount: 4,
    pages: [
      { pageNumber: 1, imagePath: '/epapers/p1.jpg' },
      { pageNumber: 2, imagePath: '/epapers/p2.jpg' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getAdminSessionMock.mockResolvedValue(adminActor);
    findByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(currentStoryInDb),
    });
    epaperFindByIdMock.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(parentEpaper) }),
    });
  });

  it('proves that ordinary editorial saves do NOT mutate releasedSnapshot until explicit release', async () => {
    // Step A: Story has an initial released snapshot. Reader sees the approved headline.
    const initialReaderView = resolveReleasedEpaperStory(currentStoryInDb);
    expect(initialReaderView?.title).toBe('Approved Public Headline');
    expect(initialReaderView?.releaseVersion).toBe(1);

    // Step B & C: Editor performs a normal editorial edit on headline, content, and hotspot.
    let capturedUpdates: Record<string, unknown> = {};
    findByIdAndUpdateMock.mockImplementation((_id, updates) => {
      capturedUpdates = updates;
      return {
        lean: () =>
          Promise.resolve({
            ...currentStoryInDb,
            ...updates,
            // If the code prematurely mutated releasedSnapshot, updates.releasedSnapshot would be present.
            // If the code is fixed, updates.releasedSnapshot is undefined, preserving currentStoryInDb.releasedSnapshot!
            releasedSnapshot: updates.releasedSnapshot ?? currentStoryInDb.releasedSnapshot,
          }),
      };
    });

    const { PATCH } = await import('@/app/api/admin/articles/[id]/route');

    const draftCorrectionPayload = {
      title: 'Unpublished Draft Correction Headline',
      excerpt: 'Unpublished draft excerpt.',
      contentHtml: '<p>Draft body modification.</p>',
      hotspot: { x: 0.2, y: 0.2, w: 0.5, h: 0.4 },
    };

    const req = new NextRequest(`http://localhost/api/admin/articles/${storyId}?kind=epaper`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftCorrectionPayload),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: storyId }) });
    const resBody = await res.json();
    if (res.status !== 200) {
      console.log('PATCH response body:', resBody);
    }
    expect(res.status).toBe(200);

    // Step D: Verify that releasedSnapshot was NOT passed in updates!
    // In inherited code: updates.releasedSnapshot WAS populated with draft title!
    // In fixed code: updates.releasedSnapshot MUST be undefined!
    expect(capturedUpdates.releasedSnapshot).toBeUndefined();

    // Verify that the reader continues to see the unchanged published snapshot
    const postEditReaderView = resolveReleasedEpaperStory({
      ...currentStoryInDb,
      ...capturedUpdates,
      releasedSnapshot: capturedUpdates.releasedSnapshot ?? currentStoryInDb.releasedSnapshot,
    });
    expect(postEditReaderView?.title).toBe('Approved Public Headline');
    expect(postEditReaderView?.releaseVersion).toBe(1);

    // Step E: Trigger explicit release workflow via /api/admin/epapers/[id]/articles/[articleId]/release
    const savedEditTimestamp = new Date('2026-09-08T12:00:00.000Z');
    const updatedDraftInDb = {
      ...currentStoryInDb,
      ...capturedUpdates,
      updatedAt: savedEditTimestamp.toISOString(),
    };

    const epaperFindOneMock = vi.fn().mockReturnValue({
      lean: () => Promise.resolve(parentEpaper),
    });
    const epaperArticleFindOneMock = vi.fn().mockReturnValue({
      lean: () => Promise.resolve(updatedDraftInDb),
    });

    const epaperArticleModel = (await import('@/lib/models/EPaperArticle')).default;
    const epaperModel = (await import('@/lib/models/EPaper')).default;
    epaperModel.findOne = epaperFindOneMock as any;
    epaperArticleModel.findOne = epaperArticleFindOneMock as any;

    let releasedResultSnapshot: any = null;
    findOneAndUpdateMock.mockImplementation((_query, updateDoc) => {
      releasedResultSnapshot = updateDoc.$set.releasedSnapshot;
      return Promise.resolve({
        ...updatedDraftInDb,
        releasedSnapshot: releasedResultSnapshot,
      });
    });

    const { POST: releasePost } = await import(
      '@/app/api/admin/epapers/[id]/articles/[articleId]/release/route'
    );

    const releaseReq = new NextRequest(
      `http://localhost/api/admin/epapers/${epaperId}/articles/${storyId}/release`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedUpdatedAt: savedEditTimestamp.toISOString() }),
      }
    );

    const releaseRes = await releasePost(releaseReq, {
      params: Promise.resolve({ id: epaperId, articleId: storyId }),
    });
    expect(releaseRes.status).toBe(200);
    const releaseBody = await releaseRes.json();
    expect(releaseBody.success).toBe(true);
    expect(releaseBody.version).toBe(2);

    // Step F: Public reader now sees the updated published snapshot version 2!
    expect(releasedResultSnapshot).toBeDefined();
    expect(releasedResultSnapshot.version).toBe(2);
    expect(releasedResultSnapshot.title).toBe('Unpublished Draft Correction Headline');

    const publicReaderAfterRelease = resolveReleasedEpaperStory({
      ...updatedDraftInDb,
      releasedSnapshot: releasedResultSnapshot,
    });
    expect(publicReaderAfterRelease?.title).toBe('Unpublished Draft Correction Headline');
    expect(publicReaderAfterRelease?.releaseVersion).toBe(2);
  }, 15000);
});
