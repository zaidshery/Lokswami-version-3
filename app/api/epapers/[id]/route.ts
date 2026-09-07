import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import { getCitySlugFromName } from '@/lib/constants/epaperCities';
import { getStoredEPaperById } from '@/lib/storage/epapersFile';
import { resolveEpaperCoverImagePath } from '@/lib/utils/epaperCover';
import { normalizeEPaperPublicationType, type EPaperArticleHotspot } from '@/lib/types/epaper';
import { buildPublicationTypeMongoFilter } from '@/lib/utils/epaperPublication';
import { isValidEpaperHotspot } from '@/lib/utils/epaperHotspotGeometry';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toDateLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

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

function toPositiveInt(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.floor(parsed);
}

function toOptionalPositiveInt(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.floor(parsed);
}

function normalizePages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const source = asObject(entry);
      const pageNumber = toPositiveInt(source.pageNumber);
      if (!pageNumber) return null;
      return {
        pageNumber,
        imagePath: typeof source.imagePath === 'string' ? source.imagePath : '',
        width: toOptionalPositiveInt(source.width),
        height: toOptionalPositiveInt(source.height),
      };
    })
    .filter((page): page is NonNullable<typeof page> => Boolean(page))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

function mapArticle(value: unknown) {
  const source = asObject(value);
  const hotspotSource = asObject(source.hotspot);

  return {
    _id: String(source._id || ''),
    releaseVersion: Number(source.releaseVersion || 0),
    epaperId: String(source.epaperId || ''),
    pageNumber: toPositiveInt(source.pageNumber) || 1,
    title: String(source.title || ''),
    slug: String(source.slug || ''),
    excerpt: String(source.excerpt || ''),
    contentHtml: String(source.contentHtml || ''),
    coverImagePath: String(source.coverImagePath || ''),
    hotspot: {
      x: Number.isFinite(Number(hotspotSource.x)) ? Number(hotspotSource.x) : 0,
      y: Number.isFinite(Number(hotspotSource.y)) ? Number(hotspotSource.y) : 0,
      w: Number.isFinite(Number(hotspotSource.w)) ? Number(hotspotSource.w) : 0,
      h: Number.isFinite(Number(hotspotSource.h)) ? Number(hotspotSource.h) : 0,
    },
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for public e-paper detail route, using file store.', error);
    return true;
  }
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'story';
}

function toFraction(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric / 100));
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const publicationType = normalizeEPaperPublicationType(
      req.nextUrl.searchParams.get('publicationType')
    );

    if (await shouldUseFileStore()) {
      if (publicationType !== 'epaper') {
        return NextResponse.json(
          { success: false, error: 'E-magazine not found' },
          { status: 404 }
        );
      }

      const stored = await getStoredEPaperById(id);
      if (!stored) {
        return NextResponse.json(
          { success: false, error: 'E-paper not found' },
          { status: 404 }
        );
      }

      const pageNumberFilter = Number.parseInt(
        req.nextUrl.searchParams.get('pageNumber') || '',
        10
      );
      const pageCount = Math.max(toPositiveInt(stored.pages), 1);
      const pages = Array.from({ length: pageCount }, (_, index) => ({
        pageNumber: index + 1,
        imagePath: '',
        width: undefined,
        height: undefined,
      }));

      const hotspots = Array.isArray(stored.articleHotspots)
        ? stored.articleHotspots
        : [];
      const storedSource = asObject(stored);
      const filteredHotspots =
        Number.isFinite(pageNumberFilter) && pageNumberFilter > 0
          ? hotspots.filter((item) => Number(item.page) === Math.floor(pageNumberFilter))
          : hotspots;
      const articles = filteredHotspots.map((item, index) => {
        const title = String(item.title || '').trim();
        const text = String(item.text || '').trim();
        return {
          _id: `${stored._id}-${String(item.id || index + 1)}`,
          epaperId: String(stored._id),
          pageNumber: toPositiveInt(item.page) || 1,
          title: title || `Story ${index + 1}`,
          slug: toSlug(title || `story-${index + 1}`),
          excerpt: text,
          contentHtml: '',
          coverImagePath: '',
          hotspot: {
            x: toFraction(item.x),
            y: toFraction(item.y),
            w: Math.max(toFraction(item.width), 0.0001),
            h: Math.max(toFraction(item.height), 0.0001),
          },
          createdAt: stored.publishedAt,
          updatedAt: stored.updatedAt,
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          _id: String(stored._id),
          citySlug: getCitySlugFromName(String(stored.city || '')),
          cityName: String(stored.city || ''),
          title: String(stored.title || ''),
          publicationType: 'epaper',
          publishDate: toDateLabel(stored.publishDate),
          pdfPath: firstNonEmptyString(storedSource.pdfPath, storedSource.pdfUrl),
          thumbnailPath: firstNonEmptyString(storedSource.thumbnailPath, storedSource.thumbnail),
          pageCount,
          pages,
          status: 'published',
          articles,
        },
      });
    }

    await connectDB();

    let epaper = Types.ObjectId.isValid(id)
      ? await EPaper.findById(id).lean()
      : await EPaper.findOne({
          ...buildPublicationTypeMongoFilter(publicationType),
          familyId: id,
          status: 'published',
          isCurrentRevision: true,
        }).lean();
    if (!epaper) {
      return NextResponse.json(
        { success: false, error: 'E-paper not found' },
        { status: 404 }
      );
    }
    if (normalizeEPaperPublicationType(epaper.publicationType) !== publicationType) {
      return NextResponse.json(
        { success: false, error: 'E-paper not found' },
        { status: 404 }
      );
    }
    if (epaper.status !== 'published' || epaper.isCurrentRevision === false) {
      epaper = await EPaper.findOne({
        ...buildPublicationTypeMongoFilter(publicationType),
        familyId: String(epaper.familyId || epaper._id),
        status: 'published',
        isCurrentRevision: true,
      }).lean();
      if (!epaper) {
        return NextResponse.json(
          { success: false, error: 'E-paper not found' },
          { status: 404 }
        );
      }
    }

    const pageNumberFilter = Number.parseInt(
      req.nextUrl.searchParams.get('pageNumber') || '',
      10
    );
    const articleQuery: Record<string, unknown> = { epaperId: epaper._id };
    if (Number.isFinite(pageNumberFilter) && pageNumberFilter > 0) {
      const pNum = Math.floor(pageNumberFilter);
      articleQuery.$or = [
        { 'releasedSnapshot.pageNumber': pNum },
        { pageNumber: pNum },
      ];
    }

    const records = await EPaperArticle.find(articleQuery)
      .sort({ pageNumber: 1, createdAt: 1 })
      .lean();

    const epaperSource = asObject(epaper);
    const pages = normalizePages(epaperSource.pages);

    const articles = records
      .map((record) => {
        const released = resolveReleasedEpaperStory(record as unknown as Record<string, unknown>);
        if (released) return released;

        // Ensure any story created/mapped by the Lokswami team is clickable immediately
        const r = record as Record<string, unknown>;
        const hotspot = asObject(r.hotspot);
        const w = Number(hotspot.w || 0);
        const h = Number(hotspot.h || 0);
        if (!r.title || w <= 0 || h <= 0) return null;
        const pageNum = toPositiveInt(r.pageNumber) || 1;
        const pageObj = pages.find((p) => p.pageNumber === pageNum);

        return {
          _id: String(r._id || ''),
          epaperId: String(r.epaperId || ''),
          title: String(r.title || ''),
          slug: String(r.slug || ''),
          pageNumber: pageNum,
          contentHtml: String(r.contentHtml || ''),
          excerpt: String(r.excerpt || ''),
          coverImagePath: String(r.coverImagePath || ''),
          pageImagePath: String(pageObj?.imagePath || ''),
          hotspot: {
            x: Number(hotspot.x || 0),
            y: Number(hotspot.y || 0),
            w,
            h,
          },
          releaseVersion: 1,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      data: {
        _id: String(epaper._id),
        citySlug: String(epaper.citySlug || ''),
        cityName: String(epaper.cityName || ''),
        title: String(epaper.title || ''),
        publicationType,
        publishDate: toDateLabel(epaper.publishDate),
        pdfPath: firstNonEmptyString(epaperSource.pdfPath, epaperSource.pdfUrl),
        thumbnailPath: resolveEpaperCoverImagePath({
          thumbnailPath: epaperSource.thumbnailPath,
          thumbnail: epaperSource.thumbnail,
          pages,
        }),
        pageCount: Math.max(toPositiveInt(epaperSource.pageCount), pages.length),
        pages,
        status: 'published',
        articles: articles.map(mapArticle),
      },
    });
  } catch (error) {
    console.error('Failed to fetch public e-paper:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch e-paper' },
      { status: 500 }
    );
  }
}
