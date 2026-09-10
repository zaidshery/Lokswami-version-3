import 'server-only';

import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import { isMongoAvailable, reportMongoUnavailable } from '@/lib/db/mongoAvailability';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import User from '@/lib/models/User';
import TtsAsset from '@/lib/models/TtsAsset';
import TtsAuditEvent from '@/lib/models/TtsAuditEvent';
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
import {
  asObject,
  mapPublicFeedFile,
  mapPublicFeedMongo,
  toDateLabel,
} from './epaperMapper';
import type {
  EpaperRecord,
  EpaperStore,
  PublicEpaperFeedInput,
  PublicEpaperFeedItem,
  PublicEpaperListInput,
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

export class EpaperRepository {
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
    let edition = this.isValidId(id)
      ? await EPaper.findById(id).lean()
      : await EPaper.findOne({
          ...buildPublicationTypeMongoFilter(publicationType), familyId: id,
          status: 'published', isCurrentRevision: true,
        }).lean();
    if (edition && (edition.status !== 'published' || edition.isCurrentRevision === false)) {
      edition = await EPaper.findOne({
        ...buildPublicationTypeMongoFilter(publicationType),
        familyId: String(edition.familyId || edition._id), status: 'published', isCurrentRevision: true,
      }).lean();
    }
    const articles = edition
      ? await EPaperArticle.find({ epaperId: edition._id }).sort({ pageNumber: 1, createdAt: 1 }).lean()
      : [];
    return { store: 'mongo' as const, edition, articles };
  }

  async findPdfRecord(id: string) {
    if (!this.isValidId(id)) return null;
    await connectDB();
    return EPaper.findById(id).select('_id pdfPublicId pdfFormat pdfPath pdfUrl').lean();
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
    const selected = projection ? query.select(projection) : query;
    return resolveLeanValue<EpaperRecord | null>(selected);
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
    const created = await EPaper.create(data);
    return asObject(created.toObject());
  }

  async createArticle(data: EpaperRecord): Promise<EpaperRecord> {
    const created = await EPaperArticle.create(data);
    return asObject(created.toObject());
  }

  async updateEdition(id: string, updates: EpaperRecord): Promise<EpaperRecord | null> {
    return EPaper.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).lean() as Promise<EpaperRecord | null>;
  }

  async updateEditionWhere(query: EpaperRecord, updates: EpaperRecord) {
    return EPaper.updateOne(query, updates);
  }

  async updateArticle(id: string, updates: EpaperRecord): Promise<EpaperRecord | null> {
    return EPaperArticle.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).lean() as Promise<EpaperRecord | null>;
  }

  async updateArticleConditional(query: EpaperRecord, updates: EpaperRecord): Promise<EpaperRecord | null> {
    const updated = await EPaperArticle.findOneAndUpdate(query, updates, { new: true, runValidators: true });
    if (!updated) return null;
    return asObject(typeof updated.toObject === 'function' ? updated.toObject() : updated);
  }

  async markPageReady(epaperId: string, pageNumber: number, actor: { id: string; name: string; email: string; role: string }, reviewedAt: Date) {
    await EPaper.updateOne(
      { _id: epaperId, 'pages.pageNumber': pageNumber },
      { $set: {
        'pages.$.reviewStatus': 'ready', 'pages.$.reviewedAt': reviewedAt,
        'pages.$.reviewedBy': actor,
      } }
    );
  }

  async deleteEditionCascade(id: string) {
    const edition = await this.findEditionById(id);
    if (!edition) return null;
    await Promise.all([EPaper.deleteOne({ _id: id }), EPaperArticle.deleteMany({ epaperId: id })]);
    return edition;
  }

  async resolveAssignee(idOrEmail: string) {
    const normalized = idOrEmail.trim();
    const query = this.isValidId(normalized) ? { _id: normalized } : { email: normalized.toLowerCase() };
    return User.findOne(query).select('_id name email role').lean();
  }

  async publishEdition(id: string, familyId: string, updates: EpaperRecord) {
    const session = await EPaper.startSession();
    let result: EpaperRecord | null = null;
    try {
      await session.withTransaction(async () => {
        await EPaper.updateMany({ familyId, _id: { $ne: id }, status: 'published', isCurrentRevision: true }, {
          status: 'draft', productionStatus: 'archived', isCurrentRevision: false,
        }, { session });
        result = await EPaper.findByIdAndUpdate(id, updates, { new: true, runValidators: true, session }).lean() as EpaperRecord | null;
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async listOcrSuggestions(query: EpaperRecord) {
    return EPaperOcrSuggestion.find(query).sort({ pageNumber: 1, createdAt: 1 }).lean();
  }

  async findOcrSuggestion(query: EpaperRecord) {
    return EPaperOcrSuggestion.findOne(query).lean();
  }

  async updateOcrSuggestion(id: string, updates: EpaperRecord) {
    return EPaperOcrSuggestion.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).lean();
  }

  async findLatestProcessingJob(epaperId: string) {
    return EPaperProcessingJob.findOne({ epaperId }).sort({ createdAt: -1 }).lean();
  }

  async listFamilyEditions(familyId: string) {
    return EPaper.find({ familyId }).sort({ revisionNumber: -1, createdAt: -1 }).lean();
  }

  async listReadyTtsAssets(query: EpaperRecord) {
    return TtsAsset.find(query).lean();
  }

  async createTtsAsset(data: EpaperRecord) {
    const created = await TtsAsset.create(data);
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
