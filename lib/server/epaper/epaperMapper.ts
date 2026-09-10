import { getCitySlugFromName } from '@/lib/constants/epaperCities';
import { resolveEpaperCoverImagePath } from '@/lib/utils/epaperCover';
import { isEPaperPageReviewStatus, normalizeEPaperPublicationType } from '@/lib/types/epaper';
import { resolveEpaperProduction } from '@/lib/workflow/epaper';
import type { EpaperPageDTO, EpaperRecord, PublicEpaperFeedItem } from './epaperTypes';

export function asObject(value: unknown): EpaperRecord {
  return typeof value === 'object' && value !== null ? value as EpaperRecord : {};
}

export function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

export function toPositiveInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function toOptionalPositiveInt(value: unknown) {
  const parsed = toPositiveInt(value);
  return parsed || undefined;
}

export function toIsoDate(value: unknown) {
  const parsed = new Date(value instanceof Date || typeof value === 'string' || typeof value === 'number' ? value : '');
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function toDateLabel(value: unknown) {
  return toIsoDate(value).slice(0, 10);
}

export function normalizeEpaperPages(value: unknown): EpaperPageDTO[] {
  if (!Array.isArray(value)) return [];
  return value.map(asObject).map((source) => {
    const pageNumber = toPositiveInt(source.pageNumber);
    if (!pageNumber) return null;
    return {
      pageNumber,
      imagePath: typeof source.imagePath === 'string' ? source.imagePath : '',
      width: toOptionalPositiveInt(source.width),
      height: toOptionalPositiveInt(source.height),
      pageType: source.pageType === 'advertisement' || source.pageType === 'classified' || source.pageType === 'photo' || source.pageType === 'blank' ? source.pageType : 'editorial',
      classificationNote: typeof source.classificationNote === 'string' ? source.classificationNote.trim() : '',
      processingStatus: source.processingStatus === 'processing' || source.processingStatus === 'ready' || source.processingStatus === 'failed' ? source.processingStatus : 'pending',
      processingError: typeof source.processingError === 'string' ? source.processingError.trim() : '',
      reviewStatus: isEPaperPageReviewStatus(source.reviewStatus) ? source.reviewStatus : 'pending',
      reviewNote: typeof source.reviewNote === 'string' ? source.reviewNote.trim() : '',
      reviewedAt: source.reviewedAt instanceof Date ? source.reviewedAt.toISOString() : typeof source.reviewedAt === 'string' && source.reviewedAt.trim() ? source.reviewedAt : null,
      reviewedBy: typeof source.reviewedBy === 'object' && source.reviewedBy !== null && typeof (source.reviewedBy as { id?: unknown }).id === 'string' ? {
        id: String((source.reviewedBy as EpaperRecord).id || ''),
        name: String((source.reviewedBy as EpaperRecord).name || ''),
        email: String((source.reviewedBy as EpaperRecord).email || ''),
        role: String((source.reviewedBy as EpaperRecord).role || ''),
      } : null,
    } satisfies EpaperPageDTO;
  }).filter((page): page is EpaperPageDTO => Boolean(page)).sort((a, b) => a.pageNumber - b.pageNumber);
}

export function mapAdminEpaper(value: unknown) {
  const source = asObject(value);
  const pages = normalizeEpaperPages(source.pages);
  const production = resolveEpaperProduction({
    productionStatus: source.productionStatus,
    productionAssignee: source.productionAssignee,
    productionNotes: source.productionNotes,
    qaCompletedAt: source.qaCompletedAt,
    status: source.status,
  });
  return {
    _id: String(source._id || ''),
    publicationType: normalizeEPaperPublicationType(source.publicationType),
    citySlug: String(source.citySlug || ''),
    cityName: String(source.cityName || ''),
    title: String(source.title || ''),
    publishDate: toDateLabel(source.publishDate),
    pdfPath: firstNonEmptyString(source.pdfPath, source.pdfUrl),
    pdfPublicId: firstNonEmptyString(source.pdfPublicId),
    pdfFormat: firstNonEmptyString(source.pdfFormat),
    thumbnailPath: resolveEpaperCoverImagePath({ thumbnailPath: source.thumbnailPath, thumbnail: source.thumbnail, pages }),
    pageCount: Math.max(toPositiveInt(source.pageCount), pages.length),
    pages,
    status: source.status === 'published' ? 'published' as const : 'draft' as const,
    familyId: firstNonEmptyString(source.familyId, source._id),
    revisionNumber: toPositiveInt(source.revisionNumber, 1),
    isCurrentRevision: source.isCurrentRevision !== false,
    supersedesId: firstNonEmptyString(source.supersedesId),
    publishedAt: source.publishedAt instanceof Date ? source.publishedAt.toISOString() : firstNonEmptyString(source.publishedAt) || null,
    productionStatus: production.productionStatus,
    productionAssignee: production.productionAssignee,
    productionNotes: production.productionNotes.map((note) => ({ ...note, createdAt: note.createdAt.toISOString() })),
    qaCompletedAt: production.qaCompletedAt?.toISOString() || null,
    sourceType: firstNonEmptyString(source.sourceType),
    sourceLabel: firstNonEmptyString(source.sourceLabel),
    sourceUrl: firstNonEmptyString(source.sourceUrl),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function mapPublicFeedMongo(raw: EpaperRecord): PublicEpaperFeedItem | null {
  const id = firstNonEmptyString(raw._id, raw.id);
  if (!id) return null;
  const pages = normalizeEpaperPages(raw.pages);
  const editionDate = toIsoDate(raw.publishDate || raw.publishedAt || raw.createdAt) || new Date().toISOString();
  return {
    _id: id,
    publicationType: normalizeEPaperPublicationType(raw.publicationType),
    citySlug: String(raw.citySlug || ''),
    cityName: String(raw.cityName || ''),
    title: String(raw.title || ''),
    publishDate: toDateLabel(raw.publishDate),
    thumbnailPath: resolveEpaperCoverImagePath({ thumbnailPath: raw.thumbnailPath, thumbnail: raw.thumbnail, pages }),
    pdfPath: firstNonEmptyString(raw.pdfPath, raw.pdfUrl),
    status: 'published',
    pageCount: Math.max(toPositiveInt(raw.pageCount), pages.length, 1),
    pagesWithImage: pages.filter((page) => Boolean(page.imagePath.trim())).length,
    editionDate,
    publishedAt: editionDate,
  };
}

export function mapPublicFeedFile(raw: EpaperRecord): PublicEpaperFeedItem | null {
  const id = firstNonEmptyString(raw._id, raw.id);
  if (!id) return null;
  const cityName = String(raw.city || '');
  const editionDate = toIsoDate(raw.publishDate || raw.publishedAt) || new Date().toISOString();
  return {
    _id: id,
    publicationType: 'epaper',
    citySlug: getCitySlugFromName(cityName),
    cityName,
    title: String(raw.title || ''),
    publishDate: String(raw.publishDate || '').trim() || toDateLabel(raw.publishedAt),
    thumbnailPath: firstNonEmptyString(raw.thumbnailPath, raw.thumbnail),
    pdfPath: firstNonEmptyString(raw.pdfPath, raw.pdfUrl),
    status: 'published',
    pageCount: Math.max(toPositiveInt(raw.pages), 1),
    pagesWithImage: 0,
    editionDate,
    publishedAt: toIsoDate(raw.publishedAt || editionDate) || editionDate,
  };
}
