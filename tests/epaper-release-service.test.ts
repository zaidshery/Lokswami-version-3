import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(),
  recordEpaperActivity: vi.fn(),
}));
vi.mock('@/lib/server/epaperWorkflowAutomation', () => ({ applyEpaperWorkflowAutomation: vi.fn() }));
vi.mock('@/lib/server/epaperWorkflowPolicy', () => ({ assertEpaperDraftEditable: vi.fn() }));
vi.mock('@/lib/server/ttsAssets', () => ({
  buildEpaperStoryTtsText: vi.fn(() => 'release text'),
  findReadyManualTtsAsset: vi.fn(() => null),
}));

import { recordEpaperActivity } from '@/lib/server/epaperActivity';
import { EpaperArticleService } from '@/lib/server/epaper/epaperArticleService';
import type { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { EpaperConflictError } from '@/lib/server/epaper/epaperTypes';

const actor = { id: 'admin-1', username: 'admin', name: 'Admin', email: 'admin@example.com', role: 'admin' as const };
const epaperId = '665000000000000000000001';
const articleId = '665000000000000000000002';
const expected = '2026-09-08T12:00:00.000Z';

function buildRepo(overrides: Record<string, unknown> = {}) {
  return {
    isValidId: vi.fn(() => true),
    connect: vi.fn(),
    findEdition: vi.fn(() => ({
      _id: epaperId,
      status: 'published',
      isCurrentRevision: true,
      pages: [{
        pageNumber: 1,
        imagePath: '/uploads/epaper/page-1.jpg',
        reviewStatus: 'ready',
        reviewedAt: expected,
      }],
    })),
    findArticle: vi.fn(() => ({
      _id: articleId,
      epaperId,
      pageNumber: 1,
      title: 'Released title',
      slug: 'released-title',
      excerpt: 'Released excerpt',
      contentHtml: '<p>Released body</p>',
      coverImagePath: '/uploads/epaper/cover.jpg',
      hotspot: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      updatedAt: expected,
      releasedSnapshot: {
        version: 3,
        sourceUpdatedAt: '2026-09-01T00:00:00.000Z',
      },
    })),
    markPageReady: vi.fn(),
    updateArticleConditional: vi.fn(() => ({ _id: articleId })),
    ...overrides,
  } as unknown as EpaperRepository;
}

describe('EpaperArticleService release concurrency contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is idempotent when the requested saved version is already released', async () => {
    const updateArticleConditional = vi.fn();
    const repo = buildRepo({
      updateArticleConditional,
      findArticle: vi.fn(() => ({
        _id: articleId,
        epaperId,
        updatedAt: expected,
        releasedSnapshot: { version: 7, sourceUpdatedAt: expected },
      })),
    });

    await expect(new EpaperArticleService(repo).release(actor, epaperId, articleId, expected)).resolves.toBe(7);
    expect(updateArticleConditional).not.toHaveBeenCalled();
    expect(recordEpaperActivity).not.toHaveBeenCalled();
  });

  it('returns a conflict when a concurrent writer wins the compare-and-set release', async () => {
    const updateArticleConditional = vi.fn(() => null);
    const repo = buildRepo({ updateArticleConditional });

    await expect(new EpaperArticleService(repo).release(actor, epaperId, articleId, expected))
      .rejects.toBeInstanceOf(EpaperConflictError);
    expect(updateArticleConditional).toHaveBeenCalledWith(
      { _id: articleId, epaperId, updatedAt: new Date(expected) },
      { $set: { releasedSnapshot: expect.objectContaining({ version: 4, sourceUpdatedAt: expected }) } }
    );
    expect(recordEpaperActivity).not.toHaveBeenCalled();
  });
});
