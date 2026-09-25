import 'server-only';

import crypto from 'crypto';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { epaperRepository } from '@/lib/server/epaper/epaperRepository';
import {
  buildEpaperActivityMessage,
  recordEpaperActivity,
} from '@/lib/server/epaperActivity';
import {
  downloadVerifiedEpaperPdf,
  renderPdfPageToJpeg,
  PdfWorkerTimeoutError,
  PdfWorkerMemoryExceededError,
} from '@/lib/server/epaperPdfRenderer';
import { buildEpaperImageAutomationUpdates } from '@/lib/server/epaperImageAutomation';
import { logEpaperMetric } from '@/lib/server/epaperObservability';
import { uploadBufferToDigitalOceanSpaces } from '@/lib/utils/digitalOceanSpaces';
import { deleteDigitalOceanSpacesAssetByPublicId } from '@/lib/utils/digitalOceanSpaces';
import { normalizeEPaperPublicationType } from '@/lib/types/epaper';
import { shouldUseGlobalPublicationScope } from '@/lib/utils/epaperPublication';
import { withDistributedLock } from '@/lib/security/distributedLock';
import { queueEpaperOcr } from '@/lib/server/epaperOcrJobs';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import {
  EPAPER_PROCESSING_ERROR_CODES,
  EpaperProcessingError,
} from '@/lib/server/epaperProcessingErrors';

export { EPAPER_PROCESSING_ERROR_CODES, EpaperProcessingError };

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
export const LEASE_MS = 10 * 60_000;
export const EPAPER_MAX_PAGES = 1000;

export function isEpaperBackgroundProcessingEnabled(citySlug?: string) {
  if (process.env.EPAPER_BACKGROUND_PROCESSING_ENABLED?.trim() === '0') {
    return false;
  }
  const allowlist = String(
    process.env.EPAPER_BACKGROUND_PROCESSING_CITY_ALLOWLIST || ''
  )
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return (
    allowlist.length === 0 ||
    !citySlug ||
    allowlist.includes(citySlug.trim().toLowerCase())
  );
}

export function uniquePageNumbers(values: number[]) {
  return Array.from(
    new Set(
      values
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0 && value <= EPAPER_MAX_PAGES)
    )
  ).sort((left, right) => left - right);
}

export function resolveRetryableEpaperPageNumbers(
  pages: Array<{
    pageNumber?: unknown;
    imagePath?: unknown;
    processingStatus?: unknown;
  }>,
  requested: number[] = []
) {
  const retryable = new Set(
    pages
      .filter(
        (page) =>
          !String(page.imagePath || '').trim() ||
          page.processingStatus === 'failed'
      )
      .map((page) => Number(page.pageNumber || 0))
      .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0)
  );
  const normalizedRequested = uniquePageNumbers(requested);
  return normalizedRequested.length
    ? normalizedRequested.filter((pageNumber) => retryable.has(pageNumber))
    : Array.from(retryable).sort((left, right) => left - right);
}

export function buildPageObjectKey(
  epaper: {
    _id?: unknown;
    publicationType?: unknown;
    citySlug?: unknown;
    publishDate?: unknown;
    revisionNumber?: unknown;
  },
  pageNumber: number
): string {
  const normalizedPage = Math.floor(Number(pageNumber || 0));
  if (normalizedPage <= 0 || normalizedPage > EPAPER_MAX_PAGES) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.PAGE_SEQUENCE_INVALID,
      `Invalid page number ${pageNumber} for derived asset key.`
    );
  }

  const epaperId = String(epaper._id || '').trim();
  if (!epaperId || epaperId === 'unknown') {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID,
      'E-paper ID is required for derived asset key.'
    );
  }

  const revisionNumber = Math.max(1, Number(epaper.revisionNumber || 1));
  const publishDate = new Date(String(epaper.publishDate || ''));
  const dateFolder = Number.isNaN(publishDate.getTime())
    ? 'unknown-date'
    : publishDate.toISOString().slice(0, 10);
  const cleanCitySlug = String(epaper.citySlug || 'unknown')
    .replace(/[^a-z0-9_-]/gi, '')
    .toLowerCase();
  const revisionFolder = `revision-${revisionNumber}-${epaperId}`;
  const editionFolder =
    normalizeEPaperPublicationType(epaper.publicationType) === 'emagazine'
      ? 'emagazines'
      : 'epapers';
  const baseFolder = shouldUseGlobalPublicationScope(epaper.publicationType)
    ? `lokswami/${editionFolder}/${dateFolder}`
    : `lokswami/${editionFolder}/${cleanCitySlug || 'unknown'}/${dateFolder}`;

  const key = `${baseFolder}/${revisionFolder}/pages/${String(normalizedPage).padStart(
    3,
    '0'
  )}-rendered.jpg`;

  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID,
      'Derived asset key contains illegal path traversal sequences.'
    );
  }

  return key;
}

export function assertValidDerivedPageKey(
  key: string,
  expectedEpaperId: string,
  expectedRevisionNumber: number,
  expectedPageNumber: number
): void {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID,
      'Derived asset key is required.'
    );
  }
  if (
    normalizedKey.includes('..') ||
    normalizedKey.startsWith('/') ||
    normalizedKey.includes('\\')
  ) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID,
      'Derived asset key contains illegal path traversal characters.'
    );
  }
  const revisionMarker = `revision-${expectedRevisionNumber}-${expectedEpaperId}`;
  if (!normalizedKey.includes(revisionMarker)) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID,
      `Derived asset key does not match revision folder ${revisionMarker}.`
    );
  }
  const pageMarker = `/pages/${String(expectedPageNumber).padStart(3, '0')}-rendered.jpg`;
  if (!normalizedKey.endsWith(pageMarker)) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID,
      `Derived asset key does not match page file ${pageMarker}.`
    );
  }
}

export async function queueEpaperPageProcessing(input: {
  epaperId: string;
  pageNumbers: number[];
}) {
  const epaper = await EPaper.findById(input.epaperId).lean<Record<string, unknown> | null>();
  if (!epaper) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.SOURCE_INVALID,
      'E-paper not found.'
    );
  }

  // Enforce draft immutability: published or archived cannot be processed
  assertEpaperDraftEditable(epaper);

  const expectedPageCount = Math.floor(Number(epaper.pageCount || 0));
  if (expectedPageCount <= 0 || expectedPageCount > EPAPER_MAX_PAGES) {
    throw new EpaperProcessingError(
      EPAPER_PROCESSING_ERROR_CODES.PAGE_COUNT_INVALID,
      `Invalid e-paper page count: ${expectedPageCount}. Must be between 1 and ${EPAPER_MAX_PAGES}.`
    );
  }

  const pageNumbers = uniquePageNumbers(input.pageNumbers);
  if (!pageNumbers.length) {
    throw new Error('At least one page is required for processing.');
  }

  for (const pageNumber of pageNumbers) {
    if (pageNumber > expectedPageCount) {
      throw new EpaperProcessingError(
        EPAPER_PROCESSING_ERROR_CODES.PAGE_SEQUENCE_INVALID,
        `Page number ${pageNumber} exceeds edition page count ${expectedPageCount}.`
      );
    }
  }

  const generation = crypto.randomUUID();
  const revisionNumber = Math.max(1, Number(epaper.revisionNumber || 1));
  const sourceKey = String(epaper.pdfPublicId || epaper.pdfPath || '');

  // Atomically set new generation on the edition document
  await EPaper.findByIdAndUpdate(input.epaperId, {
    processingGeneration: generation,
  });

  // Cancel prior active jobs for this edition
  await EPaperProcessingJob.updateMany(
    {
      epaperId: input.epaperId,
      kind: 'pdf_pages',
      status: { $in: ['queued', 'processing'] },
    },
    {
      status: 'cancelled',
      completedAt: new Date(),
      leaseOwner: '',
      leaseExpiresAt: null,
    }
  );

  return EPaperProcessingJob.create({
    epaperId: input.epaperId,
    kind: 'pdf_pages',
    status: 'queued',
    generation,
    revisionNumber,
    sourceKey,
    pageNumbers,
    totalItems: pageNumbers.length,
    processedItems: 0,
    failedItems: 0,
    failedPageNumbers: [],
    attemptCount: 0,
    maxAttempts: 4,
    nextAttemptAt: new Date(),
  });
}

export async function claimJob(options: { jobId?: string; workerId?: string } = {}) {
  const now = new Date();
  const leaseOwner = options.workerId || `epaper-worker-${process.pid}-${crypto.randomUUID()}`;
  const query: Record<string, unknown> = {
    kind: 'pdf_pages',
    status: { $in: ['queued', 'processing'] },
    nextAttemptAt: { $lte: now },
    $or: [
      { status: 'queued' },
      { leaseExpiresAt: null },
      { leaseExpiresAt: { $lte: now } },
    ],
  };
  if (options.jobId) {
    query._id = options.jobId;
  }
  return EPaperProcessingJob.findOneAndUpdate(
    query,
    {
      status: 'processing',
      leaseOwner,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      startedAt: now,
      $inc: { attemptCount: 1 },
    },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
  );
}

type ProcessingPage = {
  pageNumber: number;
  imagePath: string;
  width?: number;
  height?: number;
  pageType: string;
  classificationNote: string;
  processingStatus: string;
  processingError: string;
  processedAt?: Date | null;
  reviewStatus: string;
  reviewNote: string;
  reviewedAt?: Date | null;
  reviewedBy?: unknown;
} & Record<string, unknown>;

function normalizePages(epaper: {
  pageCount?: unknown;
  pages?: unknown;
}): ProcessingPage[] {
  const pageCount = Math.max(1, Number(epaper.pageCount || 0));
  const existing = Array.isArray(epaper.pages) ? epaper.pages : [];
  const byNumber = new Map(
    existing.map((entry) => {
      const page =
        typeof entry === 'object' && entry ? (entry as Record<string, unknown>) : {};
      return [Number(page.pageNumber || 0), page] as const;
    })
  );

  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const current = byNumber.get(pageNumber) || {};
    return {
      ...current,
      pageNumber,
      imagePath: String(current.imagePath || ''),
      width: Number(current.width || 0) || undefined,
      height: Number(current.height || 0) || undefined,
      pageType: String(current.pageType || 'editorial'),
      classificationNote: String(current.classificationNote || ''),
      processingStatus: String(current.processingStatus || 'pending'),
      processingError: String(current.processingError || ''),
      reviewStatus: String(current.reviewStatus || 'pending'),
      reviewNote: String(current.reviewNote || ''),
    } satisfies ProcessingPage;
  });
}

export async function processClaimedJob(
  job: NonNullable<Awaited<ReturnType<typeof claimJob>>>
) {
  const startedAt = Date.now();

  const abortStaleJob = async (
    reason: string,
    finalStatus: 'cancelled' | 'failed' = 'cancelled'
  ) => {
    await EPaperProcessingJob.findByIdAndUpdate(job._id, {
      status: finalStatus,
      lastError: reason,
      completedAt: new Date(),
      leaseOwner: '',
      leaseExpiresAt: null,
    });
    logEpaperMetric('conversion_stale_aborted', {
      jobId: String(job._id),
      epaperId: String(job.epaperId),
      reason,
      durationMs: Date.now() - startedAt,
    });
    return { jobId: String(job._id), status: finalStatus, processed: 0, failed: 0 };
  };

  // 1. Initial verification of the canonical edition
  const epaper = await EPaper.findById(job.epaperId).lean<Record<string, unknown> | null>();
  if (!epaper) {
    return abortStaleJob('EPAPER_SOURCE_INVALID: E-paper not found.', 'failed');
  }

  // 2. Draft immutability: published or archived editions can NEVER be modified
  const currentStatus = String(epaper.status || '').toLowerCase();
  const currentProductionStatus = String(epaper.productionStatus || '').toLowerCase();
  if (
    currentStatus === 'published' ||
    currentProductionStatus === 'published' ||
    currentStatus === 'archived' ||
    currentProductionStatus === 'archived'
  ) {
    return abortStaleJob(
      'EPAPER_EDITION_IMMUTABLE: Edition is published or archived and cannot be processed.'
    );
  }

  // 3. Stale worker protection: Generation verification
  if (
    job.generation &&
    epaper.processingGeneration &&
    epaper.processingGeneration !== job.generation
  ) {
    return abortStaleJob(
      'EPAPER_PROCESSING_STALE: Processing generation was superseded by a newer attempt.'
    );
  }

  // 4. Stale worker protection: Revision verification
  const epaperRevision = Math.max(1, Number(epaper.revisionNumber || 1));
  const jobRevision = Math.max(1, Number(job.revisionNumber || 1));
  if (job.revisionNumber && epaperRevision !== jobRevision) {
    return abortStaleJob(
      'EPAPER_PROCESSING_STALE: Edition revision was superseded.'
    );
  }

  // 5. Source PDF verification
  const canonicalSourceKey = String(epaper.pdfPublicId || '');
  if (job.sourceKey && canonicalSourceKey && canonicalSourceKey !== job.sourceKey) {
    return abortStaleJob('EPAPER_PROCESSING_STALE: Source PDF was replaced.');
  }

  // 6. Source PDF trust (3.9A invariant: no SSRF, validated Spaces URL, 25MB limit, %PDF- signature)
  const pdfPath = String(epaper.pdfPath || '');
  if (!pdfPath) {
    return abortStaleJob('EPAPER_SOURCE_INVALID: Edition has no source PDF path.', 'failed');
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await downloadVerifiedEpaperPdf(pdfPath);
  } catch (downloadErr) {
    const message = downloadErr instanceof Error ? downloadErr.message : 'PDF download failed.';
    await EPaperProcessingJob.findByIdAndUpdate(job._id, {
      status: 'failed',
      lastError: `EPAPER_SOURCE_INVALID: ${message}`,
      completedAt: new Date(),
      leaseOwner: '',
      leaseExpiresAt: null,
    });
    logEpaperMetric('conversion_failed', {
      jobId: String(job._id),
      epaperId: String(job.epaperId),
      reason: 'download_failed',
      message,
      durationMs: Date.now() - startedAt,
    });
    return {
      jobId: String(job._id),
      status: 'failed',
      processed: 0,
      failed: job.pageNumbers.length,
    };
  }

  // 7. Page count & ordering validation
  const expectedPageCount = Math.floor(Number(epaper.pageCount || 0));
  if (expectedPageCount <= 0 || expectedPageCount > EPAPER_MAX_PAGES) {
    return abortStaleJob(
      `EPAPER_PAGE_COUNT_INVALID: Expected page count is invalid (${expectedPageCount}).`,
      'failed'
    );
  }

  const pages = normalizePages(epaper);
  let processed = 0;
  const failedPageNumbers: number[] = [];
  const failures: string[] = [];

  // 8. Sequential page rendering with continuous claim & generation re-verification
  for (const pageNumber of job.pageNumbers) {
    // Re-verify that this worker still holds the lease in Mongo
    const activeJob = await EPaperProcessingJob.findOne({
      _id: job._id,
      status: 'processing',
      leaseOwner: job.leaseOwner,
      leaseExpiresAt: { $gt: new Date() },
    }).lean();

    if (!activeJob) {
      logEpaperMetric('conversion_stale_aborted', {
        jobId: String(job._id),
        epaperId: String(job.epaperId),
        reason: 'lease_lost_or_cancelled',
        pageNumber,
      });
      return {
        jobId: String(job._id),
        status: 'cancelled',
        processed,
        failed: failedPageNumbers.length,
      };
    }

    // Re-verify that the edition has not been superseded or published
    const freshEdition = await EPaper.findById(job.epaperId)
      .select('status productionStatus processingGeneration revisionNumber')
      .lean<Record<string, unknown> | null>();

    if (
      !freshEdition ||
      freshEdition.status !== 'draft' ||
      freshEdition.productionStatus === 'archived'
    ) {
      logEpaperMetric('conversion_stale_aborted', {
        jobId: String(job._id),
        epaperId: String(job.epaperId),
        reason: 'edition_superseded_or_immutable',
        pageNumber,
      });
      return {
        jobId: String(job._id),
        status: 'cancelled',
        processed,
        failed: failedPageNumbers.length,
      };
    }

    if (
      job.generation &&
      freshEdition.processingGeneration &&
      freshEdition.processingGeneration !== job.generation
    ) {
      logEpaperMetric('conversion_stale_aborted', {
        jobId: String(job._id),
        epaperId: String(job.epaperId),
        reason: 'generation_superseded_mid_flight',
        pageNumber,
      });
      return {
        jobId: String(job._id),
        status: 'cancelled',
        processed,
        failed: failedPageNumbers.length,
      };
    }

    const pageIndex = pages.findIndex((page) => page.pageNumber === pageNumber);
    if (pageIndex < 0 || pageNumber > expectedPageCount) {
      failedPageNumbers.push(pageNumber);
      failures.push(`Page ${pageNumber}: page metadata is missing or out of bounds.`);
      continue;
    }

    pages[pageIndex] = {
      ...pages[pageIndex],
      processingStatus: 'processing',
      processingError: '',
    };
    await EPaper.updateOne(
      {
        _id: job.epaperId,
        status: 'draft',
        ...(job.generation ? { processingGeneration: job.generation } : {}),
      },
      { pages }
    );

    try {
      const rendered = await renderPdfPageToJpeg({ pdfBuffer, pageNumber });
      const objectKey = buildPageObjectKey(epaper, pageNumber);
      assertValidDerivedPageKey(
        objectKey,
        String(epaper._id),
        epaperRevision,
        pageNumber
      );

      const uploaded = await uploadBufferToDigitalOceanSpaces(rendered.buffer, {
        publicId: objectKey,
        resourceType: 'image',
        overwrite: true,
        originalFilename: `${pageNumber}.jpg`,
      });

      pages[pageIndex] = {
        ...pages[pageIndex],
        imagePath: uploaded.secureUrl,
        width: rendered.width,
        height: rendered.height,
        processingStatus: 'ready',
        processingError: '',
        processedAt: new Date(),
        reviewStatus: 'pending',
        reviewedAt: null,
        reviewedBy: null,
      };
      processed += 1;

      // Atomic conditional update on EPaper: only update if still in same draft generation
      const updateFilter: Record<string, unknown> = {
        _id: job.epaperId,
        status: 'draft',
      };
      if (job.generation) {
        updateFilter.processingGeneration = job.generation;
      }

      const updateResult = await EPaper.updateOne(updateFilter, { pages });
      if (updateResult.matchedCount === 0) {
        // Generation was superseded! Abort immediately
        logEpaperMetric('conversion_stale_aborted', {
          jobId: String(job._id),
          epaperId: String(job.epaperId),
          reason: 'edition_atomic_match_failed',
          pageNumber,
        });
        return {
          jobId: String(job._id),
          status: 'cancelled',
          processed,
          failed: failedPageNumbers.length,
        };
      }

      await queueEpaperOcr(String(job.epaperId), [pageNumber]).catch(() => {
        logEpaperMetric('ocr_queue_reconciliation_needed', {
          epaperId: String(job.epaperId),
          pageNumber,
        });
      });

      await EPaperProcessingJob.findByIdAndUpdate(job._id, {
        processedItems: processed,
        failedItems: failedPageNumbers.length,
        failedPageNumbers,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Page render failed.';
      const isTimeout =
        error instanceof PdfWorkerTimeoutError ||
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code: unknown }).code === 'PDF_WORKER_TIMEOUT');
      const isMemory =
        error instanceof PdfWorkerMemoryExceededError ||
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code: unknown }).code === 'PDF_WORKER_MEMORY_EXCEEDED');

      if (isTimeout || isMemory) {
        logEpaperMetric('conversion_failed', {
          jobId: String(job._id),
          epaperId: String(job.epaperId),
          pageNumber,
          reason: isTimeout ? 'timeout' : 'memory_exceeded',
          message,
        });
      }

      failedPageNumbers.push(pageNumber);
      failures.push(`Page ${pageNumber}: ${message}`);
      pages[pageIndex] = {
        ...pages[pageIndex],
        processingStatus: 'failed',
        processingError: message,
      };
      await EPaper.updateOne({ _id: job.epaperId, status: 'draft' }, { pages });
    }
  }

  // 9. Post-loop Integrity & Readiness Check (Tasks 8, 9, 11, 12)
  // Ensure strict page order 1..expectedPageCount, no duplicates, no gaps
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const pageNumbersSet = new Set(sortedPages.map((p) => p.pageNumber));
  const hasExactSequence =
    sortedPages.length === expectedPageCount &&
    pageNumbersSet.size === expectedPageCount &&
    sortedPages.every((p, idx) => p.pageNumber === idx + 1);

  const allPagesReady =
    hasExactSequence &&
    sortedPages.every(
      (p) =>
        p.processingStatus === 'ready' &&
        String(p.imagePath || '').trim().length > 0
    );

  if (allPagesReady) {
    const automationUpdates = buildEpaperImageAutomationUpdates({
      pageCount: expectedPageCount,
      pages: sortedPages,
      currentThumbnailPath: epaper.thumbnailPath,
      currentProductionStatus: epaper.productionStatus,
      currentStatus: epaper.status,
    });

    const updateFilter: Record<string, unknown> = {
      _id: job.epaperId,
      status: 'draft',
    };
    if (job.generation) {
      updateFilter.processingGeneration = job.generation;
    }

    await EPaper.updateOne(updateFilter, {
      pages: sortedPages,
      ...automationUpdates,
    });
  }

  // 10. Update EPaperProcessingJob status
  const currentAttempt = Number(job.attemptCount || 1);
  const shouldRetry =
    failedPageNumbers.length > 0 && currentAttempt < Number(job.maxAttempts || 4);
  const finalStatus = shouldRetry
    ? 'queued'
    : failedPageNumbers.length > 0
      ? processed > 0
        ? 'completed_with_errors'
        : 'failed'
      : 'completed';
  const delay =
    RETRY_DELAYS_MS[
      Math.min(Math.max(currentAttempt - 1, 0), RETRY_DELAYS_MS.length - 1)
    ];

  await EPaperProcessingJob.findByIdAndUpdate(job._id, {
    status: finalStatus,
    pageNumbers: shouldRetry ? failedPageNumbers : job.pageNumbers,
    totalItems: shouldRetry ? failedPageNumbers.length : job.totalItems,
    processedItems: processed,
    failedItems: failedPageNumbers.length,
    failedPageNumbers,
    lastError: failures.join('\n'),
    nextAttemptAt: shouldRetry ? new Date(Date.now() + delay) : new Date(),
    leaseOwner: '',
    leaseExpiresAt: null,
    completedAt: shouldRetry ? null : new Date(),
  });

  if (!shouldRetry) {
    await recordEpaperActivity({
      epaperId: String(job.epaperId),
      action:
        failedPageNumbers.length > 0
          ? 'pdf_processing_failed'
          : 'pdf_processing_completed',
      message: buildEpaperActivityMessage({
        action:
          failedPageNumbers.length > 0
            ? 'pdf_processing_failed'
            : 'pdf_processing_completed',
      }),
      metadata: {
        backgroundJob: true,
        processed,
        failedPageNumbers,
        generation: job.generation,
      },
    });
  }

  logEpaperMetric(shouldRetry ? 'conversion_retry_scheduled' : 'conversion_completed', {
    jobId: String(job._id),
    epaperId: String(job.epaperId),
    generation: job.generation,
    attempt: currentAttempt,
    processedPages: processed,
    failedPages: failedPageNumbers.length,
    failedPageNumbers,
    durationMs: Date.now() - startedAt,
  });

  return {
    jobId: String(job._id),
    status: finalStatus,
    processed,
    failed: failedPageNumbers.length,
  };
}

export async function processQueuedEpaperJobs(options: { limit?: number } = {}) {
  if (!isEpaperBackgroundProcessingEnabled()) {
    return { claimed: 0, results: [], paused: true };
  }

  try {
    return await withDistributedLock(
      'lock:epaper-job-worker',
      async () => {
        const limit = Math.min(Math.max(Number(options.limit || 1), 1), 5);
        const results = [];

        for (let index = 0; index < limit; index += 1) {
          const job = await claimJob();
          if (!job) break;
          try {
            results.push(await processClaimedJob(job));
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Processing failed.';
            const currentAttempt = Number(job.attemptCount || 1);
            const shouldRetry = currentAttempt < Number(job.maxAttempts || 4);
            const delay =
              RETRY_DELAYS_MS[
                Math.min(Math.max(currentAttempt - 1, 0), RETRY_DELAYS_MS.length - 1)
              ];
            await EPaperProcessingJob.findByIdAndUpdate(job._id, {
              status: shouldRetry ? 'queued' : 'failed',
              nextAttemptAt: shouldRetry ? new Date(Date.now() + delay) : new Date(),
              lastError: message,
              leaseOwner: '',
              leaseExpiresAt: null,
              completedAt: shouldRetry ? null : new Date(),
            });
            results.push({
              jobId: String(job._id),
              status: shouldRetry ? 'queued' : 'failed',
              processed: 0,
              failed: job.pageNumbers.length,
            });
            logEpaperMetric(
              shouldRetry ? 'conversion_retry_scheduled' : 'conversion_failed',
              {
                jobId: String(job._id),
                epaperId: String(job.epaperId),
                generation: job.generation,
                attempt: currentAttempt,
                failedPages: job.pageNumbers.length,
                reason: message,
              }
            );
          }
        }

        return {
          claimed: results.length,
          results,
          paused: false,
        };
      },
      120
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Could not acquire distributed lock')
    ) {
      return { claimed: 0, results: [], paused: false, locked: true };
    }
    throw error;
  }
}

export type AbandonedCleanupOptions = {
  now?: Date;
  dryRun?: boolean;
  maxAgeMs?: number;
};

export function isAbandonedDraftCandidate(
  epaper: {
    status?: string;
    productionStatus?: string;
    pdfPath?: string | null;
    isCurrentRevision?: boolean;
    createdAt?: Date | string | null;
  },
  context: {
    now?: Date;
    maxAgeMs?: number;
    hasActiveJobs?: boolean;
  } = {}
): boolean {
  if (epaper.status !== 'draft') return false;
  if (epaper.productionStatus !== 'draft_upload') return false;
  if (epaper.isCurrentRevision === true) return false;
  if (epaper.pdfPath && String(epaper.pdfPath).trim() !== '') return false;
  if (context.hasActiveJobs) return false;

  const createdAt = epaper.createdAt ? new Date(epaper.createdAt).getTime() : 0;
  if (!createdAt || Number.isNaN(createdAt)) return false;

  const now = context.now ? context.now.getTime() : Date.now();
  const maxAge = context.maxAgeMs ?? 24 * 60 * 60 * 1000;
  return now - createdAt >= maxAge;
}

export async function cleanupAbandonedEpaperUploads(
  options: AbandonedCleanupOptions = {}
) {
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - maxAgeMs);

  return withDistributedLock(
    'epaper-abandoned-draft-sweeper',
    async () => {
      logEpaperMetric('epaper_cleanup_started', {
        type: 'abandoned_draft_sweep',
        cutoff: cutoff.toISOString(),
        dryRun: Boolean(options.dryRun),
      });

      const candidates = await EPaper.find({
        status: 'draft',
        productionStatus: 'draft_upload',
        isCurrentRevision: { $ne: true },
        pdfPath: { $in: ['', null] },
        createdAt: { $lte: cutoff },
      })
        .select('_id pdfPublicId thumbnailPath createdAt')
        .lean();

      const eligible: Array<{ _id: unknown; pdfPublicId?: string; thumbnailPath?: string }> = [];
      for (const epaper of candidates) {
        const activeJobs = await EPaperProcessingJob.countDocuments({
          epaperId: epaper._id,
          status: { $in: ['queued', 'processing'] },
        });
        if (activeJobs > 0) continue;

        if (
          isAbandonedDraftCandidate(epaper, {
            now,
            maxAgeMs,
            hasActiveJobs: false,
          })
        ) {
          eligible.push(epaper);
        }
      }

      if (options.dryRun) {
        return {
          checked: candidates.length,
          eligible: eligible.length,
          deleted: 0,
          dryRun: true,
        };
      }

      let deleted = 0;
      for (const epaper of eligible) {
        const publicId = String(epaper.pdfPublicId || '').trim();
        if (publicId) {
          const isReferenced =
            await epaperRepository.isAssetReferencedElsewhere(
              publicId,
              String(epaper._id)
            );
          if (!isReferenced) {
            await deleteDigitalOceanSpacesAssetByPublicId(
              publicId,
              'raw'
            ).catch(() => undefined);
          }
        }
        await EPaperProcessingJob.deleteMany({ epaperId: epaper._id });
        await EPaperOcrSuggestion.deleteMany({ epaperId: epaper._id });
        const result = await EPaper.deleteOne({
          _id: epaper._id,
          pdfPath: { $in: ['', null] },
          status: 'draft',
        });
        deleted += result.deletedCount || 0;
      }

      logEpaperMetric('epaper_cleanup_completed', {
        type: 'abandoned_draft_sweep',
        checked: candidates.length,
        deleted,
      });

      return {
        checked: candidates.length,
        eligible: eligible.length,
        deleted,
      };
    },
    60
  ).catch((error) => {
    if (
      error instanceof Error &&
      error.message.includes('Could not acquire distributed lock')
    ) {
      return { checked: 0, eligible: 0, deleted: 0, locked: true };
    }
    logEpaperMetric('epaper_cleanup_failed', {
      type: 'abandoned_draft_sweep',
      error: error instanceof Error ? error.message : 'Unknown cleanup error',
    });
    throw error;
  });
}
