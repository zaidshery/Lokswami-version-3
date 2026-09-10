import 'server-only';

import { canEditEpaper } from '@/lib/auth/permissions';
import { shouldUseGlobalPublicationScope } from '@/lib/utils/epaperPublication';
import { asObject } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import { epaperWorkerAdapter, EpaperWorkerAdapter } from './epaperWorkerAdapter';
import { EpaperConflictError, EpaperForbiddenError, EpaperNotFoundError, EpaperValidationError, type AdminSessionIdentity } from './epaperTypes';

export class EpaperProcessingService {
  constructor(
    private readonly repo: EpaperRepository = epaperRepository,
    private readonly worker: EpaperWorkerAdapter = epaperWorkerAdapter
  ) {}

  async status(actor: AdminSessionIdentity, id: string) {
    this.authorize(actor); this.assertId(id); await this.repo.connect();
    const [paper, job] = await Promise.all([
      this.repo.findEditionById(id, '_id pageCount pages productionStatus updatedAt'),
      this.repo.findLatestProcessingJob(id),
    ]);
    if (!paper) throw new EpaperNotFoundError('E-paper not found.');
    const warningHours = Math.max(1, Number(process.env.EPAPER_STUCK_WARNING_HOURS || 6));
    const ageMs = Date.now() - new Date(String(paper.updatedAt)).getTime();
    const stale = Number.isFinite(ageMs) && ageMs > warningHours * 60 * 60 * 1000;
    const jobSource = asObject(job);
    const processing = jobSource.status === 'queued' || jobSource.status === 'processing';
    const productionStatus = paper.productionStatus === 'qa_review' ? 'hotspot_mapping' : paper.productionStatus;
    const stuckWarning = stale && processing ? `This edition has been processing for more than ${warningHours} hours.`
      : stale && productionStatus === 'hotspot_mapping' ? `This edition has remained in hotspot mapping for more than ${warningHours} hours.` : '';
    return { job, pageCount: paper.pageCount, pages: paper.pages, productionStatus, updatedAt: paper.updatedAt, stuckWarning };
  }

  async retry(actor: AdminSessionIdentity, id: string, body: unknown) {
    this.authorize(actor); this.assertId(id); await this.repo.connect();
    const paper = await this.repo.findEditionById(id, '_id publicationType citySlug status pageCount pages');
    if (!paper) throw new EpaperNotFoundError('E-paper not found.');
    const citySlug = shouldUseGlobalPublicationScope(paper.publicationType) ? undefined : String(paper.citySlug || '');
    if (!this.worker.isPageProcessingEnabled(citySlug)) throw new EpaperConflictError('Background PDF processing is not enabled for this publication scope.');
    const source = asObject(body);
    const requested = Array.isArray(source.pageNumbers) ? source.pageNumbers.map(Number).filter(Number.isFinite) : [];
    const pages = this.worker.retryablePages(Array.isArray(paper.pages) ? paper.pages : [], requested);
    if (!pages.length) throw new EpaperValidationError('There are no missing or failed pages to retry.');
    const job = await this.worker.queuePageProcessing(id, pages);
    return { message: 'Page processing retry queued.', data: { jobId: String(job._id), pageNumbers: pages } };
  }

  async processDue() {
    await this.repo.connect();
    return this.worker.processDueJobs();
  }

  private authorize(actor: AdminSessionIdentity) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
  }
  private assertId(id: string) {
    if (!this.repo.isValidId(id)) throw new EpaperValidationError('Invalid e-paper ID.');
  }
}

export const epaperProcessingService = new EpaperProcessingService();
