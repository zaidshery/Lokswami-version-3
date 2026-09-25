import crypto from 'node:crypto';
import mongoose from 'mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { loadTrustedEpaperImage } from '@/lib/server/epaperShareImage';
import {
  LOCAL_OCR_ENGINE_VERSION,
  runIsolatedLocalOcr,
} from '@/lib/server/epaperLocalOcr';
import { logEpaperMetric } from '@/lib/server/epaperObservability';

type SourcePage = {
  pageNumber: number;
  imagePath?: string;
  processedAt?: unknown;
  processingStatus?: string;
  pageType?: string;
};

export function epaperOcrSourceKey(
  id: string,
  revision: number,
  page: SourcePage,
  generation?: string
) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        id,
        revision,
        page.pageNumber,
        page.imagePath,
        page.processedAt ? new Date(String(page.processedAt)).toISOString() : '',
        generation || '',
        LOCAL_OCR_ENGINE_VERSION,
      ])
    )
    .digest('hex');
}

export async function queueEpaperOcr(
  epaperId: string,
  selected: number[] = [],
  retry = false
) {
  const paper = await EPaper.findById(epaperId).lean();
  if (!paper) throw new Error('Publication not found.');
  const jobs: string[] = [];

  for (const page of paper.pages) {
    if (
      !page.imagePath ||
      page.processingStatus === 'failed' ||
      (page.pageType && page.pageType !== 'editorial') ||
      (selected.length && !selected.includes(page.pageNumber))
    ) {
      continue;
    }
    const sourceKey = epaperOcrSourceKey(
      epaperId,
      paper.revisionNumber || 1,
      page,
      paper.processingGeneration
    );
    const identity = { kind: 'ocr' as const, sourceKey };
    const job = await EPaperProcessingJob.findOneAndUpdate(
      identity,
      {
        $setOnInsert: {
          ...identity,
          epaperId,
          pageNumbers: [page.pageNumber],
          sourceImagePath: page.imagePath,
          totalItems: 1,
          status: 'queued',
          maxAttempts: 4,
          nextAttemptAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    if (retry) {
      await EPaperProcessingJob.updateOne(
        {
          ...identity,
          status: { $in: ['failed', 'completed_with_errors', 'cancelled'] },
        },
        {
          $set: {
            status: 'queued',
            nextAttemptAt: new Date(),
            attemptCount: 0,
          },
        }
      );
    }
    jobs.push(String(job._id));
  }

  logEpaperMetric('epaper_ocr_queued', { epaperId, jobCount: jobs.length });
  return jobs;
}

/** One Mongo lease coordinates OCR across app instances; Redis is not a correctness dependency. */
export async function processQueuedEpaperOcrJobs() {
  if (process.env.EPAPER_LOCAL_OCR_ENABLED !== '1') {
    return { paused: true, processed: 0 };
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error('OCR requires MongoDB.');
  const leaseId = 'local-ocr';
  const owner = crypto.randomUUID();
  const locks = db.collection<{ _id: string; owner: string; expiresAt: Date }>(
    'epaperWorkerLeases'
  );

  try {
    await locks.updateOne(
      { _id: leaseId, expiresAt: { $lte: new Date() } },
      { $set: { owner, expiresAt: new Date(Date.now() + 300_000) } },
      { upsert: true }
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { busy: true, processed: 0 };
    }
    throw error;
  }

  let job;
  try {
    const allowlist = (process.env.EPAPER_LOCAL_OCR_CITY_ALLOWLIST || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const papers = await EPaper.find({
      isCurrentRevision: { $ne: false },
      ...(allowlist.length ? { citySlug: { $in: allowlist } } : {}),
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('_id')
      .lean();

    for (const paper of papers) {
      await queueEpaperOcr(String(paper._id));
    }
    const allowedIds = papers.map((paper) => paper._id);

    const jobQuery: Record<string, unknown> = {
      kind: 'ocr',
      nextAttemptAt: { $lte: new Date() },
      $or: [
        { status: 'queued' },
        { status: 'processing', leaseExpiresAt: { $lte: new Date() } },
      ],
    };
    if (allowlist.length > 0) {
      jobQuery.epaperId = { $in: allowedIds };
    }

    job = await EPaperProcessingJob.findOneAndUpdate(
      jobQuery,
      {
        $set: {
          status: 'processing',
          leaseOwner: owner,
          leaseExpiresAt: new Date(Date.now() + 240_000),
          startedAt: new Date(),
        },
        $inc: { attemptCount: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, _id: 1 } }
    );

    if (!job) return { processed: 0 };

    logEpaperMetric('epaper_ocr_started', {
      epaperId: String(job.epaperId),
      jobId: String(job._id),
      pageNumber: job.pageNumbers[0],
      attemptCount: job.attemptCount,
    });

    const imageBuffer = await loadTrustedEpaperImage(job.sourceImagePath);
    const results = await runIsolatedLocalOcr(imageBuffer);

    // Verify freshness against canonical edition
    const paper = await EPaper.findById(job.epaperId).lean();
    const page = paper?.pages.find(
      (entry) => entry.pageNumber === job!.pageNumbers[0]
    );
    const current =
      paper &&
      paper.productionStatus !== 'archived' &&
      page &&
      page.imagePath === job.sourceImagePath &&
      epaperOcrSourceKey(
        String(paper._id),
        paper.revisionNumber || 1,
        page,
        paper.processingGeneration
      ) === job.sourceKey;

    const committed = await EPaperProcessingJob.findOneAndUpdate(
      {
        _id: job._id,
        status: 'processing',
        leaseOwner: owner,
        leaseExpiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: current ? 'completed' : 'cancelled',
          checkpoint: current ? results : [],
          completedAt: new Date(),
          processedItems: current ? 1 : 0,
        },
      },
      { new: true }
    );

    if (!committed || !current) {
      logEpaperMetric('epaper_ocr_failed', {
        epaperId: String(job.epaperId),
        jobId: String(job._id),
        status: !committed ? 'lease_lost' : 'stale_cancelled',
        errorCategory: !committed ? 'lease_expired' : 'stale_generation',
      });
      return { processed: 0, stale: true };
    }

    for (const result of results) {
      const fingerprint = crypto
        .createHash('sha256')
        .update(JSON.stringify([job.sourceKey, result.title, result.hotspot]))
        .digest('hex');

      await EPaperOcrSuggestion.updateOne(
        { epaperId: job.epaperId, pageNumber: page.pageNumber, fingerprint },
        {
          $setOnInsert: {
            epaperId: job.epaperId,
            pageNumber: page.pageNumber,
            fingerprint,
            sourceKey: job.sourceKey,
            runId: String(job._id),
            title: result.title.trim().slice(0, 220),
            excerpt: result.text.trim().slice(0, 1000),
            contentHtml: `<p>${result.text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br/>')}</p>`,
            hotspot: result.hotspot,
            confidence: Math.max(0, Math.min(100, result.confidence)),
            status: 'pending',
          },
        },
        { upsert: true }
      );
    }

    logEpaperMetric('epaper_ocr_completed', {
      epaperId: String(job.epaperId),
      jobId: String(job._id),
      pageNumber: page.pageNumber,
      suggestionsCount: results.length,
    });

    return { processed: 1, suggestions: results.length };
  } catch (error) {
    if (job) {
      const attempts = job.attemptCount ?? 1;
      const willRetry = attempts < 4;
      const backoffMs = [60_000, 300_000, 900_000][
        Math.min(Math.max(0, attempts - 1), 2)
      ];
      await EPaperProcessingJob.updateOne(
        { _id: job._id, leaseOwner: owner },
        {
          $set: {
            status: willRetry ? 'queued' : 'failed',
            leaseOwner: '',
            leaseExpiresAt: null,
            nextAttemptAt: new Date(Date.now() + backoffMs),
            lastError:
              error instanceof Error ? error.message : 'Local OCR failed.',
          },
        }
      );
      logEpaperMetric('epaper_ocr_failed', {
        epaperId: String(job.epaperId),
        jobId: String(job._id),
        attempts,
        willRetry,
        error: error instanceof Error ? error.message : 'Unknown OCR error',
      });
    }
    throw error;
  } finally {
    await locks.deleteOne({ _id: leaseId, owner }).catch(() => undefined);
  }
}
