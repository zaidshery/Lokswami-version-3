// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import {
  epaperOcrSourceKey,
  processQueuedEpaperOcrJobs,
  queueEpaperOcr,
} from '@/lib/server/epaperOcrJobs';
import * as localOcr from '@/lib/server/epaperLocalOcr';
import * as epaperShareImage from '@/lib/server/epaperShareImage';
import { epaperOcrService } from '@/lib/server/epaper/epaperOcrService';
import type { AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';

vi.mock('server-only', () => ({}));

const superAdminActor: AdminSessionIdentity = {
  id: 'super-admin-1',
  name: 'Super Admin',
  email: 'superadmin@example.com',
  username: 'superadmin',
  role: 'super_admin',
};

const adminActor: AdminSessionIdentity = {
  id: 'admin-1',
  name: 'Desk Admin',
  email: 'admin@example.com',
  username: 'admin',
  role: 'admin',
};

describe('E-Paper OCR Coordination, Idempotency & Lifecycle (Phase 3.9D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EPAPER_LOCAL_OCR_ENABLED = '1';
  });

  describe('queueEpaperOcr', () => {
    it('repairs legacy revision metadata on reuse without resetting the lease or results', async () => {
      const paper = {
        _id: '665000000000000000000020', status: 'draft',
        productionStatus: 'pages_ready', revisionNumber: 2,
        processingGeneration: 'generation-2',
        pages: [{ pageNumber: 1, imagePath: '/p1.jpg', pageType: 'editorial' }],
      };
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(paper),
      } as never);
      const existing = { _id: 'legacy-job', revisionNumber: 1, generation: '',
        status: 'processing', leaseOwner: 'current-worker', checkpoint: [{ title: 'Existing result' }] };
      const upsert = vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockImplementation(
        (_query: unknown, update: unknown) => {
          Object.assign(existing, (update as { $set: object }).$set);
          return Promise.resolve(existing) as never;
        }
      );
      await expect(queueEpaperOcr(String(paper._id))).resolves.toEqual(['legacy-job']);
      expect(existing).toEqual(expect.objectContaining({
        revisionNumber: 2, generation: 'generation-2', status: 'processing',
        leaseOwner: 'current-worker', checkpoint: [{ title: 'Existing result' }],
      }));
      const update = upsert.mock.calls[0][1] as { $set: object; $setOnInsert: object };
      expect(update.$set).toEqual({ revisionNumber: 2, generation: 'generation-2' });
      expect(update.$setOnInsert).not.toHaveProperty('revisionNumber');
      expect(update.$setOnInsert).not.toHaveProperty('generation');
    });

    it.each(['initializing', 'failed'])('does not queue OCR on a %s revision', async (revisionInitializationStatus) => {
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          status: 'draft', productionStatus: 'hotspot_mapping', revisionInitializationStatus,
          pages: [{ pageNumber: 1, imagePath: '/p1.jpg' }],
        }),
      } as never);
      const createJob = vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate');
      await expect(queueEpaperOcr('665000000000000000000020')).resolves.toEqual([]);
      expect(createJob).not.toHaveBeenCalled();
    });

    it('repairs cancelled legacy metadata before explicitly retrying the job', async () => {
      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          status: 'draft', productionStatus: 'pages_ready', revisionNumber: 2,
          processingGeneration: 'generation-2',
          pages: [{ pageNumber: 1, imagePath: '/p1.jpg' }],
        }),
      } as never);
      const upsert = vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockResolvedValue({
        _id: 'legacy-cancelled', status: 'cancelled',
      } as never);
      const retry = vi.spyOn(EPaperProcessingJob, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as never);
      await queueEpaperOcr('665000000000000000000020', [1], true);
      expect(upsert).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
        $set: { revisionNumber: 2, generation: 'generation-2' },
      }), expect.any(Object));
      expect(retry).toHaveBeenCalledWith(expect.objectContaining({
        status: { $in: ['failed', 'completed_with_errors', 'cancelled'] },
      }), expect.objectContaining({ $set: expect.objectContaining({ status: 'queued', attemptCount: 0 }) }));
      expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(retry.mock.invocationCallOrder[0]);
    });

    it('queues OCR jobs only for eligible editorial pages and skips failed or non-editorial pages', async () => {
      const mockEdition = {
        _id: '665000000000000000000020',
        status: 'draft',
        productionStatus: 'draft_upload',
        revisionNumber: 1,
        processingGeneration: 'gen-1',
        pages: [
          { pageNumber: 1, imagePath: '/p1.jpg', pageType: 'editorial', processingStatus: 'completed' },
          { pageNumber: 2, imagePath: '/p2.jpg', pageType: 'advertisement', processingStatus: 'completed' },
          { pageNumber: 3, imagePath: '/p3.jpg', pageType: 'editorial', processingStatus: 'failed' },
          { pageNumber: 4, imagePath: '', pageType: 'editorial', processingStatus: 'completed' },
          { pageNumber: 5, imagePath: '/p5.jpg', pageType: 'editorial', processingStatus: 'completed' },
        ],
      };

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockEdition),
      } as never);

      const findOneAndUpdateSpy = vi
        .spyOn(EPaperProcessingJob, 'findOneAndUpdate')
        .mockImplementation((query: unknown) => {
          return Promise.resolve({
            _id: `job-${(query as { sourceKey: string }).sourceKey.slice(0, 8)}`,
          }) as never;
        });

      const jobs = await queueEpaperOcr('665000000000000000000020');

      // Only pages 1 and 5 should be queued!
      expect(jobs).toHaveLength(2);
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);

      const firstCallArgs = findOneAndUpdateSpy.mock.calls[0][1] as {
        $setOnInsert: { pageNumbers: number[]; sourceImagePath: string };
      };
      expect(firstCallArgs.$setOnInsert.pageNumbers).toEqual([1]);
      expect(firstCallArgs.$setOnInsert.sourceImagePath).toBe('/p1.jpg');

      const secondCallArgs = findOneAndUpdateSpy.mock.calls[1][1] as {
        $setOnInsert: { pageNumbers: number[]; sourceImagePath: string };
      };
      expect(secondCallArgs.$setOnInsert.pageNumbers).toEqual([5]);
      expect(secondCallArgs.$setOnInsert.sourceImagePath).toBe('/p5.jpg');
    });

    it('honors selected page numbers when provided', async () => {
      const mockEdition = {
        _id: '665000000000000000000021',
        status: 'draft',
        productionStatus: 'pages_ready',
        revisionNumber: 1,
        pages: [
          { pageNumber: 1, imagePath: '/p1.jpg', pageType: 'editorial' },
          { pageNumber: 2, imagePath: '/p2.jpg', pageType: 'editorial' },
        ],
      };

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockEdition),
      } as never);

      vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockResolvedValue({ _id: 'job-p2' } as never);

      const jobs = await queueEpaperOcr('665000000000000000000021', [2]);

      expect(jobs).toHaveLength(1);
    });
    it('does not queue OCR for the protected QA edition or any published edition', async () => {
      const findById = vi.spyOn(EPaper, 'findById');
      findById.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          _id: '665000000000000000000099',
          status: 'published',
          productionStatus: 'published',
          pages: [{ pageNumber: 1, imagePath: '/published.jpg' }],
        }),
      } as never);
      const createJob = vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate');

      await expect(queueEpaperOcr('6ab0da70c6aab6a2a6cab44e')).resolves.toEqual([]);
      await expect(queueEpaperOcr('6AB0DA70C6AAB6A2A6CAB44E')).resolves.toEqual([]);
      expect(findById).not.toHaveBeenCalled();
      await expect(queueEpaperOcr('665000000000000000000099')).resolves.toEqual([]);
      expect(createJob).not.toHaveBeenCalled();
    });

  });

  describe('processQueuedEpaperOcrJobs - Execution, Deduplication & Generation Safety', () => {
    it('allows monthly magazines and non-current draft revisions under city-scoped OCR without batch starvation', async () => {
      vi.stubEnv('EPAPER_LOCAL_OCR_CITY_ALLOWLIST', 'indore');
      Object.defineProperty(mongoose.connection, 'db', {
        value: { collection: () => ({
          updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
          deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
        }) },
        configurable: true, writable: true,
      });
      const find = vi.spyOn(EPaper, 'find').mockReturnValue({
        sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [] }) }) }),
      } as never);
      const distinct = vi.spyOn(EPaper, 'distinct').mockResolvedValue(['older-monthly-draft'] as never);
      const claim = vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockResolvedValue(null);
      await processQueuedEpaperOcrJobs();
      expect(find).toHaveBeenCalledWith(expect.objectContaining({
        status: 'draft',
        $or: [{ publicationType: 'emagazine' }, { citySlug: { $in: ['indore'] } }],
      }));
      const query = (find.mock.calls as unknown as unknown[][])[0][0];
      expect(query).not.toHaveProperty('isCurrentRevision');
      expect(distinct).toHaveBeenCalledWith('_id', query);
      expect(claim).toHaveBeenCalledWith(
        expect.objectContaining({ epaperId: { $in: ['older-monthly-draft'] } }),
        expect.any(Object), expect.any(Object),
      );
      vi.unstubAllEnvs();
    });
    it.each([1,undefined,null])('claims revision-one OCR with stored revision %s and commits fresh suggestions', async (revisionNumber) => {
      const mockJob = {
        _id: 'ocr-job-1',
        kind: 'ocr',
        epaperId: '665000000000000000000022',
        pageNumbers: [1],
        sourceImagePath: '/p1.jpg',
        sourceKey: epaperOcrSourceKey('665000000000000000000022', 1, { pageNumber: 1, imagePath: '/p1.jpg' }, 'gen-1'),
        attemptCount: 1,
        revisionNumber: 1,
      };

      const mockEdition = {
        _id: '665000000000000000000022',
        status: 'draft',
        revisionNumber,
        productionStatus: 'ocr_review',
        processingGeneration: 'gen-1',
        pages: [{ pageNumber: 1, imagePath: '/p1.jpg' }],
      };

      const mockCollection = {
        updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
        deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      };

      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          collection: vi.fn().mockReturnValue(mockCollection),
        },
        configurable: true,
        writable: true,
      });

      vi.spyOn(EPaper, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      // Claim returns mockJob
      vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockJob as never) // first call: claim
        .mockResolvedValueOnce({ ...mockJob, status: 'completed' } as never); // second call: commit

      vi.spyOn(epaperShareImage, 'loadTrustedEpaperImage').mockResolvedValue(Buffer.from('fake-image'));

      vi.spyOn(localOcr, 'runIsolatedLocalOcr').mockResolvedValue([
        {
          title: 'Headline 1',
          text: 'Body text content of article 1',
          confidence: 95,
          hotspot: { x: 0.1, y: 0.1, w: 0.4, h: 0.3 },
        },
      ]);

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockEdition),
      } as never);

      const updateSuggestionSpy = vi.spyOn(EPaperOcrSuggestion, 'updateOne').mockResolvedValue({ acknowledged: true } as never);

      const result = await processQueuedEpaperOcrJobs();

      expect(result.processed).toBe(1);
      expect(result.suggestions).toBe(1);
      expect(updateSuggestionSpy).toHaveBeenCalledTimes(1);

      const suggestionCall = updateSuggestionSpy.mock.calls[0];
      const filter = suggestionCall[0] as { epaperId: string; pageNumber: number; fingerprint: string };
      expect(filter.epaperId).toBe('665000000000000000000022');
      expect(filter.pageNumber).toBe(1);
      expect(filter.fingerprint).toBeDefined();

      const insertPayload = (suggestionCall as unknown as [unknown, { $setOnInsert: Record<string, unknown> }])[1].$setOnInsert;
      expect(insertPayload.title).toBe('Headline 1');
      expect(insertPayload.status).toBe('pending');
      expect(insertPayload.confidence).toBe(95);
    });

    it('rejects completion and cancels job if generation was superseded while worker was running', async () => {
      const oldGenerationKey = epaperOcrSourceKey('665000000000000000000023', 1, { pageNumber: 1, imagePath: '/p1.jpg' }, 'gen-1');

      const mockJob = {
        _id: 'ocr-job-stale',
        kind: 'ocr',
        epaperId: '665000000000000000000023',
        pageNumbers: [1],
        sourceImagePath: '/p1.jpg',
        sourceKey: oldGenerationKey,
        attemptCount: 1,
      };

      // Current edition has new generation 'gen-2'!
      const mockEdition = {
        _id: '665000000000000000000023',
        revisionNumber: 1,
        productionStatus: 'ocr_review',
        processingGeneration: 'gen-2',
        pages: [{ pageNumber: 1, imagePath: '/p1.jpg' }],
      };

      const mockCollection = {
        updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
        deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      };

      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          collection: vi.fn().mockReturnValue(mockCollection),
        },
        configurable: true,
        writable: true,
      });

      vi.spyOn(EPaper, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const findOneAndUpdateSpy = vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockJob as never)
        .mockResolvedValueOnce({ ...mockJob, status: 'cancelled' } as never);

      vi.spyOn(epaperShareImage, 'loadTrustedEpaperImage').mockResolvedValue(Buffer.from('fake-image'));
      vi.spyOn(localOcr, 'runIsolatedLocalOcr').mockResolvedValue([
        { title: 'Stale News', text: 'Text', confidence: 90, hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      ]);

      vi.spyOn(EPaper, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockEdition),
      } as never);

      const updateSuggestionSpy = vi.spyOn(EPaperOcrSuggestion, 'updateOne');

      const result = await processQueuedEpaperOcrJobs();

      expect(result.processed).toBe(0);
      expect(result.stale).toBe(true);

      // Verify suggestions were NOT inserted for stale generation!
      expect(updateSuggestionSpy).not.toHaveBeenCalled();

      // Verify job was marked cancelled
      const cancelCallArgs = findOneAndUpdateSpy.mock.calls[1][1] as {
        $set: { status: string };
      };
      expect(cancelCallArgs.$set.status).toBe('cancelled');
    });

    it('bounds retries and marks failed after max attempts (4)', async () => {
      const mockJob = {
        _id: 'ocr-job-fail',
        kind: 'ocr',
        epaperId: '665000000000000000000024',
        pageNumbers: [1],
        sourceImagePath: '/p1.jpg',
        attemptCount: 4, // 4th attempt failing!
      };

      const mockCollection = {
        updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
        deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      };

      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          collection: vi.fn().mockReturnValue(mockCollection),
        },
        configurable: true,
        writable: true,
      });

      vi.spyOn(EPaper, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate').mockResolvedValue(mockJob as never);
      vi.spyOn(epaperShareImage, 'loadTrustedEpaperImage').mockRejectedValue(new Error('Image fetch timeout'));

      const updateOneSpy = vi.spyOn(EPaperProcessingJob, 'updateOne').mockResolvedValue({ acknowledged: true } as never);

      await expect(processQueuedEpaperOcrJobs()).rejects.toThrow('Image fetch timeout');

      expect(updateOneSpy).toHaveBeenCalled();
      const failUpdate = (updateOneSpy.mock.calls[0] as unknown as [unknown, { $set: { status: string; lastError: string } }])[1];
      expect(failUpdate.$set.status).toBe('failed');
      expect(failUpdate.$set.lastError).toBe('Image fetch timeout');
    });
  });

  describe('epaperOcrService RBAC', () => {
    it('allows super_admin to queue and list OCR suggestions', async () => {
      vi.spyOn(epaperOcrService['repo'], 'connect').mockResolvedValue(undefined);
      vi.spyOn(epaperOcrService['repo'], 'isValidId').mockReturnValue(true);
      vi.spyOn(epaperOcrService['repo'], 'listOcrSuggestions').mockResolvedValue([]);
      vi.spyOn(epaperOcrService['worker'], 'queueOcr').mockResolvedValue(['job-1']);

      const listResult = await epaperOcrService.list(superAdminActor, '665000000000000000000025');
      expect(listResult).toEqual([]);

      const queueResult = await epaperOcrService.queue(superAdminActor, '665000000000000000000025', { pageNumbers: [1] });
      expect(queueResult.data.queued).toBe(1);
    });

    it('strictly denies non-super_admin roles from queueing or reviewing OCR suggestions', async () => {
      await expect(
        epaperOcrService.list(adminActor, '665000000000000000000025')
      ).rejects.toThrow(/Forbidden/i);

      await expect(
        epaperOcrService.queue(adminActor, '665000000000000000000025', { pageNumbers: [1] })
      ).rejects.toThrow(/Forbidden/i);

      await expect(
        epaperOcrService.review(adminActor, '665000000000000000000025', '665000000000000000000099', { action: 'accept' })
      ).rejects.toThrow(/Forbidden/i);
    });
  });
});
