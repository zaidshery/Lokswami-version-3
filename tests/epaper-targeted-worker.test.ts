import { beforeEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import {
  processClaimedJob,
  processEpaperJobForEdition,
} from '@/lib/server/epaperProcessingJobs';
import { buildEpaperImageAutomationUpdates } from '@/lib/server/epaperImageAutomation';
import * as epaperPdfRenderer from '@/lib/server/epaperPdfRenderer';
import * as digitalOceanSpaces from '@/lib/utils/digitalOceanSpaces';
import * as epaperOcrJobs from '@/lib/server/epaperOcrJobs';
import { assertSafeStagingEpaperTarget } from '@/scripts/epaper/process-staging-edition';

const targetId = '507f1f77bcf86cd799439011';
const unrelatedId = '507f1f77bcf86cd799439099';

describe('targeted staging e-paper worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('hard-blocks the preserved QA edition and invalid or missing IDs', () => {
    expect(() => assertSafeStagingEpaperTarget('')).toThrow('--epaper-id');
    expect(() => assertSafeStagingEpaperTarget('not-an-object-id')).toThrow('--epaper-id');
    expect(() => assertSafeStagingEpaperTarget('6ab0da70c6aab6a2a6cab44e')).toThrow(
      'preserved QA'
    );
    expect(() => assertSafeStagingEpaperTarget(targetId)).not.toThrow();
  });

  it('queries and claims only jobs belonging to the explicitly requested edition', async () => {
    const firstSort = vi.fn().mockResolvedValue(null);
    const secondSelect = vi.fn().mockResolvedValue(null);
    const secondSort = vi.fn().mockReturnValue({ select: secondSelect });
    const findOne = vi.spyOn(EPaperProcessingJob, 'findOne')
      .mockReturnValueOnce({ sort: firstSort } as never)
      .mockReturnValueOnce({ sort: secondSort } as never);
    const claim = vi.spyOn(EPaperProcessingJob, 'findOneAndUpdate');

    await expect(processEpaperJobForEdition({ epaperId: targetId })).resolves.toEqual({
      claimed: 0,
      status: 'no_active_job',
      jobId: '',
      jobStatus: 'missing',
    });

    expect(findOne.mock.calls[0][0]).toEqual(expect.objectContaining({
      epaperId: targetId,
      kind: 'pdf_pages',
    }));
    expect(findOne.mock.calls[0][0]).not.toEqual(expect.objectContaining({ epaperId: unrelatedId }));
    expect(claim).not.toHaveBeenCalled();
  });

  it('preserves already-ready manual images and performs no render or upload', async () => {
    const job = {
      _id: '607f1f77bcf86cd799439001',
      epaperId: targetId,
      generation: 'generation-1',
      revisionNumber: 1,
      sourceKey: 'pdf-key-1',
      leaseOwner: 'targeted-worker',
      attemptCount: 1,
      maxAttempts: 4,
      totalItems: 1,
      pageNumbers: [1],
    } as never;
    const edition = {
      _id: targetId,
      status: 'draft',
      productionStatus: 'pages_ready',
      processingGeneration: 'generation-1',
      revisionNumber: 1,
      pdfPublicId: 'pdf-key-1',
      pdfPath: 'https://staging-bucket.example.test/source.pdf',
      pageCount: 1,
      pages: [{
        pageNumber: 1,
        imagePath: 'https://staging-bucket.example.test/manual-page.jpg',
        processingStatus: 'ready',
        processingError: '',
      }],
    };
    vi.spyOn(EPaper, 'findById').mockReturnValue({
      lean: vi.fn().mockResolvedValue(edition),
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(edition) }),
    } as never);
    vi.spyOn(EPaperProcessingJob, 'findOne').mockReturnValue({
      lean: vi.fn().mockResolvedValue(job),
    } as never);
    vi.spyOn(EPaperProcessingJob, 'findByIdAndUpdate').mockResolvedValue({} as never);
    vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    vi.spyOn(epaperPdfRenderer, 'downloadVerifiedEpaperPdf').mockResolvedValue(
      Buffer.from('%PDF-1.4 mock')
    );
    const render = vi.spyOn(epaperPdfRenderer, 'renderPdfPageToJpeg');
    const upload = vi.spyOn(digitalOceanSpaces, 'uploadBufferToDigitalOceanSpaces');
    const ocr = vi.spyOn(epaperOcrJobs, 'queueEpaperOcr');

    await expect(processClaimedJob(job)).resolves.toEqual(expect.objectContaining({
      status: 'completed',
      processed: 0,
      failed: 0,
    }));
    expect(render).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(ocr).not.toHaveBeenCalled();
  });

  it('demotes a false pages_ready draft when any required image is missing', () => {
    expect(buildEpaperImageAutomationUpdates({
      pageCount: 2,
      pages: [
        { pageNumber: 1, imagePath: '/page-1.jpg' },
        { pageNumber: 2, imagePath: '' },
      ],
      currentProductionStatus: 'pages_ready',
      currentStatus: 'draft',
    })).toEqual(expect.objectContaining({ productionStatus: 'draft_upload' }));
  });
});
