import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import { EpaperArticleService } from '@/lib/server/epaper/epaperArticleService';
import { EpaperConflictError } from '@/lib/server/epaper/epaperTypes';

const workflowMocks = vi.hoisted(() => ({
  automate: vi.fn(),
  activity: vi.fn(),
}));

vi.mock('@/lib/server/epaperWorkflowAutomation', () => ({
  applyEpaperWorkflowAutomation: workflowMocks.automate,
}));
vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(() => 'A mapped e-paper story was created.'),
  recordEpaperActivity: workflowMocks.activity,
}));

const actor = {
  id: 'super-admin-1',
  name: 'Super Admin',
  email: 'superadmin@example.com',
  username: 'superadmin',
  role: 'super_admin' as const,
};
const epaperId = '507f1f77bcf86cd799439011';
const articleId = '507f1f77bcf86cd799439012';
const hotspot = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };

function buildRepo() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    isValidId: vi.fn().mockReturnValue(true),
    findEditionById: vi.fn().mockResolvedValue({
      _id: epaperId,
      status: 'draft',
      productionStatus: 'pages_ready',
      pageCount: 2,
      pages: [
        { pageNumber: 1, imagePath: '/page-1.jpg' },
        { pageNumber: 2, imagePath: '/page-2.jpg' },
      ],
    }),
    findArticle: vi.fn().mockResolvedValue(null),
    countArticles: vi.fn().mockResolvedValue(0),
    articleExists: vi.fn().mockResolvedValue(false),
    createArticle: vi.fn().mockImplementation(async (data) => ({
      _id: articleId,
      ...data,
      createdAt: new Date('2026-09-26T00:00:00.000Z'),
      updatedAt: new Date('2026-09-26T00:00:00.000Z'),
    })),
    deleteArticleWhere: vi.fn().mockResolvedValue({ deletedCount: 1 }),
  };
}

describe('E-paper mapped story create regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workflowMocks.automate.mockResolvedValue({ changed: true, nextStatus: 'ocr_review' });
    workflowMocks.activity.mockResolvedValue(undefined);
  });

  it('reproduces the original reviewedBy embedded-schema validation failure', () => {
    const edition = new EPaper({
      publicationType: 'epaper',
      citySlug: 'indore',
      cityName: 'Indore',
      title: 'Schema reproduction',
      publishDate: new Date('2026-09-25T00:00:00.000Z'),
      pageCount: 1,
      pages: [{
        pageNumber: 1,
        imagePath: '/page-1.jpg',
        reviewStatus: 'ready',
        reviewedBy: 'actor-id',
      }],
    });

    const validation = edition.validateSync();
    expect(validation).toBeDefined();
    expect(validation?.message).toContain('reviewedBy');
  });

  it('lets a Super Admin create exactly one draft without mutating legacy page review fields', async () => {
    const repo = buildRepo();
    const service = new EpaperArticleService(repo as never);

    const created = await service.create(actor, epaperId, {
      pageNumber: 2,
      title: 'Mapped newsroom story',
      contentHtml: '<p>Readable newsroom copy.</p>',
      hotspot,
    });

    expect(created.workflow?.status).toBe('draft');
    expect(repo.createArticle).toHaveBeenCalledTimes(1);
    const input = repo.createArticle.mock.calls[0][0];
    expect(input.workflow).toEqual({
      status: 'draft',
      createdBy: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
      },
    });
    expect(input.workflow.reviewedBy).toBeUndefined();
    expect(input.releasedSnapshot).toBeNull();
  });

  it('compensates only the newly inserted story when required workflow automation fails', async () => {
    const repo = buildRepo();
    workflowMocks.automate.mockRejectedValueOnce(new Error('workflow update failed'));

    await expect(new EpaperArticleService(repo as never).create(actor, epaperId, {
      pageNumber: 2,
      title: 'Atomic story',
      contentHtml: '<p>Readable copy.</p>',
      hotspot,
    })).rejects.toThrow('workflow update failed');

    expect(repo.deleteArticleWhere).toHaveBeenCalledWith({
      _id: articleId,
      epaperId,
    });
  });

  it('recovers an exact prior partial story instead of inserting a duplicate on retry', async () => {
    const repo = buildRepo();
    repo.findArticle.mockResolvedValueOnce({
      _id: articleId,
      epaperId,
      pageNumber: 2,
      title: 'Draft story - Page 2 #1',
      slug: 'draft-story-page-2-1',
      excerpt: '',
      contentHtml: '',
      coverImagePath: '/uploads/epapers/crop.jpg',
      hotspot,
      workflow: { status: 'published' },
    });

    const recovered = await new EpaperArticleService(repo as never).create(actor, epaperId, {
      pageNumber: 2,
      title: '',
      contentHtml: '',
      coverImagePath: '/uploads/epapers/crop.jpg',
      hotspot,
    });

    expect(recovered.recovered).toBe(true);
    expect(recovered._id).toBe(articleId);
    expect(repo.createArticle).not.toHaveBeenCalled();
  });

  it('keeps published editions immutable', async () => {
    const repo = buildRepo();
    repo.findEditionById.mockResolvedValueOnce({
      _id: epaperId,
      status: 'published',
      productionStatus: 'published',
      pageCount: 2,
      pages: [],
    });

    await expect(new EpaperArticleService(repo as never).create(actor, epaperId, {
      pageNumber: 2,
      title: '',
      hotspot,
    })).rejects.toThrow(EpaperConflictError);
    expect(repo.createArticle).not.toHaveBeenCalled();
  });

  it('refreshes mapped stories and shows a recovery message in the page editor', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/(admin)/admin/epapers/[id]/page/[pageNumber]/page.tsx'),
      'utf8'
    );
    expect(source).toContain('await fetchData()');
    expect(source).toContain('A matching mapped story already existed');
    expect(source).toContain("setError(toErrorMessage(err, 'Failed to create article'))");
  });
});
