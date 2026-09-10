import 'server-only';

import { canEditEpaper } from '@/lib/auth/permissions';
import { buildEpaperActivityMessage, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { buildEpaperImageAutomationUpdates } from '@/lib/server/epaperImageAutomation';
import { assertEpaperDraftEditable, invalidateEpaperQa } from '@/lib/server/epaperWorkflowPolicy';
import { verifyEpaperAssetUpload } from '@/lib/storage/epaperAssetUpload';
import { isEPaperPageReviewStatus, isEPaperPageType, type EPaperPageType } from '@/lib/types/epaper';
import { isTrustedEpaperAssetPath } from '@/lib/utils/epaperStorage';
import { asObject, toPositiveInt } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import { EpaperConflictError, EpaperForbiddenError, EpaperNotFoundError, EpaperValidationError, InvalidEpaperIdError, type AdminSessionIdentity, type EpaperRecord } from './epaperTypes';

type Page = {
  pageNumber: number; imagePath: string; width?: number; height?: number; pageType: EPaperPageType;
  classificationNote: string; processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  processingError: string; processedAt: Date | null; reviewStatus: 'pending' | 'needs_attention' | 'ready';
  reviewNote: string; reviewedAt: Date | null; reviewedBy: { id: string; name: string; email: string; role: string } | null;
};

function optionalDimension(value: unknown) {
  return toPositiveInt(value) || undefined;
}

function mapPages(value: unknown, pageCount: number): Page[] {
  const input = Array.isArray(value) ? value.map(asObject) : [];
  const byNumber = new Map(input.map((page) => [Number(page.pageNumber), page]));
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1; const current = byNumber.get(pageNumber) || {};
    const reviewedBy = asObject(current.reviewedBy);
    return {
      pageNumber, imagePath: String(current.imagePath || ''), width: optionalDimension(current.width), height: optionalDimension(current.height),
      pageType: isEPaperPageType(current.pageType) ? current.pageType : 'editorial',
      classificationNote: typeof current.classificationNote === 'string' ? current.classificationNote : '',
      processingStatus: current.processingStatus === 'processing' || current.processingStatus === 'ready' || current.processingStatus === 'failed' ? current.processingStatus : 'pending',
      processingError: typeof current.processingError === 'string' ? current.processingError : '',
      processedAt: current.processedAt instanceof Date ? current.processedAt : current.processedAt ? new Date(String(current.processedAt)) : null,
      reviewStatus: isEPaperPageReviewStatus(current.reviewStatus) ? current.reviewStatus : 'pending',
      reviewNote: typeof current.reviewNote === 'string' ? current.reviewNote : '',
      reviewedAt: current.reviewedAt instanceof Date ? current.reviewedAt : current.reviewedAt ? new Date(String(current.reviewedAt)) : null,
      reviewedBy: typeof reviewedBy.id === 'string' && typeof reviewedBy.name === 'string' && typeof reviewedBy.email === 'string' && typeof reviewedBy.role === 'string'
        ? { id: reviewedBy.id, name: reviewedBy.name, email: reviewedBy.email, role: reviewedBy.role } : null,
    };
  });
}

function updatePage(pages: Page[], pageNumber: number, updates: Partial<Page>) {
  return pages.map((page) => page.pageNumber === pageNumber ? { ...page, ...updates } : page);
}

export class EpaperPageService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  async update(actor: AdminSessionIdentity, id: string, body: unknown, contentType: string) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
    if (!this.repo.isValidId(id)) throw new InvalidEpaperIdError();
    await this.repo.connect();
    const paper = await this.repo.findEditionById(id);
    if (!paper) throw new EpaperNotFoundError();
    if (contentType.includes('multipart/form-data')) {
      throw new EpaperValidationError('Direct DigitalOcean upload is required for page images. Please use the updated CMS page image uploader.');
    }
    try { assertEpaperDraftEditable(paper); } catch (error) {
      throw new EpaperConflictError(error instanceof Error ? error.message : 'Edition is immutable.');
    }
    const source = asObject(body);
    const entries = Array.isArray(source.pages) ? source.pages : [];
    if (!entries.length) throw new EpaperValidationError('pages[] is required');
    let pageCount = Number(paper.pageCount || 0);
    let pages = mapPages(paper.pages, Math.max(pageCount, 1));
    const imagePages: number[] = [];
    const reviewPages: number[] = [];
    const classificationPages: number[] = [];

    for (const value of entries) {
      const entry = asObject(value);
      const pageNumber = toPositiveInt(entry.pageNumber);
      if (!pageNumber) throw new EpaperValidationError('Each page update needs valid pageNumber');
      if (pageNumber > 1000) throw new EpaperValidationError('pageNumber must be <= 1000');
      const has = (key: string) => Object.hasOwn(entry, key);
      const mediaKey = typeof entry.mediaKey === 'string' ? entry.mediaKey.trim() : '';
      let imagePath = has('imagePath') && typeof entry.imagePath === 'string' ? entry.imagePath.trim() : undefined;
      const reviewStatus = has('reviewStatus') && entry.reviewStatus !== null && entry.reviewStatus !== ''
        ? isEPaperPageReviewStatus(entry.reviewStatus) ? entry.reviewStatus : null : undefined;
      const reviewNote = has('reviewNote') ? String(entry.reviewNote || '').trim() : undefined;
      const pageType = has('pageType') ? isEPaperPageType(entry.pageType) ? entry.pageType : null : undefined;
      const classificationNote = has('classificationNote') ? String(entry.classificationNote || '').trim() : undefined;
      if (mediaKey) {
        const verified = await verifyEpaperAssetUpload({ kind: 'epaper_page_image', mediaKey });
        if (imagePath && imagePath !== verified.mediaUrl) throw new EpaperValidationError(`imagePath does not match verified upload for page ${pageNumber}`);
        imagePath = verified.mediaUrl;
      }
      if (imagePath && !isTrustedEpaperAssetPath(imagePath)) throw new EpaperValidationError(`Invalid imagePath for page ${pageNumber}`);
      if (reviewStatus === null) throw new EpaperValidationError(`Invalid reviewStatus for page ${pageNumber}`);
      if (pageType === null) throw new EpaperValidationError(`Invalid pageType for page ${pageNumber}`);
      if (reviewStatus === 'needs_attention' && !reviewNote) throw new EpaperValidationError(`reviewNote is required when page ${pageNumber} is marked needs_attention`);
      if (pageNumber > pageCount) { pageCount = pageNumber; pages = mapPages(pages, pageCount); }
      const imageChanged = has('imagePath') || Boolean(mediaKey) || has('width') || has('height');
      const classificationChanged = has('pageType') || has('classificationNote');
      const reviewChanged = has('reviewStatus') || has('reviewNote');
      const current = pages.find((page) => page.pageNumber === pageNumber);
      const resolvedType = pageType || current?.pageType || 'editorial';
      const resolvedNote = classificationNote !== undefined ? classificationNote : current?.classificationNote || '';
      if (resolvedType === 'blank' && !resolvedNote) throw new EpaperValidationError(`classificationNote is required when page ${pageNumber} is marked blank`);
      const now = new Date();
      pages = updatePage(pages, pageNumber, {
        ...(has('imagePath') || mediaKey ? { imagePath: imagePath || '' } : {}),
        ...(has('width') ? { width: optionalDimension(entry.width) } : {}),
        ...(has('height') ? { height: optionalDimension(entry.height) } : {}),
        ...(pageType ? { pageType } : {}), ...(classificationNote !== undefined ? { classificationNote } : {}),
        ...(imageChanged ? { processingStatus: imagePath ? 'ready' : 'pending', processingError: '', processedAt: imagePath ? now : null } as Partial<Page> : {}),
        ...(imageChanged || classificationChanged ? { reviewStatus: 'pending', reviewedAt: null, reviewedBy: null } as Partial<Page> : {}),
        ...(reviewStatus ? { reviewStatus } : {}), ...(has('reviewNote') ? { reviewNote } : {}),
        ...(reviewChanged ? { reviewedAt: now, reviewedBy: { id: actor.id, name: actor.name, email: actor.email, role: actor.role } } : {}),
      });
      if (imageChanged) imagePages.push(pageNumber);
      if (reviewChanged) reviewPages.push(pageNumber);
      if (classificationChanged) classificationPages.push(pageNumber);
    }

    const automation = buildEpaperImageAutomationUpdates({ pageCount, pages, currentThumbnailPath: paper.thumbnailPath,
      currentProductionStatus: paper.productionStatus, currentStatus: paper.status });
    const updated = await this.repo.updateEdition(id, { pageCount, pages, ...automation });
    const contentChanged = [...new Set([...imagePages, ...classificationPages])];
    if (contentChanged.length) await invalidateEpaperQa({ epaperId: id, actor, reason: 'Page image or page classification changed.', pageNumbers: contentChanged });
    await this.recordChanges(actor, id, imagePages, reviewPages, automation);
    const message = automation.productionStatus === 'pages_ready' ? 'Pages updated and edition moved to Pages Ready'
      : imagePages.length && reviewPages.length ? 'Page images and review details updated'
      : reviewPages.length ? 'Page review updated' : 'Page images updated';
    return { message, data: updated };
  }

  private async recordChanges(actor: AdminSessionIdentity, id: string, imagePages: number[], reviewPages: number[], automation: EpaperRecord) {
    if (imagePages.length) await recordEpaperActivity({ epaperId: id, actor, action: 'page_image_uploaded', message: buildEpaperActivityMessage({ action: 'page_image_uploaded' }), metadata: { updatedPages: imagePages } });
    if (automation.thumbnailPath) await recordEpaperActivity({ epaperId: id, actor, action: 'cover_thumbnail_updated', message: buildEpaperActivityMessage({ action: 'cover_thumbnail_updated' }), metadata: { thumbnailPath: automation.thumbnailPath, sourcePage: 1 } });
    if (automation.productionStatus === 'pages_ready') await recordEpaperActivity({ epaperId: id, actor, action: 'pages_ready', fromStatus: 'draft_upload', toStatus: 'pages_ready', message: buildEpaperActivityMessage({ action: 'pages_ready', toStatus: 'pages_ready' }), metadata: { automated: true, reason: 'All edition pages have images.' } });
    if (reviewPages.length) await recordEpaperActivity({ epaperId: id, actor, action: 'page_review_updated', message: buildEpaperActivityMessage({ action: 'page_review_updated' }), metadata: { reviewedPages: reviewPages, reviewedById: actor.id, reviewedByName: actor.name } });
  }
}

export const epaperPageService = new EpaperPageService();
