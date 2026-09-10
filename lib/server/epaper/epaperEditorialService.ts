import 'server-only';

import crypto from 'crypto';
import {
  canCreateEpaper,
  canDeleteEpaper,
  canEditEpaper,
  canManageEpaperAssignments,
  canPrepareEpaperForPublish,
  canPublishEpaper,
  canViewPage,
} from '@/lib/auth/permissions';
import {
  getCityNameFromSlug,
  getCitySlugFromName,
  isEPaperCitySlug,
  normalizeCityName,
  normalizeCitySlug,
} from '@/lib/constants/epaperCities';
import { buildEpaperImageAutomationUpdates } from '@/lib/server/epaperImageAutomation';
import { buildEpaperActivityMessage, listEpaperActivity, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { logEpaperMetric } from '@/lib/server/epaperObservability';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import { createWorkflowNotification } from '@/lib/storage/workflowNotifications';
import { verifyEpaperAssetUpload, type EpaperUploadedAsset } from '@/lib/storage/epaperAssetUpload';
import { deleteAssetFile, parsePublishDate } from '@/lib/utils/epaperStorage';
import { buildEpaperAutomationInfo, buildEpaperReadiness } from '@/lib/utils/epaperAdminReadiness';
import { buildEpaperEditionQualitySummary } from '@/lib/utils/epaperQualitySignals';
import {
  buildPublicationTypeMongoFilter,
  getPublicationIssueDateRange,
  getPublicationTypeLabels,
  normalizePublicationCityScope,
  normalizePublicationIssueDate,
  resolveEPaperPublicationType,
} from '@/lib/utils/epaperPublication';
import { applyEpaperProductionUpdate, resolveEpaperProduction } from '@/lib/workflow/epaper';
import { canTransitionEpaperProduction, getAllowedEpaperProductionTransitions } from '@/lib/workflow/transitions';
import { isEpaperProductionStatus } from '@/lib/workflow/types';
import {
  asObject,
  firstNonEmptyString,
  mapAdminEpaper,
  normalizeEpaperPages,
  toPositiveInt,
} from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import {
  EpaperConflictError,
  EpaperForbiddenError,
  EpaperNotFoundError,
  EpaperValidationError,
  InvalidEpaperIdError,
  type AdminSessionIdentity,
  type EpaperPageDTO,
  type EpaperRecord,
} from './epaperTypes';

function parsePage(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function parseLimit(value: string | null, fallback: number, max: number) {
  if ((value || '').trim().toLowerCase() === 'all') return null;
  return parsePage(value, fallback, max);
}

function compactMetadata(value: EpaperRecord) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
    if (entry === null || entry === undefined) return false;
    if (typeof entry === 'string') return Boolean(entry.trim());
    if (Array.isArray(entry)) return Boolean(entry.length);
    return true;
  }));
}

function normalizeQualityArticles(value: unknown[]) {
  return value.map((entry) => {
    const source = asObject(entry);
    return {
      _id: String(source._id || ''), epaperId: String(source.epaperId || ''),
      pageNumber: Number(source.pageNumber || 0), excerpt: String(source.excerpt || ''),
      contentHtml: String(source.contentHtml || ''), coverImagePath: String(source.coverImagePath || ''),
      title: String(source.title || ''), slug: String(source.slug || ''),
      hotspot: { x: 0, y: 0, w: 0, h: 0 },
    };
  });
}

function buildPages(pageCount: number, current: EpaperPageDTO[]) {
  const byNumber = new Map(current.map((page) => [page.pageNumber, page]));
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const page = byNumber.get(pageNumber);
    return {
      pageNumber, imagePath: page?.imagePath || '', width: page?.width, height: page?.height,
      pageType: page?.pageType || 'editorial', classificationNote: page?.classificationNote || '',
      processingStatus: page?.processingStatus || 'pending', processingError: page?.processingError || '',
      reviewStatus: page?.reviewStatus || 'pending', reviewNote: page?.reviewNote || '',
      reviewedAt: page?.reviewedAt || null, reviewedBy: page?.reviewedBy || null,
    };
  });
}

function resolveCityName(citySlug: string, input: string) {
  return normalizeCityName(input) || getCityNameFromSlug(citySlug) || input.trim();
}

async function verifyAsset(kind: 'epaper_pdf' | 'epaper_thumbnail', value: unknown) {
  const source = asObject(value);
  const mediaKey = firstNonEmptyString(source.mediaKey, source.publicId);
  if (!mediaKey) throw new EpaperValidationError(kind === 'epaper_pdf' ? 'Verified PDF asset is required' : 'Verified thumbnail asset is required');
  return verifyEpaperAssetUpload({
    kind, mediaKey, expectedSize: toPositiveInt(source.mediaSizeBytes),
    expectedFileType: firstNonEmptyString(source.mediaMimeType), expectedFileName: firstNonEmptyString(source.fileName),
  });
}

async function verifyPageAssets(value: unknown) {
  if (!Array.isArray(value)) return [];
  const verified: Array<{ pageNumber: number; asset: EpaperUploadedAsset; width?: number; height?: number }> = [];
  for (let index = 0; index < value.length; index += 1) {
    const source = asObject(value[index]);
    const pageNumber = toPositiveInt(source.pageNumber, index + 1);
    if (pageNumber > 1000) throw new EpaperValidationError('Each page image needs a valid pageNumber');
    const mediaKey = firstNonEmptyString(source.mediaKey, source.publicId);
    if (!mediaKey) throw new EpaperValidationError(`Verified page image asset is required for page ${pageNumber}`);
    verified.push({
      pageNumber,
      asset: await verifyEpaperAssetUpload({
        kind: 'epaper_page_image', mediaKey, expectedSize: toPositiveInt(source.mediaSizeBytes),
        expectedFileType: firstNonEmptyString(source.mediaMimeType), expectedFileName: firstNonEmptyString(source.fileName),
      }),
      width: toPositiveInt(source.width) || undefined, height: toPositiveInt(source.height) || undefined,
    });
  }
  return verified;
}

export class EpaperEditorialService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  async list(actor: AdminSessionIdentity, params: URLSearchParams) {
    if (!canViewPage(actor.role, 'epapers')) throw new EpaperForbiddenError();
    const citySlug = (params.get('citySlug') || '').trim().toLowerCase();
    const status = (params.get('status') || '').trim().toLowerCase();
    const date = (params.get('date') || '').trim();
    const month = (params.get('month') || '').trim();
    const publicationType = resolveEPaperPublicationType(params.get('publicationType'));
    const limit = parseLimit(params.get('limit'), 20, 200);
    const page = limit === null ? 1 : parsePage(params.get('page'), 1, 500);
    const labels = getPublicationTypeLabels(publicationType);
    const query: EpaperRecord = { ...buildPublicationTypeMongoFilter(publicationType) };
    if (citySlug && publicationType !== 'emagazine') {
      if (!isEPaperCitySlug(citySlug)) throw new EpaperValidationError('Invalid city slug');
      query.citySlug = citySlug;
    }
    if (status) {
      if (status !== 'draft' && status !== 'published') throw new EpaperValidationError('Invalid status filter');
      query.status = status;
    }
    const issueFilter = month || date;
    if (issueFilter) {
      const normalized = normalizePublicationIssueDate(issueFilter, publicationType);
      const parsed = parsePublishDate(normalized);
      if (!parsed) throw new EpaperValidationError(`Invalid ${labels.issueFilterLabel.toLowerCase()}.`);
      const next = new Date(parsed); next.setUTCDate(next.getUTCDate() + 1);
      query.publishDate = getPublicationIssueDateRange(normalized, publicationType) || { $gte: parsed, $lt: next };
    }

    const fileResult = publicationType === 'epaper' && (!status || status === 'published')
      ? await this.repo.listAdminStored({ city: citySlug ? getCityNameFromSlug(citySlug) : null, publishDate: date || null, limit: limit ?? Number.MAX_SAFE_INTEGER, page })
      : { data: [], total: 0 };
    const mapFile = () => fileResult.data.map((row) => {
      const item = {
        _id: row._id, publicationType: 'epaper' as const, citySlug: getCitySlugFromName(row.city), cityName: row.city,
        title: row.title, publishDate: row.publishDate, pdfPath: row.pdfUrl, thumbnailPath: row.thumbnail,
        pageCount: Number(row.pages) || 1, pages: [], status: 'published' as const,
        pagesWithImage: 0, pagesMissingImage: Number(row.pages) || 1, sourceType: 'legacy',
        sourceLabel: 'Legacy file store', sourceUrl: row.pdfUrl, createdAt: row.publishedAt, updatedAt: row.updatedAt,
      };
      const production = resolveEpaperProduction({ status: 'published' });
      return { ...item, articleCount: 0, productionStatus: production.productionStatus, productionAssignee: production.productionAssignee,
        productionNotes: [], qaCompletedAt: null, readiness: buildEpaperReadiness({ epaper: item, articles: [] }), automation: buildEpaperAutomationInfo(item) };
    });

    const store = await this.repo.resolveAdminStore('admin e-papers');
    if (store === 'file') return this.listResult(mapFile(), fileResult.total, page, limit);
    const total = await this.repo.countEditions(query);
    if (!total && fileResult.total) return this.listResult(mapFile(), fileResult.total, page, limit);
    const rows = await this.repo.listEditions(query, page, limit);
    const mapped = rows.map(mapAdminEpaper);
    const stats = await this.repo.getArticleStats(mapped.map((item) => item._id).filter(Boolean));
    const byId = new Map(stats.map((row) => [String(row._id), row]));
    const data = mapped.map((item) => {
      const stat = asObject(byId.get(item._id));
      const count = Number(stat.articleCount || 0);
      const hotspotPages = Array.isArray(stat.pagesWithHotspots) ? stat.pagesWithHotspots.map(Number).filter(Boolean) : [];
      const textCount = Number(stat.articlesWithReadableText || 0);
      const readiness = buildEpaperReadiness({ epaper: item, articles: Array.from({ length: count }, (_, index) => ({
        pageNumber: hotspotPages[index] || hotspotPages[0] || 1,
        excerpt: index < textCount ? 'text-ready' : '', contentHtml: '', coverImagePath: '',
      })) });
      const production = resolveEpaperProduction({ ...item, readiness });
      return { ...item, productionStatus: production.productionStatus, productionAssignee: production.productionAssignee,
        productionNotes: production.productionNotes.map((note) => ({ ...note, createdAt: note.createdAt.toISOString() })),
        qaCompletedAt: production.qaCompletedAt?.toISOString() || null, articleCount: count, readiness, automation: buildEpaperAutomationInfo(item) };
    });
    return this.listResult(data, total, page, limit);
  }

  private listResult(data: unknown[], total: number, page: number, limit: number | null) {
    return { data, pagination: { total, page, limit: limit ?? total, pages: limit === null ? 1 : Math.ceil(total / limit) } };
  }

  async create(actor: AdminSessionIdentity, body: unknown) {
    if (!canCreateEpaper(actor.role)) throw new EpaperForbiddenError();
    const source = asObject(body);
    const publicationType = resolveEPaperPublicationType(source.publicationType);
    const labels = getPublicationTypeLabels(publicationType);
    const scope = normalizePublicationCityScope({ publicationType, citySlug: source.citySlug, cityName: source.cityName });
    const title = String(source.title || '').trim();
    const normalizedDate = normalizePublicationIssueDate(source.publishDate, publicationType);
    const publishDate = parsePublishDate(normalizedDate);
    const requestedCount = toPositiveInt(source.pageCount);
    if (!scope.citySlug) throw new EpaperValidationError(scope.isGlobal ? `${labels.issueLabel} scope is invalid` : 'citySlug is required and must be valid');
    if (!scope.cityName) throw new EpaperValidationError('cityName is required');
    if (!title) throw new EpaperValidationError('title is required');
    if (!publishDate) throw new EpaperValidationError(`${labels.issueLabel} must be valid`);
    if (requestedCount > 1000) throw new EpaperValidationError('pageCount is too high (max 1000)');
    if (String(source.status || '').trim() && String(source.status).trim().toLowerCase() !== 'draft') {
      throw new EpaperValidationError('New editions must start as drafts and use the production workflow to publish.');
    }
    const [pdf, thumbnail, pageAssets] = await Promise.all([
      verifyAsset('epaper_pdf', source.pdfAsset), verifyAsset('epaper_thumbnail', source.thumbnailAsset), verifyPageAssets(source.pageImageAssets),
    ]);
    const pageCount = Math.max(requestedCount, ...pageAssets.map((item) => item.pageNumber));
    if (pageCount < 1) throw new EpaperValidationError('pageCount is required when page images are not included in the create request');
    await this.repo.connect();
    const duplicate = await this.repo.findEdition({
      ...buildPublicationTypeMongoFilter(publicationType), citySlug: scope.citySlug,
      publishDate: getPublicationIssueDateRange(normalizedDate, publicationType) || publishDate, isCurrentRevision: true,
    }, '_id');
    if (duplicate) throw new EpaperConflictError(scope.isGlobal
      ? `${labels.singular} already exists for ${labels.issueFilterLabel.toLowerCase()} ${normalizedDate}`
      : `${labels.singular} already exists for ${scope.citySlug} in ${labels.issueFilterLabel.toLowerCase()} ${normalizedDate}`);
    const pages: Array<{ pageNumber: number; imagePath: string; width?: number; height?: number; pageType: 'editorial'; processingStatus: 'pending' | 'ready'; reviewStatus: 'pending' }> = Array.from({ length: pageCount }, (_, index) => ({ pageNumber: index + 1, imagePath: '', width: undefined, height: undefined,
      pageType: 'editorial', processingStatus: 'pending', reviewStatus: 'pending' }));
    for (const item of pageAssets) pages[item.pageNumber - 1] = { pageNumber: item.pageNumber, imagePath: item.asset.mediaUrl,
      width: item.width, height: item.height, pageType: 'editorial', processingStatus: 'ready', reviewStatus: 'pending' };
    const automation = buildEpaperImageAutomationUpdates({ pageCount, pages, currentThumbnailPath: thumbnail.mediaUrl,
      currentProductionStatus: 'draft_upload', currentStatus: 'draft' });
    const created = await this.repo.createEdition({ publicationType, citySlug: scope.citySlug, cityName: scope.cityName,
      title, publishDate, pdfPath: pdf.mediaUrl, pdfPublicId: pdf.mediaKey,
      pdfFormat: pdf.mediaKey.split('.').pop()?.toLowerCase() || 'pdf', thumbnailPath: thumbnail.mediaUrl,
      pageCount, pages, status: 'draft', familyId: crypto.randomUUID(), revisionNumber: 1, isCurrentRevision: true,
      productionStatus: automation.productionStatus || 'draft_upload', sourceType: 'manual-upload',
      sourceLabel: `Direct Spaces upload (${labels.singular})`, sourceUrl: pdf.mediaUrl });
    return { message: `${labels.singular} created successfully`, data: mapAdminEpaper(created) };
  }

  async get(actor: AdminSessionIdentity, id: string, publicationTypeParam?: string | null) {
    if (!canViewPage(actor.role, 'epapers')) throw new EpaperForbiddenError();
    this.assertId(id); await this.repo.connect();
    const [edition, articles] = await Promise.all([
      this.repo.findEditionById(id), this.repo.listArticles(id, 'pageNumber excerpt contentHtml coverImagePath'),
    ]);
    if (!edition) throw new EpaperNotFoundError();
    const mapped = mapAdminEpaper(edition);
    if (publicationTypeParam && mapped.publicationType !== resolveEPaperPublicationType(publicationTypeParam)) {
      throw new EpaperNotFoundError(`${getPublicationTypeLabels(resolveEPaperPublicationType(publicationTypeParam)).singular} not found`);
    }
    return this.enrich(mapped, edition, articles);
  }

  async updateMetadata(actor: AdminSessionIdentity, id: string, body: unknown) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
    this.assertId(id); await this.repo.connect();
    const current = await this.repo.findEditionById(id);
    if (!current) throw new EpaperNotFoundError();
    const source = asObject(body);
    const updates: EpaperRecord = {};
    const previous = mapAdminEpaper(current);
    const publicationType = resolveEPaperPublicationType(current.publicationType);
    const labels = getPublicationTypeLabels(publicationType);
    const scope = normalizePublicationCityScope({ publicationType, citySlug: current.citySlug, cityName: current.cityName });
    if (typeof source.title === 'string') {
      if (!source.title.trim()) throw new EpaperValidationError('title cannot be empty');
      updates.title = source.title.trim();
    }
    if (Object.hasOwn(source, 'status')) throw new EpaperValidationError('Edition status can only be changed through the production workflow.');
    if (scope.isGlobal) {
      if (current.citySlug !== scope.citySlug) updates.citySlug = scope.citySlug;
      if (current.cityName !== scope.cityName) updates.cityName = scope.cityName;
    } else if (typeof source.citySlug === 'string') {
      const slug = normalizeCitySlug(source.citySlug);
      if (!slug) throw new EpaperValidationError('Invalid citySlug');
      const cityName = resolveCityName(slug, typeof source.cityName === 'string' ? source.cityName : String(current.cityName || ''));
      if (!cityName) throw new EpaperValidationError('cityName is required');
      updates.citySlug = slug; updates.cityName = cityName;
    } else if (typeof source.cityName === 'string') {
      const cityName = resolveCityName(String(current.citySlug || ''), source.cityName);
      if (!cityName) throw new EpaperValidationError('cityName is required');
      updates.cityName = cityName;
    }
    if (typeof source.publishDate === 'string') {
      const normalized = normalizePublicationIssueDate(source.publishDate, publicationType);
      const parsed = parsePublishDate(normalized);
      if (!parsed) throw new EpaperValidationError(`${labels.issueLabel} must be valid`);
      updates.publishDate = parsed;
    }
    const count = Math.min(1000, toPositiveInt(source.pageCount));
    if (count) { updates.pageCount = count; updates.pages = buildPages(count, normalizeEpaperPages(current.pages)); }
    if (updates.citySlug || updates.publishDate) {
      const duplicate = await this.repo.findEdition({ ...buildPublicationTypeMongoFilter(publicationType),
        citySlug: String(updates.citySlug || current.citySlug || ''),
        publishDate: getPublicationIssueDateRange(updates.publishDate || current.publishDate, publicationType) || updates.publishDate || current.publishDate,
        isCurrentRevision: true, _id: { $ne: id } }, '_id');
      if (duplicate) throw new EpaperConflictError(scope.isGlobal
        ? `${labels.singular} for this ${labels.issueFilterLabel.toLowerCase()} already exists`
        : `${labels.singular} for this city/${labels.issueFilterLabel.toLowerCase()} already exists`);
    }
    const updated = await this.repo.updateEdition(id, updates);
    if (!updated) throw new EpaperNotFoundError();
    await recordEpaperActivity({ epaperId: id, actor, action: 'metadata_update',
      fromStatus: previous.productionStatus as never, toStatus: mapAdminEpaper(updated).productionStatus as never,
      message: buildEpaperActivityMessage({ action: 'metadata_update' }), metadata: { changedFields: Object.keys(updates) } });
    return { message: 'E-paper updated successfully', data: mapAdminEpaper(updated) };
  }

  async updateWorkflow(actor: AdminSessionIdentity, id: string, body: unknown) {
    if (!canPrepareEpaperForPublish(actor.role)) throw new EpaperForbiddenError();
    this.assertId(id);
    const source = asObject(body);
    const hasAssignee = Object.hasOwn(source, 'assignedToId');
    if (hasAssignee && !canManageEpaperAssignments(actor.role)) throw new EpaperForbiddenError('Only admins can assign publication desk ownership.');
    await this.repo.connect();
    const [current, articleRows] = await Promise.all([this.repo.findEditionById(id), this.repo.listArticles(id, 'pageNumber excerpt contentHtml coverImagePath')]);
    if (!current) throw new EpaperNotFoundError();
    const isArchive = current.status === 'published' && source.productionStatus === 'archived';
    if (!isArchive) try { assertEpaperDraftEditable(current); } catch (error) {
      throw new EpaperConflictError(error instanceof Error ? error.message : 'Edition is immutable.');
    }
    const mapped = mapAdminEpaper(current);
    const articles = normalizeQualityArticles(articleRows);
    const readiness = buildEpaperReadiness({ epaper: mapped, articles });
    const quality = buildEpaperEditionQualitySummary({ pageCount: mapped.pageCount, pages: mapped.pages, articles });
    const currentProduction = resolveEpaperProduction({ ...current, readiness });
    const nextStatus = typeof source.productionStatus === 'string' && isEpaperProductionStatus(source.productionStatus) ? source.productionStatus : undefined;
    const note = typeof source.note === 'string' ? source.note.trim() : typeof source.productionNote === 'string' ? source.productionNote.trim() : '';
    if (!nextStatus && !note && !hasAssignee) throw new EpaperValidationError('No production updates were provided');
    if (nextStatus && nextStatus !== currentProduction.productionStatus && !canTransitionEpaperProduction(currentProduction.productionStatus, nextStatus)) {
      throw new EpaperValidationError(`Cannot move production from ${currentProduction.productionStatus} to ${nextStatus}`);
    }
    if (nextStatus && (nextStatus === 'published' || nextStatus === 'archived') && !canPublishEpaper(actor.role)) {
      throw new EpaperForbiddenError('Only admins can publish or archive an edition.');
    }
    const blockers = [...new Set([...readiness.blockers, ...quality.publishBlockers])];
    if ((nextStatus === 'ready_to_publish' || nextStatus === 'published') && blockers.length) {
      logEpaperMetric('publishing_blocked', { epaperId: id, targetStatus: nextStatus, blockerCount: blockers.length, blockers });
      throw new EpaperValidationError(`This edition still has blockers: ${blockers.join(' ')}`);
    }
    let assignedTo: Awaited<ReturnType<typeof this.resolveAssignee>> | undefined;
    if (hasAssignee) {
      const assignedId = String(source.assignedToId || '').trim();
      assignedTo = assignedId ? await this.resolveAssignee(assignedId) : null;
      if (assignedId && !assignedTo) throw new EpaperValidationError('Valid assignedToId is required');
    }
    const transition = applyEpaperProductionUpdate({ currentProduction, actor, nextStatus, assignedTo, note });
    const updates = {
      productionStatus: transition.nextProduction.productionStatus, productionAssignee: transition.nextProduction.productionAssignee,
      productionNotes: transition.nextProduction.productionNotes, qaCompletedAt: transition.nextProduction.qaCompletedAt,
      ...(transition.toStatus === 'published' ? { status: 'published', isCurrentRevision: true, publishedAt: new Date() } : {}),
      ...(transition.toStatus === 'archived' ? { status: 'draft', isCurrentRevision: false } : {}),
    };
    const updated = transition.toStatus === 'published'
      ? await this.repo.publishEdition(id, String(current.familyId || current._id), updates)
      : await this.repo.updateEdition(id, updates);
    if (!updated) throw new EpaperNotFoundError();
    const action = nextStatus && nextStatus !== transition.fromStatus ? nextStatus : hasAssignee ? 'assign' : 'note';
    const message = buildEpaperActivityMessage({ action, toStatus: transition.toStatus, assignedTo: transition.nextProduction.productionAssignee });
    await recordEpaperActivity({ epaperId: id, actor, action, fromStatus: transition.fromStatus as never, toStatus: transition.toStatus as never,
      message, metadata: compactMetadata({ assignedToId: transition.nextProduction.productionAssignee?.id || '', assignedToName: transition.nextProduction.productionAssignee?.name || '',
        note, readinessStatus: readiness.status, blockers, allowedNextStatuses: getAllowedEpaperProductionTransitions(transition.toStatus) }) });
    await this.notifyAssignee(actor, updated, action, transition.toStatus, transition.nextProduction.productionAssignee, resolveEPaperPublicationType(current.publicationType));
    if (transition.toStatus === 'published') logEpaperMetric('publishing_completed', { epaperId: id, familyId: String(updated.familyId || updated._id), revisionNumber: Number(updated.revisionNumber || 1) });
    return { message, data: this.enrich(mapAdminEpaper(updated), updated, articleRows) };
  }

  async delete(actor: AdminSessionIdentity, id: string) {
    if (!canDeleteEpaper(actor.role)) throw new EpaperForbiddenError();
    this.assertId(id); await this.repo.connect();
    const edition = await this.repo.deleteEditionCascade(id);
    if (!edition) throw new EpaperNotFoundError();
    const assets = [firstNonEmptyString(edition.pdfPath, edition.pdfUrl), firstNonEmptyString(edition.thumbnailPath, edition.thumbnail),
      ...normalizeEpaperPages(edition.pages).map((page) => page.imagePath)].filter(Boolean);
    await Promise.all(assets.map((asset) => deleteAssetFile(asset).catch(() => undefined)));
    return { message: 'E-paper and associated assets deleted' };
  }

  async activity(actor: AdminSessionIdentity, id: string) {
    if (!canViewPage(actor.role, 'epapers')) throw new EpaperForbiddenError();
    if ((await this.repo.resolveAdminStore('e-paper activity route')) === 'file') return [];
    this.assertId(id);
    const edition = await this.repo.findEditionById(id, '_id status productionStatus productionAssignee productionNotes qaCompletedAt updatedAt');
    if (!edition) throw new EpaperNotFoundError();
    return listEpaperActivity({ epaperId: id, epaper: edition });
  }

  private assertId(id: string) {
    if (!this.repo.isValidId(id)) throw new InvalidEpaperIdError();
  }

  private async resolveAssignee(id: string) {
    const user = await this.repo.resolveAssignee(id);
    if (!user || typeof user.role !== 'string' || user.role === 'reader') return null;
    return { id: String(user._id || ''), name: String(user.name || '').trim() || String(user.email || '').trim(),
      email: String(user.email || '').trim(), role: user.role as AdminSessionIdentity['role'] };
  }

  private enrich(mapped: ReturnType<typeof mapAdminEpaper>, edition: EpaperRecord, articleRows: unknown[]) {
    const articles = normalizeQualityArticles(articleRows);
    const readiness = buildEpaperReadiness({ epaper: mapped, articles });
    const production = resolveEpaperProduction({ ...edition, readiness });
    return { ...mapped, productionStatus: production.productionStatus, productionAssignee: production.productionAssignee,
      productionNotes: production.productionNotes.map((note) => ({ ...note, createdAt: note.createdAt.toISOString() })),
      qaCompletedAt: production.qaCompletedAt?.toISOString() || null, articleCount: articles.length,
      pagesWithImage: readiness.pagesWithImage, pagesMissingImage: readiness.pagesMissingImage,
      readiness, automation: buildEpaperAutomationInfo(mapped) };
  }

  private async notifyAssignee(actor: AdminSessionIdentity, edition: EpaperRecord, action: string, status: string, assignee: { id: string; name: string; email: string; role: string } | null, publicationType: 'epaper' | 'emagazine') {
    if (!assignee?.email || assignee.email.toLowerCase() === actor.email.toLowerCase() || (action !== 'assign' && status !== 'published')) return;
    const id = String(edition._id || '');
    await createWorkflowNotification({ recipientId: assignee.id, recipientEmail: assignee.email,
      eventType: status === 'published' ? 'published' : 'assigned', contentType: 'epaper', contentId: id, publicationType,
      title: String(edition.title || (publicationType === 'emagazine' ? 'E-Magazine' : 'E-Paper')),
      message: status === 'published' ? 'This publication was released.' : 'This publication was assigned to you.',
      messageHi: status === 'published' ? 'यह पब्लिकेशन जारी हो गया है।' : 'यह पब्लिकेशन आपको असाइन किया गया है।',
      href: publicationType === 'emagazine' ? `/admin/emagazines/${encodeURIComponent(id)}` : `/admin/epapers/${encodeURIComponent(id)}`,
      dedupeKey: `epaper:${id}:${action}:${assignee.email}:${new Date().toISOString()}` });
  }
}

export const epaperEditorialService = new EpaperEditorialService();
