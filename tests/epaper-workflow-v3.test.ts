import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isProtectedRemoteAddress,
  isProtectedRemoteHostname,
} from '@/lib/utils/adminEpaperIngestion';
import { resolveRetryableEpaperPageNumbers } from '@/lib/server/epaperProcessingJobs';
import { buildEpaperPlaceholderTitle } from '@/lib/utils/epaperArticles';
import { buildEpaperReadiness } from '@/lib/utils/epaperAdminReadiness';
import { getAllowedEpaperProductionTransitions } from '@/lib/workflow/transitions';

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('e-paper workflow v3 safeguards', () => {
  it('rejects loopback, private, link-local, and metadata import targets', () => {
    expect(isProtectedRemoteAddress('127.0.0.1')).toBe(true);
    expect(isProtectedRemoteAddress('10.1.2.3')).toBe(true);
    expect(isProtectedRemoteAddress('169.254.169.254')).toBe(true);
    expect(isProtectedRemoteAddress('192.168.1.10')).toBe(true);
    expect(isProtectedRemoteAddress('::1')).toBe(true);
    expect(isProtectedRemoteAddress('fd00::1')).toBe(true);
    expect(isProtectedRemoteAddress('8.8.8.8')).toBe(false);
    expect(isProtectedRemoteHostname('metadata.google.internal')).toBe(true);
    expect(isProtectedRemoteHostname('localhost')).toBe(true);
    expect(isProtectedRemoteHostname('drive.google.com')).toBe(false);
  });

  it('retries only missing or failed pages', () => {
    const pages = [
      { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
      { pageNumber: 2, imagePath: '', processingStatus: 'pending' },
      { pageNumber: 3, imagePath: '/page-3.jpg', processingStatus: 'failed' },
    ];

    expect(resolveRetryableEpaperPageNumbers(pages)).toEqual([2, 3]);
    expect(resolveRetryableEpaperPageNumbers(pages, [1, 2, 3])).toEqual([2, 3]);
    expect(resolveRetryableEpaperPageNumbers(pages, [1])).toEqual([]);
  });

  it('removes direct publishing and automatic audio controls', () => {
    const createPage = read('app/(admin)/admin/epapers/new/page.tsx');
    const detailPage = read('app/(admin)/admin/epapers/[id]/page.tsx');
    const pageEditor = read(
      'app/(admin)/admin/epapers/[id]/page/[pageNumber]/page.tsx'
    );
    const createRoute = read('app/api/admin/epapers/route.ts');
    const importRoute = read('app/api/admin/epapers/import/route.ts');

    expect(createPage).not.toContain('value="published"');
    expect(detailPage).not.toContain('Generate Audio');
    expect(pageEditor).not.toContain('Generate Audio');
    expect(pageEditor).not.toContain('Regenerate Audio');
    expect(createRoute).toContain("const status = 'draft'");
    expect(importRoute).toContain("status: 'draft'");
  });

  it('uses a cron secret and keeps processing independent of the browser', () => {
    const cronRoute = read('app/api/admin/epapers/jobs/run-due/route.ts');
    const uploadPage = read('app/(admin)/admin/epapers/new/page.tsx');
    const jobModel = read('lib/models/EPaperProcessingJob.ts');

    expect(cronRoute).toContain("request.headers.get('x-cron-secret')");
    expect(cronRoute).toContain('processQueuedEpaperJobs');
    expect(uploadPage).not.toContain('renderPdfFilePages');
    expect(jobModel).toContain('nextAttemptAt');
    expect(jobModel).toContain('leaseExpiresAt');
  });

  it('allows manual hotspot mapping to create an incomplete draft story', () => {
    const pageEditor = read(
      'app/(admin)/admin/epapers/[id]/page/[pageNumber]/page.tsx'
    );
    const articleRoute = read('app/api/admin/epapers/[id]/articles/route.ts');

    expect(buildEpaperPlaceholderTitle(2, 1)).toBe('Draft story - Page 2 #1');
    expect(pageEditor).toContain('Headline (optional)');
    expect(pageEditor).toContain('fields create a placeholder draft');
    expect(pageEditor).toContain(
      'const canCreateManualDraft = Boolean(draftHotspot)'
    );
    expect(pageEditor).not.toContain('Headline required before creating draft');
    expect(pageEditor).not.toContain('Clean Hindi body required before creating draft');
    expect(articleRoute).not.toContain("error: 'title is required'");
    expect(articleRoute).toContain('buildEpaperPlaceholderTitle');
  });

  it('moves directly from hotspot mapping to ready to publish without page QA', () => {
    const detailPage = read('app/(admin)/admin/epapers/[id]/page.tsx');
    const pageEditor = read(
      'app/(admin)/admin/epapers/[id]/page/[pageNumber]/page.tsx'
    );

    expect(getAllowedEpaperProductionTransitions('hotspot_mapping')).toEqual([
      'ready_to_publish',
      'published',
    ]);
    expect(detailPage).not.toContain('Move To QA Review');
    expect(detailPage).not.toContain('Pending QA');
    expect(pageEditor).not.toContain('Page QA');
    expect(pageEditor).not.toContain('Review status');
    expect(pageEditor).toContain('Save Classification');
  });

  it('ignores legacy page review statuses when calculating publish readiness', () => {
    const readiness = buildEpaperReadiness({
      epaper: {
        _id: 'paper-with-legacy-review-statuses',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '/uploads/paper.pdf',
        thumbnailPath: '/page-1.jpg',
        pages: [
          {
            pageNumber: 1,
            imagePath: '/page-1.jpg',
            reviewStatus: 'pending',
          },
          {
            pageNumber: 2,
            imagePath: '/page-2.jpg',
            reviewStatus: 'needs_attention',
          },
        ],
      },
      articles: [
        {
          pageNumber: 1,
          contentHtml: '<p>Page one story</p>',
          excerpt: '',
          coverImagePath: '',
        },
        {
          pageNumber: 2,
          contentHtml: '<p>Page two story</p>',
          excerpt: '',
          coverImagePath: '',
        },
      ],
    });

    expect(readiness.blockers).toEqual([]);
    expect(readiness.pagesPendingQa).toBe(0);
    expect(readiness.pagesNeedingAttention).toBe(0);
  });
});
