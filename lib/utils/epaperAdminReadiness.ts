import type {
  EPaperArticleRecord,
  EPaperAutomationInfo,
  EPaperReadiness,
  EPaperRecord,
} from '@/lib/types/epaper';

export type MinimalEpaperRecord = {
  _id?: string;
  cityName?: string;
  citySlug?: string;
  pageCount: number;
  pages?: Array<{
    pageNumber?: number;
    imagePath?: string;
    width?: number;
    height?: number;
    pageType?: string;
    classificationNote?: string;
    processingStatus?: string;
    processingError?: string;
    reviewStatus?: string;
    reviewNote?: string;
    [key: string]: unknown;
  }> | EPaperRecord['pages'];
  pdfPath?: string;
  thumbnailPath?: string;
  sourceType?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  status?: string;
  productionStatus?: string;
  processingGeneration?: string;
  isStaleGeneration?: boolean;
};

type MinimalArticleRecord = Pick<
  EPaperArticleRecord,
  'pageNumber' | 'contentHtml' | 'excerpt' | 'coverImagePath'
>;

function uniqueSortedNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0))).sort(
    (left, right) => left - right
  );
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveSourceType(epaper: MinimalEpaperRecord): EPaperAutomationInfo['sourceType'] {
  const explicit = nonEmptyString(epaper.sourceType).toLowerCase();
  if (
    explicit === 'manual-upload' ||
    explicit === 'drive-import' ||
    explicit === 'remote-import' ||
    explicit === 'legacy'
  ) {
    return explicit;
  }

  const pdfPath = nonEmptyString(epaper.pdfPath);
  if (!pdfPath) return 'unknown';
  if (pdfPath.startsWith('/uploads/') || pdfPath.startsWith('/api/public/uploads/')) {
    return 'manual-upload';
  }
  if (/drive\.google\.com|docs\.google\.com/i.test(pdfPath)) {
    return 'drive-import';
  }
  if (/^https?:\/\//i.test(pdfPath)) {
    return 'legacy';
  }
  return 'manual-upload';
}

function getSourceHost(value: string) {
  if (!value) return '';

  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function isTrustedPdfAsset(pdfPath: string): boolean {
  const trimmed = nonEmptyString(pdfPath);
  if (!trimmed) return false;
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/public/uploads/')) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.digitaloceanspaces.com') ||
      hostname.endsWith('.cdn.digitaloceanspaces.com')
    ) {
      return true;
    }
    if (url.pathname.includes('/epapers/') || url.pathname.includes('/emagazines/')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function buildEpaperAutomationInfo(epaper: MinimalEpaperRecord): EPaperAutomationInfo {
  const sourceType = resolveSourceType(epaper);
  const sourceUrl = nonEmptyString(epaper.sourceUrl) || nonEmptyString(epaper.pdfPath);
  const pageImageGenerationEnabled =
    process.env.EPAPER_ENABLE_PAGE_IMAGE_GENERATION?.trim() === '1';
  const pdfPath = nonEmptyString(epaper.pdfPath);
  const pageImageGenerationAvailable =
    pageImageGenerationEnabled &&
    Boolean(pdfPath) &&
    !/^https?:\/\//i.test(pdfPath);

  let pageImageGenerationReason = '';
  if (!pageImageGenerationEnabled) {
    pageImageGenerationReason =
      'Enable EPAPER_ENABLE_PAGE_IMAGE_GENERATION=1 to allow server image generation.';
  } else if (!pdfPath) {
    pageImageGenerationReason = 'PDF asset is missing.';
  } else if (/^https?:\/\//i.test(pdfPath)) {
    pageImageGenerationReason =
      'This edition uses a remote/cloud PDF, so page images still need manual upload or re-ingestion.';
  }

  return {
    sourceType,
    sourceLabel: nonEmptyString(epaper.sourceLabel),
    sourceUrl,
    sourceHost: getSourceHost(sourceUrl),
    pageImageGenerationEnabled,
    pageImageGenerationAvailable,
    pageImageGenerationReason,
  };
}

export function buildEpaperReadiness(params: {
  epaper: MinimalEpaperRecord;
  articles: MinimalArticleRecord[];
}): EPaperReadiness {
  const { epaper, articles } = params;
  const pageCount = Math.max(1, Number(epaper.pageCount || 0) || (epaper.pages || []).length || 1);
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pageByNumber = new Map(
    (epaper.pages || []).map((page) => [Number(page.pageNumber || 0), page])
  );
  const editorialPageNumbers = pageNumbers.filter(
    (pageNumber) => (pageByNumber.get(pageNumber)?.pageType || 'editorial') === 'editorial'
  );
  const nonEditorialPageNumbers = pageNumbers.filter(
    (pageNumber) => !editorialPageNumbers.includes(pageNumber)
  );
  const imagePages = uniqueSortedNumbers(
    (epaper.pages || [])
      .filter((page) => Boolean(nonEmptyString(page.imagePath)))
      .map((page) => Number(page.pageNumber || 0))
  );

  const editorialArticles = articles.filter((article) =>
    editorialPageNumbers.includes(Number(article.pageNumber || 0))
  );
  const pagesWithHotspots = uniqueSortedNumbers(
    editorialArticles.map((article) => Number(article.pageNumber || 0))
  );
  const mappedArticles = editorialArticles.length;
  const articlesWithReadableText = editorialArticles.filter((article) => {
    return Boolean(nonEmptyString(article.contentHtml) || nonEmptyString(article.excerpt));
  }).length;

  const missingImagePages = pageNumbers.filter((pageNumber) => !imagePages.includes(pageNumber));
  const missingHotspotPages = editorialPageNumbers.filter(
    (pageNumber) =>
      imagePages.includes(pageNumber) && !pagesWithHotspots.includes(pageNumber)
  );
  const invalidBlankPages = pageNumbers.filter((pageNumber) => {
    const page = pageByNumber.get(pageNumber);
    return (
      page?.pageType === 'blank' &&
      !nonEmptyString(page.classificationNote || page.reviewNote)
    );
  });

  const pagesMissingImage = missingImagePages.length;
  const pagesMissingHotspots = missingHotspotPages.length;
  const pagesWithImage = imagePages.length;
  const articlesMissingReadableText = Math.max(0, mappedArticles - articlesWithReadableText);

  const existingPageNumbers = new Set(
    (epaper.pages || []).map((page) => Number(page.pageNumber || 0))
  );
  const missingPageEntries = pageNumbers.filter(
    (pageNumber) => !existingPageNumbers.has(pageNumber)
  );
  const failedPages = pageNumbers.filter((pageNumber) => {
    const page = pageByNumber.get(pageNumber);
    return page?.processingStatus === 'failed';
  });
  const processingPages = pageNumbers.filter((pageNumber) => {
    const page = pageByNumber.get(pageNumber);
    return page?.processingStatus === 'processing';
  });

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!nonEmptyString(epaper.thumbnailPath)) {
    blockers.push('Thumbnail is missing.');
  }
  if (!nonEmptyString(epaper.pdfPath)) {
    blockers.push('PDF file is missing.');
  } else if (!isTrustedPdfAsset(epaper.pdfPath || '')) {
    blockers.push('PDF asset is unverified or from an untrusted source.');
  }
  if (pagesMissingImage > 0) {
    blockers.push(
      `${pagesMissingImage} page image${pagesMissingImage === 1 ? ' is' : 's are'} missing.`
    );
  }
  if (missingPageEntries.length > 0) {
    blockers.push(
      `Page set has gaps or is incomplete (missing page ${missingPageEntries.join(', ')}).`
    );
  }
  if (failedPages.length > 0) {
    blockers.push(
      `Page${failedPages.length === 1 ? '' : 's'} ${failedPages.join(', ')} failed processing.`
    );
  }
  if (processingPages.length > 0) {
    blockers.push(
      `Page${processingPages.length === 1 ? '' : 's'} ${processingPages.join(', ')} still processing.`
    );
  }
  if (epaper.isStaleGeneration) {
    blockers.push('Processing generation is stale.');
  }
  if (epaper.productionStatus === 'processing') {
    blockers.push('Edition is currently processing.');
  }
  if (editorialPageNumbers.length > 0 && mappedArticles === 0) {
    warnings.push('No mapped stories have been added to editorial pages yet.');
  }
  if (pagesMissingHotspots > 0) {
    warnings.push(
      `${pagesMissingHotspots} page${pagesMissingHotspots === 1 ? '' : 's'} still ${
        pagesMissingHotspots === 1 ? 'has' : 'have'
      } no mapped hotspots.`
    );
  }
  if (articlesMissingReadableText > 0) {
    warnings.push(
      `${articlesMissingReadableText} mapped stor${
        articlesMissingReadableText === 1 ? 'y is' : 'ies are'
      } missing readable text or excerpt.`
    );
  }
  if (invalidBlankPages.length > 0) {
    blockers.push(
      `Blank page${invalidBlankPages.length === 1 ? '' : 's'} ${invalidBlankPages.join(
        ', '
      )} require a classification note.`
    );
  }

  return {
    assetReadiness: blockers.length ? 'not-ready' : 'ready',
    mappingReadiness: editorialPageNumbers.every((pageNumber) => pageByNumber.get(pageNumber)?.reviewStatus === 'ready') && articlesMissingReadableText === 0 && missingHotspotPages.length === 0 ? 'ready' : 'needs-review',
    status:
      blockers.length > 0 ? 'not-ready' : warnings.length > 0 ? 'needs-review' : 'ready',
    blockers,
    warnings,
    pageImageCoveragePercent: clampPercent((pagesWithImage / pageCount) * 100),
    hotspotCoveragePercent: clampPercent((pagesWithHotspots.length / pageCount) * 100),
    textCoveragePercent: clampPercent(
      mappedArticles > 0 ? (articlesWithReadableText / mappedArticles) * 100 : 0
    ),
    pagesWithImage,
    pagesMissingImage,
    pagesWithHotspots: pagesWithHotspots.length,
    pagesMissingHotspots,
    mappedArticles,
    articlesWithReadableText,
    articlesMissingReadableText,
    editorialPages: editorialPageNumbers.length,
    nonEditorialPages: nonEditorialPageNumbers.length,
    pagesReadyForPublish: pageCount,
    pagesPendingQa: 0,
    pagesNeedingAttention: 0,
    missingImagePages,
    missingHotspotPages,
    pendingQaPages: [],
    invalidBlankPages,
  };
}
