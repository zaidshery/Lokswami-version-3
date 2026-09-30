import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  PROTECTED_EPAPER_AUTOMATION_IDS,
  resolveEpaperAutomationTarget,
  type EpaperAutomationStatus,
} from '@/lib/server/epaperAutomationPipeline';

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function status(
  overrides: Partial<EpaperAutomationStatus> = {}
): EpaperAutomationStatus {
  return {
    epaperId: '665000000000000000000001',
    publicationType: 'epaper',
    stage: 'draft_upload',
    generation: 'generation-1',
    revisionNumber: 1,
    page: {
      total: 2,
      ready: 2,
      processing: 0,
      failed: 0,
      missing: 0,
    },
    ocr: {
      enabled: true,
      eligible: 2,
      queued: 0,
      processing: 0,
      completed: 2,
      failed: 0,
      skipped: 0,
      pendingSuggestions: 0,
      terminal: true,
    },
    mappedStories: 0,
    blockers: [],
    warnings: [],
    nextAutomaticAction: '',
    lastReconciledAt: '2026-09-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('canonical E-Paper and E-Magazine automation pipeline', () => {
  it('advances from upload only when every PDF page is ready and current', () => {
    expect(resolveEpaperAutomationTarget(status())).toBe('pages_ready');
    expect(
      resolveEpaperAutomationTarget(
        status({ page: { total: 2, ready: 1, processing: 1, failed: 0, missing: 0 } })
      )
    ).toBeNull();
    expect(
      resolveEpaperAutomationTarget(
        status({ blockers: ['Processing generation is stale.'] })
      )
    ).toBeNull();
  });

  it('waits for enabled OCR but truthfully advances when disabled OCR is terminal/skipped', () => {
    expect(
      resolveEpaperAutomationTarget(
        status({
          stage: 'pages_ready',
          ocr: {
            enabled: true,
            eligible: 2,
            queued: 1,
            processing: 1,
            completed: 0,
            failed: 0,
            skipped: 0,
            pendingSuggestions: 0,
            terminal: false,
          },
        })
      )
    ).toBeNull();

    expect(
      resolveEpaperAutomationTarget(
        status({
          stage: 'pages_ready',
          ocr: {
            enabled: false,
            eligible: 2,
            queued: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            skipped: 2,
            pendingSuggestions: 0,
            terminal: true,
          },
        })
      )
    ).toBe('ocr_review');
  });

  it('moves terminal OCR through mapping and treats warnings as non-blocking', () => {
    expect(resolveEpaperAutomationTarget(status({ stage: 'ocr_review' }))).toBe(
      'hotspot_mapping'
    );
    expect(
      resolveEpaperAutomationTarget(
        status({
          stage: 'hotspot_mapping',
          mappedStories: 0,
          warnings: ['No mapped stories yet.'],
        })
      )
    ).toBe('ready_to_publish');
    expect(
      resolveEpaperAutomationTarget(
        status({
          stage: 'hotspot_mapping',
          blockers: ['Page 2 image is missing.'],
        })
      )
    ).toBeNull();
  });

  it('has publication-type parity and never crosses the human publish boundary', () => {
    const epaper = status({ stage: 'hotspot_mapping', publicationType: 'epaper' });
    const emagazine = status({
      stage: 'hotspot_mapping',
      publicationType: 'emagazine',
    });
    expect(resolveEpaperAutomationTarget(epaper)).toBe('ready_to_publish');
    expect(resolveEpaperAutomationTarget(emagazine)).toBe('ready_to_publish');
    expect(
      resolveEpaperAutomationTarget(status({ stage: 'ready_to_publish' }))
    ).toBeNull();
    expect(resolveEpaperAutomationTarget(status({ stage: 'published' }))).toBeNull();
  });

  it('keeps lifecycle, protected QA, CAS, recovery UI, and revision routing explicit', () => {
    const pipeline = read('lib/server/epaperAutomationPipeline.ts');
    const repository = read('lib/server/epaper/epaperRepository.ts');
    const processingJobs = read('lib/server/epaperProcessingJobs.ts');
    const revisionService = read('lib/server/epaper/epaperRevisionService.ts');
    const worker = read('scripts/epaper/run-automation-worker.js');
    const localStart = read('scripts/start-next-dev.js');
    const hostingerStart = read('scripts/start-hostinger.js');
    const detailPage = read('app/(admin)/admin/epapers/[id]/page.tsx');
    const pageEditor = read(
      'app/(admin)/admin/epapers/[id]/page/[pageNumber]/page.tsx'
    );

    expect(PROTECTED_EPAPER_AUTOMATION_IDS.has('6ab0da70c6aab6a2a6cab44e')).toBe(true);
    expect(pipeline).toContain("status: 'draft'");
    expect(pipeline).not.toContain("target = 'published'");
    expect(repository).toContain('advanceEditionAutomation');
    expect(repository).toContain('processingGeneration');
    expect(processingJobs).toContain('PROTECTED_EPAPER_AUTOMATION_IDS');
    expect(repository).toContain('revisionNumber');
    expect(worker).toContain('EPAPER_AUTOMATION_WORKER_ENABLED');
    expect(localStart).toContain('startAutomationWorker');
    expect(hostingerStart).toContain("EPAPER_AUTOMATION_WORKER_ENABLED !== '1'");
    expect(detailPage).toContain('Advanced / Recovery');
    expect(detailPage).toContain('Reconcile Automation');
    expect(detailPage).toContain('?mode=add-story');
    expect(pageEditor).toContain('Add Story in Draft');
    expect(pageEditor).toContain('/revisions');
    expect(revisionService).toContain('Existing draft revision reused.');
    expect(revisionService).toContain('.code !== 11000');
  });
});
