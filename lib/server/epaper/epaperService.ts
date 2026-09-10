import 'server-only';

import { getCitySlugFromName } from '@/lib/constants/epaperCities';
import { resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import { normalizeEPaperPublicationType } from '@/lib/types/epaper';
import { isValidEpaperHotspot } from '@/lib/utils/epaperHotspotGeometry';
import { normalizePublicationIssueMonth } from '@/lib/utils/epaperPublication';
import {
  buildDigitalOceanSpacesRawAssetUrl,
  parseDigitalOceanSpacesAssetFromUrl,
} from '@/lib/utils/digitalOceanSpaces';
import type { CursorPageResult } from '@/lib/utils/cursorPage';
import {
  asObject,
  firstNonEmptyString,
  mapPublicFeedFile,
  mapPublicFeedMongo,
  normalizeEpaperPages,
  toDateLabel,
  toPositiveInt,
} from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import {
  EpaperNotFoundError,
  EpaperValidationError,
  type EpaperStore,
  type PublicEpaperFeedInput,
  type PublicEpaperFeedItem,
  type PublicEpaperListInput,
} from './epaperTypes';

function toSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'story';
}

function toFraction(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric / 100)) : 0;
}

function mapPublicArticle(value: unknown) {
  const source = asObject(value);
  const hotspot = asObject(source.hotspot);
  return {
    _id: String(source._id || ''),
    releaseVersion: Number(source.releaseVersion || 0),
    epaperId: String(source.epaperId || ''),
    pageNumber: toPositiveInt(source.pageNumber, 1),
    title: String(source.title || ''),
    slug: String(source.slug || ''),
    excerpt: String(source.excerpt || ''),
    contentHtml: String(source.contentHtml || ''),
    coverImagePath: String(source.coverImagePath || ''),
    hotspot: {
      x: Number.isFinite(Number(hotspot.x)) ? Number(hotspot.x) : 0,
      y: Number.isFinite(Number(hotspot.y)) ? Number(hotspot.y) : 0,
      w: Number.isFinite(Number(hotspot.w)) ? Number(hotspot.w) : 0,
      h: Number.isFinite(Number(hotspot.h)) ? Number(hotspot.h) : 0,
    },
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function normalizePdfFormat(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolvePdfFormatFromUrl(value: string) {
  try {
    const parsed = new URL(value);
    return normalizePdfFormat(decodeURIComponent(parsed.pathname.split('/').pop() || '').split('.').pop() || '');
  } catch {
    return '';
  }
}

function buildHomeHref(citySlug: string, publishDate: string, publicationType: 'epaper' | 'emagazine') {
  if (publicationType === 'emagazine') {
    const month = normalizePublicationIssueMonth(publishDate);
    return month ? `/main/e-magazine?month=${encodeURIComponent(month)}` : '/main/e-magazine';
  }
  const params = new URLSearchParams();
  if (citySlug) params.set('city', citySlug);
  if (publishDate) params.set('date', publishDate);
  return params.size ? `/main/epaper?${params.toString()}` : '/main/epaper';
}

export class EpaperService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  listPublicEpaperFeed(input: PublicEpaperFeedInput): Promise<CursorPageResult<PublicEpaperFeedItem>> {
    return this.repo.listPublicFeed(input);
  }

  async listPublicEpapers(input: PublicEpaperListInput) {
    const result = await this.repo.listPublic(input);
    return {
      data: result.rows.map((row) => {
        if (!row) return null;
        return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'editionDate' && key !== 'publishedAt'));
      }).filter(Boolean),
      pagination: {
        total: result.total,
        page: input.page,
        limit: input.limit,
        pages: Math.ceil(result.total / input.limit),
      },
    };
  }

  async getPublicEditionDetail(id: string, publicationType: 'epaper' | 'emagazine', pageNumber?: number) {
    const result = await this.repo.findPublicEdition(id, publicationType);
    if (!result.edition) {
      throw new EpaperNotFoundError(result.store === 'file' && publicationType === 'emagazine' ? 'E-magazine not found' : 'E-paper not found');
    }

    if (result.store === 'file') {
      const stored = result.edition;
      const source = asObject(stored);
      const pageCount = Math.max(toPositiveInt(source.pages), 1);
      const pages = Array.from({ length: pageCount }, (_, index) => ({
        pageNumber: index + 1, imagePath: '', width: undefined, height: undefined,
      }));
      const hotspots = Array.isArray(source.articleHotspots) ? source.articleHotspots.map(asObject) : [];
      const filtered = pageNumber ? hotspots.filter((item) => Number(item.page) === pageNumber) : hotspots;
      const articles = filtered.map((item, index) => {
        const title = String(item.title || '').trim();
        return {
          _id: `${String(source._id)}-${String(item.id || index + 1)}`,
          epaperId: String(source._id),
          pageNumber: toPositiveInt(item.page, 1),
          title: title || `Story ${index + 1}`,
          slug: toSlug(title || `story-${index + 1}`),
          excerpt: String(item.text || '').trim(), contentHtml: '', coverImagePath: '',
          hotspot: { x: toFraction(item.x), y: toFraction(item.y), w: Math.max(toFraction(item.width), 0.0001), h: Math.max(toFraction(item.height), 0.0001) },
          createdAt: source.publishedAt, updatedAt: source.updatedAt,
        };
      });
      return {
        _id: String(source._id), citySlug: getCitySlugFromName(String(source.city || '')),
        cityName: String(source.city || ''), title: String(source.title || ''), publicationType: 'epaper' as const,
        publishDate: toDateLabel(source.publishDate), pdfPath: firstNonEmptyString(source.pdfPath, source.pdfUrl),
        thumbnailPath: firstNonEmptyString(source.thumbnailPath, source.thumbnail), pageCount, pages,
        status: 'published' as const, articles,
      };
    }

    const edition = asObject(result.edition);
    if (normalizeEPaperPublicationType(edition.publicationType) !== publicationType) {
      throw new EpaperNotFoundError('E-paper not found');
    }
    const pages = normalizeEpaperPages(edition.pages).map(({ pageNumber: number, imagePath, width, height }) => ({ pageNumber: number, imagePath, width, height }));
    const records = pageNumber ? result.articles.filter((record) => {
      const source = asObject(record);
      const released = asObject(source.releasedSnapshot);
      return Number(released.pageNumber || source.pageNumber) === pageNumber;
    }) : result.articles;
    const articles = records.map((record) => {
      const released = resolveReleasedEpaperStory(asObject(record));
      if (released) return released;
      const source = asObject(record);
      const hotspot = asObject(source.hotspot);
      if (!source.title || !isValidEpaperHotspot({
        x: Number(hotspot.x), y: Number(hotspot.y),
        w: Number(hotspot.w), h: Number(hotspot.h),
      })) return null;
      const currentPage = toPositiveInt(source.pageNumber, 1);
      return {
        ...source,
        pageNumber: currentPage,
        pageImagePath: pages.find((page) => page.pageNumber === currentPage)?.imagePath || '',
        releaseVersion: 1,
      };
    }).filter(Boolean).map(mapPublicArticle);

    return {
      _id: String(edition._id), citySlug: String(edition.citySlug || ''), cityName: String(edition.cityName || ''),
      title: String(edition.title || ''), publicationType, publishDate: toDateLabel(edition.publishDate),
      pdfPath: firstNonEmptyString(edition.pdfPath, edition.pdfUrl),
      thumbnailPath: mapPublicFeedMongo(edition)?.thumbnailPath || '',
      pageCount: Math.max(toPositiveInt(edition.pageCount), pages.length), pages,
      status: 'published' as const, articles,
    };
  }

  async resolvePublicPdfUrl(id: string) {
    const record = asObject(await this.repo.findPdfRecord(id));
    if (!record._id) throw new EpaperNotFoundError('E-paper not found');
    const explicitPublicId = firstNonEmptyString(record.pdfPublicId);
    const pdfUrl = firstNonEmptyString(record.pdfUrl, record.pdfPath);
    const parsed = pdfUrl ? parseDigitalOceanSpacesAssetFromUrl(pdfUrl) : null;
    const publicId = explicitPublicId || (parsed?.resourceType === 'raw' ? parsed.publicId : '');
    const format = normalizePdfFormat(String(record.pdfFormat || '')) || resolvePdfFormatFromUrl(pdfUrl) || 'pdf';
    if (!publicId) throw new EpaperValidationError('DigitalOcean Spaces PDF metadata not available');
    try {
      const url = buildDigitalOceanSpacesRawAssetUrl({ publicId, format });
      if (!url) throw new Error('Empty Spaces URL');
      return url;
    } catch {
      throw new EpaperValidationError('Failed to create DigitalOcean Spaces URL');
    }
  }

  async getHomeFeedEditions(store: EpaperStore) {
    const records = await this.repo.getHomeFeedEditions(store);
    const map = (raw: unknown, source: EpaperStore) => {
      const item = source === 'mongo' ? mapPublicFeedMongo(asObject(raw)) : mapPublicFeedFile(asObject(raw));
      if (!item) return null;
      return {
        id: item._id, publicationType: item.publicationType, citySlug: item.citySlug, cityName: item.cityName,
        title: item.title, publishDate: item.publishDate, thumbnailPath: item.thumbnailPath,
        pdfPath: item.pdfPath, pageCount: item.pageCount,
        href: buildHomeHref(item.citySlug, item.publishDate, item.publicationType),
      };
    };
    const epapers = records.epaper.map((row) => map(row, store)).filter((row) => row?.citySlug === 'indore')
      .sort((a, b) => String(b?.publishDate).localeCompare(String(a?.publishDate)));
    const magazines = records.emagazine.map((row) => map(row, store)).filter(Boolean);
    return { epaper: epapers[0] || null, emagazine: magazines[0] || null };
  }
}

export const epaperService = new EpaperService();
