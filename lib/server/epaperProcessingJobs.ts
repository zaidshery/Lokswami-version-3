import 'server-only';

import crypto from 'crypto';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
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

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const LEASE_MS = 10 * 60_000;

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

function uniquePageNumbers(values: number[]) {
  return Array.from(
    new Set(
      values
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0 && value <= 1000)
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

export async function queueEpaperPageProcessing(input: {
  epaperId: string;
  pageNumbers: number[];
}) {
  const pageNumbers = uniquePageNumbers(input.pageNumbers);
  if (!pageNumbers.length) {
    throw new Error('At least one page is required for processing.');
  }

  await EPaperProcessingJob.updateMany(
    {
      epaperId: input.epaperId,
      kind: 'pdf_pages',
      status: { $in: ['queued', 'processing'] },
    },
    { status: 'cancelled', completedAt: new Date() }
  );

  return EPaperProcessingJob.create({
    epaperId: input.epaperId,
    kind: 'pdf_pages',
    status: 'queued',
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

async function claimJob() {
  const now = new Date();
  const leaseOwner = `epaper-worker-${process.pid}-${crypto.randomUUID()}`;
  return EPaperProcessingJob.findOneAndUpdate(
    {
      status: { $in: ['queued', 'processing'] },
      nextAttemptAt: { $lte: now },
      kind: 'pdf_pages',
      $or: [
        { status: 'queued' },
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $lte: now } },
      ],
    },
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

function buildPageObjectKey(epaper: {
  _id?: unknown;
  publicationType?: unknown;
  citySlug?: unknown;
  publishDate?: unknown;
  revisionNumber?: unknown;
}, pageNumber: number) {
  const publishDate = new Date(String(epaper.publishDate || ''));
  const dateFolder = Number.isNaN(publishDate.getTime())
    ? 'unknown-date'
    : publishDate.toISOString().slice(0, 10);
  const revisionFolder = `revision-${Math.max(
    1,
    Number(epaper.revisionNumber || 1)
  )}-${String(epaper._id || 'unknown')}`;
  const editionFolder =
    normalizeEPaperPublicationType(epaper.publicationType) === 'emagazine'
      ? 'emagazines'
      : 'epapers';
  const baseFolder = shouldUseGlobalPublicationScope(epaper.publicationType)
    ? `lokswami/${editionFolder}/${dateFolder}`
    : `lokswami/${editionFolder}/${String(epaper.citySlug || 'unknown')}/${dateFolder}`;

  return `${baseFolder}/${revisionFolder}/pages/${String(pageNumber).padStart(
    3,
    '0'
  )}-rendered.jpg`;
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

async function processClaimedJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>) {
  const startedAt = Date.now();
  const epaper = await EPaper.findById(job.epaperId).lean<Record<string, unknown> | null>();
  if (!epaper) {
    await EPaperProcessingJob.findByIdAndUpdate(job._id, {
      status: 'failed',
      lastError: 'E-paper not found.',
      completedAt: new Date(),
      leaseExpiresAt: null,
    });
    logEpaperMetric('conversion_failed', {
      jobId: String(job._id),
      epaperId: String(job.epaperId),
      reason: 'epaper_not_found',
      durationMs: Date.now() - startedAt,
    });
    return { jobId: String(job._id), status: 'failed', processed: 0, failed: 0 };
  }

  const pdfBuffer = await downloadVerifiedEpaperPdf(String(epaper.pdfPath || ''));
  const pages = normalizePages(epaper);
  let processed = 0;
  const failedPageNumbers: number[] = [];
  const failures: string[] = [];

  for (const pageNumber of job.pageNumbers) {
    const pageIndex = pages.findIndex((page) => page.pageNumber === pageNumber);
    if (pageIndex < 0) {
      failedPageNumbers.push(pageNumber);
      failures.push(`Page ${pageNumber}: page metadata is missing.`);
      continue;
    }

    pages[pageIndex] = {
      ...pages[pageIndex],
      processingStatus: 'processing',
      processingError: '',
    };
    await EPaper.findByIdAndUpdate(job.epaperId, { pages });

    try {
      const rendered = await renderPdfPageToJpeg({ pdfBuffer, pageNumber });
      const uploaded = await uploadBufferToDigitalOceanSpaces(rendered.buffer, {
        publicId: buildPageObjectKey(epaper, pageNumber),
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

      const automationUpdates = buildEpaperImageAutomationUpdates({
        pageCount: Number(epaper.pageCount || pages.length),
        pages,
        currentThumbnailPath: epaper.thumbnailPath,
        currentProductionStatus: epaper.productionStatus,
        currentStatus: epaper.status,
      });
      await EPaper.findByIdAndUpdate(job.epaperId, {
        pages,
        ...automationUpdates,
      });
      await queueEpaperOcr(String(job.epaperId), [pageNumber]).catch(() => {
        logEpaperMetric('ocr_queue_reconciliation_needed', { epaperId: String(job.epaperId), pageNumber });
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
        (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'PDF_WORKER_TIMEOUT');
      const isMemory =
        error instanceof PdfWorkerMemoryExceededError ||
        (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'PDF_WORKER_MEMORY_EXCEEDED');

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
      await EPaper.findByIdAndUpdate(job.epaperId, { pages });
    }
  }

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
    RETRY_DELAYS_MS[Math.min(Math.max(currentAttempt - 1, 0), RETRY_DELAYS_MS.length - 1)];

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
      },
    });
  }
  logEpaperMetric(shouldRetry ? 'conversion_retry_scheduled' : 'conversion_completed', {
    jobId: String(job._id),
    epaperId: String(job.epaperId),
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

export async function cleanupAbandonedEpaperUploads() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const abandoned = await EPaper.find({
    status: 'draft',
    productionStatus: 'draft_upload',
    pdfPath: { $in: ['', null] },
    createdAt: { $lt: cutoff },
  })
    .select('_id pdfPublicId')
    .lean();

  let deleted = 0;
  for (const epaper of abandoned) {
    const publicId = String(epaper.pdfPublicId || '').trim();
    if (publicId) {
      await deleteDigitalOceanSpacesAssetByPublicId(publicId, 'raw').catch(
        () => undefined
      );
    }
    await EPaperProcessingJob.deleteMany({ epaperId: epaper._id });
    const result = await EPaper.deleteOne({ _id: epaper._id, pdfPath: { $in: ['', null] } });
    deleted += result.deletedCount || 0;
  }

  return { checked: abandoned.length, deleted };
}
