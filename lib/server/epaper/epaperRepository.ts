import 'server-only';

import { Types, type ClientSession } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import { isMongoAvailable, reportMongoUnavailable } from '@/lib/db/mongoAvailability';
import EPaper, { EPAPER_ACTIVE_DRAFT_INDEX } from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import User from '@/lib/models/User';
import TtsAsset from '@/lib/models/TtsAsset';
import TtsAuditEvent from '@/lib/models/TtsAuditEvent';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import {
  getStoredEPaperById,
  listAllStoredEPapers,
  listStoredEPapers,
} from '@/lib/storage/epapersFile';
import { getCityNameFromSlug, getCitySlugFromName } from '@/lib/constants/epaperCities';
import {
  buildPublicEpaperMongoQuery,
  matchesPublicEpaperMetadata,
} from '@/lib/utils/publicEpaperFilters';
import { buildPublicationTypeMongoFilter } from '@/lib/utils/epaperPublication';
import { cursorPage, type CursorPageResult } from '@/lib/utils/cursorPage';
import { StandaloneEpaperMutation, recoverEditionContentMutation } from './epaperStandaloneMutation';
import {
  asObject,
  mapPublicFeedFile,
  mapPublicFeedMongo,
  toDateLabel,
} from './epaperMapper';
import {
  EpaperConflictError,
  EpaperVersionConflictError,
  type EpaperRecord,
  type EpaperStore,
  type EpaperTtsAssetCloneSource,
  type CreateEpaperTtsAssetInput,
  type PublicEpaperFeedInput,
  type PublicEpaperFeedItem,
  type PublicEpaperListInput,
} from './epaperTypes';

const PUBLIC_PROJECTION =
  '_id publicationType citySlug cityName title publishDate thumbnailPath thumbnail pdfPath pdfUrl status pageCount pages createdAt publishedAt familyId isCurrentRevision';
const DEFAULT_QUERY_TIMEOUT_MS = 2000;

function parsePositiveEnvInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });
}

async function resolveLeanValue<T>(query: unknown): Promise<T> {
  const candidate = query as { lean?: () => Promise<unknown> };
  const value = typeof candidate?.lean === 'function' ? await candidate.lean() : await query;
  if (value && !Array.isArray(value) && typeof (value as { toObject?: unknown }).toObject === 'function') {
    return (value as { toObject: () => unknown }).toObject() as T;
  }
  return value as T;
}

function filterStoredRows(input: PublicEpaperListInput | PublicEpaperFeedInput) {
  if (input.filters.publicationType !== 'epaper') return Promise.resolve([]);
  return listAllStoredEPapers().then((rows) => {
    const cityName = input.filters.citySlug ? getCityNameFromSlug(input.filters.citySlug) : '';
    const date = input.filters.parsedDate ? input.filters.parsedDate.toISOString().slice(0, 10) : '';
    return rows.filter((row) => {
      if (cityName && row.city !== cityName) return false;
      if (date && row.publishDate !== date) return false;
      if (!date && input.filters.month && !String(row.publishDate || '').startsWith(`${input.filters.month}-`)) return false;
      return !input.filters.query || matchesPublicEpaperMetadata({
        title: row.title,
        cityName: row.city,
        citySlug: getCitySlugFromName(row.city),
        publishDate: row.publishDate,
      }, input.filters.query);
    });
  });
}

function isStandaloneTransactionUnsupported(error: unknown) {
  const candidate = error as { code?: unknown; codeName?: unknown; message?: unknown } | null;
  return candidate?.code === 20 && candidate.codeName === 'IllegalOperation' &&
    typeof candidate.message === 'string' &&
    candidate.message.startsWith('Transaction numbers are only allowed on a replica set member or mongos');
}

export class EpaperRepository {
  constructor(
    private readonly initializationSession?: ClientSession,
    private readonly revisionInitializationOwner?: { id: string; owner: string },
    private readonly readinessMutation?: { id: string; version: number },
    private readonly standaloneMutation?: StandaloneEpaperMutation,
  ) {}

  async withEditionReadinessMutation<T>(
    id: string,
    expectedVersion: number,
    mutate: (repo: EpaperRepository) => Promise<T>,
  ): Promise<T> {
    const session = await EPaper.db.startSession();
    let result: T | undefined;
    let mutationStarted = false;
    try {
      try {
        await session.withTransaction(async () => {
          const current = await EPaper.findById(id).session(session).lean();
          if (!current) throw new EpaperConflictError('Edition no longer exists.');
          assertEpaperDraftEditable(current);
          // The caller derived its mutation from this version, not from the
          // newer document we may have read after a concurrent page upload.
          if (Number(current.version || 1) !== expectedVersion) {
            throw new EpaperVersionConflictError(Number(current.version || 1), expectedVersion);
          }
          const locked = await EPaper.updateOne({
            _id: id, status: 'draft', productionStatus: current.productionStatus,
            version: current.version == null ? { $exists: false } : expectedVersion,
            revisionInitializationStatus: { $nin: ['initializing', 'failed'] },
          }, {
            ...(current.version == null ? {} : { $inc: { version: 1 } }),
            $set: { qaCompletedAt: null,
              ...(current.version == null ? { version: expectedVersion + 1 } : {}),
              ...(current.productionStatus === 'ready_to_publish' ? { productionStatus: 'hotspot_mapping' } : {}),
            },
          }, { session });
          if (!locked.matchedCount) throw new EpaperConflictError('Edition changed during content mutation. Reload before retrying.');
          mutationStarted = true;
          result = await mutate(new EpaperRepository(session, undefined, {
            id, version: expectedVersion + 1,
          }));
        });
      } catch (error) {
        if (!isStandaloneTransactionUnsupported(error) || mutationStarted) throw error;
        const current = await EPaper.findById(id).lean();
        if (!current) throw new EpaperConflictError('Edition no longer exists.');
        if (asObject(current.contentMutation).id) {
          await recoverEditionContentMutation(id);
          throw new EpaperConflictError('A prior content change was recovered or is still in progress. Reload before retrying.');
        }
        assertEpaperDraftEditable(current);
        if (Number(current.version || 1) !== expectedVersion) {
          throw new EpaperVersionConflictError(Number(current.version || 1), expectedVersion);
        }
        const saga = new StandaloneEpaperMutation(id, expectedVersion, asObject(current));
        return saga.execute(() => mutate(new EpaperRepository(undefined, undefined, undefined, saga)));
      }
      return result as T;
    } finally {
      await session.endSession();
    }
  }

  async withRevisionInitialization(
    id: string,
    owner: string,
    initialize: (repo: EpaperRepository) => Promise<void>
  ): Promise<void> {
    const session = await EPaper.db.startSession();
    let initializationStarted = false;
    try {
      try {
        await session.withTransaction(async () => {
          // On replica sets the transaction keeps the owner fence and cloned
          // children atomic. Standalone Mongo fails on this first parent write.
          const locked = await EPaper.updateOne({
            _id: id, status: 'draft', revisionInitializationStatus: 'initializing',
            revisionInitializationOwner: owner,
          }, { $set: { revisionInitializationStartedAt: new Date() } }, { session });
          if (!locked.matchedCount) {
            throw new EpaperConflictError('Draft revision initialization ownership changed. Retry from the published issue.');
          }
          initializationStarted = true;
          await initialize(new EpaperRepository(session, { id, owner }));
        });
      } catch (error) {
        if (!isStandaloneTransactionUnsupported(error) || initializationStarted) throw error;
        const locked = await EPaper.updateOne({
          _id: id, status: 'draft', revisionInitializationStatus: 'initializing',
          revisionInitializationOwner: owner,
        }, { $set: { revisionInitializationStartedAt: new Date() } });
        if (!locked.matchedCount) {
          throw new EpaperConflictError('Draft revision initialization ownership changed. Retry from the published issue.');
        }
        const fallbackRepo = new EpaperRepository(undefined, { id, owner });
        try {
          await initialize(fallbackRepo);
        } catch (initializationError) {
          // Only remove children written by this owner. A recovery owner may
          // already be cloning the same active draft.
          await Promise.all([
            EPaperArticle.deleteMany({ epaperId: id, revisionInitializationOwner: owner }),
            TtsAsset.deleteMany({ sourceParentId: id, revisionInitializationOwner: owner }),
          ]);
          throw initializationError;
        }
      }
    } finally {
      await session.endSession();
    }
  }

  private async refreshInitializationLease() {
    if (!this.revisionInitializationOwner) return;
    const { id, owner } = this.revisionInitializationOwner;
    const refreshed = await EPaper.updateOne({
      _id: id, status: 'draft', revisionInitializationStatus: 'initializing', revisionInitializationOwner: owner,
    }, { $set: { revisionInitializationStartedAt: new Date() } }, { session: this.initializationSession });
    if (!refreshed.matchedCount) {
      throw new EpaperConflictError('Draft revision initialization ownership changed. Retry from the published issue.');
    }
  }
  isValidId(id: string) {
    return Types.ObjectId.isValid(id);
  }

  async connect() {
    await connectDB();
  }

  async resolveAdminStore(label: string): Promise<EpaperStore> {
    if (!process.env.MONGODB_URI) return 'file';
    try {
      await connectDB();
      return 'mongo';
    } catch (error) {
      console.error(`MongoDB unavailable for ${label}, using file store.`, error);
      return 'file';
    }
  }

  async isPublicMongoAvailable(label: string) {
    return isMongoAvailable({ label });
  }

  async listAllStored() {
    return listAllStoredEPapers();
  }

  async listPublicFeed(input: PublicEpaperFeedInput): Promise<CursorPageResult<PublicEpaperFeedItem>> {
    const filePage = async () => cursorPage<PublicEpaperFeedItem>({
      arrayItems: await filterStoredRows(input),
      limit: input.limit,
      dateField: 'editionDate',
      fallbackDateFields: ['publishDate', 'publishedAt'],
      cursorPublishedAt: input.cursorPublishedAt,
      cursorId: input.cursorId,
      mapItem: (raw) => mapPublicFeedFile(asObject(raw)),
    });

    if (!(await isMongoAvailable({ label: 'public e-papers latest feed' }))) return filePage();
    try {
      const timeoutMs = parsePositiveEnvInt('MONGODB_PUBLIC_QUERY_TIMEOUT_MS', 0) ||
        parsePositiveEnvInt('MONGODB_QUERY_TIMEOUT_MS', 0) || DEFAULT_QUERY_TIMEOUT_MS;
      return await withTimeout(cursorPage<PublicEpaperFeedItem>({
        model: EPaper,
        mongoFilter: buildPublicEpaperMongoQuery(input.filters, {
          status: 'published',
          isCurrentRevision: { $ne: false },
        }),
        mongoProjection: PUBLIC_PROJECTION,
        limit: input.limit,
        dateField: 'editionDate',
        fallbackDateFields: ['publishDate', 'publishedAt'],
        mongoDateField: 'publishDate',
        cursorPublishedAt: input.cursorPublishedAt,
        cursorId: input.cursorId,
        mapItem: (raw) => mapPublicFeedMongo(asObject(raw)),
      }), timeoutMs, 'Public e-paper feed query');
    } catch (error) {
      reportMongoUnavailable(error, 'public e-papers latest feed');
      console.error('MongoDB query failed for public e-papers latest feed, using file store.', error);
      return filePage();
    }
  }

  async listPublic(input: PublicEpaperListInput) {
    const storedRows = await filterStoredRows(input);
    storedRows.sort((a, b) => {
      const byDate = new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
      return byDate || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    const start = (input.page - 1) * input.limit;
    const fileResult = {
      rows: storedRows.slice(start, start + input.limit).map((row) => mapPublicFeedFile(asObject(row))).filter(Boolean),
      total: storedRows.length,
      source: 'file' as const,
    };
    if ((await this.resolveAdminStore('public e-papers route')) === 'file') return fileResult;

    try {
      const query = buildPublicEpaperMongoQuery(input.filters, {
        status: 'published',
        isCurrentRevision: { $ne: false },
      });
      const total = await EPaper.countDocuments(query);
      if (total === 0 && storedRows.length > 0) return fileResult;
      const records = await EPaper.find(query)
        .sort({ publishDate: -1, createdAt: -1 })
        .skip(start)
        .limit(input.limit)
        .lean();
      return {
        rows: records.map((record) => mapPublicFeedMongo(asObject(record))).filter(Boolean),
        total,
        source: 'mongo' as const,
      };
    } catch (error) {
      console.error('MongoDB query failed for public e-papers route, using file store.', error);
      return fileResult;
    }
  }

  async getStoredById(id: string) {
    return getStoredEPaperById(id);
  }

  async findPublicEdition(id: string, publicationType: 'epaper' | 'emagazine') {
    if ((await this.resolveAdminStore('public e-paper detail route')) === 'file') {
      return { store: 'file' as const, edition: publicationType === 'epaper' ? await getStoredEPaperById(id) : null, articles: [] };
    }
    const edition = this.isValidId(id)
      ? await EPaper.findOne({
          _id: id,
          status: 'published',
          isCurrentRevision: { $ne: false },
          ...buildPublicationTypeMongoFilter(publicationType),
        }).lean()
      : await EPaper.findOne({
          familyId: id,
          status: 'published',
          isCurrentRevision: { $ne: false },
          ...buildPublicationTypeMongoFilter(publicationType),
        }).lean();
    const articles = edition
      ? await EPaperArticle.find({ epaperId: edition._id }).sort({ pageNumber: 1, createdAt: 1 }).lean()
      : [];
    return { store: 'mongo' as const, edition, articles };
  }

  async findPdfRecord(id: string) {
    if ((await this.resolveAdminStore('public e-paper pdf route')) === 'file') {
      const stored = await getStoredEPaperById(id);
      if (!stored) return null;
      return {
        _id: stored._id,
        pdfPath: stored.pdfUrl,
        pdfUrl: stored.pdfUrl,
        status: 'published',
        isCurrentRevision: true,
      };
    }
    if (!this.isValidId(id)) return null;
    await connectDB();
    return EPaper.findOne({
      _id: id,
      status: 'published',
      isCurrentRevision: { $ne: false },
    }).select('_id pdfPublicId pdfFormat pdfPath pdfUrl status isCurrentRevision').lean();
  }

  async getHomeFeedEditions(store: EpaperStore) {
    if (store === 'file') {
      const rows = await listAllStoredEPapers();
      return { epaper: rows, emagazine: [] };
    }
    const [epaper, emagazine] = await Promise.all([
      EPaper.find({ status: 'published', isCurrentRevision: { $ne: false }, citySlug: 'indore', ...buildPublicationTypeMongoFilter('epaper') })
        .select(PUBLIC_PROJECTION).sort({ publishDate: -1, _id: -1 }).limit(1).lean(),
      EPaper.find({ status: 'published', isCurrentRevision: { $ne: false }, ...buildPublicationTypeMongoFilter('emagazine') })
        .select(PUBLIC_PROJECTION).sort({ publishDate: -1, _id: -1 }).limit(1).lean(),
    ]);
    return { epaper, emagazine };
  }

  async listAdminStored(options: Parameters<typeof listStoredEPapers>[0]) {
    return listStoredEPapers(options);
  }

  async countEditions(query: EpaperRecord) {
    return EPaper.countDocuments(query);
  }

  async listEditions(query: EpaperRecord, page: number, limit: number | null) {
    let cursor = EPaper.find(query).sort({ publishDate: -1, createdAt: -1 }).skip(limit ? (page - 1) * limit : 0);
    if (limit) cursor = cursor.limit(limit);
    return cursor.lean() as Promise<EpaperRecord[]>;
  }

  async getArticleStats(ids: string[]) {
    if (!ids.length) return [];
    return EPaperArticle.aggregate([
      { $match: { epaperId: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
      { $group: {
        _id: '$epaperId', articleCount: { $sum: 1 }, pagesWithHotspots: { $addToSet: '$pageNumber' },
        articlesWithReadableText: { $sum: { $cond: [{ $or: [
          { $gt: [{ $strLenCP: { $ifNull: ['$contentHtml', ''] } }, 0] },
          { $gt: [{ $strLenCP: { $ifNull: ['$excerpt', ''] } }, 0] },
        ] }, 1, 0] } },
      } },
    ]);
  }

  async findEditionById(id: string, projection?: string): Promise<EpaperRecord | null> {
    const query = EPaper.findById(id);
    const selected = projection ? query.select(`${projection} contentMutation`) : query;
    const edition = await resolveLeanValue<EpaperRecord | null>(selected);
    const journal = asObject(edition?.contentMutation);
    if (journal.id && (journal.phase !== 'running' || new Date(String(journal.leaseUntil)).getTime() <= Date.now())) {
      await recoverEditionContentMutation(id);
      const refreshed = EPaper.findById(id);
      return resolveLeanValue<EpaperRecord | null>(projection ? refreshed.select(`${projection} contentMutation`) : refreshed);
    }
    return edition;
  }

  async findEdition(query: EpaperRecord, projection?: string): Promise<EpaperRecord | null> {
    const cursor = EPaper.findOne(query);
    if (projection) cursor.select(projection);
    return cursor.lean() as Promise<EpaperRecord | null>;
  }

  async findLatestEdition(query: EpaperRecord, projection?: string): Promise<EpaperRecord | null> {
    const cursor = EPaper.findOne(query);
    if (projection) cursor.select(projection);
    return cursor.sort({ publishDate: -1, revisionNumber: -1, _id: -1 }).lean() as Promise<EpaperRecord | null>;
  }

  async findLatestRevision(query: EpaperRecord, projection?: string): Promise<EpaperRecord | null> {
    const cursor = EPaper.findOne(query);
    if (projection) cursor.select(projection);
    return cursor.sort({ revisionNumber: -1, createdAt: -1, _id: -1 }).lean() as Promise<EpaperRecord | null>;
  }

  async listArticles(epaperId: string, projection?: string): Promise<EpaperRecord[]> {
    const cursor = EPaperArticle.find({ epaperId });
    if (this.initializationSession) cursor.session(this.initializationSession);
    if (projection) cursor.select(projection);
    return cursor.lean() as Promise<EpaperRecord[]>;
  }

  async listArticlesByQuery(query: EpaperRecord): Promise<EpaperRecord[]> {
    return EPaperArticle.find(query).sort({ pageNumber: 1, createdAt: 1 }).lean() as Promise<EpaperRecord[]>;
  }

  async countArticles(query: EpaperRecord) {
    return EPaperArticle.countDocuments(query);
  }

  async articleExists(query: EpaperRecord) {
    return Boolean(await EPaperArticle.exists(query));
  }

  async findArticleById(id: string): Promise<EpaperRecord | null> {
    return EPaperArticle.findById(id).lean() as Promise<EpaperRecord | null>;
  }

  async findArticle(query: EpaperRecord, projection?: string): Promise<EpaperRecord | null> {
    const cursor = EPaperArticle.findOne(query);
    const selected = projection ? cursor.select(projection) : cursor;
    return resolveLeanValue<EpaperRecord | null>(selected);
  }

  async createEdition(data: EpaperRecord): Promise<EpaperRecord> {
    if (data.status === 'draft' && data.familyId) {
      // createIndex is idempotent. Fail closed if legacy duplicate drafts
      // prevent installing the constraint rather than creating another draft.
      await EPaper.collection.createIndex(
        { publicationType: 1, familyId: 1 },
        EPAPER_ACTIVE_DRAFT_INDEX
      );
    }
    const created = await EPaper.create(data);
    return asObject(created.toObject());
  }

  async createArticle(data: EpaperRecord): Promise<EpaperRecord> {
    if (this.standaloneMutation) return this.standaloneMutation.createArticle(data);
    await this.refreshInitializationLease();
    const articleData = this.revisionInitializationOwner
      ? { ...data, revisionInitializationOwner: this.revisionInitializationOwner.owner }
      : data;
    const created = this.initializationSession
      ? (await EPaperArticle.create([articleData], { session: this.initializationSession }))[0]
      : await EPaperArticle.create(articleData);
    return asObject(created.toObject());
  }

  async deleteArticleWhere(query: EpaperRecord) {
    if (this.standaloneMutation) return this.standaloneMutation.deleteArticle(query);
    return EPaperArticle.deleteOne(query, { session: this.initializationSession });
  }

  async updateEdition(
    id: string,
    updates: EpaperRecord,
    expectedVersion?: number,
    expectedSnapshot?: { productionStatus: string; revisionNumber: number; processingGeneration: string }
  ): Promise<EpaperRecord | null> {
    return this.updateEditionWithCas(id, updates, expectedVersion, expectedSnapshot);
  }

  async updateEditionWithCas(
    id: string,
    updates: EpaperRecord,
    expectedVersion?: number,
    expectedSnapshot?: { productionStatus: string; revisionNumber: number; processingGeneration: string }
  ): Promise<EpaperRecord | null> {
    const query: Record<string, unknown> = { _id: id, ...expectedSnapshot };
    if (expectedSnapshot) {
      query.status = 'draft';
      query.revisionInitializationStatus = { $nin: ['initializing', 'failed'] };
    }
    if (expectedVersion !== undefined) {
      if (expectedVersion === 1) {
        query.$or = [{ version: 1 }, { version: { $exists: false } }];
      } else {
        query.version = expectedVersion;
      }
    }
    const { $set, $inc, ...directFields } = updates;
    const finalSet = { ...directFields, ...(asObject($set)) };
    const finalInc = { ...(asObject($inc)), version: 1 };
    const mongoUpdate: Record<string, unknown> = {
      $inc: finalInc,
    };
    if (Object.keys(finalSet).length > 0) {
      mongoUpdate.$set = finalSet;
    }

    const updated = (await EPaper.findOneAndUpdate(query, mongoUpdate, {
      new: true,
      runValidators: true,
      ...(this.initializationSession ? { session: this.initializationSession } : {}),
    }).lean()) as EpaperRecord | null;

    if (!updated && expectedVersion !== undefined) {
      const currentDoc = await EPaper.findById(id).select('version').lean();
      if (currentDoc) {
        throw new EpaperVersionConflictError(
          Number(currentDoc.version || 1),
          expectedVersion
        );
      }
    }

    return updated;
  }

  async advanceEditionAutomation(input: {
    id: string;
    fromStatus: string;
    expectedVersion: number;
    expectedGeneration: string;
    expectedRevisionNumber: number;
    updates: EpaperRecord;
  }): Promise<EpaperRecord | null> {
    if (input.updates.status === 'published' || input.updates.productionStatus === 'published') {
      throw new EpaperConflictError('Automated transitions can never publish an edition.');
    }
    const query: Record<string, unknown> = {
      _id: input.id,
      status: 'draft',
      productionStatus: input.fromStatus,
      version: input.expectedVersion,
      revisionNumber: input.expectedRevisionNumber,
      processingGeneration: input.expectedGeneration,
      revisionInitializationStatus: { $nin: ['initializing', 'failed'] },
    };
    const updated = (await EPaper.findOneAndUpdate(
      query,
      {
        ['$set']: input.updates,
        ['$inc']: { version: 1 },
      },
      { new: true, runValidators: true }
    ).lean()) as EpaperRecord | null;

    if (!updated) {
      const current = await EPaper.findById(input.id)
        .select('version status productionStatus processingGeneration revisionNumber revisionInitializationStatus')
        .lean();
      if (current) {
        throw new EpaperVersionConflictError(
          Number(current.version || 1),
          input.expectedVersion
        );
      }
    }
    return updated;
  }

  async deleteArticles(epaperIdOrFilter: string | { epaperId: string }) {
    await this.refreshInitializationLease();
    const epaperId = typeof epaperIdOrFilter === 'string'
      ? epaperIdOrFilter
      : epaperIdOrFilter.epaperId;
    return EPaperArticle.deleteMany({ epaperId }, { session: this.initializationSession });
  }

  async deleteTtsAssets(query: EpaperRecord) {
    await this.refreshInitializationLease();
    return TtsAsset.deleteMany(query, { session: this.initializationSession });
  }

  async updateEditionWhere(query: EpaperRecord, updates: EpaperRecord) {
    if (this.standaloneMutation) return this.standaloneMutation.stageParent(updates);
    await this.refreshInitializationLease();
    // On standalone Mongo another writer can run after the readiness CAS.
    // Never replace its newer pages using this mutation's locked snapshot.
    const fencedQuery = this.readinessMutation
      ? { ...query, _id: this.readinessMutation.id, status: 'draft', version: this.readinessMutation.version }
      : query;
    const result = await EPaper.updateOne(fencedQuery, updates, { session: this.initializationSession });
    if (this.readinessMutation && !result.matchedCount) {
      throw new EpaperConflictError('Edition changed during content mutation. Reload before retrying.');
    }
    return result;
  }

  async updateArticle(id: string, updates: EpaperRecord): Promise<EpaperRecord | null> {
    if (this.standaloneMutation) return this.standaloneMutation.updateArticle(id, updates);
    return EPaperArticle.findByIdAndUpdate(id, updates, { new: true, runValidators: true, session: this.initializationSession }).lean() as Promise<EpaperRecord | null>;
  }

  async updateArticleConditional(query: EpaperRecord, updates: EpaperRecord): Promise<EpaperRecord | null> {
    const updated = await EPaperArticle.findOneAndUpdate(query, updates, { new: true, runValidators: true });
    if (!updated) return null;
    return asObject(typeof updated.toObject === 'function' ? updated.toObject() : updated);
  }

  async markPageReady(epaperId: string, pageNumber: number, actor: { id: string; name: string; email: string; role: string }, reviewedAt: Date) {
    await EPaper.updateOne(
      { _id: epaperId, 'pages.pageNumber': pageNumber },
      {
        $set: {
          'pages.$.reviewStatus': 'ready', 'pages.$.reviewedAt': reviewedAt,
          'pages.$.reviewedBy': actor,
        },
        $inc: { version: 1 },
      }
    );
  }

  async isAssetReferencedElsewhere(
    assetPath: string,
    excludeEditionId: string
  ): Promise<boolean> {
    const normalized = assetPath.trim();
    if (!normalized) return false;

    await this.connect();

    const otherEdition = await EPaper.findOne({
      _id: { $ne: excludeEditionId },
      $or: [
        { pdfPath: normalized },
        { pdfUrl: normalized },
        { thumbnailPath: normalized },
        { thumbnail: normalized },
        { 'pages.imagePath': normalized },
      ],
    })
      .select('_id')
      .lean();

    if (otherEdition) return true;

    const otherArticle = await EPaperArticle.findOne({
      epaperId: { $ne: excludeEditionId },
      $or: [
        { coverImagePath: normalized },
        { pageImagePath: normalized },
      ],
    })
      .select('_id')
      .lean();

    if (otherArticle) return true;

    const otherTts = await TtsAsset.findOne({
      epaperId: { $ne: excludeEditionId },
      $or: [{ audioUrl: normalized }, { storageKey: normalized }],
    })
      .select('_id')
      .lean();

    if (otherTts) return true;

    return false;
  }

  async deleteEditionCascade(id: string) {
    const edition = await this.findEditionById(id);
    if (!edition) return null;
    await Promise.all([
      EPaper.deleteOne({ _id: id }),
      EPaperArticle.deleteMany({ epaperId: id }),
      EPaperProcessingJob.deleteMany({ epaperId: id }),
      EPaperOcrSuggestion.deleteMany({ epaperId: id }),
      TtsAsset.deleteMany({ sourceParentId: id }),
    ]);
    return edition;
  }

  async resolveAssignee(idOrEmail: string) {
    const normalized = idOrEmail.trim();
    const query = this.isValidId(normalized) ? { _id: normalized } : { email: normalized.toLowerCase() };
    return User.findOne({ ...query, isActive: { $ne: false } })
      .select('_id name email role isActive')
      .lean();
  }

  async publishEdition(
    id: string,
    familyId: string,
    updates: EpaperRecord,
    expectedVersion: number
  ) {
    let session: ClientSession | null = null;
    let supportsTransactions = true;
    try {
      if (typeof EPaper.startSession === 'function') {
        session = await EPaper.startSession();
      } else {
        supportsTransactions = false;
      }
    } catch {
      session = null;
      supportsTransactions = false;
    }

    const publishUpdates = {
      ...updates,
      status: 'published',
      isCurrentRevision: true,
      publishedAt: updates.publishedAt || new Date(),
    };
    const publishFilter = { _id: id, version: expectedVersion };
    const publishMutation = {
      $set: publishUpdates,
      $inc: { version: 1 },
    };
    // New families use UUIDs; only legacy ObjectId families can match _id.
    // Build this once so both transaction and standalone queries cast safely.
    const familyMatches: EpaperRecord[] = [{ familyId }];
    if (Types.ObjectId.isValid(familyId)) familyMatches.push({ _id: familyId });
    const previousRevisionFilter = {
      $or: familyMatches,
      _id: { $ne: id },
      isCurrentRevision: { $ne: false },
      status: 'published',
    };

    const throwVersionConflict = async () => {
      const currentDoc = await EPaper.findById(id).select('version').lean();
      if (currentDoc) {
        throw new EpaperVersionConflictError(
          Number(currentDoc.version || 1),
          expectedVersion
        );
      }
    };

    if (session && supportsTransactions) {
      try {
        let result: EpaperRecord | null = null;
        await session.withTransaction(async () => {
          result = (await EPaper.findOneAndUpdate(publishFilter, publishMutation, {
            new: true,
            runValidators: true,
            session,
          }).lean()) as EpaperRecord | null;
          if (!result) {
            await throwVersionConflict();
            return;
          }
          await EPaper.updateMany(
            previousRevisionFilter,
            { $set: { isCurrentRevision: false } },
            { session }
          );
        });
        return result;
      } catch (txError: unknown) {
        const msg = txError instanceof Error ? txError.message : String(txError || '');
        if (
          msg.includes('Transaction numbers are only allowed on a replica set member') ||
          msg.includes('replica set')
        ) {
          // Fall back to serialized non-transaction execution
        } else {
          throw txError;
        }
      } finally {
        await session.endSession().catch(() => {});
      }
    }

    const updated = (await EPaper.findOneAndUpdate(publishFilter, publishMutation, {
      new: true,
      runValidators: true,
    }).lean()) as EpaperRecord | null;
    if (!updated) {
      await throwVersionConflict();
      return null;
    }
    await EPaper.updateMany(
      previousRevisionFilter,
      { $set: { isCurrentRevision: false } }
    );
    return updated;
  }

  async listOcrSuggestions(query: EpaperRecord) {
    return EPaperOcrSuggestion.find(query).sort({ pageNumber: 1, createdAt: 1 }).lean();
  }

  async findOcrSuggestion(query: EpaperRecord) {
    return EPaperOcrSuggestion.findOne(query).lean();
  }

  async updateOcrSuggestion(id: string, updates: EpaperRecord) {
    if (this.standaloneMutation) return this.standaloneMutation.updateSuggestion(id, updates);
    return EPaperOcrSuggestion.findByIdAndUpdate(id, updates, { new: true, runValidators: true, session: this.initializationSession }).lean();
  }

  async findLatestProcessingJob(epaperId: string) {
    // PDF generation/lease blockers must not accidentally use an optional OCR
    // job as the latest page-conversion job.
    return EPaperProcessingJob.findOne({ epaperId, kind: 'pdf_pages' }).sort({ createdAt: -1 }).lean();
  }

  async listFamilyEditions(familyId: string) {
    return EPaper.find({ familyId }).sort({ revisionNumber: -1, createdAt: -1 }).lean();
  }

  async listReadyTtsAssets(query: EpaperRecord): Promise<EpaperTtsAssetCloneSource[]> {
    const cursor = TtsAsset.find(query);
    if (this.initializationSession) cursor.session(this.initializationSession);
    return cursor.lean() as unknown as Promise<EpaperTtsAssetCloneSource[]>;
  }

  async createTtsAsset(data: CreateEpaperTtsAssetInput) {
    await this.refreshInitializationLease();
    const assetData = this.revisionInitializationOwner
      ? { ...data, revisionInitializationOwner: this.revisionInitializationOwner.owner }
      : data;
    const created = this.initializationSession
      ? (await TtsAsset.create([assetData], { session: this.initializationSession }))[0]
      : await TtsAsset.create(assetData);
    return asObject(created.toObject());
  }

  async createTtsAuditEvent(data: EpaperRecord) {
    const created = await TtsAuditEvent.create(data);
    return asObject(typeof created.toObject === 'function' ? created.toObject() : created);
  }

  toObjectId(id: string) {
    return new Types.ObjectId(id);
  }

  toDateLabel(value: unknown) {
    return toDateLabel(value);
  }
}

export const epaperRepository = new EpaperRepository();
