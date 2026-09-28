import 'server-only';

import { canEditEpaper } from '@/lib/auth/permissions';
import { buildEpaperActivityMessage, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { PROTECTED_EPAPER_AUTOMATION_IDS } from '@/lib/server/epaperAutomationPolicy';
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
    if (PROTECTED_EPAPER_AUTOMATION_IDS.has(id.toLowerCase())) {
      throw new EpaperConflictError('This preserved QA edition cannot be revised.');
    }
    await this.repo.connect();
    const source = await this.repo.findEditionById(id);
    if (!source) throw new EpaperNotFoundError('E-paper not found.');
    if (source.status !== 'published' || source.productionStatus !== 'published') throw new EpaperConflictError('Only a published edition can be revised.');
    if (source.isCurrentRevision === false) throw new EpaperConflictError('Only the current published revision can be revised.');
    const familyId = String(source.familyId || source._id);
    const publicationType = normalizeEPaperPublicationType(source.publicationType);
    const scope = normalizePublicationCityScope({ publicationType, citySlug: source.citySlug, cityName: source.cityName });
    const existing = await this.repo.findEdition({ publicationType, familyId, status: 'draft', productionStatus: { $ne: 'archived' } });
    if (existing) {
      this.assertRevisionInitialized(existing);
      return {
        message: 'Existing draft revision reused.',
        data: {
          revisionId: String(existing._id),
          familyId,
          revisionNumber: Number(existing.revisionNumber || 1),
          reused: true,
        },
      };
    }
    const latest = await this.repo.findLatestRevision({ publicationType, familyId }, 'revisionNumber');
    const revisionNumber = Number(latest?.revisionNumber || source.revisionNumber || 1) + 1;
    const pages = Array.isArray(source.pages)
      ? source.pages.map(asObject).map((page) => ({
          pageNumber: Number(page.pageNumber || 0),
          imagePath: String(page.imagePath || ''),
          width: typeof page.width === 'number' ? page.width : undefined,
          height: typeof page.height === 'number' ? page.height : undefined,
          pageType: page.pageType || 'editorial',
          classificationNote: String(page.classificationNote || ''),
          processingStatus: page.processingStatus || 'ready',
          processingError: '',
          reviewStatus: 'pending',
          reviewNote: '',
          reviewedAt: null,
          reviewedBy: null,
        }))
      : [];
    let revision;
    try {
      revision = await this.repo.createEdition({
        publicationType,
        citySlug: scope.citySlug,
        cityName: scope.cityName,
        title: source.title,
        publishDate: source.publishDate,
        pdfPath: source.pdfPath,
        pdfPublicId: source.pdfPublicId,
        pdfFormat: source.pdfFormat,
        thumbnailPath: source.thumbnailPath,
        pdfUrl: source.pdfUrl,
        thumbnail: source.thumbnail,
        pageCount: source.pageCount,
        pages,
        status: 'draft',
        familyId,
        revisionNumber,
        isCurrentRevision: false,
        supersedesId: source._id,
        productionStatus: 'hotspot_mapping',
        productionAssignee: source.productionAssignee,
        productionNotes: [],
        qaCompletedAt: null,
        sourceType: source.sourceType,
        sourceLabel: source.sourceLabel,
        sourceUrl: source.sourceUrl,
        processingGeneration: '',
        revisionInitializationStatus: 'initializing',
        version: 1,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const concurrent = await this.repo.findEdition({
        publicationType,
        familyId,
        status: 'draft',
        productionStatus: { ['\u0024ne']: 'archived' },
      });
      if (!concurrent) throw error;
      this.assertRevisionInitialized(concurrent);
      return {
        message: 'Concurrent draft revision reused.',
        data: {
          revisionId: String(concurrent._id),
          familyId,
          revisionNumber: Number(concurrent.revisionNumber || revisionNumber),
          reused: true,
        },
      };
    }
    try {
      const articles = await this.repo.listArticles(String(source._id));
      const ids = new Map<string, string>();
      for (const article of articles) {
        const clone = await this.repo.createArticle({
          epaperId: revision._id,
          pageNumber: article.pageNumber,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          contentHtml: article.contentHtml,
          coverImagePath: article.coverImagePath,
          videoUrl: article.videoUrl,
          hotspot: article.hotspot ? JSON.parse(JSON.stringify(article.hotspot)) : { x: 0, y: 0, w: 0, h: 0 },
          workflow: article.workflow ? JSON.parse(JSON.stringify(article.workflow)) : undefined,
        });
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
      const initialized = await this.repo.updateEditionWhere({
        _id: revision._id, status: 'draft', revisionInitializationStatus: 'initializing',
      }, { $set: { revisionInitializationStatus: 'ready' }, $inc: { version: 1 } });
      if (asObject(initialized).matchedCount === 0) {
        throw new EpaperConflictError('Draft revision changed while cloning. Reload before retrying.');
      }
    } catch (error) {
      await this.repo.updateEditionWhere({
        _id: revision._id, status: 'draft', revisionInitializationStatus: 'initializing',
      }, { $set: { revisionInitializationStatus: 'failed' }, $inc: { version: 1 } });
      throw error;
    }
    await recordEpaperActivity({ epaperId: String(revision._id), actor, action: 'revision_created', fromStatus: 'published', toStatus: 'hotspot_mapping',
      message: buildEpaperActivityMessage({ action: 'revision_created' }), metadata: { familyId, revisionNumber, supersedesId: String(source._id) } });
    return { message: `Draft revision ${revisionNumber} created.`, data: { revisionId: String(revision._id), familyId, revisionNumber } };
  }

  private assertRevisionInitialized(revision: Record<string, unknown>) {
    if (revision.revisionInitializationStatus === 'initializing') {
      throw new EpaperConflictError('Draft revision is still being created. Retry Add Story shortly to reuse it.');
    }
    if (revision.revisionInitializationStatus === 'failed') {
      throw new EpaperConflictError('Draft revision creation failed. Recover or delete the incomplete draft before retrying.');
    }
  }
}

export const epaperRevisionService = new EpaperRevisionService();
