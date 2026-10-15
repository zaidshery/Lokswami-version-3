import type { EPaperArticleRecord, EPaperPageData } from '@/lib/types/epaper';
import {
  buildEpaperReadiness,
  type MinimalEpaperRecord,
} from '@/lib/utils/epaperAdminReadiness';

export type EPaperPageQualityLevel = 'good' | 'watch' | 'critical';

export type EPaperPageQualitySignal = {
  level: EPaperPageQualityLevel;
  label: string;
  issues: string[];
  mappedStories: number;
  readableStories: number;
  unreadableStories: number;
  textCoveragePercent: number;
};

export type EPaperEditionQualitySummary = {
  pageSignals: Array<{
    pageNumber: number;
    page: EPaperPageData | null;
    quality: EPaperPageQualitySignal;
  }>;
  counts: {
    good: number;
    watch: number;
    critical: number;
    lowTextPages: number;
    pendingQa: number;
    needsAttentionQa: number;
    readyQa: number;
  };
  publishBlockers: string[];
};

export type EPaperEditionQualitySummaryInput = {
  pageCount: number;
  pages: EPaperPageData[];
  articles: EPaperArticleRecord[];
  epaper?: MinimalEpaperRecord | Partial<MinimalEpaperRecord> | Record<string, unknown> | null;
  readinessBlockers?: string[];
  thumbnailPath?: string;
  pdfPath?: string;
  isStaleGeneration?: boolean;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasReadableText(article: Pick<EPaperArticleRecord, 'contentHtml' | 'excerpt'>) {
  return Boolean(String(article.contentHtml || '').trim() || String(article.excerpt || '').trim());
}

export function getEpaperPageQualityTone(level: EPaperPageQualityLevel) {
  switch (level) {
    case 'good':
      return 'bg-emerald-100 text-emerald-700';
    case 'critical':
      return 'bg-red-100 text-red-700';
    case 'watch':
    default:
      return 'bg-amber-100 text-amber-700';
  }
}

export function buildEpaperPageQualitySignal(input: {
  pageNumber: number;
  page: EPaperPageData | null | undefined;
  articles: EPaperArticleRecord[];
}): EPaperPageQualitySignal {
  const { page, articles } = input;
  const pageType = page?.pageType || 'editorial';
  const requiresStories = pageType === 'editorial';
  const mappedStories = articles.length;
  const readableStories = articles.filter((article) => hasReadableText(article)).length;
  const unreadableStories = Math.max(0, mappedStories - readableStories);
  const textCoveragePercent = clampPercent(
    mappedStories > 0 ? (readableStories / mappedStories) * 100 : 0
  );

  const issues: string[] = [];
  let level: EPaperPageQualityLevel = 'good';

  if (!page?.imagePath) {
    return {
      level: 'critical',
      label: 'Image Missing',
      issues: ['Page image is missing.'],
      mappedStories,
      readableStories,
      unreadableStories,
      textCoveragePercent,
    };
  }

  if (requiresStories && mappedStories === 0) {
    level = 'critical';
    issues.push('No hotspots mapped yet.');
  }

  if (requiresStories && mappedStories > 0 && readableStories === 0) {
    level = 'critical';
    issues.push('All mapped stories still lack readable text.');
  } else if (unreadableStories > 0) {
    if (level !== 'critical') {
      level = textCoveragePercent < 60 ? 'critical' : 'watch';
    }
    issues.push(
      `${unreadableStories} mapped stor${unreadableStories === 1 ? 'y still lacks' : 'ies still lack'} readable text.`
    );
  }

  if (
    pageType === 'blank' &&
    !String(page.classificationNote || page.reviewNote || '').trim()
  ) {
    level = 'critical';
    issues.push('Blank pages require a classification note.');
  }

  const label =
    level === 'good'
      ? 'Healthy'
      : level === 'critical'
        ? 'Needs Recheck'
        : 'Watch';

  return {
    level,
    label,
    issues,
    mappedStories,
    readableStories,
    unreadableStories,
    textCoveragePercent,
  };
}

export function buildEpaperEditionQualitySummary(
  input: EPaperEditionQualitySummaryInput
): EPaperEditionQualitySummary {
  const { pageCount, pages, articles } = input;
  const normalizedPageCount = Math.max(1, pageCount || pages.length || 1);
  const pageSignals = Array.from({ length: normalizedPageCount }, (_, index) => {
    const pageNumber = index + 1;
    const page = pages.find((entry) => entry.pageNumber === pageNumber) || null;
    const pageArticles = articles.filter((article) => Number(article.pageNumber || 0) === pageNumber);

    return {
      pageNumber,
      page,
      quality: buildEpaperPageQualitySignal({
        pageNumber,
        page,
        articles: pageArticles,
      }),
    };
  });

  const counts = pageSignals.reduce(
    (summary, entry) => {
      summary[entry.quality.level] += 1;
      if (entry.quality.unreadableStories > 0) {
        summary.lowTextPages += 1;
      }

      const reviewStatus = entry.page?.reviewStatus || 'pending';
      if (reviewStatus === 'ready') {
        summary.readyQa += 1;
      } else if (reviewStatus === 'needs_attention') {
        summary.needsAttentionQa += 1;
      } else {
        summary.pendingQa += 1;
      }

      return summary;
    },
    {
      good: 0,
      watch: 0,
      critical: 0,
      lowTextPages: 0,
      pendingQa: 0,
      needsAttentionQa: 0,
      readyQa: 0,
    }
  );

  let publishBlockers: string[] = [];
  if (input.readinessBlockers) {
    publishBlockers = [...input.readinessBlockers];
  } else {
    const epaperRecord: MinimalEpaperRecord = {
      _id: String(input.epaper?._id || ''),
      cityName: String(input.epaper?.cityName || ''),
      citySlug: String(input.epaper?.citySlug || ''),
      pageCount: normalizedPageCount,
      pages: (input.epaper?.pages || pages) as MinimalEpaperRecord['pages'],
      pdfPath: String(input.epaper?.pdfPath ?? input.pdfPath ?? ''),
      thumbnailPath: String(input.epaper?.thumbnailPath ?? input.thumbnailPath ?? ''),
      sourceType: typeof input.epaper?.sourceType === 'string' ? input.epaper.sourceType : undefined,
      sourceLabel: typeof input.epaper?.sourceLabel === 'string' ? input.epaper.sourceLabel : undefined,
      sourceUrl: typeof input.epaper?.sourceUrl === 'string' ? input.epaper.sourceUrl : undefined,
      isStaleGeneration: Boolean(input.epaper?.isStaleGeneration ?? input.isStaleGeneration),
    };
    const readiness = buildEpaperReadiness({
      epaper: epaperRecord,
      articles,
    });
    publishBlockers = [...readiness.blockers];
  }

  return {
    pageSignals,
    counts,
    publishBlockers,
  };
}
