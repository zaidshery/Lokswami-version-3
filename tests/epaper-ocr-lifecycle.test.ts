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
    it('queues OCR jobs only for eligible editorial pages and skips failed or non-editorial pages', async () => {
      const mockEdition = {
        _id: '665000000000000000000020',
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
  });

  describe('processQueuedEpaperOcrJobs - Execution, Deduplication & Generation Safety', () => {
    it('claims a queued job, runs isolated OCR, deduplicates suggestions, and marks completed', async () => {
      const mockJob = {
        _id: 'ocr-job-1',
        kind: 'ocr',
        epaperId: '665000000000000000000022',
        pageNumbers: [1],
        sourceImagePath: '/p1.jpg',
        sourceKey: epaperOcrSourceKey('665000000000000000000022', 1, { pageNumber: 1, imagePath: '/p1.jpg' }, 'gen-1'),
        attemptCount: 1,
      };

      const mockEdition = {
        _id: '665000000000000000000022',
        revisionNumber: 1,
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
