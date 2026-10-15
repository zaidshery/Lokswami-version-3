import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { buildEpaperImageAutomationUpdates } from '@/lib/server/epaperImageAutomation';
import { EPAPER_PRODUCTION_STATUSES } from '@/lib/workflow/types';
import { EPaperProductionStatusSchema } from '@/lib/models/schemas/workflow';
import { EpaperConflictError } from '@/lib/server/epaper/epaperTypes';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

const verifyEpaperUploadReceiptMock = vi.fn();
const verifyEpaperAssetUploadMock = vi.fn();
const downloadVerifiedEpaperPdfMock = vi.fn();
const getPdfPageCountFromBufferMock = vi.fn();
const deleteDigitalOceanSpacesAssetByPublicIdMock = vi.fn();
const recordEpaperActivityMock = vi.fn();
const buildEpaperActivityMessageMock = vi.fn();
const logEpaperMetricMock = vi.fn();

vi.mock('@/lib/storage/epaperAssetUpload', () => ({
  verifyEpaperAssetUpload: (...args: unknown[]) => verifyEpaperAssetUploadMock(...args),
  verifyEpaperUploadReceipt: (...args: unknown[]) => verifyEpaperUploadReceiptMock(...args),
}));

vi.mock('@/lib/server/epaperPdfRenderer', () => ({
  downloadVerifiedEpaperPdf: (...args: unknown[]) => downloadVerifiedEpaperPdfMock(...args),
  getPdfPageCountFromBuffer: (...args: unknown[]) => getPdfPageCountFromBufferMock(...args),
}));

vi.mock('@/lib/utils/digitalOceanSpaces', () => ({
  deleteDigitalOceanSpacesAssetByPublicId: (...args: unknown[]) =>
    deleteDigitalOceanSpacesAssetByPublicIdMock(...args),
}));

vi.mock('@/lib/server/epaperActivity', () => ({
  recordEpaperActivity: (...args: unknown[]) => recordEpaperActivityMock(...args),
  buildEpaperActivityMessage: (...args: unknown[]) => buildEpaperActivityMessageMock(...args),
}));

vi.mock('@/lib/server/epaperObservability', () => ({
  logEpaperMetric: (...args: unknown[]) => logEpaperMetricMock(...args),
}));

describe('E-Paper Upload Finalize Regression & Lifecycle Contract', () => {
  const superAdminActor: AdminSessionIdentity = {
    id: 'super-admin-1',
    name: 'Super Admin',
    email: 'admin@lokswami.com',
    username: 'superadmin',
    role: 'super_admin',
  };

  let mockRepo: {
    connect: ReturnType<typeof vi.fn>;
    isValidId: ReturnType<typeof vi.fn>;
    findEditionById: ReturnType<typeof vi.fn>;
    updateEdition: ReturnType<typeof vi.fn>;
  };

  let mockWorker: {
    isPageProcessingEnabled: ReturnType<typeof vi.fn>;
    queuePageProcessing: ReturnType<typeof vi.fn>;
  };

  let service: EpaperUploadService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      connect: vi.fn().mockResolvedValue(undefined),
      isValidId: vi.fn().mockReturnValue(true),
      findEditionById: vi.fn(),
      updateEdition: vi.fn().mockResolvedValue({}),
    };

    mockWorker = {
      isPageProcessingEnabled: vi.fn().mockReturnValue(true),
      queuePageProcessing: vi.fn().mockResolvedValue({
        _id: 'job-789',
        status: 'queued',
      }),
    };

    service = new EpaperUploadService(mockRepo as any, mockWorker as any);

    verifyEpaperUploadReceiptMock.mockReturnValue({
      epaperId: '507f1f77bcf86cd799439011',
      actorId: 'super-admin-1',
      mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test-edition.pdf',
      expectedFileType: 'application/pdf',
    });

    verifyEpaperAssetUploadMock.mockResolvedValue({
      mediaUrl: 'https://cdn.lokswami.com/epapers/indore/2026-09-25/pdf/test-edition.pdf',
      mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test-edition.pdf',
      fileSize: 1048576,
    });

    downloadVerifiedEpaperPdfMock.mockResolvedValue(Buffer.from('%PDF-1.4 test content'));
    getPdfPageCountFromBufferMock.mockResolvedValue(4);
  });

  it('Schema Contract: EPAPER_PRODUCTION_STATUSES contains draft_upload and strictly excludes page_processing', () => {
    expect(EPAPER_PRODUCTION_STATUSES).toContain('draft_upload');
    expect(EPAPER_PRODUCTION_STATUSES).toContain('pages_ready');
    expect(EPAPER_PRODUCTION_STATUSES).toContain('ocr_review');
    expect(EPAPER_PRODUCTION_STATUSES).toContain('hotspot_mapping');
    expect(EPAPER_PRODUCTION_STATUSES).toContain('ready_to_publish');
    expect(EPAPER_PRODUCTION_STATUSES).toContain('published');
    expect(EPAPER_PRODUCTION_STATUSES).toContain('archived');

    // Regression prevention: 'page_processing' must NEVER be treated as a top-level production status
    expect((EPAPER_PRODUCTION_STATUSES as readonly string[])).not.toContain('page_processing');
    expect(EPaperProductionStatusSchema.enum).toEqual(EPAPER_PRODUCTION_STATUSES);
    expect(EPaperProductionStatusSchema.default).toBe('draft_upload');
  });

  it('Super Admin finalizes verified draft: top-level stays draft_upload (NEVER page_processing), pages are pending, exactly one job queued', async () => {
    const epaperId = '507f1f77bcf86cd799439011';

    mockRepo.findEditionById.mockResolvedValue({
      _id: epaperId,
      status: 'draft',
      productionStatus: 'draft_upload',
      publicationType: 'epaper',
      citySlug: 'indore',
      revisionNumber: 1,
      pages: [],
    });

    const result = await service.finalize(superAdminActor, epaperId, {
      mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test-edition.pdf',
      uploadReceipt: 'valid-receipt-token',
    });

    expect(result.message).toBe('PDF verified and queued for background conversion.');
    expect(result.data.jobId).toBe('job-789');
    expect(result.data.status).toBe('queued');

    // Verify updateEdition payload
    expect(mockRepo.updateEdition).toHaveBeenCalledTimes(1);
    const updateArgs = mockRepo.updateEdition.mock.calls[0];
    expect(updateArgs[0]).toBe(epaperId);
    const updatePayload = updateArgs[1];

    // CRITICAL: Top-level productionStatus MUST be 'draft_upload', NEVER 'page_processing'
    expect(updatePayload.productionStatus).toBe('draft_upload');
    expect(updatePayload.productionStatus).not.toBe('page_processing');

    // Page count matches extracted PDF
    expect(updatePayload.pageCount).toBe(4);
    expect(updatePayload.pages).toHaveLength(4);

    // Initial page records must begin with processingStatus = 'pending'
    for (const page of updatePayload.pages) {
      expect(page.processingStatus).toBe('pending');
      expect(page.reviewStatus).toBe('pending');
    }

    // Verify worker queued exactly once with page numbers [1, 2, 3, 4]
    expect(mockWorker.queuePageProcessing).toHaveBeenCalledTimes(1);
    expect(mockWorker.queuePageProcessing).toHaveBeenCalledWith(epaperId, [1, 2, 3, 4]);
  });

  it('Image Automation: Once all page images are rendered, edition promotes from draft_upload to pages_ready', () => {
    const renderedPages = [
      { pageNumber: 1, imagePath: '/epaper/page-1.jpg' },
      { pageNumber: 2, imagePath: '/epaper/page-2.jpg' },
      { pageNumber: 3, imagePath: '/epaper/page-3.jpg' },
      { pageNumber: 4, imagePath: '/epaper/page-4.jpg' },
    ];

    const updates = buildEpaperImageAutomationUpdates({
      pageCount: 4,
      pages: renderedPages,
      currentProductionStatus: 'draft_upload',
      currentStatus: 'draft',
    });

    expect(updates.productionStatus).toBe('pages_ready');
    expect(updates.thumbnailPath).toBe('/epaper/page-1.jpg');
  });

  it('Image Automation: Does not promote when pages are incomplete', () => {
    const incompletePages = [
      { pageNumber: 1, imagePath: '/epaper/page-1.jpg' },
      { pageNumber: 2, imagePath: '' }, // page 2 missing
      { pageNumber: 3, imagePath: '/epaper/page-3.jpg' },
      { pageNumber: 4, imagePath: '/epaper/page-4.jpg' },
    ];

    const updates = buildEpaperImageAutomationUpdates({
      pageCount: 4,
      pages: incompletePages,
      currentProductionStatus: 'draft_upload',
      currentStatus: 'draft',
    });

    expect(updates.productionStatus).toBeUndefined();
  });

  it('Safety & Immutability: Published editions reject finalize with 409 conflict', async () => {
    const epaperId = '507f1f77bcf86cd799439011';
    mockRepo.findEditionById.mockResolvedValue({
      _id: epaperId,
      status: 'published',
      productionStatus: 'published',
      publicationType: 'epaper',
    });

    await expect(
      service.finalize(superAdminActor, epaperId, {
        mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test-edition.pdf',
        uploadReceipt: 'valid-receipt-token',
      })
    ).rejects.toThrow(EpaperConflictError);

    expect(mockRepo.updateEdition).not.toHaveBeenCalled();
    expect(mockWorker.queuePageProcessing).not.toHaveBeenCalled();
  });

  it('Safety & Immutability: Archived editions reject finalize with 409 conflict', async () => {
    const epaperId = '507f1f77bcf86cd799439011';
    mockRepo.findEditionById.mockResolvedValue({
      _id: epaperId,
      status: 'draft',
      productionStatus: 'archived',
      publicationType: 'epaper',
    });

    await expect(
      service.finalize(superAdminActor, epaperId, {
        mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test-edition.pdf',
        uploadReceipt: 'valid-receipt-token',
      })
    ).rejects.toThrow(EpaperConflictError);

    expect(mockRepo.updateEdition).not.toHaveBeenCalled();
    expect(mockWorker.queuePageProcessing).not.toHaveBeenCalled();
  });

  it('Safety & Immutability: Editions advanced to hotspot_mapping reject duplicate finalize with 409 conflict', async () => {
    const epaperId = '507f1f77bcf86cd799439011';
    mockRepo.findEditionById.mockResolvedValue({
      _id: epaperId,
      status: 'draft',
      productionStatus: 'hotspot_mapping',
      publicationType: 'epaper',
    });

    await expect(
      service.finalize(superAdminActor, epaperId, {
        mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test-edition.pdf',
        uploadReceipt: 'valid-receipt-token',
      })
    ).rejects.toThrow(EpaperConflictError);

    expect(mockRepo.updateEdition).not.toHaveBeenCalled();
    expect(mockWorker.queuePageProcessing).not.toHaveBeenCalled();
  });
});
