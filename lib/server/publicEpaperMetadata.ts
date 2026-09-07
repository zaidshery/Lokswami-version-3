import { Types } from 'mongoose';
import { getCitySlugFromName } from '@/lib/constants/epaperCities';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import {
  getStoredEPaperById,
  listAllStoredEPapers,
  type StoredEPaper,
} from '@/lib/storage/epapersFile';
import { resolveEpaperCoverImagePath } from '@/lib/utils/epaperCover';
import {
  buildPublicationTypeMongoFilter,
  getPublicationIssueDateRange,
  isMonthlyEPaperPublication,
  resolveEPaperPublicationType,
} from '@/lib/utils/epaperPublication';
import type { EPaperPublicationType } from '@/lib/types/epaper';

export type PublicEpaperMetadata = {
  id: string;
  citySlug: string;
  cityName: string;
  title: string;
  publishDate: string;
  thumbnailPath: string;
  pageCount: number;
};

export type PublicEpaperStoryMetadata = {
  releaseVersion?: number;
  pageImagePath?: string;
  hotspot?: import('@/lib/types/epaper').EPaperArticleHotspot;
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImagePath: string;
  pageNumber: number;
};

type PublicEpaperMetadataQuery = {
  publicationType?: EPaperPublicationType;
  id?: string;
  citySlug?: string;
  publishDate?: string;
};

type PublicEpaperStoryMetadataQuery = {
  publicationType?: EPaperPublicationType;
  epaperId?: string;
  storyToken?: string;
};

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function toDateLabel(value: unknown) {
  const parsed = new Date(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : ''
  );
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function toPositiveInt(value: unknown, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizePages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asObject(entry))
    .map((entry) => ({
      pageNumber: toPositiveInt(entry.pageNumber, 0),
      imagePath: String(entry.imagePath || '').trim(),
    }))
    .filter((entry) => entry.pageNumber > 0);
}

function toSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'story'
  );
}

function mapMongoEpaper(input: unknown): PublicEpaperMetadata | null {
  const source = asObject(input);
  const id = firstNonEmptyString(source._id, source.id);
  if (!id) return null;

  const pages = normalizePages(source.pages);
  const publishDate = toDateLabel(source.publishDate);

  return {
    id,
    citySlug: String(source.citySlug || '').trim().toLowerCase(),
    cityName: String(source.cityName || '').trim(),
    title: String(source.title || '').trim(),
    publishDate,
    thumbnailPath: resolveEpaperCoverImagePath({
      thumbnailPath: source.thumbnailPath,
      thumbnail: source.thumbnail,
      pages,
    }),
    pageCount: Math.max(toPositiveInt(source.pageCount), pages.length, 1),
  };
}

function mapStoredEpaper(input: StoredEPaper): PublicEpaperMetadata {
  return {
    id: String(input._id || '').trim(),
    citySlug: getCitySlugFromName(input.city),
    cityName: String(input.city || '').trim(),
    title: String(input.title || '').trim(),
    publishDate: String(input.publishDate || '').trim() || toDateLabel(input.publishedAt),
    thumbnailPath: firstNonEmptyString(
      (input as unknown as Record<string, unknown>).thumbnailPath,
      input.thumbnail
    ),
    pageCount: Math.max(toPositiveInt(input.pages), 1),
  };
}

function mapMongoEpaperStory(input: unknown): PublicEpaperStoryMetadata | null {
  const source = asObject(input);
  const id = firstNonEmptyString(source._id, source.id);
  if (!id) return null;

  const title = String(source.title || '').trim();

  return {
    id,
    slug: String(source.slug || '').trim().toLowerCase(),
    title,
    excerpt: String(source.excerpt || '').trim(),
    coverImagePath: String(source.coverImagePath || '').trim(),
    pageNumber: toPositiveInt(source.pageNumber, 1),
  };
}

function mapStoredEpaperStory(
  input: StoredEPaper,
  storyToken: string
): PublicEpaperStoryMetadata | null {
  const token = storyToken.trim().toLowerCase();
  if (!token) return null;

  const hotspots = Array.isArray(input.articleHotspots) ? input.articleHotspots : [];

  for (let index = 0; index < hotspots.length; index += 1) {
    const hotspot = hotspots[index];
    const title = String(hotspot.title || '').trim();
    const slug = toSlug(title || `story-${index + 1}`);
    const id = `${String(input._id)}-${String(hotspot.id || index + 1)}`;

    if (token !== slug && token !== id.toLowerCase()) {
      continue;
    }

    return {
      id,
      slug,
      title: title || `Story ${index + 1}`,
      excerpt: String(hotspot.text || '').trim(),
      coverImagePath: '',
      pageNumber: toPositiveInt(hotspot.page, 1),
    };
  }

  return null;
}

function getDateRange(dateLabel: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) return null;
  const start = new Date(`${dateLabel}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { $gte: start, $lt: end };
}

async function getMongoEpaperMetadata(query: PublicEpaperMetadataQuery) {
  if (!(await isMongoAvailable({ label: 'public e-paper metadata lookup' }))) {
    return null;
  }

  try {
    if (query.id?.trim()) {
      const requested = Types.ObjectId.isValid(query.id)
        ? await EPaper.findById(query.id)
            .select('_id familyId status isCurrentRevision publicationType')
            .lean()
        : await EPaper.findOne({
            ...buildPublicationTypeMongoFilter(query.publicationType),
            familyId: query.id.trim(),
            status: 'published',
            isCurrentRevision: true,
          })
            .select('_id familyId status isCurrentRevision publicationType')
            .lean();
      if (!requested) return null;
      const requestedType = resolveEPaperPublicationType(requested.publicationType);
      if (requestedType !== query.publicationType) return null;
      const record =
        requested.status === 'published' && requested.isCurrentRevision !== false
          ? await EPaper.findById(requested._id)
              .select('_id citySlug cityName title publishDate thumbnailPath thumbnail pageCount pages')
              .lean()
          : await EPaper.findOne({
              ...buildPublicationTypeMongoFilter(query.publicationType),
              familyId: String(requested.familyId || requested._id),
              status: 'published',
              isCurrentRevision: true,
            })
        .select('_id citySlug cityName title publishDate thumbnailPath thumbnail pageCount pages')
        .lean();
      return mapMongoEpaper(record);
    }

    const mongoQuery: Record<string, unknown> = {
      ...buildPublicationTypeMongoFilter(query.publicationType),
      status: 'published',
      isCurrentRevision: { $ne: false },
    };
    if (query.citySlug?.trim()) mongoQuery.citySlug = query.citySlug.trim().toLowerCase();
    const dateRange = query.publishDate
      ? getPublicationIssueDateRange(query.publishDate, query.publicationType) ||
        getDateRange(query.publishDate)
      : null;
    if (dateRange) mongoQuery.publishDate = dateRange;

    const record = await EPaper.findOne(mongoQuery)
      .select('_id citySlug cityName title publishDate thumbnailPath thumbnail pageCount pages')
      .sort({ publishDate: -1, _id: -1 })
      .lean();
    return mapMongoEpaper(record);
  } catch (error) {
    console.error('Failed to load public e-paper metadata from MongoDB, falling back.', error);
    return null;
  }
}

async function getStoredEpaperMetadata(query: PublicEpaperMetadataQuery) {
  if (query.publicationType !== 'epaper') return null;

  if (query.id?.trim()) {
    const record = await getStoredEPaperById(query.id.trim());
    return record ? mapStoredEpaper(record) : null;
  }

  const records = await listAllStoredEPapers();
  const filtered = records
    .filter((item) => {
      const mapped = mapStoredEpaper(item);
      if (query.citySlug?.trim() && mapped.citySlug !== query.citySlug.trim().toLowerCase()) {
        return false;
      }
      if (query.publishDate?.trim() && mapped.publishDate !== query.publishDate.trim()) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.publishDate.localeCompare(left.publishDate));

  return filtered[0] ? mapStoredEpaper(filtered[0]) : null;
}

async function getMongoEpaperStoryMetadata(query: PublicEpaperStoryMetadataQuery) {
  const epaperId = query.epaperId?.trim() || '';
  const storyToken = query.storyToken?.trim() || '';
  if (!epaperId || !storyToken) return null;

  if (!(await isMongoAvailable({ label: 'public e-paper story metadata lookup' }))) {
    return null;
  }

  try {
    if (!Types.ObjectId.isValid(epaperId)) return null;
    const parent = await EPaper.findOne({
      ...buildPublicationTypeMongoFilter(query.publicationType),
      _id: new Types.ObjectId(epaperId),
      status: 'published',
      isCurrentRevision: { $ne: false },
    })
      .select('_id pages')
      .lean();
    if (!parent) return null;

    const normalizedStoryToken = storyToken.toLowerCase();
    const storyQuery: Record<string, unknown> = {
      epaperId: new Types.ObjectId(epaperId),
    };

    if (Types.ObjectId.isValid(storyToken)) {
      storyQuery.$or = [
        { 'releasedSnapshot.slug': normalizedStoryToken },
        { slug: normalizedStoryToken },
        { _id: new Types.ObjectId(storyToken) },
      ];
    } else {
      storyQuery.$or = [
        { 'releasedSnapshot.slug': normalizedStoryToken },
        { slug: normalizedStoryToken },
      ];
    }

    const record = await EPaperArticle.findOne(storyQuery)
      .select('_id epaperId slug title excerpt pageNumber coverImagePath hotspot releasedSnapshot')
      .lean();
    if (!record) return null;

    const released = resolveReleasedEpaperStory(record as unknown as Record<string, unknown> | null);
    if (released) {
      const mapped = mapMongoEpaperStory(released);
      return mapped ? {
        ...mapped,
        releaseVersion: Number(released.releaseVersion || 1),
        hotspot: released.hotspot as import('@/lib/types/epaper').EPaperArticleHotspot,
        pageImagePath: String(released.pageImagePath || ''),
      } : null;
    }

    const rec = record as Record<string, unknown>;
    const hotspot = asObject(rec.hotspot);
    const w = Number(hotspot.w || 0);
    const h = Number(hotspot.h || 0);
    if (!rec.title || w <= 0 || h <= 0) return null;

    const pageNumber = toPositiveInt(rec.pageNumber, 1);
    const parentPages = Array.isArray(parent.pages) ? (parent.pages as Record<string, unknown>[]) : [];
    const pageObj = parentPages.find((p) => Number(p.pageNumber) === pageNumber);

    return {
      id: String(rec._id),
      slug: String(rec.slug || ''),
      title: String(rec.title || ''),
      excerpt: String(rec.excerpt || ''),
      coverImagePath: String(rec.coverImagePath || ''),
      pageNumber,
      releaseVersion: 1,
      hotspot: {
        x: Number(hotspot.x || 0),
        y: Number(hotspot.y || 0),
        w,
        h,
      },
      pageImagePath: String(pageObj?.imagePath || ''),
    };
  } catch (error) {
    console.error('Failed to load public e-paper story metadata from MongoDB, falling back.', error);
    return null;
  }
}

async function getStoredEpaperStoryMetadata(query: PublicEpaperStoryMetadataQuery) {
  if (query.publicationType !== 'epaper') return null;

  const epaperId = query.epaperId?.trim() || '';
  const storyToken = query.storyToken?.trim() || '';
  if (!epaperId || !storyToken) return null;

  const record = await getStoredEPaperById(epaperId);
  if (!record) return null;

  return mapStoredEpaperStory(record, storyToken);
}

export async function getPublicEpaperForMetadata(query: PublicEpaperMetadataQuery) {
  const publicationType = resolveEPaperPublicationType(query.publicationType);
  const normalizedQuery = {
    publicationType,
    id: query.id?.trim() || '',
    citySlug: isMonthlyEPaperPublication(publicationType)
      ? ''
      : query.citySlug?.trim().toLowerCase() || '',
    publishDate: query.publishDate?.trim() || '',
  };

  const mongoRecord = await getMongoEpaperMetadata(normalizedQuery);
  if (mongoRecord) return mongoRecord;

  return getStoredEpaperMetadata(normalizedQuery);
}

export async function getPublicEpaperStoryForMetadata(query: PublicEpaperStoryMetadataQuery) {
  const normalizedQuery = {
    publicationType: resolveEPaperPublicationType(query.publicationType),
    epaperId: query.epaperId?.trim() || '',
    storyToken: query.storyToken?.trim() || '',
  };

  const mongoRecord = await getMongoEpaperStoryMetadata(normalizedQuery);
  if (mongoRecord) return mongoRecord;

  return getStoredEpaperStoryMetadata(normalizedQuery);
}
