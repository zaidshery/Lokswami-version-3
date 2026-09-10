import 'server-only';

import { canEditEpaper } from '@/lib/auth/permissions';
import { buildEpaperActivityMessage, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { epaperOcrSourceKey } from '@/lib/server/epaperOcrJobs';
import { logEpaperMetric } from '@/lib/server/epaperObservability';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import { resolveUniqueSlug } from '@/lib/utils/epaperArticles';
import { asObject } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import { epaperWorkerAdapter, EpaperWorkerAdapter } from './epaperWorkerAdapter';
import { EpaperConflictError, EpaperForbiddenError, EpaperNotFoundError, EpaperValidationError, type AdminSessionIdentity } from './epaperTypes';

export class EpaperOcrService {
  constructor(
    private readonly repo: EpaperRepository = epaperRepository,
    private readonly worker: EpaperWorkerAdapter = epaperWorkerAdapter
  ) {}

  async list(actor: AdminSessionIdentity, id: string, pageNumber?: number, status?: string) {
    this.authorize(actor); this.assertId(id, 'Invalid publication ID'); await this.repo.connect();
    return this.repo.listOcrSuggestions({ epaperId: id, ...(pageNumber ? { pageNumber } : {}), ...(status ? { status } : {}) });
  }

  async queue(actor: AdminSessionIdentity, id: string, body: unknown) {
    this.authorize(actor); this.assertId(id, 'Invalid publication ID');
    const source = asObject(body);
    const pages = Array.isArray(source.pageNumbers) ? source.pageNumbers.map(Number).filter((page) => Number.isInteger(page) && page > 0 && page <= 1000) : [];
    await this.repo.connect();
    const jobIds = await this.worker.queueOcr(id, pages);
    const paused = this.worker.isLocalOcrPaused();
    return { message: paused ? 'OCR queued. The local worker is paused pending hosting validation.' : 'OCR queued. Suggestions will appear here when processing finishes.',
      data: { jobIds, queued: jobIds.length, paused } };
  }

  async review(actor: AdminSessionIdentity, id: string, suggestionId: string, body: unknown) {
    this.authorize(actor);
    if (!this.repo.isValidId(id) || !this.repo.isValidId(suggestionId)) throw new EpaperValidationError('Invalid ID.');
    await this.repo.connect();
    const [paper, suggestion] = await Promise.all([this.repo.findEditionById(id), this.repo.findOcrSuggestion({ _id: suggestionId, epaperId: id })]);
    if (!paper || !suggestion) throw new EpaperNotFoundError('Suggestion not found.');
    try { assertEpaperDraftEditable(paper); } catch (error) {
      throw new EpaperConflictError(error instanceof Error ? error.message : 'Edition is immutable.');
    }
    const source = asObject(body); const action = String(source.action || '').trim();
    if (action !== 'accept' && action !== 'reject') throw new EpaperValidationError('Action must be accept or reject.');
    if (action === 'reject') {
      const updated = await this.repo.updateOcrSuggestion(suggestionId, { status: 'rejected', reviewedById: actor.id, reviewedAt: new Date(),
        duplicateReason: String(source.note || '').trim() || suggestion.duplicateReason });
      await this.recordReview(actor, id, suggestionId, Number(suggestion.pageNumber), 'rejected');
      return { data: updated };
    }
    const pages = Array.isArray(paper.pages) ? paper.pages.map(asObject) : [];
    const page = pages.find((entry) => Number(entry.pageNumber) === Number(suggestion.pageNumber));
    if (suggestion.sourceKey && (!page || epaperOcrSourceKey(id, Number(paper.revisionNumber || 1), page as never) !== suggestion.sourceKey)) {
      throw new EpaperConflictError('This page image was replaced. Run OCR for the current page before accepting suggestions.');
    }
    if (suggestion.status === 'suppressed') throw new EpaperConflictError('Suppressed duplicate suggestions cannot be accepted.');
    if (suggestion.createdArticleId) throw new EpaperConflictError('This suggestion has already been accepted.');
    const slug = await resolveUniqueSlug(String(suggestion.title || ''), (candidate) => this.repo.articleExists({ epaperId: id, slug: candidate }));
    const now = new Date();
    const snapshot = { title: suggestion.title, slug, pageNumber: suggestion.pageNumber, excerpt: suggestion.excerpt || '',
      contentHtml: suggestion.contentHtml || '', coverImagePath: '', pageImagePath: String(page?.imagePath || ''), hotspot: { ...asObject(suggestion.hotspot) },
      version: 1, releasedAt: now.toISOString(), releasedById: actor.id, sourceUpdatedAt: now.toISOString() };
    const article = await this.repo.createArticle({ epaperId: id, pageNumber: suggestion.pageNumber, title: suggestion.title, slug,
      excerpt: suggestion.excerpt, contentHtml: suggestion.contentHtml, coverImagePath: '', hotspot: suggestion.hotspot, releasedSnapshot: snapshot,
      workflow: { status: 'published', publishedAt: now, reviewedBy: { id: actor.id, name: actor.name || actor.email || 'Admin', email: actor.email || '', role: actor.role } } });
    const reviewed = await this.repo.updateOcrSuggestion(suggestionId, { status: 'accepted', reviewedById: actor.id, reviewedAt: now,
      createdArticleId: this.repo.toObjectId(String(article._id)) });
    await this.repo.updateEdition(id, { pages: pages.map((entry) => Number(entry.pageNumber) === Number(suggestion.pageNumber)
      ? { ...entry, reviewStatus: 'ready', reviewedAt: now, reviewedBy: actor.id } : entry) });
    await this.recordReview(actor, id, suggestionId, Number(suggestion.pageNumber), 'accepted', String(article._id));
    return { message: 'OCR suggestion accepted and mapped story created.', data: { suggestion: reviewed, article } };
  }

  private authorize(actor: AdminSessionIdentity) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
  }

  private assertId(id: string, message: string) {
    if (!this.repo.isValidId(id)) throw new EpaperValidationError(message);
  }

  private async recordReview(actor: AdminSessionIdentity, id: string, suggestionId: string, pageNumber: number, decision: 'accepted' | 'rejected', articleId?: string) {
    const action = decision === 'accepted' ? 'ocr_suggestion_accepted' : 'ocr_suggestion_rejected';
    await recordEpaperActivity({ epaperId: id, actor, action, message: buildEpaperActivityMessage({ action }),
      metadata: { suggestionId, ...(articleId ? { articleId } : {}), pageNumber } });
    logEpaperMetric('ocr_suggestion_reviewed', { epaperId: id, suggestionId, pageNumber, decision });
  }
}

export const epaperOcrService = new EpaperOcrService();
