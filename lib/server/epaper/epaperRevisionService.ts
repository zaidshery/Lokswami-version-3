import 'server-only';

import crypto from 'node:crypto';
import { canEditEpaper } from '@/lib/auth/permissions';
import { buildEpaperActivityMessage, recordEpaperActivity } from '@/lib/server/epaperActivity';
import { PROTECTED_EPAPER_AUTOMATION_IDS } from '@/lib/server/epaperAutomationPolicy';
import {
  isRevisionInitializationStale,
  REVISION_INITIALIZATION_STALE_MS,
} from '@/lib/server/epaperWorkflowPolicy';
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
      if (existing.revisionInitializationStatus !== 'initializing' && existing.revisionInitializationStatus !== 'failed') {
        return {
          message: 'Existing draft revision reused.',
          data: {
            revisionId: String(existing._id),
            familyId,
            revisionNumber: Number(existing.revisionNumber || 1),
            reused: true as boolean,
            recovered: false as boolean,
            initializationPending: false as boolean,
          },
        };
      }
      if (existing.revisionInitializationStatus === 'initializing') {
        const isStale = isRevisionInitializationStale(existing);
        if (!isStale) {
          return {
            message: 'Draft revision initialization in progress. Please retry shortly.',
            data: {
              revisionId: String(existing._id),
              familyId,
              revisionNumber: Number(existing.revisionNumber || 1),
              reused: true as boolean,
              recovered: false as boolean,
              initializationPending: true as boolean,
            },
          };
        }
      }
      return this.recoverDraftRevision(actor, source, existing);
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
    const initializationOwner = crypto.randomUUID();
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
        revisionInitializationStartedAt: new Date(),
        revisionInitializationOwner: initializationOwner,
        version: 1,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const concurrent = await this.repo.findEdition({
        publicationType,
        familyId,
        status: 'draft',
        productionStatus: { $ne: 'archived' },
      });
      if (!concurrent) throw error;
      if (concurrent.revisionInitializationStatus !== 'initializing' && concurrent.revisionInitializationStatus !== 'failed') {
        return {
          message: 'Concurrent draft revision reused.',
          data: {
            revisionId: String(concurrent._id),
            familyId,
            revisionNumber: Number(concurrent.revisionNumber || revisionNumber),
            reused: true as boolean,
            recovered: false as boolean,
            initializationPending: false as boolean,
          },
        };
      }
      if (concurrent.revisionInitializationStatus === 'initializing') {
        const isStale = isRevisionInitializationStale(concurrent);
        if (!isStale) {
          return {
            message: 'Draft revision initialization in progress. Please retry shortly.',
            data: {
              revisionId: String(concurrent._id),
              familyId,
              revisionNumber: Number(concurrent.revisionNumber || revisionNumber),
              reused: true as boolean,
              recovered: false as boolean,
              initializationPending: true as boolean,
            },
          };
        }
      }
      return this.recoverDraftRevision(actor, source, concurrent);
    }
    try {
      await this.repo.withRevisionInitialization(String(revision._id), initializationOwner, async (repo) => {
      await this.cloneContent(String(source._id), String(revision._id), repo);
      const initialized = await repo.updateEditionWhere({
        _id: revision._id, status: 'draft', revisionInitializationStatus: 'initializing',
        revisionInitializationOwner: initializationOwner,
      }, { $set: { revisionInitializationStatus: 'ready', revisionInitializationStartedAt: null, revisionInitializationOwner: '' }, $inc: { version: 1 } });
      if (asObject(initialized).matchedCount === 0) {
        throw new EpaperConflictError('Draft revision changed while cloning. Reload before retrying.');
      }
      });
    } catch (error) {
      await this.repo.updateEditionWhere({
        _id: revision._id, status: 'draft', revisionInitializationStatus: 'initializing',
        revisionInitializationOwner: initializationOwner,
      }, { $set: { revisionInitializationStatus: 'failed' }, $inc: { version: 1 } });
      throw error;
    }
    await recordEpaperActivity({ epaperId: String(revision._id), actor, action: 'revision_created', fromStatus: 'published', toStatus: 'hotspot_mapping',
      message: buildEpaperActivityMessage({ action: 'revision_created' }), metadata: { familyId, revisionNumber, supersedesId: String(source._id) } });
    return { message: `Draft revision ${revisionNumber} created.`, data: { revisionId: String(revision._id), familyId, revisionNumber, reused: false as boolean, recovered: false as boolean, initializationPending: false as boolean } };
  }

  private async cloneContent(sourceId: string, targetId: string, repo: EpaperRepository) {
    const articles = await repo.listArticles(sourceId);
    const ids = new Map<string, string>();
    for (const article of articles) {
      const clone = await repo.createArticle({
        epaperId: targetId,
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
    const ttsQuery = { sourceParentId: sourceId, sourceType: 'epaperArticle', provider: 'manual', status: 'ready' };
    const assets = await repo.listReadyTtsAssets(ttsQuery);
    for (const asset of assets) {
      const nextId = ids.get(String(asset.sourceId || ''));
      if (!nextId) continue;
      await repo.createTtsAsset({
        sourceType: asset.sourceType, sourceId: nextId, sourceParentId: targetId,
        variant: asset.variant, title: asset.title, textHash: asset.textHash, contentVersionHash: asset.contentVersionHash,
        languageCode: asset.languageCode, voice: asset.voice, provider: asset.provider, model: asset.model,
        mimeType: asset.mimeType, audioUrl: asset.audioUrl, storageMode: asset.storageMode, status: asset.status,
        chunkCount: asset.chunkCount, charCount: asset.charCount, generatedAt: asset.generatedAt,
        lastVerifiedAt: asset.lastVerifiedAt, failureCount: asset.failureCount, lastError: asset.lastError,
        metadata: { ...(asset.metadata || {}), clonedFromEpaperId: sourceId, clonedFromAssetId: String(asset._id) },
      });
    }
  }

  private async recoverDraftRevision(
    actor: AdminSessionIdentity,
    source: Record<string, unknown>,
    existing: Record<string, unknown>
  ) {
    const familyId = String(source.familyId || source._id);
    const existingId = String(existing._id);
    const recoveryOwner = `recovery-${actor.id}-${crypto.randomUUID()}`;
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - REVISION_INITIALIZATION_STALE_MS);

    const claimFilter: Record<string, unknown> = {
      _id: existingId,
      status: 'draft',
      $or: [
        { revisionInitializationStatus: 'failed' },
        {
          revisionInitializationStatus: 'initializing',
          revisionInitializationStartedAt: { $lte: staleCutoff },
        },
        {
          revisionInitializationStatus: 'initializing',
          revisionInitializationStartedAt: null,
          createdAt: { $lte: staleCutoff },
        },
      ],
    };

    const claimed = await this.repo.updateEditionWhere(claimFilter, {
      $set: {
        revisionInitializationStatus: 'initializing',
        revisionInitializationStartedAt: now,
        revisionInitializationOwner: recoveryOwner,
      },
      $inc: { version: 1 },
    });

    if (asObject(claimed).matchedCount === 0) {
      const current = await this.repo.findEditionById(existingId);
      if (current && current.revisionInitializationStatus === 'ready') {
        return {
          message: 'Existing draft revision reused.',
          data: {
            revisionId: existingId,
            familyId,
            revisionNumber: Number(current.revisionNumber || existing.revisionNumber || 1),
            reused: true as boolean,
            recovered: false as boolean,
            initializationPending: false as boolean,
          },
        };
      }
      throw new EpaperConflictError('Draft revision is still being created. Retry Add Story shortly to reuse it.');
    }

    try {
      await this.repo.withRevisionInitialization(existingId, recoveryOwner, async (repo) => {
      await repo.deleteArticles({ epaperId: existingId });
      await repo.deleteTtsAssets({ sourceParentId: existingId });

      await this.cloneContent(String(source._id), existingId, repo);

      const initialized = await repo.updateEditionWhere({
        _id: existingId,
        status: 'draft',
        revisionInitializationStatus: 'initializing',
        revisionInitializationOwner: recoveryOwner,
      }, {
        $set: {
          revisionInitializationStatus: 'ready',
          revisionInitializationStartedAt: null,
          revisionInitializationOwner: '',
        },
        $inc: { version: 1 },
      });

      if (asObject(initialized).matchedCount === 0) {
        throw new EpaperConflictError('Draft revision changed while cloning. Reload before retrying.');
      }
      });
    } catch (error) {
      await this.repo.updateEditionWhere({
        _id: existingId,
        status: 'draft',
        revisionInitializationOwner: recoveryOwner,
      }, {
        $set: {
          revisionInitializationStatus: 'failed',
          revisionInitializationStartedAt: null,
          revisionInitializationOwner: '',
        },
        $inc: { version: 1 },
      });
      throw error;
    }

    await recordEpaperActivity({
      epaperId: existingId,
      actor,
      action: 'revision_recovered',
      fromStatus: 'hotspot_mapping',
      toStatus: 'hotspot_mapping',
      message: buildEpaperActivityMessage({ action: 'revision_recovered' }),
      metadata: {
        familyId,
        revisionNumber: Number(existing.revisionNumber || 1),
        supersedesId: String(source._id),
        recovered: true,
      },
    });

    return {
      message: `Draft revision ${Number(existing.revisionNumber || 1)} recovered and reused.`,
      data: {
        revisionId: existingId,
        familyId,
        revisionNumber: Number(existing.revisionNumber || 1),
        reused: true as boolean,
        recovered: true as boolean,
        initializationPending: false as boolean,
      },
    };
  }

  assertRevisionInitialized(revision: Record<string, unknown>) {
    if (revision.revisionInitializationStatus === 'initializing') {
      throw new EpaperConflictError('Draft revision is still being created. Retry Add Story shortly to reuse it.');
    }
    if (revision.revisionInitializationStatus === 'failed') {
      throw new EpaperConflictError('Draft revision creation failed. Recover or delete the incomplete draft before retrying.');
    }
  }
}

export const epaperRevisionService = new EpaperRevisionService();
