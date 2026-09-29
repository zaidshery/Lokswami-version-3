// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { epaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import * as ocr from '@/lib/server/epaperOcrJobs';
import { applyEpaperWorkflowAutomation } from '@/lib/server/epaperAutomationPipeline';

vi.mock('server-only', () => ({}));

const id = '665000000000000000000030';

describe('background publication reconciliation behavior', () => {
  let paper: Record<string, unknown>;
  let jobs: Record<string, unknown>[];
  let pdfJob: Record<string, unknown> | null;
  let transition: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    paper = {
      _id: id, publicationType: 'epaper', title: 'Test publication',
      citySlug: 'indore', cityName: 'Indore', status: 'draft',
      productionStatus: 'draft_upload', version: 1, revisionNumber: 1,
      processingGeneration: 'gen-1', pageCount: 1,
      pdfPath: '/uploads/test.pdf', thumbnailPath: '/uploads/page.jpg',
      pages: [{ pageNumber: 1, imagePath: '/uploads/page.jpg',
        processingStatus: 'ready', pageType: 'editorial' }],
    };
    jobs = [];
    pdfJob = { status: 'completed', generation: 'gen-1', revisionNumber: 1 };
    vi.stubEnv('EPAPER_LOCAL_OCR_ENABLED', '0');
    vi.spyOn(EPaper, 'findById').mockImplementation(() => ({
      lean: vi.fn(async () => ({ ...paper })),
    }) as never);
    vi.spyOn(EPaper, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    vi.spyOn(EPaperArticle, 'find').mockReturnValue({
      select: () => ({ lean: async () => [] }),
    } as never);
    vi.spyOn(EPaperProcessingJob, 'findOne').mockImplementation(() => ({
      sort: () => ({ lean: async () => pdfJob }),
    }) as never);
    vi.spyOn(EPaperProcessingJob, 'find').mockImplementation(() => ({
      lean: async () => jobs,
    }) as never);
    vi.spyOn(EPaperOcrSuggestion, 'countDocuments').mockResolvedValue(0 as never);
    transition = vi.spyOn(epaperEditorialService, 'updateWorkflow')
      .mockImplementation(async (_actor, _id, body) => {
        const source = body as Record<string, unknown>;
        expect(source.automation).toBe(true);
        expect(source.expectedVersion).toBe(paper.version);
        expect(source.expectedGeneration).toBe(paper.processingGeneration);
        expect(source.expectedRevisionNumber).toBe(paper.revisionNumber);
        paper = { ...paper, productionStatus: source.productionStatus,
          version: Number(paper.version) + 1 };
        return { message: '', data: paper } as never;
      });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each(['epaper', 'emagazine'])('reconciles %s through ready without publishing', async (publicationType) => {
    paper.publicationType = publicationType;
    const result = await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Test' });
    expect(result.nextStatus).toBe('ready_to_publish');
    expect(transition.mock.calls.map((call: unknown[]) =>
      (call[2] as Record<string, unknown>).productionStatus
    )).toEqual(['pages_ready', 'ocr_review', 'hotspot_mapping', 'ready_to_publish']);
    expect(paper.status).toBe('draft');
    await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Repeat' });
    expect(transition).toHaveBeenCalledTimes(4);
  });

  it.each([
    { status: 'processing', generation: 'gen-1', revisionNumber: 1 },
    { status: 'completed', generation: 'gen-old', revisionNumber: 1 },
    { status: 'completed', generation: 'gen-1', revisionNumber: 2 },
  ])('does not advance an active or stale PDF job %j', async (job) => {
    pdfJob = job;
    await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Test' });
    expect(transition).not.toHaveBeenCalled();
  });

  it('ensures OCR jobs then waits until current-source OCR is terminal', async () => {
    paper.productionStatus = 'pages_ready';
    vi.stubEnv('EPAPER_LOCAL_OCR_ENABLED', '1');
    const queue = vi.spyOn(ocr, 'queueEpaperOcr').mockResolvedValue(['job-1']);
    await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Test' });
    expect(queue).toHaveBeenCalledWith(id);
    expect(transition).not.toHaveBeenCalled();

    const sourceKey = ocr.epaperOcrSourceKey(id, 1,
      { pageNumber: 1, imagePath: '/uploads/page.jpg' }, 'gen-1');
    jobs = [{ sourceKey, status: 'failed' }];
    const result = await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Test' });
    expect(result.nextStatus).toBe('ready_to_publish');
    expect('snapshot' in result && result.snapshot?.ocr.failed).toBe(1);
    expect('snapshot' in result && result.snapshot?.warnings.join(' ')).toContain('terminal failure');
  });

  it('keeps missing images blocked and protects published/QA editions', async () => {
    paper.pages = [{ pageNumber: 1, imagePath: '', processingStatus: 'failed' }];
    await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Test' });
    expect(transition).not.toHaveBeenCalled();
    paper.status = 'published';
    paper.productionStatus = 'published';
    await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Test' });
    expect(transition).not.toHaveBeenCalled();
    vi.mocked(EPaper.findById).mockClear();
    await expect(applyEpaperWorkflowAutomation({
      epaperId: '6ab0da70c6aab6a2a6cab44e', reason: 'Test',
    })).resolves.toMatchObject({ protected: true, changed: false });
    expect(EPaper.findById).not.toHaveBeenCalled();
    await expect(applyEpaperWorkflowAutomation({
      epaperId: '6AB0DA70C6AAB6A2A6CAB44E', reason: 'Uppercase target',
    })).resolves.toMatchObject({ protected: true, changed: false });
    expect(EPaper.findById).not.toHaveBeenCalled();
  });

  it('reconciles invalidated mapping back to ready when canonical blockers clear', async () => {
    paper.productionStatus = 'hotspot_mapping';
    paper.pages = [{ pageNumber: 1, imagePath: '/uploads/page.jpg',
      processingStatus: 'ready', pageType: 'blank', classificationNote: '' }];
    await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Changed content' });
    expect(transition).not.toHaveBeenCalled();
    paper.pages = [{ pageNumber: 1, imagePath: '/uploads/page.jpg',
      processingStatus: 'ready', pageType: 'blank', classificationNote: 'Intentionally blank' }];
    const result = await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Resolved' });
    expect(result.nextStatus).toBe('ready_to_publish');
  });

  it.each(['initializing', 'failed'])('cannot ready a partially cloned revision: %s', async (state) => {
    paper.productionStatus = 'hotspot_mapping';
    paper.revisionInitializationStatus = state;
    const result = await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Concurrent clone' });
    expect(transition).not.toHaveBeenCalled();
    expect('snapshot' in result && result.snapshot?.blockers.join(' ')).toContain('revision cloning');
  });

  it.each(['epaper', 'emagazine'])('waits for page QA before advancing a changed %s draft revision', async (publicationType) => {
    paper.publicationType = publicationType;
    paper.supersedesId = '665000000000000000000001';
    paper.productionStatus = 'hotspot_mapping';
    paper.pages = [{ pageNumber: 1, imagePath: '/uploads/page.jpg',
      processingStatus: 'ready', reviewStatus: 'pending' }];
    const blocked = await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'New draft mapping' });
    expect(transition).not.toHaveBeenCalled();
    expect('snapshot' in blocked && blocked.snapshot?.blockers.join(' ')).toContain('Draft revision page QA');
    paper.pages = [{ pageNumber: 1, imagePath: '/uploads/page.jpg',
      processingStatus: 'ready', reviewStatus: 'ready' }];
    const ready = await applyEpaperWorkflowAutomation({ epaperId: id, reason: 'Page QA completed' });
    expect(ready.nextStatus).toBe('ready_to_publish');
    expect(paper.status).toBe('draft');
  });
});
