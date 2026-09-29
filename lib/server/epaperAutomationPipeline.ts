import 'server-only';
import { recoverEditionContentMutation } from '@/lib/server/epaper/epaperStandaloneMutation';

import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { PROTECTED_EPAPER_AUTOMATION_IDS } from '@/lib/server/epaperAutomationPolicy';
import { epaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { epaperOcrSourceKey, queueEpaperOcr } from '@/lib/server/epaperOcrJobs';
import {
  buildEpaperProcessingBlockers,
  buildEpaperReadiness,
} from '@/lib/utils/epaperAdminReadiness';
import type { EPaperArticleRecord, EPaperRecord } from '@/lib/types/epaper';
import type { EPaperProductionStatus } from '@/lib/workflow/types';

export { PROTECTED_EPAPER_AUTOMATION_IDS };

export const EPAPER_AUTOMATION_ACTOR: AdminSessionIdentity = {
  id: 'epaper-automation',
  username: 'epaper-automation',
  name: 'E-Paper Automation',
  email: 'automation@system.lokswami',
  role: 'super_admin',
};

const OCR_TERMINAL_STATUSES = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

type Actor = Pick<AdminSessionIdentity, 'id' | 'name' | 'email' | 'role'> &
  Partial<Pick<AdminSessionIdentity, 'username'>>;

type AutomationPage = {
  pageNumber: number;
  imagePath?: string;
  processedAt?: unknown;
  processingStatus?: string;
  pageType?: string;
};

export type EpaperAutomationStatus = {
  epaperId: string;
  publicationType: 'epaper' | 'emagazine';
  stage: EPaperProductionStatus;
  generation: string;
  revisionNumber: number;
  page: {
    total: number;
    ready: number;
    processing: number;
    failed: number;
    missing: number;
  };
  ocr: {
    enabled: boolean;
    eligible: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    skipped: number;
    pendingSuggestions: number;
    terminal: boolean;
  };
  mappedStories: number;
  blockers: string[];
  warnings: string[];
  nextAutomaticAction: string;
  lastReconciledAt: string;
};

function normalizeArticle(article: Record<string, unknown>): EPaperArticleRecord {
  return {
    _id: String(article._id || ''),
    epaperId: String(article.epaperId || ''),
    pageNumber: Number(article.pageNumber || 0),
    title: String(article.title || ''),
    slug: String(article.slug || ''),
    excerpt: String(article.excerpt || ''),
    contentHtml: String(article.contentHtml || ''),
    coverImagePath: String(article.coverImagePath || ''),
    hotspot: { x: 0, y: 0, w: 0, h: 0 },
  };
}

function normalizeEpaper(epaper: Record<string, unknown>): EPaperRecord {
  const pages = Array.isArray(epaper.pages) ? epaper.pages : [];
  return {
    _id: String(epaper._id || ''),
    publicationType: epaper.publicationType === 'emagazine' ? 'emagazine' : 'epaper',
    citySlug: String(epaper.citySlug || ''),
    cityName: String(epaper.cityName || ''),
    title: String(epaper.title || ''),
    publishDate:
      epaper.publishDate instanceof Date
        ? epaper.publishDate.toISOString().slice(0, 10)
        : String(epaper.publishDate || ''),
    pdfPath: String(epaper.pdfPath || ''),
    thumbnailPath: String(epaper.thumbnailPath || ''),
    pageCount: Math.max(1, Number(epaper.pageCount || 0)),
    pages: pages.map((page) => {
      const source = typeof page === 'object' && page ? page as Record<string, unknown> : {};
      return {
        pageNumber: Number(source.pageNumber || 0),
        imagePath: String(source.imagePath || ''),
        width: Number(source.width || 0) || undefined,
        height: Number(source.height || 0) || undefined,
        pageType: source.pageType,
        classificationNote: String(source.classificationNote || ''),
        processingStatus: source.processingStatus,
        reviewStatus: source.reviewStatus,
        reviewNote: String(source.reviewNote || ''),
      };
    }),
    status: epaper.status === 'published' ? 'published' : 'draft',
    productionStatus: String(epaper.productionStatus || 'draft_upload'),
    revisionInitializationStatus: epaper.revisionInitializationStatus,
  } as EPaperRecord;
}

function normalizeProductionStatus(value: unknown): EPaperProductionStatus {
  return value === 'qa_review'
    ? 'hotspot_mapping'
    : String(value || 'draft_upload') as EPaperProductionStatus;
}

function getPageStats(pageCount: number, pages: AutomationPage[]) {
  const byNumber = new Map(pages.map((page) => [Number(page.pageNumber), page]));
  const result = { total: pageCount, ready: 0, processing: 0, failed: 0, missing: 0 };
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = byNumber.get(pageNumber);
    if (!page || !String(page.imagePath || '').trim()) result.missing += 1;
    if (page?.processingStatus === 'processing') result.processing += 1;
    if (page?.processingStatus === 'failed') result.failed += 1;
    if (page?.processingStatus === 'ready' && String(page.imagePath || '').trim()) {
      result.ready += 1;
    }
  }
  return result;
}

function getNextAction(status: Omit<EpaperAutomationStatus, 'nextAutomaticAction'>) {
  if (status.stage === 'ready_to_publish') return 'Waiting for Super Admin to publish.';
  if (status.page.processing > 0) return 'Continue PDF page conversion.';
  if (status.page.failed > 0 || status.page.missing > 0) {
    return 'Retry missing or failed PDF pages.';
  }
  if (status.ocr.queued > 0 || status.ocr.processing > 0) return 'Continue OCR processing.';
  if (status.blockers.length > 0) return 'Resolve canonical readiness blockers.';
  if (status.stage === 'hotspot_mapping') return 'Advance to Ready To Publish.';
  return 'Reconcile the next workflow stage.';
}

async function loadAutomationState(epaperId: string) {
  const epaper = await EPaper.findById(epaperId).lean<Record<string, unknown> | null>();
  if (!epaper) throw new Error('Publication not found.');

  const pages = (Array.isArray(epaper.pages) ? epaper.pages : [])
    .map((page) => typeof page === 'object' && page ? page as AutomationPage : null)
    .filter((page): page is AutomationPage => Boolean(page));
  const pageCount = Math.max(1, Number(epaper.pageCount || pages.length || 1));
  const revisionNumber = Math.max(1, Number(epaper.revisionNumber || 1));
  const generation = String(epaper.processingGeneration || '');
  const eligiblePages = pages.filter(
    (page) =>
      page.processingStatus === 'ready' &&
      Boolean(String(page.imagePath || '').trim()) &&
      (!page.pageType || page.pageType === 'editorial')
  );
  const sourceKeys = eligiblePages.map((page) =>
    epaperOcrSourceKey(epaperId, revisionNumber, page, generation)
  );

  const [articleRows, latestPdfJob, ocrJobs, pendingSuggestions] = await Promise.all([
    EPaperArticle.find({ epaperId })
      .select('_id epaperId pageNumber title slug excerpt contentHtml coverImagePath')
      .lean<Record<string, unknown>[]>(),
    EPaperProcessingJob.findOne({ epaperId, kind: 'pdf_pages' })
      .sort({ createdAt: -1 })
      .lean<Record<string, unknown> | null>(),
    sourceKeys.length
      ? EPaperProcessingJob.find({ epaperId, kind: 'ocr', sourceKey: { ['\u0024in']: sourceKeys } })
          .lean<Record<string, unknown>[]>()
      : Promise.resolve([]),
    EPaperOcrSuggestion.countDocuments({ epaperId, status: 'pending' }),
  ]);

  const articles = articleRows.map(normalizeArticle);
  const readinessEpaper = normalizeEpaper(epaper);
  const isStaleGeneration = Boolean(
    generation && latestPdfJob?.generation && String(latestPdfJob.generation) !== generation
  );
  const readiness = buildEpaperReadiness({
    epaper: { ...readinessEpaper, isStaleGeneration },
    articles,
  });
  const processingBlockers = buildEpaperProcessingBlockers({
    processingGeneration: generation,
    latestJob: latestPdfJob
      ? {
          status: String(latestPdfJob.status || ''),
          generation: String(latestPdfJob.generation || ''),
        }
      : null,
  });
  if (
    latestPdfJob?.revisionNumber &&
    Number(latestPdfJob.revisionNumber) !== revisionNumber
  ) {
    processingBlockers.push('Processing revision is stale.');
  }

  const jobsBySource = new Map(ocrJobs.map((job) => [String(job.sourceKey || ''), job]));
  const counts = { queued: 0, processing: 0, completed: 0, failed: 0 };
  for (const sourceKey of sourceKeys) {
    const status = String(jobsBySource.get(sourceKey)?.status || 'missing');
    if (status === 'queued') counts.queued += 1;
    else if (status === 'processing') counts.processing += 1;
    else if (status === 'completed') counts.completed += 1;
    else if (OCR_TERMINAL_STATUSES.has(status)) counts.failed += 1;
  }
  const ocrEnabled = process.env.EPAPER_LOCAL_OCR_ENABLED === '1';
  const terminal =
    !ocrEnabled ||
    sourceKeys.length === 0 ||
    sourceKeys.every((sourceKey) =>
      OCR_TERMINAL_STATUSES.has(String(jobsBySource.get(sourceKey)?.status || ''))
    );
  const warnings = [...readiness.warnings];
  if (!ocrEnabled && eligiblePages.length > 0) {
    warnings.push('Local OCR is disabled; eligible pages were truthfully skipped.');
  }
  if (counts.failed > 0) {
    warnings.push(
      counts.failed + ' OCR page' + (counts.failed === 1 ? '' : 's') +
        ' reached a terminal failure state.'
    );
  }
  if (pendingSuggestions > 0) {
    warnings.push(
      pendingSuggestions + ' OCR suggestion' + (pendingSuggestions === 1 ? '' : 's') +
        ' remain for optional editorial review.'
    );
  }
  if (epaper.contentMutation && typeof epaper.contentMutation === 'object' && 'id' in epaper.contentMutation) {
    processingBlockers.push('A content change is being saved or recovered.');
  }
  const blockers = [...new Set([...readiness.blockers, ...processingBlockers])];
  const base = {
    epaperId,
    publicationType: epaper.publicationType === 'emagazine' ? 'emagazine' as const : 'epaper' as const,
    stage: normalizeProductionStatus(epaper.productionStatus),
    generation,
    revisionNumber,
    page: getPageStats(pageCount, pages),
    ocr: {
      enabled: ocrEnabled,
      eligible: eligiblePages.length,
      ...counts,
      skipped: ocrEnabled ? 0 : Math.max(0, eligiblePages.length - counts.completed - counts.failed),
      pendingSuggestions,
      terminal,
    },
    mappedStories: articles.length,
    blockers,
    warnings: [...new Set(warnings)],
    lastReconciledAt: epaper.automationReconciledAt
      ? new Date(String(epaper.automationReconciledAt)).toISOString()
      : '',
  };
  const status: EpaperAutomationStatus = {
    ...base,
    nextAutomaticAction: getNextAction(base),
  };
  return { epaper, status };
}

export async function getEpaperAutomationStatus(epaperId: string) {
  return (await loadAutomationState(epaperId)).status;
}

function canAdvancePages(status: EpaperAutomationStatus) {
  return (
    status.page.total > 0 &&
    status.page.ready === status.page.total &&
    status.page.processing === 0 &&
    status.page.failed === 0 &&
    status.page.missing === 0 &&
    !status.blockers.some((blocker) =>
      /processing job is still active|generation is stale|revision is stale/i.test(blocker)
    )
  );
}

export function resolveEpaperAutomationTarget(
  status: EpaperAutomationStatus
): Exclude<EPaperProductionStatus, 'published' | 'archived'> | null {
  if (status.stage === 'draft_upload' && canAdvancePages(status)) {
    return 'pages_ready';
  }
  if (status.stage === 'pages_ready' && canAdvancePages(status) && status.ocr.terminal) {
    return 'ocr_review';
  }
  if (status.stage === 'ocr_review' && canAdvancePages(status) && status.ocr.terminal) {
    return 'hotspot_mapping';
  }
  if (status.stage === 'hotspot_mapping' && status.blockers.length === 0) {
    return 'ready_to_publish';
  }
  return null;
}

async function advance(
  epaper: Record<string, unknown>,
  actor: Actor,
  nextStatus: Exclude<EPaperProductionStatus, 'published' | 'archived'>,
  reason: string
) {
  return epaperEditorialService.updateWorkflow(actor as AdminSessionIdentity, String(epaper._id), {
    productionStatus: nextStatus,
    expectedVersion: Math.max(1, Number(epaper.version || 1)),
    expectedGeneration: String(epaper.processingGeneration || ''),
    expectedRevisionNumber: Math.max(1, Number(epaper.revisionNumber || 1)),
    automation: true,
    note: reason,
  });
}

export async function applyEpaperWorkflowAutomation(input: {
  epaperId: string;
  actor?: Actor;
  reason: string;
  ensureOcr?: boolean;
}) {
  if (PROTECTED_EPAPER_AUTOMATION_IDS.has(input.epaperId.toLowerCase())) {
    return { changed: false, nextStatus: null, protected: true };
  }

  const actor = input.actor || EPAPER_AUTOMATION_ACTOR;
  let changed = false;
  let nextStatus: EPaperProductionStatus | null = null;
  let current = await loadAutomationState(input.epaperId);
  if (current.epaper.contentMutation) {
    await recoverEditionContentMutation(input.epaperId);
    current = await loadAutomationState(input.epaperId);
  }

  if (
    current.epaper.status !== 'draft' ||
    current.status.stage === 'published' ||
    current.status.stage === 'archived'
  ) {
    return { changed: false, nextStatus: null, snapshot: current.status };
  }

  for (let step = 0; step < 4; step += 1) {
    if (current.status.stage === 'pages_ready' && input.ensureOcr !== false && current.status.ocr.enabled) {
      await queueEpaperOcr(input.epaperId);
      current = await loadAutomationState(input.epaperId);
    }
    const target = resolveEpaperAutomationTarget(current.status);

    if (!target) break;
    await advance(current.epaper, actor, target, input.reason);
    changed = true;
    nextStatus = target;
    current = await loadAutomationState(input.epaperId);
  }

  const reconciledAt = new Date();
  const stamped = await EPaper.updateOne({
    _id: input.epaperId,
    status: 'draft',
    version: Math.max(1, Number(current.epaper.version || 1)),
    revisionNumber: Math.max(1, Number(current.epaper.revisionNumber || 1)),
    processingGeneration: String(current.epaper.processingGeneration || ''),
  }, { $set: { automationReconciledAt: reconciledAt } }, { timestamps: false });
  if (stamped.matchedCount) current.status.lastReconciledAt = reconciledAt.toISOString();
  return { changed, nextStatus, snapshot: current.status };
}

export async function reconcileDueEpaperAutomation(options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
  const editions = await EPaper.find({
    status: 'draft',
    'contentMutation.id': { $exists: false },
    productionStatus: { ['\u0024nin']: ['published', 'archived', 'ready_to_publish'] },
    _id: { ['\u0024nin']: [...PROTECTED_EPAPER_AUTOMATION_IDS] },
  })
    .sort({ automationReconciledAt: 1, updatedAt: 1, _id: 1 })
    .limit(limit)
    .select('_id')
    .lean<Array<{ _id: unknown }>>();

  const results = [];
  for (const edition of editions) {
    try {
      results.push(await applyEpaperWorkflowAutomation({
        epaperId: String(edition._id),
        reason: 'Automatic production workflow reconciliation.',
      }));
    } catch (error) {
      results.push({
        changed: false,
        epaperId: String(edition._id),
        error: error instanceof Error ? error.message : 'Workflow reconciliation failed.',
      });
    }
  }
  return { inspected: editions.length, results };
}
