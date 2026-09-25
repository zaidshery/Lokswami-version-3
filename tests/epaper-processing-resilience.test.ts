import { describe, it, expect, vi, beforeEach } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import {
  claimJob,
  queueEpaperPageProcessing,
  processClaimedJob,
  buildPageObjectKey,
  assertValidDerivedPageKey,
  resolveRetryableEpaperPageNumbers,
  uniquePageNumbers,
  LEASE_MS,
  EPAPER_MAX_PAGES,
  EPAPER_PROCESSING_ERROR_CODES,
  EpaperProcessingError,
} from '@/lib/server/epaperProcessingJobs';
import { epaperProcessingService } from '@/lib/server/epaper/epaperProcessingService';
import { EpaperConflictError, EpaperForbiddenError, EpaperValidationError, type AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';
import * as epaperPdfRenderer from '@/lib/server/epaperPdfRenderer';
import * as digitalOceanSpaces from '@/lib/utils/digitalOceanSpaces';
import * as epaperOcrJobs from '@/lib/server/epaperOcrJobs';

const superAdminActor: AdminSessionIdentity = {
  id: 'super-admin-1',
  name: 'Super Admin',
  email: 'superadmin@lokswami.com',
  username: 'superadmin',
  role: 'super_admin',
};

const adminActor: AdminSessionIdentity = {
  id: 'admin-1',
  name: 'Regular Admin',
  email: 'admin@lokswami.com',
  username: 'admin',
  role: 'admin',
};

const copyEditorActor: AdminSessionIdentity = {
  id: 'copy-editor-1',
  name: 'Copy Editor',
  email: 'copyeditor@lokswami.com',
  username: 'copyeditor',
  role: 'copy_editor',
};

const reporterActor: AdminSessionIdentity = {
  id: 'reporter-1',
  name: 'Reporter',
  email: 'reporter@lokswami.com',
  username: 'reporter',
  role: 'reporter',
};

describe('Phase 3.9B — E-Paper Processing Lifecycle & Page Generation Resilience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Canonical Processing States & Input Invariants', () => {
    it('normalizes and sorts page numbers strictly in numeric order', () => {
      const input = [10, 2, 1, 11, 2, 0, -5, 9999, 3];
      const result = uniquePageNumbers(input);
      expect(result).toEqual([1, 2, 3, 10, 11]);
    });

    it('rejects queue processing when page count is non-positive or exceeds maximum', async () => {
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          pageCount: 0,
        }),
      } as any);

      await expect(
        queueEpaperPageProcessing({
          epaperId: '507f1f77bcf86cd799439011',
          pageNumbers: [1],
        })
      ).rejects.toThrow(EPAPER_PROCESSING_ERROR_CODES.PAGE_COUNT_INVALID);
    });

    it('rejects queue processing when requested page exceeds edition page count', async () => {
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          pageCount: 5,
        }),
      } as any);

      await expect(
        queueEpaperPageProcessing({
          epaperId: '507f1f77bcf86cd799439011',
          pageNumbers: [1, 2, 6],
        })
      ).rejects.toThrow(EPAPER_PROCESSING_ERROR_CODES.PAGE_SEQUENCE_INVALID);
    });

    it('rejects queue processing for published editions (immutability regression guard)', async () => {
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'published',
          productionStatus: 'published',
          pageCount: 8,
        }),
      } as any);

      await expect(
        queueEpaperPageProcessing({
          epaperId: '507f1f77bcf86cd799439011',
          pageNumbers: [1],
        })
      ).rejects.toThrow(EpaperConflictError);
    });

    it('rejects queue processing for archived editions (immutability regression guard)', async () => {
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'archived',
          pageCount: 8,
        }),
      } as any);

      await expect(
        queueEpaperPageProcessing({
          epaperId: '507f1f77bcf86cd799439011',
          pageNumbers: [1],
        })
      ).rejects.toThrow(EpaperConflictError);
    });
  });

  describe('2. Atomic Processing Claim & Lease Semantics', () => {
    it('claims a queued job atomically and sets lease expiration', async () => {
      const mockJob = {
        _id: 'job-1',
        status: 'processing',
        leaseOwner: 'epaper-worker-test',
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      };

      vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockResolvedValue(mockJob as any);

      const claimed = await claimJob({ workerId: 'epaper-worker-test' });
      expect(claimed).toBeDefined();
      expect(claimed?.status).toBe('processing');
      expect(claimed?.leaseOwner).toBe('epaper-worker-test');
    });

    it('prevents worker B from claiming an active job claimed by worker A', async () => {
      // Simulate MongoDB atomic query returning null because lease is active
      vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockResolvedValue(null);

      const claimed = await claimJob({ workerId: 'worker-B' });
      expect(claimed).toBeNull();
    });

    it('allows reclamation when an existing lease has expired', async () => {
      const expiredJob = {
        _id: 'job-1',
        status: 'processing',
        leaseOwner: 'worker-B-recovery',
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        attemptCount: 2,
      };

      vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockImplementation(((filter: any) => {
        // Confirm the query matches expired leases
        expect(filter.$or).toBeDefined();
        return Promise.resolve(expiredJob);
      }) as any);

      const reclaimed = await claimJob({ workerId: 'worker-B-recovery' });
      expect(reclaimed).toBeDefined();
      expect(reclaimed?.leaseOwner).toBe('worker-B-recovery');
    });
  });

  describe('3. Stale Worker & Processing Generation Safety', () => {
    it('aborts processing if the edition generation does not match the job generation', async () => {
      const job: any = {
        _id: 'job-stale-1',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-old-123',
        revisionNumber: 1,
        pageNumbers: [1, 2],
      };

      // Current edition has already moved to gen-new-456
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          processingGeneration: 'gen-new-456',
          pageCount: 2,
        }),
      } as any);

      const jobUpdateSpy = vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as any);
      const epaperUpdateSpy = vi.spyOn(EPaper, 'findByIdAndUpdate').mockResolvedValue({} as any);

      const result = await processClaimedJob(job);
      expect(result.status).toBe('cancelled');
      expect(jobUpdateSpy).toHaveBeenCalledWith(
        'job-stale-1',
        expect.objectContaining({
          status: 'cancelled',
          lastError: expect.stringContaining('EPAPER_PROCESSING_STALE'),
        })
      );
      // Edition pages must NOT have been modified
      expect(epaperUpdateSpy).not.toHaveBeenCalled();
    });

    it('aborts processing if the edition revision was superseded', async () => {
      const job: any = {
        _id: 'job-stale-rev',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-123',
        revisionNumber: 1,
        pageNumbers: [1],
      };

      // Edition is now revision 2
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          processingGeneration: 'gen-123',
          revisionNumber: 2,
          pageCount: 1,
        }),
      } as any);

      const jobUpdateSpy = vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as any);
      const result = await processClaimedJob(job);
      expect(result.status).toBe('cancelled');
      expect(jobUpdateSpy).toHaveBeenCalledWith(
        'job-stale-rev',
        expect.objectContaining({
          status: 'cancelled',
          lastError: expect.stringContaining('EPAPER_PROCESSING_STALE'),
        })
      );
    });

    it('aborts processing if the source PDF was replaced', async () => {
      const job: any = {
        _id: 'job-stale-source',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-123',
        revisionNumber: 1,
        sourceKey: 'lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pdf/original.pdf',
        pageNumbers: [1],
      };

      // Source was replaced with replacement.pdf
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          processingGeneration: 'gen-123',
          revisionNumber: 1,
          pdfPublicId: 'lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pdf/replacement.pdf',
          pageCount: 1,
        }),
      } as any);

      const jobUpdateSpy = vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as any);
      const result = await processClaimedJob(job);
      expect(result.status).toBe('cancelled');
      expect(jobUpdateSpy).toHaveBeenCalledWith(
        'job-stale-source',
        expect.objectContaining({
          status: 'cancelled',
          lastError: expect.stringContaining('EPAPER_PROCESSING_STALE'),
        })
      );
    });

    it('aborts mid-loop if worker lease was overtaken by another process', async () => {
      const job: any = {
        _id: 'job-active-1',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-1',
        revisionNumber: 1,
        sourceKey: 'pdf-key-1',
        leaseOwner: 'worker-A',
        pageNumbers: [1, 2],
      };

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          processingGeneration: 'gen-1',
          revisionNumber: 1,
          pdfPublicId: 'pdf-key-1',
          pdfPath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pdf/source.pdf',
          pageCount: 2,
          pages: [],
        }),
      } as any);

      vi.spyOn(epaperPdfRenderer, 'downloadVerifiedEpaperPdf').mockResolvedValue(Buffer.from('%PDF-1.4 mock'));

      // Simulate lease lost: findOne returns null (Worker B overtook the lease)
      vi.spyOn(EPaperProcessingJob, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      } as any);

      const result = await processClaimedJob(job);
      expect(result.status).toBe('cancelled');
    });
  });

  describe('4. Derived Asset Key Authority & Namespace Isolation', () => {
    it('constructs deterministic, server-owned page object keys', () => {
      const epaper = {
        _id: '6ab0da70c6aab6a2a6cab44e',
        publicationType: 'epaper',
        citySlug: 'indore',
        publishDate: new Date('2026-09-21T00:00:00Z'),
        revisionNumber: 1,
      };

      const key = buildPageObjectKey(epaper, 1);
      expect(key).toBe(
        'lokswami/epapers/indore/2026-09-21/revision-1-6ab0da70c6aab6a2a6cab44e/pages/001-rendered.jpg'
      );
    });

    it('pads page numbers correctly past page 9', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        publicationType: 'epaper',
        citySlug: 'bhopal',
        publishDate: new Date('2026-09-21T00:00:00Z'),
        revisionNumber: 2,
      };

      expect(buildPageObjectKey(epaper, 10)).toContain('/pages/010-rendered.jpg');
      expect(buildPageObjectKey(epaper, 100)).toContain('/pages/100-rendered.jpg');
    });

    it('rejects path traversal sequences in derived keys', () => {
      const epaper = {
        _id: '../../etc/passwd',
        publicationType: 'epaper',
        citySlug: 'indore',
        publishDate: new Date('2026-09-21T00:00:00Z'),
        revisionNumber: 1,
      };

      expect(() => buildPageObjectKey(epaper, 1)).toThrow(
        EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID
      );
    });

    it('assertValidDerivedPageKey validates matching revision and page number', () => {
      const validKey =
        'lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pages/002-rendered.jpg';

      expect(() =>
        assertValidDerivedPageKey(validKey, '507f1f77bcf86cd799439011', 1, 2)
      ).not.toThrow();

      // Mismatched revision
      expect(() =>
        assertValidDerivedPageKey(validKey, '507f1f77bcf86cd799439011', 2, 2)
      ).toThrow(EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID);

      // Mismatched page number
      expect(() =>
        assertValidDerivedPageKey(validKey, '507f1f77bcf86cd799439011', 1, 3)
      ).toThrow(EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID);
    });
  });

  describe('5. Page Generation, Count Integrity & Partial Failure', () => {
    it('successfully processes all pages, derives cover, and transitions to pages_ready', async () => {
      const job: any = {
        _id: '607f1f77bcf86cd799439001',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-succ',
        revisionNumber: 1,
        sourceKey: 'pdf-key-1',
        leaseOwner: 'worker-1',
        attemptCount: 1,
        maxAttempts: 4,
        pageNumbers: [1, 2],
      };

      const mockEdition = {
        _id: '507f1f77bcf86cd799439011',
        status: 'draft',
        productionStatus: 'draft_upload',
        processingGeneration: 'gen-succ',
        revisionNumber: 1,
        pdfPublicId: 'pdf-key-1',
        pdfPath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pdf/source.pdf',
        pageCount: 2,
        pages: [
          { pageNumber: 1, processingStatus: 'pending' },
          { pageNumber: 2, processingStatus: 'pending' },
        ],
      };

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockEdition),
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockEdition),
        }),
      } as any);

      vi.spyOn(EPaperProcessingJob, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(job),
      } as any);

      vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as any);

      vi.spyOn(epaperPdfRenderer, 'downloadVerifiedEpaperPdf').mockResolvedValue(
        Buffer.from('%PDF-1.4 mock')
      );
      vi.spyOn(epaperPdfRenderer, 'renderPdfPageToJpeg').mockResolvedValue({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        width: 3000,
        height: 4200,
      });
      vi.spyOn(digitalOceanSpaces, 'uploadBufferToDigitalOceanSpaces').mockResolvedValue({
        secureUrl: 'https://lokswami.blr1.digitaloceanspaces.com/rendered-page.jpg',
        publicId: 'test-public-id',
      } as any);
      vi.spyOn(epaperOcrJobs, 'queueEpaperOcr').mockResolvedValue([]);

      const epaperUpdateOneSpy = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
        acknowledged: true,
        upsertedId: null,
        upsertedCount: 0,
      });

      const result = await processClaimedJob(job);
      expect(result.status).toBe('completed');
      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);

      // Verify that pages_ready and thumbnail updates were persisted
      expect(epaperUpdateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: '507f1f77bcf86cd799439011', status: 'draft', processingGeneration: 'gen-succ' }),
        expect.objectContaining({
          productionStatus: 'pages_ready',
          thumbnailPath: 'https://lokswami.blr1.digitaloceanspaces.com/rendered-page.jpg',
        })
      );
    });

    it('isolates partial page failure: middle page fails, edition DOES NOT become pages_ready', async () => {
      const job: any = {
        _id: '607f1f77bcf86cd799439002',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-part',
        revisionNumber: 1,
        sourceKey: 'pdf-key-1',
        leaseOwner: 'worker-1',
        attemptCount: 1,
        maxAttempts: 4,
        pageNumbers: [1, 2, 3],
      };

      const mockEdition = {
        _id: '507f1f77bcf86cd799439011',
        status: 'draft',
        productionStatus: 'draft_upload',
        processingGeneration: 'gen-part',
        revisionNumber: 1,
        pdfPublicId: 'pdf-key-1',
        pdfPath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pdf/source.pdf',
        pageCount: 3,
        pages: [
          { pageNumber: 1, processingStatus: 'pending' },
          { pageNumber: 2, processingStatus: 'pending' },
          { pageNumber: 3, processingStatus: 'pending' },
        ],
      };

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockEdition),
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockEdition),
        }),
      } as any);

      vi.spyOn(EPaperProcessingJob, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(job),
      } as any);

      vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as any);

      vi.spyOn(epaperPdfRenderer, 'downloadVerifiedEpaperPdf').mockResolvedValue(
        Buffer.from('%PDF-1.4 mock')
      );

      // Page 1 and 3 succeed, Page 2 throws error
      vi.spyOn(epaperPdfRenderer, 'renderPdfPageToJpeg').mockImplementation(async (opts) => {
        if (opts.pageNumber === 2) {
          throw new Error('Simulated rasterization crash on page 2');
        }
        return {
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
          width: 3000,
          height: 4200,
        };
      });

      vi.spyOn(digitalOceanSpaces, 'uploadBufferToDigitalOceanSpaces').mockResolvedValue({
        secureUrl: 'https://lokswami.blr1.digitaloceanspaces.com/rendered-page.jpg',
        publicId: 'test-public-id',
      } as any);

      const epaperUpdateOneSpy = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
        acknowledged: true,
        upsertedId: null,
        upsertedCount: 0,
      });

      const result = await processClaimedJob(job);
      // Attempt 1 < maxAttempts 4 -> job is requeued for failed page 2
      expect(result.status).toBe('queued');
      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);

      // Confirm edition productionStatus was NEVER updated to pages_ready
      const statusUpdates = epaperUpdateOneSpy.mock.calls
        .map((call) => (call as unknown as any[])[1]?.productionStatus)
        .filter(Boolean);
      expect(statusUpdates).not.toContain('pages_ready');
    });

    it('resolveRetryableEpaperPageNumbers selects only missing or failed pages for retry', () => {
      const pages = [
        { pageNumber: 1, imagePath: 'https://cdn/1.jpg', processingStatus: 'ready' },
        { pageNumber: 2, imagePath: '', processingStatus: 'failed' },
        { pageNumber: 3, imagePath: 'https://cdn/3.jpg', processingStatus: 'ready' },
        { pageNumber: 4, imagePath: '', processingStatus: 'pending' },
      ];

      // Automatic resolution: pages 2 and 4
      expect(resolveRetryableEpaperPageNumbers(pages)).toEqual([2, 4]);

      // Requested subset: user requested pages 1 and 2, but only page 2 is retryable
      expect(resolveRetryableEpaperPageNumbers(pages, [1, 2])).toEqual([2]);
    });
  });

  describe('6. Retry Semantics & Newsroom RBAC', () => {
    it('blocks retry for published editions with HTTP 409 EpaperConflictError', async () => {
      const mockRepo: any = {
        connect: vi.fn(),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn().mockResolvedValue({
          _id: 'edition-pub',
          status: 'published',
          productionStatus: 'published',
          pageCount: 5,
        }),
      };

      const service = new (epaperProcessingService as any).constructor(mockRepo, {} as any);

      await expect(
        service.retry(superAdminActor, 'edition-pub', {})
      ).rejects.toThrow(EpaperConflictError);
    });

    it('blocks retry for archived editions with HTTP 409 EpaperConflictError', async () => {
      const mockRepo: any = {
        connect: vi.fn(),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn().mockResolvedValue({
          _id: 'edition-arch',
          status: 'draft',
          productionStatus: 'archived',
          pageCount: 5,
        }),
      };

      const service = new (epaperProcessingService as any).constructor(mockRepo, {} as any);

      await expect(
        service.retry(superAdminActor, 'edition-arch', {})
      ).rejects.toThrow(EpaperConflictError);
    });

    it('strictly denies non-super_admin roles from retrying processing', async () => {
      const mockRepo: any = {
        connect: vi.fn(),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          pageCount: 5,
        }),
      };

      const service = new (epaperProcessingService as any).constructor(mockRepo, {} as any);

      await expect(service.retry(adminActor, '507f1f77bcf86cd799439011', {})).rejects.toThrow(EpaperForbiddenError);
      await expect(service.retry(copyEditorActor, '507f1f77bcf86cd799439011', {})).rejects.toThrow(EpaperForbiddenError);
      await expect(service.retry(reporterActor, '507f1f77bcf86cd799439011', {})).rejects.toThrow(EpaperForbiddenError);
    });

    it('rejects retry when there are no failed or missing pages', async () => {
      const mockRepo: any = {
        connect: vi.fn(),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'draft_upload',
          citySlug: 'indore',
          publicationType: 'epaper',
          pageCount: 2,
          pages: [
            { pageNumber: 1, imagePath: 'https://cdn/1.jpg', processingStatus: 'ready' },
            { pageNumber: 2, imagePath: 'https://cdn/2.jpg', processingStatus: 'ready' },
          ],
        }),
      };
      const mockWorker: any = {
        isPageProcessingEnabled: vi.fn().mockReturnValue(true),
        retryablePages: vi.fn().mockReturnValue([]),
      };

      const service = new (epaperProcessingService as any).constructor(mockRepo, mockWorker);

      await expect(
        service.retry(superAdminActor, '507f1f77bcf86cd799439011', {})
      ).rejects.toThrow(EpaperValidationError);
    });
  });

  describe('7. Source PDF Trust & SSRF Prevention', () => {
    it('rejects arbitrary external URLs that do not originate from DigitalOcean Spaces', async () => {
      await expect(
        epaperPdfRenderer.downloadVerifiedEpaperPdf('https://attacker.com/malicious.pdf')
      ).rejects.toThrow('Only verified DigitalOcean Spaces e-paper PDFs can be processed.');

      await expect(
        epaperPdfRenderer.downloadVerifiedEpaperPdf('http://localhost:8080/internal.pdf')
      ).rejects.toThrow('Only verified DigitalOcean Spaces e-paper PDFs can be processed.');

      await expect(
        epaperPdfRenderer.downloadVerifiedEpaperPdf('file:///etc/passwd')
      ).rejects.toThrow('Only verified DigitalOcean Spaces e-paper PDFs can be processed.');
    });

    it('rejects Spaces URLs that do not belong to epapers or emagazines directories', async () => {
      await expect(
        epaperPdfRenderer.downloadVerifiedEpaperPdf(
          'https://lokswami.blr1.digitaloceanspaces.com/lokswami/articles/secret.pdf'
        )
      ).rejects.toThrow('Only verified DigitalOcean Spaces e-paper PDFs can be processed.');
    });

    it('rejects PDFs exceeding the 25MB limit', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': String(30 * 1024 * 1024) }),
        arrayBuffer: vi.fn(),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        epaperPdfRenderer.downloadVerifiedEpaperPdf(
          'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/2026-09-21/source.pdf'
        )
      ).rejects.toThrow('PDF exceeds the 25MB processing limit.');

      vi.unstubAllGlobals();
    });

    it('rejects files without a valid %PDF- signature', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '100' }),
        arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('NOT_A_PDF_FILE_HEADER').buffer),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        epaperPdfRenderer.downloadVerifiedEpaperPdf(
          'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/2026-09-21/source.pdf'
        )
      ).rejects.toThrow('PDF signature is invalid.');

      vi.unstubAllGlobals();
    });
  });

  describe('8. Page Gaps, Single-Page PDFs & Multi-Attempt Generation Races', () => {
    it('successfully processes a 1-page PDF and sets page 1 as cover', async () => {
      const job: any = {
        _id: '607f1f77bcf86cd799439099',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-single-1',
        revisionNumber: 1,
        sourceKey: 'pdf-key-1',
        leaseOwner: 'worker-1',
        attemptCount: 1,
        maxAttempts: 4,
        pageNumbers: [1],
      };

      const mockEdition = {
        _id: '507f1f77bcf86cd799439011',
        status: 'draft',
        productionStatus: 'draft_upload',
        processingGeneration: 'gen-single-1',
        revisionNumber: 1,
        pdfPublicId: 'pdf-key-1',
        pdfPath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pdf/source.pdf',
        pageCount: 1,
        pages: [{ pageNumber: 1, processingStatus: 'pending' }],
      };

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockEdition),
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockEdition),
        }),
      } as any);

      vi.spyOn(EPaperProcessingJob, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(job),
      } as any);

      vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as any);

      vi.spyOn(epaperPdfRenderer, 'downloadVerifiedEpaperPdf').mockResolvedValue(
        Buffer.from('%PDF-1.4 mock')
      );
      vi.spyOn(epaperPdfRenderer, 'renderPdfPageToJpeg').mockResolvedValue({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        width: 3000,
        height: 4200,
      });
      vi.spyOn(digitalOceanSpaces, 'uploadBufferToDigitalOceanSpaces').mockResolvedValue({
        secureUrl: 'https://lokswami.blr1.digitaloceanspaces.com/rendered-page-1.jpg',
        publicId: 'test-public-id-1',
      } as any);
      vi.spyOn(epaperOcrJobs, 'queueEpaperOcr').mockResolvedValue([]);

      const epaperUpdateOneSpy = vi.spyOn(EPaper, 'updateOne').mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
        acknowledged: true,
        upsertedId: null,
        upsertedCount: 0,
      });

      const result = await processClaimedJob(job);
      expect(result.status).toBe('completed');
      expect(result.processed).toBe(1);

      expect(epaperUpdateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: '507f1f77bcf86cd799439011', status: 'draft', processingGeneration: 'gen-single-1' }),
        expect.objectContaining({
          productionStatus: 'pages_ready',
          thumbnailPath: 'https://lokswami.blr1.digitaloceanspaces.com/rendered-page-1.jpg',
        })
      );
    });

    it('rejects stale first attempt from winning after retry creates a new generation', async () => {
      // First attempt with generation gen-attempt-1
      const staleJob: any = {
        _id: '607f1f77bcf86cd799439088',
        epaperId: '507f1f77bcf86cd799439011',
        generation: 'gen-attempt-1',
        revisionNumber: 1,
        sourceKey: 'pdf-key-1',
        leaseOwner: 'slow-worker',
        attemptCount: 1,
        maxAttempts: 4,
        pageNumbers: [1, 2],
      };

      // In the meantime, retry queued generation gen-attempt-2
      const freshEdition = {
        _id: '507f1f77bcf86cd799439011',
        status: 'draft',
        productionStatus: 'draft_upload',
        processingGeneration: 'gen-attempt-2', // superseding generation!
        revisionNumber: 1,
        pdfPublicId: 'pdf-key-1',
        pdfPath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-21/revision-1-507f1f77bcf86cd799439011/pdf/source.pdf',
        pageCount: 2,
        pages: [],
      };

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(freshEdition),
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(freshEdition),
        }),
      } as any);

      vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as any);

      const result = await processClaimedJob(staleJob);
      expect(result.status).toBe('cancelled');
    });
  });
});
