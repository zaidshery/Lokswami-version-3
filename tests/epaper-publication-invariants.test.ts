import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(() => 'Activity message'),
  recordEpaperActivity: vi.fn(),
  listEpaperActivity: vi.fn(() => []),
}));
vi.mock('@/lib/server/epaperObservability', () => ({
  logEpaperMetric: vi.fn(),
}));
vi.mock('@/lib/storage/workflowNotifications', () => ({
  createWorkflowNotification: vi.fn(),
}));

import {
  buildEpaperReadiness,
  isTrustedPdfAsset,
} from '@/lib/utils/epaperAdminReadiness';
import { buildEpaperEditionQualitySummary } from '@/lib/utils/epaperQualitySignals';
import { EpaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import type { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import {
  EpaperForbiddenError,
  EpaperValidationError,
  EpaperConflictError,
  type AdminSessionIdentity,
} from '@/lib/server/epaper/epaperTypes';

const superAdminActor: AdminSessionIdentity = {
  id: 'super-admin-1',
  username: 'superadmin',
  name: 'Super Admin',
  email: 'superadmin@example.com',
  role: 'super_admin',
};

const adminActor: AdminSessionIdentity = {
  id: 'admin-1',
  username: 'admin',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
};

const copyEditorActor: AdminSessionIdentity = {
  id: 'copy-editor-1',
  username: 'editor',
  name: 'Copy Editor',
  email: 'editor@example.com',
  role: 'copy_editor',
};

describe('Phase 3.9C — E-Paper Publication Invariants & Quality Signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authoritative Readiness & Quality Signals Matrix', () => {
    it('returns zero publish blockers for a completely valid edition', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/2026/09/indore.pdf',
        thumbnailPath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/2026/09/thumb.jpg',
        pages: [
          {
            pageNumber: 1,
            imagePath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/2026/09/page-1.jpg',
            processingStatus: 'ready',
            pageType: 'editorial',
          },
          {
            pageNumber: 2,
            imagePath: 'https://lokswami.blr1.digitaloceanspaces.com/lokswami/epapers/2026/09/page-2.jpg',
            processingStatus: 'ready',
            pageType: 'editorial',
          },
        ],
      };

      const articles = [
        {
          pageNumber: 1,
          contentHtml: '<p>Article 1</p>',
          excerpt: 'Excerpt 1',
          coverImagePath: '',
        },
      ];

      const readiness = buildEpaperReadiness({ epaper, articles });
      expect(readiness.blockers).toEqual([]);

      const quality = buildEpaperEditionQualitySummary({
        pageCount: 2,
        pages: epaper.pages as never,
        articles: articles as never,
        epaper,
      });
      expect(quality.publishBlockers).toEqual([]);
    });

    it('blocks publication when thumbnail is missing', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '/uploads/paper.pdf',
        thumbnailPath: '',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
          { pageNumber: 2, imagePath: '/page-2.jpg', processingStatus: 'ready' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers).toContain('Thumbnail is missing.');

      const quality = buildEpaperEditionQualitySummary({
        pageCount: 2,
        pages: epaper.pages as never,
        articles: [],
        epaper,
      });
      expect(quality.publishBlockers).toContain('Thumbnail is missing.');
    });

    it('blocks publication when PDF is missing', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '',
        thumbnailPath: '/thumb.jpg',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
          { pageNumber: 2, imagePath: '/page-2.jpg', processingStatus: 'ready' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers).toContain('PDF file is missing.');

      const quality = buildEpaperEditionQualitySummary({
        pageCount: 2,
        pages: epaper.pages as never,
        articles: [],
        epaper,
      });
      expect(quality.publishBlockers).toContain('PDF file is missing.');
    });

    it('blocks publication when PDF is from an untrusted or unverified source', () => {
      expect(isTrustedPdfAsset('https://drive.google.com/file/d/xyz')).toBe(false);
      expect(isTrustedPdfAsset('https://attacker.evil.com/fake.pdf')).toBe(false);
      expect(isTrustedPdfAsset('https://cdn.digitaloceanspaces.com/lokswami/epapers/doc.pdf')).toBe(true);
      expect(isTrustedPdfAsset('/uploads/epaper.pdf')).toBe(true);

      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: 'https://drive.google.com/file/d/untrusted-drive-link',
        thumbnailPath: '/thumb.jpg',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
          { pageNumber: 2, imagePath: '/page-2.jpg', processingStatus: 'ready' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers.some((b) => b.includes('unverified') || b.includes('untrusted'))).toBe(true);

      const quality = buildEpaperEditionQualitySummary({
        pageCount: 2,
        pages: epaper.pages as never,
        articles: [],
        epaper,
      });
      expect(quality.publishBlockers.some((b) => b.includes('unverified') || b.includes('untrusted'))).toBe(true);
    });

    it('blocks publication when any page is missing an image', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '/uploads/paper.pdf',
        thumbnailPath: '/thumb.jpg',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
          { pageNumber: 2, imagePath: '', processingStatus: 'pending' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers).toContain('1 page image is missing.');

      const quality = buildEpaperEditionQualitySummary({
        pageCount: 2,
        pages: epaper.pages as never,
        articles: [],
        epaper,
      });
      expect(quality.publishBlockers).toContain('1 page image is missing.');
    });

    it('blocks publication when there is a page gap or missing page entry', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 3,
        pdfPath: '/uploads/paper.pdf',
        thumbnailPath: '/thumb.jpg',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
          // Page 2 is missing entirely
          { pageNumber: 3, imagePath: '/page-3.jpg', processingStatus: 'ready' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers.some((b) => b.includes('gap') || b.includes('incomplete'))).toBe(true);
    });

    it('blocks publication when a page failed processing', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '/uploads/paper.pdf',
        thumbnailPath: '/thumb.jpg',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
          { pageNumber: 2, imagePath: '/page-2.jpg', processingStatus: 'failed' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers.some((b) => b.includes('failed processing'))).toBe(true);
    });

    it('blocks publication when a page is still processing', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '/uploads/paper.pdf',
        thumbnailPath: '/thumb.jpg',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
          { pageNumber: 2, imagePath: '/page-2.jpg', processingStatus: 'processing' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers.some((b) => b.includes('still processing'))).toBe(true);
    });

    it('blocks publication when a blank page lacks a classification note', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '/uploads/paper.pdf',
        thumbnailPath: '/thumb.jpg',
        pages: [
          { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready', pageType: 'editorial' },
          { pageNumber: 2, imagePath: '/page-2.jpg', processingStatus: 'ready', pageType: 'blank', classificationNote: '' },
        ],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      expect(readiness.blockers.some((b) => b.includes('Blank page') && b.includes('classification note'))).toBe(true);

      const quality = buildEpaperEditionQualitySummary({
        pageCount: 2,
        pages: epaper.pages as never,
        articles: [],
        epaper,
      });
      expect(quality.publishBlockers.some((b) => b.includes('Blank page') && b.includes('classification note'))).toBe(true);
    });

    it('propagates blockers directly from buildEpaperReadiness to buildEpaperEditionQualitySummary', () => {
      const epaper = {
        _id: '507f1f77bcf86cd799439011',
        cityName: 'Indore',
        citySlug: 'indore',
        pageCount: 2,
        pdfPath: '',
        thumbnailPath: '',
        pages: [],
      };

      const readiness = buildEpaperReadiness({ epaper, articles: [] });
      const quality = buildEpaperEditionQualitySummary({
        pageCount: 2,
        pages: [],
        articles: [],
        epaper,
      });

      expect(quality.publishBlockers).toEqual(readiness.blockers);
      expect(quality.publishBlockers.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow Gates (ready_to_publish & published)', () => {
    function createMockRepo(overrides: Partial<EpaperRepository> = {}): EpaperRepository {
      return {
        connect: vi.fn(),
        isValidId: vi.fn(() => true),
        findEditionById: vi.fn(),
        listArticles: vi.fn().mockResolvedValue([]),
        updateEdition: vi.fn(),
        updateEditionWithCas: vi.fn(),
        publishEdition: vi.fn(),
        findLatestProcessingJob: vi.fn().mockResolvedValue(null),
        resolveAssignee: vi.fn().mockResolvedValue(null),
        ...overrides,
      } as unknown as EpaperRepository;
    }

    it('rejects ready_to_publish transition when publish blockers exist', async () => {
      const mockRepo = createMockRepo({
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          publicationType: 'epaper',
          citySlug: 'indore',
          cityName: 'Indore',
          title: 'Draft Title',
          pageCount: 2,
          pdfPath: '', // Missing PDF blocker!
          thumbnailPath: '/thumb.jpg',
          pages: [
            { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
            { pageNumber: 2, imagePath: '/page-2.jpg', processingStatus: 'ready' },
          ],
          status: 'draft',
          productionStatus: 'hotspot_mapping',
        }),
      });

      const service = new EpaperEditorialService(mockRepo);

      await expect(
        service.updateWorkflow(superAdminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'ready_to_publish',
        })
      ).rejects.toThrow(EpaperValidationError);

      await expect(
        service.updateWorkflow(superAdminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'ready_to_publish',
        })
      ).rejects.toThrow(/PDF file is missing/);
    });

    it('rejects direct publish transition when publish blockers exist', async () => {
      const mockRepo = createMockRepo({
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          publicationType: 'epaper',
          citySlug: 'indore',
          cityName: 'Indore',
          title: 'Draft Title',
          pageCount: 2,
          pdfPath: '/uploads/paper.pdf',
          thumbnailPath: '/thumb.jpg',
          pages: [
            { pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' },
            { pageNumber: 2, imagePath: '', processingStatus: 'pending' }, // Missing page image!
          ],
          status: 'draft',
          productionStatus: 'hotspot_mapping',
        }),
      });

      const service = new EpaperEditorialService(mockRepo);

      await expect(
        service.updateWorkflow(superAdminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'published',
        })
      ).rejects.toThrow(EpaperValidationError);
    });

    it('rejects publishing if background processing job is still active', async () => {
      const mockRepo = createMockRepo({
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          publicationType: 'epaper',
          citySlug: 'indore',
          cityName: 'Indore',
          title: 'Draft Title',
          pageCount: 1,
          pdfPath: '/uploads/paper.pdf',
          thumbnailPath: '/thumb.jpg',
          pages: [{ pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' }],
          status: 'draft',
          productionStatus: 'ready_to_publish',
        }),
        findLatestProcessingJob: vi.fn().mockResolvedValue({
          status: 'processing',
        }),
      });

      const service = new EpaperEditorialService(mockRepo);

      await expect(
        service.updateWorkflow(superAdminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'published',
        })
      ).rejects.toThrow(/Background processing job is still active/);
    });

    it('rejects publishing if processing generation is stale', async () => {
      const mockRepo = createMockRepo({
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          publicationType: 'epaper',
          citySlug: 'indore',
          cityName: 'Indore',
          title: 'Draft Title',
          pageCount: 1,
          pdfPath: '/uploads/paper.pdf',
          thumbnailPath: '/thumb.jpg',
          processingGeneration: 'gen-old-123',
          pages: [{ pageNumber: 1, imagePath: '/page-1.jpg', processingStatus: 'ready' }],
          status: 'draft',
          productionStatus: 'ready_to_publish',
        }),
        findLatestProcessingJob: vi.fn().mockResolvedValue({
          status: 'completed',
          generation: 'gen-newer-456',
        }),
      });

      const service = new EpaperEditorialService(mockRepo);

      await expect(
        service.updateWorkflow(superAdminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'published',
        })
      ).rejects.toThrow(/Processing generation is stale/);
    });

    it('rejects non-super_admin from publishing an edition', async () => {
      const mockRepo = createMockRepo();
      const service = new EpaperEditorialService(mockRepo);

      await expect(
        service.updateWorkflow(adminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'published',
        })
      ).rejects.toThrow(EpaperForbiddenError);

      await expect(
        service.updateWorkflow(copyEditorActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'published',
        })
      ).rejects.toThrow(EpaperForbiddenError);
    });

    it('rejects publishing an archived edition', async () => {
      const mockRepo = createMockRepo({
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          status: 'draft',
          productionStatus: 'archived',
        }),
      });

      const service = new EpaperEditorialService(mockRepo);

      await expect(
        service.updateWorkflow(superAdminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'published',
        })
      ).rejects.toThrow(EpaperConflictError);
    });

    it('does not trust client-supplied readiness and reloads canonical state', async () => {
      const mockRepo = createMockRepo({
        findEditionById: vi.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          publicationType: 'epaper',
          citySlug: 'indore',
          cityName: 'Indore',
          title: 'Draft Title',
          pageCount: 2,
          pdfPath: '', // Server-side canonical is actually broken
          thumbnailPath: '',
          pages: [],
          status: 'draft',
          productionStatus: 'ready_to_publish',
        }),
      });

      const service = new EpaperEditorialService(mockRepo);

      // Client passes fake readiness claims in the payload body
      await expect(
        service.updateWorkflow(superAdminActor, '507f1f77bcf86cd799439011', {
          productionStatus: 'published',
          readiness: { blockers: [], status: 'ready' },
          quality: { publishBlockers: [] },
        })
      ).rejects.toThrow(EpaperValidationError);
    });
  });
});
