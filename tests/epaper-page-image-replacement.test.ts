import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpaperPageService } from '@/lib/server/epaper/epaperPageService';

const mocks = vi.hoisted(() => ({
  verifyUpload: vi.fn(),
  activity: vi.fn(),
  invalidateQa: vi.fn(),
}));

vi.mock('@/lib/storage/epaperAssetUpload', () => ({
  verifyEpaperAssetUpload: mocks.verifyUpload,
}));
vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(() => 'Page image uploaded.'),
  recordEpaperActivity: mocks.activity,
}));
vi.mock('@/lib/server/epaperWorkflowPolicy', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/epaperWorkflowPolicy')>();
  return { ...original, invalidateEpaperQa: mocks.invalidateQa };
});
const actor = {
  id: 'super-admin-1',
  name: 'Super Admin',
  email: 'superadmin@example.com',
  username: 'superadmin',
  role: 'super_admin' as const,
};
const epaperId = '507f1f77bcf86cd799439011';
const pageImage =
  'https://staging-bucket.blr1.digitaloceanspaces.com/lokswami/epapers/indore/page-2.jpg';

function repoFor(pageCount: number, productionStatus = 'draft_upload') {
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    imagePath: index === 0 ? '/uploads/epapers/page-1.jpg' : '',
    processingStatus: index === 0 ? 'ready' : 'failed',
    processingError: index === 0 ? '' : 'old render failure',
    processedAt: null,
    pageType: 'editorial',
    reviewStatus: 'pending',
  }));
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    isValidId: vi.fn().mockReturnValue(true),
    findEditionById: vi.fn().mockResolvedValue({
      _id: epaperId,
      status: 'draft',
      productionStatus,
      thumbnailPath: '/uploads/epapers/page-1.jpg',
      pageCount,
      pages,
    }),
    updateEdition: vi.fn().mockImplementation(async (_id, updates) => ({
      _id: epaperId,
      ...updates,
    })),
  };
}

describe('manual e-paper page image replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyUpload.mockResolvedValue({ mediaUrl: pageImage });
    mocks.activity.mockResolvedValue(undefined);
    mocks.invalidateQa.mockResolvedValue(undefined);
  });

  it('writes truthful ready metadata and promotes only when every image exists', async () => {
    const repo = repoFor(2);
    await new EpaperPageService(repo as never).update(actor, epaperId, {
      pages: [{ pageNumber: 2, mediaKey: 'verified-page-2' }],
    }, 'application/json');

    const updates = repo.updateEdition.mock.calls[0][1];
    const page = updates.pages.find((entry: { pageNumber: number }) => entry.pageNumber === 2);
    expect(page).toEqual(expect.objectContaining({
      imagePath: pageImage,
      processingStatus: 'ready',
      processingError: '',
    }));
    expect(page.processedAt).toBeInstanceOf(Date);
    expect(updates.productionStatus).toBe('pages_ready');
  });

  it('does not retain pages_ready while another required page image is missing', async () => {
    const repo = repoFor(3, 'pages_ready');
    await new EpaperPageService(repo as never).update(actor, epaperId, {
      pages: [{ pageNumber: 2, mediaKey: 'verified-page-2' }],
    }, 'application/json');

    const updates = repo.updateEdition.mock.calls[0][1];
    expect(updates.pages[2].imagePath).toBe('');
    expect(updates.productionStatus).toBe('draft_upload');
  });
});
