import 'server-only';

import { getCitySlugFromName } from '@/lib/constants/epaperCities';
import { resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import type { EPaperArticleHotspot, EPaperPublicationType } from '@/lib/types/epaper';
import { resolveEpaperCoverImagePath } from '@/lib/utils/epaperCover';
import { buildPublicationTypeMongoFilter, getPublicationIssueDateRange, isMonthlyEPaperPublication, resolveEPaperPublicationType } from '@/lib/utils/epaperPublication';
import { asObject, firstNonEmptyString, toDateLabel, toPositiveInt } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import type { EpaperRecord, PublicEpaperMetadata, PublicEpaperStoryMetadata } from './epaperTypes';

export type { PublicEpaperMetadata, PublicEpaperStoryMetadata };
export type PublicEpaperMetadataQuery = { publicationType?: EPaperPublicationType; id?: string; citySlug?: string; publishDate?: string };
export type PublicEpaperStoryMetadataQuery = { publicationType?: EPaperPublicationType; epaperId?: string; storyToken?: string };

function pages(value: unknown) {
  return Array.isArray(value) ? value.map(asObject).map((item) => ({ pageNumber: toPositiveInt(item.pageNumber), imagePath: String(item.imagePath || '').trim() })).filter((item) => item.pageNumber) : [];
}

function mapEdition(value: unknown): PublicEpaperMetadata | null {
  const source = asObject(value); const id = firstNonEmptyString(source._id, source.id);
  if (!id) return null;
  const normalizedPages = pages(source.pages);
  return { id, citySlug: String(source.citySlug || '').trim().toLowerCase(), cityName: String(source.cityName || '').trim(),
    title: String(source.title || '').trim(), publishDate: toDateLabel(source.publishDate),
    thumbnailPath: resolveEpaperCoverImagePath({ thumbnailPath: source.thumbnailPath, thumbnail: source.thumbnail, pages: normalizedPages }),
    pageCount: Math.max(toPositiveInt(source.pageCount, 1), normalizedPages.length, 1) };
}

function mapStored(value: unknown): PublicEpaperMetadata | null {
  const source = asObject(value); const id = String(source._id || '').trim(); if (!id) return null;
  return { id, citySlug: getCitySlugFromName(String(source.city || '')), cityName: String(source.city || '').trim(),
    title: String(source.title || '').trim(), publishDate: String(source.publishDate || '').trim() || toDateLabel(source.publishedAt),
    thumbnailPath: firstNonEmptyString(source.thumbnailPath, source.thumbnail), pageCount: Math.max(toPositiveInt(source.pages, 1), 1) };
}

function mapStory(value: unknown): PublicEpaperStoryMetadata | null {
  const source = asObject(value); const id = firstNonEmptyString(source._id, source.id); if (!id) return null;
  return { id, slug: String(source.slug || '').trim().toLowerCase(), title: String(source.title || '').trim(),
    excerpt: String(source.excerpt || '').trim(), coverImagePath: String(source.coverImagePath || '').trim(), pageNumber: toPositiveInt(source.pageNumber, 1) };
}

function storedStory(value: unknown, tokenInput: string): PublicEpaperStoryMetadata | null {
  const source = asObject(value); const token = tokenInput.trim().toLowerCase(); if (!token) return null;
  const hotspots = Array.isArray(source.articleHotspots) ? source.articleHotspots.map(asObject) : [];
  for (let index = 0; index < hotspots.length; index += 1) {
    const hotspot = hotspots[index]; const title = String(hotspot.title || '').trim();
    const slug = (title || `story-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'story';
    const id = `${String(source._id)}-${String(hotspot.id || index + 1)}`;
    if (token !== slug && token !== id.toLowerCase()) continue;
    return { id, slug, title: title || `Story ${index + 1}`, excerpt: String(hotspot.text || '').trim(), coverImagePath: '', pageNumber: toPositiveInt(hotspot.page, 1) };
  }
  return null;
}

function dateRange(label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const start = new Date(`${label}T00:00:00.000Z`); if (Number.isNaN(start.getTime())) return null;
  return { $gte: start, $lt: new Date(start.getTime() + 86_400_000) };
}

export class EpaperMetadataService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  async getEdition(query: PublicEpaperMetadataQuery) {
    const publicationType = resolveEPaperPublicationType(query.publicationType);
    const normalized = { publicationType, id: query.id?.trim() || '', citySlug: isMonthlyEPaperPublication(publicationType) ? '' : query.citySlug?.trim().toLowerCase() || '', publishDate: query.publishDate?.trim() || '' };
    const mongo = await this.mongoEdition(normalized); if (mongo) return mongo;
    if (publicationType !== 'epaper') return null;
    if (normalized.id) return mapStored(await this.repo.getStoredById(normalized.id));
    const rows = await this.repo.listAllStored();
    return rows.map(mapStored).filter((item): item is PublicEpaperMetadata => Boolean(item))
      .filter((item) => (!normalized.citySlug || item.citySlug === normalized.citySlug) && (!normalized.publishDate || item.publishDate === normalized.publishDate))
      .sort((a, b) => b.publishDate.localeCompare(a.publishDate))[0] || null;
  }

  async getStory(query: PublicEpaperStoryMetadataQuery) {
    const publicationType = resolveEPaperPublicationType(query.publicationType);
    const epaperId = query.epaperId?.trim() || ''; const storyToken = query.storyToken?.trim() || '';
    const mongo = await this.mongoStory({ publicationType, epaperId, storyToken }); if (mongo) return mongo;
    if (publicationType !== 'epaper' || !epaperId || !storyToken) return null;
    return storedStory(await this.repo.getStoredById(epaperId), storyToken);
  }

  private async mongoEdition(query: Required<Pick<PublicEpaperMetadataQuery, 'publicationType'>> & { id: string; citySlug: string; publishDate: string }) {
    if (!(await this.repo.isPublicMongoAvailable('public e-paper metadata lookup'))) return null;
    try {
      if (query.id) {
        const requested = this.repo.isValidId(query.id)
          ? await this.repo.findEditionById(query.id, '_id familyId status isCurrentRevision publicationType')
          : await this.repo.findEdition({ ...buildPublicationTypeMongoFilter(query.publicationType), familyId: query.id, status: 'published', isCurrentRevision: true }, '_id familyId status isCurrentRevision publicationType');
        if (!requested || resolveEPaperPublicationType(requested.publicationType) !== query.publicationType) return null;
        const record = requested.status === 'published' && requested.isCurrentRevision !== false
          ? await this.repo.findEditionById(String(requested._id), '_id citySlug cityName title publishDate thumbnailPath thumbnail pageCount pages')
          : await this.repo.findEdition({ ...buildPublicationTypeMongoFilter(query.publicationType), familyId: String(requested.familyId || requested._id), status: 'published', isCurrentRevision: true }, '_id citySlug cityName title publishDate thumbnailPath thumbnail pageCount pages');
        return mapEdition(record);
      }
      const filter: EpaperRecord = { ...buildPublicationTypeMongoFilter(query.publicationType), status: 'published', isCurrentRevision: { $ne: false } };
      if (query.citySlug) filter.citySlug = query.citySlug;
      const range = query.publishDate ? getPublicationIssueDateRange(query.publishDate, query.publicationType) || dateRange(query.publishDate) : null;
      if (range) filter.publishDate = range;
      return mapEdition(await this.repo.findLatestEdition(filter, '_id citySlug cityName title publishDate thumbnailPath thumbnail pageCount pages'));
    } catch (error) { console.error('Failed to load public e-paper metadata from MongoDB, falling back.', error); return null; }
  }

  private async mongoStory(query: { publicationType: EPaperPublicationType; epaperId: string; storyToken: string }) {
    if (!query.epaperId || !query.storyToken || !(await this.repo.isPublicMongoAvailable('public e-paper story metadata lookup'))) return null;
    try {
      if (!this.repo.isValidId(query.epaperId)) return null;
      const parent = await this.repo.findEdition({ ...buildPublicationTypeMongoFilter(query.publicationType), _id: this.repo.toObjectId(query.epaperId), status: 'published', isCurrentRevision: { $ne: false } }, '_id pages');
      if (!parent) return null;
      const token = query.storyToken.toLowerCase(); const clauses: EpaperRecord[] = [{ 'releasedSnapshot.slug': token }, { slug: token }];
      if (this.repo.isValidId(query.storyToken)) clauses.push({ _id: this.repo.toObjectId(query.storyToken) });
      const record = await this.repo.findArticle({ epaperId: this.repo.toObjectId(query.epaperId), $or: clauses }, '_id epaperId slug title excerpt pageNumber coverImagePath hotspot releasedSnapshot');
      if (!record) return null;
      const released = resolveReleasedEpaperStory(record);
      if (released) { const mapped = mapStory(released); return mapped ? { ...mapped, releaseVersion: Number(released.releaseVersion || 1), hotspot: released.hotspot as EPaperArticleHotspot, pageImagePath: String(released.pageImagePath || '') } : null; }
      const hotspot = asObject(record.hotspot); const w = Number(hotspot.w || 0); const h = Number(hotspot.h || 0);
      if (!record.title || w <= 0 || h <= 0) return null;
      const pageNumber = toPositiveInt(record.pageNumber, 1); const page = pages(parent.pages).find((item) => item.pageNumber === pageNumber);
      return { id: String(record._id), slug: String(record.slug || ''), title: String(record.title || ''), excerpt: String(record.excerpt || ''),
        coverImagePath: String(record.coverImagePath || ''), pageNumber, releaseVersion: 1,
        hotspot: { x: Number(hotspot.x || 0), y: Number(hotspot.y || 0), w, h }, pageImagePath: String(page?.imagePath || '') };
    } catch (error) { console.error('Failed to load public e-paper story metadata from MongoDB, falling back.', error); return null; }
  }
}

export const epaperMetadataService = new EpaperMetadataService();
