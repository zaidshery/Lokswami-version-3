import 'server-only';
import { recoverPendingEditionContentMutations } from './epaperStandaloneMutation';

import { reconcileDueEpaperAutomation } from '@/lib/server/epaperAutomationPipeline';
import { processQueuedEpaperOcrJobs, queueEpaperOcr } from '@/lib/server/epaperOcrJobs';
import {
  cleanupAbandonedEpaperUploads,
  isEpaperBackgroundProcessingEnabled,
  processQueuedEpaperJobs,
  queueEpaperPageProcessing,
  resolveRetryableEpaperPageNumbers,
} from '@/lib/server/epaperProcessingJobs';

export class EpaperWorkerAdapter {
  queueOcr(epaperId: string, pageNumbers: number[]) {
    return queueEpaperOcr(epaperId, pageNumbers, true);
  }

  isLocalOcrPaused() {
    return process.env.EPAPER_LOCAL_OCR_ENABLED !== '1';
  }

  isPageProcessingEnabled(citySlug?: string) {
    return isEpaperBackgroundProcessingEnabled(citySlug);
  }

  retryablePages(pages: unknown[], requested: number[]) {
    return resolveRetryableEpaperPageNumbers(pages as Parameters<typeof resolveRetryableEpaperPageNumbers>[0], requested);
  }

  queuePageProcessing(epaperId: string, pageNumbers: number[]) {
    return queueEpaperPageProcessing({ epaperId, pageNumbers });
  }

  async processDueJobs() {
    const contentRecovery = await recoverPendingEditionContentMutations();
    const [processing, cleanup] = await Promise.all([
      processQueuedEpaperJobs({ limit: 1 }),
      cleanupAbandonedEpaperUploads(),
    ]);
    const ocr = await processQueuedEpaperOcrJobs();
    const automation = await reconcileDueEpaperAutomation();
    return { processing, cleanup, ocr, automation, contentRecovery };
  }
}

export const epaperWorkerAdapter = new EpaperWorkerAdapter();
