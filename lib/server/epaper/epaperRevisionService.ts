import 'server-only';

import { canEditEpaper } from '@/lib/auth/permissions';
import { buildEpaperActivityMessage, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { normalizeEPaperPublicationType } from '@/lib/types/epaper';
import { normalizePublicationCityScope } from '@/lib/utils/epaperPublication';
import { asObject } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import { EpaperConflictError, EpaperForbiddenError, EpaperNotFoundError, EpaperValidationError, type AdminSessionIdentity } from './epaperTypes';

export class EpaperRevisionService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  async create(actor: AdminSessionIdentity, id: string) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
    if (!this.repo.isValidId(id)) throw new EpaperValidationError('Invalid e-paper ID.');
    await this.repo.connect();
    const source = await this.repo.findEditionById(id);
    if (!source) throw new EpaperNotFoundError('E-paper not found.');
    if (source.status !== 'published' || source.productionStatus !== 'published') throw new EpaperConflictError('Only a published edition can be revised.');
    const familyId = String(source.familyId || source._id);
    const publicationType = normalizeEPaperPublicationType(source.publicationType);
    const scope = normalizePublicationCityScope({ publicationType, citySlug: source.citySlug, cityName: source.cityName });
    await this.repo.updateEditionWhere({ _id: source._id, familyId: { $in: ['', null] } }, { familyId, revisionNumber: Number(source.revisionNumber || 1) });
    const existing = await this.repo.findEdition({ publicationType, familyId, status: 'draft', productionStatus: { $ne: 'archived' } });
    if (existing) {
      const error = new EpaperConflictError('A draft revision already exists for this edition.') as EpaperConflictError & { data?: unknown };
      error.data = { revisionId: String(existing._id) };
      throw error;
    }
    const latest = await this.repo.findLatestRevision({ publicationType, familyId }, 'revisionNumber');
    const revisionNumber = Number(latest?.revisionNumber || source.revisionNumber || 1) + 1;
    const pages = Array.isArray(source.pages) ? source.pages.map(asObject).map((page) => ({ ...page, reviewStatus: 'pending', reviewNote: '', reviewedAt: null, reviewedBy: null })) : [];
    const revision = await this.repo.createEdition({ publicationType, citySlug: scope.citySlug, cityName: scope.cityName,
      title: source.title, publishDate: source.publishDate, pdfPath: source.pdfPath, pdfPublicId: source.pdfPublicId,
      pdfFormat: source.pdfFormat, thumbnailPath: source.thumbnailPath, pdfUrl: source.pdfUrl, thumbnail: source.thumbnail,
      pageCount: source.pageCount, pages, status: 'draft', familyId, revisionNumber, isCurrentRevision: false,
      supersedesId: source._id, productionStatus: 'hotspot_mapping', productionAssignee: source.productionAssignee,
      productionNotes: [], qaCompletedAt: null, sourceType: source.sourceType, sourceLabel: source.sourceLabel, sourceUrl: source.sourceUrl });
    const articles = await this.repo.listArticles(String(source._id));
    const ids = new Map<string, string>();
    for (const article of articles) {
      const clone = await this.repo.createArticle({ epaperId: revision._id, pageNumber: article.pageNumber, title: article.title,
        slug: article.slug, excerpt: article.excerpt, contentHtml: article.contentHtml, coverImagePath: article.coverImagePath,
        videoUrl: article.videoUrl, hotspot: article.hotspot, workflow: article.workflow });
      ids.set(String(article._id), String(clone._id));
    }
    const assets = await this.repo.listReadyTtsAssets({ sourceParentId: String(source._id), sourceType: 'epaperArticle', provider: 'manual', status: 'ready' });
    for (const asset of assets) {
      const nextId = ids.get(String(asset.sourceId || ''));
      if (!nextId) continue;
      await this.repo.createTtsAsset({ sourceType: asset.sourceType, sourceId: nextId, sourceParentId: String(revision._id),
        variant: asset.variant, title: asset.title, textHash: asset.textHash, contentVersionHash: asset.contentVersionHash,
        languageCode: asset.languageCode, voice: asset.voice, provider: asset.provider, model: asset.model,
        mimeType: asset.mimeType, audioUrl: asset.audioUrl, storageMode: asset.storageMode, status: asset.status,
        chunkCount: asset.chunkCount, charCount: asset.charCount, generatedAt: asset.generatedAt,
        lastVerifiedAt: asset.lastVerifiedAt, failureCount: asset.failureCount, lastError: asset.lastError,
        metadata: { ...(asset.metadata || {}), clonedFromEpaperId: String(source._id), clonedFromAssetId: String(asset._id) } });
    }
    await recordEpaperActivity({ epaperId: String(revision._id), actor, action: 'revision_created', fromStatus: 'published', toStatus: 'hotspot_mapping',
      message: buildEpaperActivityMessage({ action: 'revision_created' }), metadata: { familyId, revisionNumber, supersedesId: String(source._id) } });
    return { message: `Draft revision ${revisionNumber} created.`, data: { revisionId: String(revision._id), familyId, revisionNumber } };
  }
}

export const epaperRevisionService = new EpaperRevisionService();
