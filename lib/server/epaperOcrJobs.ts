import crypto from 'node:crypto';
import mongoose from 'mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { loadTrustedEpaperImage } from '@/lib/server/epaperShareImage';
import { LOCAL_OCR_ENGINE_VERSION, runIsolatedLocalOcr } from '@/lib/server/epaperLocalOcr';

type SourcePage = { pageNumber: number; imagePath?: string; processedAt?: unknown; processingStatus?: string; pageType?: string };
export function epaperOcrSourceKey(id: string, revision: number, page: SourcePage) {
  return crypto.createHash('sha256').update(JSON.stringify([id, revision, page.pageNumber, page.imagePath, page.processedAt ? new Date(String(page.processedAt)).toISOString() : '', LOCAL_OCR_ENGINE_VERSION])).digest('hex');
}
export async function queueEpaperOcr(epaperId: string, selected: number[] = [], retry = false) {
  const paper = await EPaper.findById(epaperId).lean();
  if (!paper) throw new Error('Publication not found.');
  const jobs = [];
  for (const page of paper.pages) {
    if (!page.imagePath || page.processingStatus === 'failed' || (page.pageType && page.pageType !== 'editorial') || (selected.length && !selected.includes(page.pageNumber))) continue;
    const sourceKey = epaperOcrSourceKey(epaperId, paper.revisionNumber || 1, page);
    const identity = { kind: 'ocr' as const, sourceKey };
    const job = await EPaperProcessingJob.findOneAndUpdate(identity, { $setOnInsert: {
      ...identity, epaperId, pageNumbers: [page.pageNumber], sourceImagePath: page.imagePath,
      totalItems: 1, status: 'queued', maxAttempts: 4, nextAttemptAt: new Date(),
    } }, { upsert: true, new: true });
    if (retry) await EPaperProcessingJob.updateOne({ ...identity, status: { $in: ['failed', 'completed_with_errors'] } }, { $set: { status: 'queued', nextAttemptAt: new Date(), attemptCount: 0 } });
    jobs.push(String(job._id));
  }
  return jobs;
}

/** One Mongo lease coordinates OCR across app instances; Redis is not a correctness dependency. */
export async function processQueuedEpaperOcrJobs() {
  if (process.env.EPAPER_LOCAL_OCR_ENABLED !== '1') return { paused: true, processed: 0 };
  const db = mongoose.connection.db;
  if (!db) throw new Error('OCR requires MongoDB.');
  const leaseId = 'local-ocr';
  const owner = crypto.randomUUID();
  const locks = db.collection<{ _id: string; owner: string; expiresAt: Date }>('epaperWorkerLeases');
  try {
    await locks.updateOne({ _id: leaseId, expiresAt: { $lte: new Date() } }, { $set: { owner, expiresAt: new Date(Date.now() + 300_000) } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { busy: true, processed: 0 };
    throw error;
  }
  let job;
  try {
    // Reconcile ready/replaced assets after interrupted callbacks, bounded per cron run.
    const allowlist = (process.env.EPAPER_LOCAL_OCR_CITY_ALLOWLIST || '').split(',').map((value) => value.trim()).filter(Boolean);
    const papers = await EPaper.find({ isCurrentRevision: { $ne: false }, ...(allowlist.length ? { citySlug: { $in: allowlist } } : {}) }).sort({ updatedAt: -1 }).limit(20).select('_id').lean();
    for (const paper of papers) await queueEpaperOcr(String(paper._id));
    const allowedIds = papers.map((paper) => paper._id);
    job = await EPaperProcessingJob.findOneAndUpdate({ kind: 'ocr', epaperId: { $in: allowedIds }, nextAttemptAt: { $lte: new Date() }, $or: [{ status: 'queued' }, { status: 'processing', leaseExpiresAt: { $lte: new Date() } }] }, {
      $set: { status: 'processing', leaseOwner: owner, leaseExpiresAt: new Date(Date.now() + 240_000), startedAt: new Date() }, $inc: { attemptCount: 1 },
    }, { new: true, sort: { nextAttemptAt: 1, _id: 1 } });
    if (!job) return { processed: 0 };
    const results = await runIsolatedLocalOcr(await loadTrustedEpaperImage(job.sourceImagePath));
    const paper = await EPaper.findById(job.epaperId).lean();
    const page = paper?.pages.find((entry) => entry.pageNumber === job!.pageNumbers[0]);
    const current = paper && page && epaperOcrSourceKey(String(paper._id), paper.revisionNumber || 1, page) === job.sourceKey;
    const committed = await EPaperProcessingJob.findOneAndUpdate({ _id: job._id, status: 'processing', leaseOwner: owner, leaseExpiresAt: { $gt: new Date() } }, { $set: { status: current ? 'completed' : 'cancelled', checkpoint: current ? results : [], completedAt: new Date(), processedItems: current ? 1 : 0 } }, { new: true });
    if (!committed || !current) return { processed: 0, stale: true };
    for (const result of results) {
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify([job.sourceKey, result.title, result.hotspot])).digest('hex');
      await EPaperOcrSuggestion.updateOne({ epaperId: job.epaperId, pageNumber: page.pageNumber, fingerprint }, { $setOnInsert: {
        epaperId: job.epaperId, pageNumber: page.pageNumber, fingerprint, sourceKey: job.sourceKey, runId: String(job._id), title: result.title,
        excerpt: result.text.slice(0, 1000), contentHtml: `<p>${result.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`,
        hotspot: result.hotspot, confidence: Math.max(0, Math.min(100, result.confidence)), status: 'pending',
      } }, { upsert: true });
    }
    return { processed: 1, suggestions: results.length };
  } catch (error) {
    if (job) await EPaperProcessingJob.updateOne({ _id: job._id, leaseOwner: owner }, { $set: { status: job.attemptCount < 4 ? 'queued' : 'failed', leaseOwner: '', leaseExpiresAt: null, nextAttemptAt: new Date(Date.now() + [60_000, 300_000, 900_000][Math.min(job.attemptCount - 1, 2)]), lastError: error instanceof Error ? error.message : 'Local OCR failed.' } });
    throw error;
  } finally { await locks.deleteOne({ _id: leaseId, owner }); }
}
