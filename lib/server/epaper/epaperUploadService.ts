import 'server-only';

import crypto from 'crypto';
import { canCreateEpaper } from '@/lib/auth/permissions';
import { getCityNameFromSlug } from '@/lib/constants/epaperCities';
import { buildEpaperActivityMessage, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { downloadVerifiedEpaperPdf, getPdfPageCountFromBuffer } from '@/lib/server/epaperPdfRenderer';
import { createAdminEpaperFromRemoteImport, mapAdminEpaper as mapImportedEpaper } from '@/lib/utils/adminEpaperIngestion';
import { deleteDigitalOceanSpacesAssetByPublicId } from '@/lib/utils/digitalOceanSpaces';
import { createEpaperAssetUploadTarget, parseEpaperAssetSize, validateEpaperAssetSelection, verifyEpaperAssetUpload } from '@/lib/storage/epaperAssetUpload';
import { parsePublishDate } from '@/lib/utils/epaperStorage';
import { buildPublicationTypeMongoFilter, getPublicationIssueDateRange, getPublicationTypeLabels, normalizePublicationCityScope, normalizePublicationIssueDate, resolveEPaperPublicationType, shouldUseGlobalPublicationScope } from '@/lib/utils/epaperPublication';
import { asObject } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import { epaperWorkerAdapter, EpaperWorkerAdapter } from './epaperWorkerAdapter';
import { EpaperConflictError, EpaperForbiddenError, EpaperNotFoundError, EpaperValidationError, InvalidEpaperIdError, type AdminSessionIdentity } from './epaperTypes';

function pageShells(count: number) {
  return Array.from({ length: count }, (_, index) => ({ pageNumber: index + 1, imagePath: '', pageType: 'editorial', processingStatus: 'pending', reviewStatus: 'pending' }));
}

function pageImageUrls(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return typeof value === 'string' ? value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) : [];
}

export class EpaperUploadService {
  constructor(private readonly repo: EpaperRepository = epaperRepository, private readonly worker: EpaperWorkerAdapter = epaperWorkerAdapter) {}

  async initialize(actor: AdminSessionIdentity, body: unknown) {
    this.authorize(actor); const source = asObject(body); const title = String(source.title || '').trim();
    const publicationType = resolveEPaperPublicationType(source.publicationType); const labels = getPublicationTypeLabels(publicationType);
    const scope = normalizePublicationCityScope({ publicationType, citySlug: source.citySlug, cityName: getCityNameFromSlug(String(source.citySlug || '').trim().toLowerCase()) });
    const issueDate = normalizePublicationIssueDate(source.publishDate, publicationType); const publishDate = parsePublishDate(issueDate);
    const pageCount = Math.max(0, Math.floor(Number.parseInt(String(source.pageCount || 0), 10) || 0));
    if (!scope.citySlug || !scope.cityName || !title || !publishDate) throw new EpaperValidationError(scope.isGlobal ? `Valid title and ${labels.issueLabel.toLowerCase()} are required.` : 'Valid city, title, and publish date are required.');
    if (pageCount > 1000) throw new EpaperValidationError('pageCount must be <= 1000.');
    const input = { kind: 'epaper_pdf' as const, publicationType, fileName: String(source.fileName || '').trim(), fileType: String(source.fileType || '').trim(),
      fileSize: parseEpaperAssetSize(source.fileSize), citySlug: scope.citySlug, publishDate: issueDate };
    const selectionError = validateEpaperAssetSelection(input); if (selectionError) throw new EpaperValidationError(selectionError);
    await this.repo.connect();
    const existing = await this.repo.findEdition({ ...buildPublicationTypeMongoFilter(publicationType), citySlug: scope.citySlug,
      publishDate: getPublicationIssueDateRange(issueDate, publicationType) || publishDate, isCurrentRevision: true }, '_id familyId status productionStatus pdfPath pdfPublicId');
    if (existing) {
      const canResumeDraftUpload = existing.status === 'draft' && existing.productionStatus === 'draft_upload' && !String(existing.pdfPath || '').trim();
      if (!canResumeDraftUpload) throw new EpaperConflictError(scope.isGlobal ? `${labels.singular} already exists for this ${labels.issueFilterLabel.toLowerCase()}.` : `${labels.singular} already exists for this city and ${labels.issueFilterLabel.toLowerCase()}.`);
      const familyId = String(existing.familyId || crypto.randomUUID()); const target = createEpaperAssetUploadTarget(input);
      await this.repo.updateEditionWhere({ _id: existing._id }, { $set: { publicationType, citySlug: scope.citySlug, cityName: scope.cityName,
        title, publishDate, pdfPath: '', pdfPublicId: target.mediaKey, thumbnailPath: '', pageCount, pages: pageShells(pageCount), status: 'draft', familyId,
        isCurrentRevision: true, productionStatus: 'draft_upload', sourceType: 'manual-upload', sourceLabel: `Direct Spaces upload (${labels.singular})` } });
      const previous = String(existing.pdfPublicId || '').trim();
      if (previous && previous !== target.mediaKey) void deleteDigitalOceanSpacesAssetByPublicId(previous, 'raw').catch((error) => console.warn('Failed to cleanup abandoned e-paper PDF asset:', error));
      return { status: 200, data: { epaperId: String(existing._id), familyId, uploadTarget: target, resumed: true } };
    }
    const familyId = crypto.randomUUID(); const target = createEpaperAssetUploadTarget(input);
    const edition = await this.repo.createEdition({ publicationType, citySlug: scope.citySlug, cityName: scope.cityName, title, publishDate,
      pdfPath: '', pdfPublicId: target.mediaKey, thumbnailPath: '', pageCount, pages: pageShells(pageCount), status: 'draft', familyId,
      revisionNumber: 1, isCurrentRevision: true, productionStatus: 'draft_upload', sourceType: 'manual-upload', sourceLabel: `Direct Spaces upload (${labels.singular})` });
    return { status: 201, data: { epaperId: String(edition._id), familyId, uploadTarget: target } };
  }

  async finalize(actor: AdminSessionIdentity, id: string, body: unknown) {
    this.authorize(actor); if (!this.repo.isValidId(id)) throw new InvalidEpaperIdError('Invalid e-paper ID.');
    const source = asObject(body); const asset = await verifyEpaperAssetUpload({ kind: 'epaper_pdf', mediaKey: String(source.mediaKey || ''),
      expectedSize: Number(source.expectedSize || 0), expectedFileType: String(source.expectedFileType || ''), expectedFileName: String(source.expectedFileName || '') });
    const pageCount = await getPdfPageCountFromBuffer(await downloadVerifiedEpaperPdf(asset.mediaUrl));
    if (pageCount < 1 || pageCount > 1000) throw new EpaperValidationError('The uploaded PDF must contain between 1 and 1000 pages.');
    await this.repo.connect(); const paper = await this.repo.findEditionById(id);
    if (!paper) throw new EpaperNotFoundError('E-paper not found.');
    const city = shouldUseGlobalPublicationScope(paper.publicationType) ? undefined : String(paper.citySlug || '');
    if (!this.worker.isPageProcessingEnabled(city)) throw new EpaperConflictError('Background PDF processing is not enabled for this publication scope.');
    const previousPages = Array.isArray(paper.pages) ? paper.pages.map(asObject) : [];
    const pages = Array.from({ length: pageCount }, (_, index) => { const existing = previousPages.find((page) => Number(page.pageNumber) === index + 1); return {
      pageNumber: index + 1, imagePath: String(existing?.imagePath || ''), width: existing?.width, height: existing?.height,
      pageType: existing?.pageType || 'editorial', classificationNote: existing?.classificationNote || '', processingStatus: existing?.imagePath ? 'ready' : 'pending',
      processingError: '', processedAt: existing?.processedAt || null, reviewStatus: 'pending', reviewNote: '', reviewedAt: null, reviewedBy: null } });
    await this.repo.updateEdition(id, { pdfPath: asset.mediaUrl, pdfPublicId: asset.mediaKey, pdfFormat: 'pdf', sourceUrl: asset.mediaUrl, pageCount, pages });
    const previous = String(paper.pdfPublicId || '').trim();
    if (previous && previous !== asset.mediaKey) void deleteDigitalOceanSpacesAssetByPublicId(previous, 'raw').catch((error) => console.warn('Failed to cleanup replaced e-paper PDF asset:', error));
    const job = await this.worker.queuePageProcessing(id, Array.from({ length: pageCount }, (_, index) => index + 1));
    await recordEpaperActivity({ epaperId: id, actor, action: 'pdf_processing_queued', message: buildEpaperActivityMessage({ action: 'pdf_processing_queued' }), metadata: { jobId: String(job._id), pageCount } });
    return { message: 'PDF verified and queued for background conversion.', data: { epaperId: id, jobId: String(job._id), status: job.status } };
  }

  async importRemote(actor: AdminSessionIdentity, body: unknown) {
    this.authorize(actor); await this.repo.connect(); const source = asObject(body);
    const publicationType = resolveEPaperPublicationType(source.publicationType); const labels = getPublicationTypeLabels(publicationType);
    const result = await createAdminEpaperFromRemoteImport({ publicationType, citySlug: String(source.citySlug || ''), cityName: typeof source.cityName === 'string' ? source.cityName : '',
      title: String(source.title || ''), publishDate: String(source.publishDate || ''), status: 'draft', pageCount: Number.parseInt(String(source.pageCount ?? ''), 10) || 0,
      pdfUrl: String(source.pdfUrl || ''), thumbnailUrl: String(source.thumbnailUrl || '').trim() || undefined, pageImageUrls: pageImageUrls(source.pageImageUrls), sourceLabel: String(source.sourceLabel || '') });
    return { message: `${labels.singular} imported successfully`, warning: result.warning, data: mapImportedEpaper(result.epaper.toObject()) };
  }

  private authorize(actor: AdminSessionIdentity) { if (!canCreateEpaper(actor.role)) throw new EpaperForbiddenError(); }
}

export const epaperUploadService = new EpaperUploadService();
