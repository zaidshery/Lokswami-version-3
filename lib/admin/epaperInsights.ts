import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { listAllStoredEPapers } from '@/lib/storage/epapersFile';
import type { EPaperArticleRecord, EPaperPageData } from '@/lib/types/epaper';
import {
  buildEpaperEditionQualitySummary,
  type EPaperEditionQualitySummary,
} from '@/lib/utils/epaperQualitySignals';

type EpaperSource = {
  _id?: unknown;
  title?: string;
  cityName?: string;
  status?: 'draft' | 'published';
  productionStatus?: string;
  pages?: unknown[];
  pageCount?: number;
  updatedAt?: Date | string;
};

type EpaperArticleSource = {
  epaperId?: unknown;
  pageNumber?: unknown;
  contentHtml?: string;
  excerpt?: string;
};

export type EpaperLowQualityPage = {
  epaperId: string;
  epaperTitle: string;
  cityName: string;
  pageNumber: number;
  qualityLabel: string;
  issueSummary: string;
  reviewStatus: string;
  reviewedByName: string;
  editHref: string;
  updatedAt: string;
};

export type EpaperBlockedEdition = {
  epaperId: string;
  title: string;
  cityName: string;
  productionStatus: string;
  blockerCount: number;
  blockers: string[];
  editHref: string;
  updatedAt: string;
};

export type EpaperInsights = {
  source: 'mongodb' | 'file';
  editionCounts: {
    total: number;
    inProduction: number;
    readyToPublish: number;
    published: number;
  };
  pageQualityCounts: EPaperEditionQualitySummary['counts'];
  lowQualityPages: EpaperLowQualityPage[];
  blockedEditions: EpaperBlockedEdition[];
};

function toIsoDate(value: unknown) {
  const parsed =
    value instanceof Date ? value : value ? new Date(String(value)) : new Date(0);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function shouldUseFileStore() {
  return !process.env.MONGODB_URI?.trim();
}

type EpaperInsightsOptions = {
  maxLowQualityPages?: number | null;
  maxBlockedEditions?: number | null;
};

async function loadFromFileStore(): Promise<EpaperInsights> {
  const epapers = await listAllStoredEPapers();

  return {
    source: 'file',
    editionCounts: {
      total: epapers.length,
      inProduction: 0,
      readyToPublish: 0,
      published: epapers.length,
    },
    pageQualityCounts: {
      good: 0,
      watch: 0,
      critical: 0,
      lowTextPages: 0,
      pendingQa: 0,
      needsAttentionQa: 0,
      readyQa: 0,
    },
    lowQualityPages: [],
    blockedEditions: [],
  };
}

export async function getEpaperInsights(
  options: EpaperInsightsOptions = {}
): Promise<EpaperInsights> {
  const maxLowQualityPages = options.maxLowQualityPages ?? 10;
  const maxBlockedEditions = options.maxBlockedEditions ?? 8;
  if (shouldUseFileStore()) {
    return loadFromFileStore();
  }

  try {
    await connectDB();
  } catch (error) {
    console.error('MongoDB unavailable for e-paper insights, using file store.', error);
    return loadFromFileStore();
  }

  const [epapers, articles] = await Promise.all([
    EPaper.find({})
      .select('_id title cityName status productionStatus pages pageCount updatedAt')
      .sort({ updatedAt: -1, publishDate: -1, _id: -1 })
      .lean() as Promise<EpaperSource[]>,
    EPaperArticle.find({})
      .select('epaperId pageNumber contentHtml excerpt')
      .lean() as Promise<EpaperArticleSource[]>,
  ]);

  const groupedArticles = new Map<string, EpaperArticleSource[]>();
  for (const article of articles) {
    const epaperId = String(article.epaperId || '').trim();
    if (!epaperId) continue;
    const current = groupedArticles.get(epaperId) || [];
    current.push(article);
    groupedArticles.set(epaperId, current);
  }

  const summaryCounts: EpaperInsights['pageQualityCounts'] = {
    good: 0,
    watch: 0,
    critical: 0,
    lowTextPages: 0,
    pendingQa: 0,
    needsAttentionQa: 0,
    readyQa: 0,
  };

  const lowQualityPages: EpaperLowQualityPage[] = [];
  const blockedEditions: EpaperBlockedEdition[] = [];

  for (const epaper of epapers) {
    const epaperId = String(epaper._id || '').trim();
    if (!epaperId) continue;

    const editionSummary = buildEpaperEditionQualitySummary({
      pageCount: Number(epaper.pageCount || 0),
      pages: Array.isArray(epaper.pages) ? (epaper.pages as EPaperPageData[]) : [],
      articles: (groupedArticles.get(epaperId) || []) as EPaperArticleRecord[],
      epaper: epaper as any,
    });

    summaryCounts.good += editionSummary.counts.good;
    summaryCounts.watch += editionSummary.counts.watch;
    summaryCounts.critical += editionSummary.counts.critical;
    summaryCounts.lowTextPages += editionSummary.counts.lowTextPages;
    summaryCounts.pendingQa += editionSummary.counts.pendingQa;
    summaryCounts.needsAttentionQa += editionSummary.counts.needsAttentionQa;
    summaryCounts.readyQa += editionSummary.counts.readyQa;

    if (editionSummary.publishBlockers.length > 0) {
      blockedEditions.push({
        epaperId,
        title: String(epaper.title || 'Untitled Edition').trim() || 'Untitled Edition',
        cityName: String(epaper.cityName || 'Unknown City').trim() || 'Unknown City',
        productionStatus: String(epaper.productionStatus || epaper.status || 'draft_upload'),
        blockerCount: editionSummary.publishBlockers.length,
        blockers: editionSummary.publishBlockers,
        editHref: `/admin/epapers/${encodeURIComponent(epaperId)}`,
        updatedAt: toIsoDate(epaper.updatedAt),
      });
    }

    for (const pageSignal of editionSummary.pageSignals) {
      if (pageSignal.quality.level === 'good') continue;

      lowQualityPages.push({
        epaperId,
        epaperTitle: String(epaper.title || 'Untitled Edition').trim() || 'Untitled Edition',
        cityName: String(epaper.cityName || 'Unknown City').trim() || 'Unknown City',
        pageNumber: pageSignal.pageNumber,
        qualityLabel: pageSignal.quality.label,
        issueSummary: pageSignal.quality.issues[0] || 'Needs desk review.',
        reviewStatus: String(pageSignal.page?.reviewStatus || 'pending'),
        reviewedByName: pageSignal.page?.reviewedBy?.name || '',
        editHref: `/admin/epapers/${encodeURIComponent(epaperId)}/page/${pageSignal.pageNumber}`,
        updatedAt: toIsoDate(epaper.updatedAt),
      });
    }
  }

  return {
    source: 'mongodb',
    editionCounts: {
      total: epapers.length,
      inProduction: epapers.filter((epaper) =>
        ['draft_upload', 'pages_ready', 'ocr_review', 'hotspot_mapping'].includes(
          String(epaper.productionStatus || '')
        )
      ).length,
      readyToPublish: epapers.filter(
        (epaper) => String(epaper.productionStatus || '') === 'ready_to_publish'
      ).length,
      published: epapers.filter(
        (epaper) =>
          String(epaper.productionStatus || '') === 'published' || epaper.status === 'published'
      ).length,
    },
    pageQualityCounts: summaryCounts,
    lowQualityPages:
      maxLowQualityPages === null
        ? lowQualityPages.sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          )
        : lowQualityPages
            .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
            .slice(0, maxLowQualityPages),
    blockedEditions:
      maxBlockedEditions === null ? blockedEditions : blockedEditions.slice(0, maxBlockedEditions),
  };
}
