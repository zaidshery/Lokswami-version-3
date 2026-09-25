import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import { EpaperConflictError, type AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';
import { EpaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperPageService } from '@/lib/server/epaper/epaperPageService';
import { EpaperArticleService } from '@/lib/server/epaper/epaperArticleService';
import { EpaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { EpaperRevisionService } from '@/lib/server/epaper/epaperRevisionService';
import { createEpaperUploadReceipt } from '@/lib/storage/epaperUploadReceipt';

const superAdminActor: AdminSessionIdentity = {
  id: 'super-admin-1',
  name: 'Super Admin',
  email: 'superadmin@lokswami.com',
  username: 'superadmin',
  role: 'super_admin',
};

const adminActor: AdminSessionIdentity = {
  id: 'admin-1',
  name: 'Regular Admin',
  email: 'admin@lokswami.com',
  username: 'admin',
  role: 'admin',
};

const copyEditorActor: AdminSessionIdentity = {
  id: 'copy-editor-1',
  name: 'Copy Editor',
  email: 'copyeditor@lokswami.com',
  username: 'copyeditor',
  role: 'copy_editor',
};

const reporterActor: AdminSessionIdentity = {
  id: 'reporter-1',
  name: 'Reporter',
  email: 'reporter@lokswami.com',
  username: 'reporter',
  role: 'reporter',
};

describe('Phase 3.9A — E-Paper Draft Immutability & Central Policy', () => {
  describe('assertEpaperDraftEditable unit contract', () => {
    it('allows mutation for valid draft editions', () => {
      expect(() =>
        assertEpaperDraftEditable({ status: 'draft', productionStatus: 'draft_upload' })
      ).not.toThrow();
      expect(() =>
        assertEpaperDraftEditable({ status: 'draft', productionStatus: 'hotspot_mapping' })
      ).not.toThrow();
      expect(() =>
        assertEpaperDraftEditable({ status: 'draft', productionStatus: 'qa_review' })
      ).not.toThrow();
    });

    it('rejects mutation when status or productionStatus is published', () => {
      expect(() =>
        assertEpaperDraftEditable({ status: 'published', productionStatus: 'published' })
      ).toThrow(EpaperConflictError);
      expect(() =>
        assertEpaperDraftEditable({ status: 'published', productionStatus: 'ready_to_publish' })
      ).toThrow(EpaperConflictError);
      expect(() =>
        assertEpaperDraftEditable({ status: 'draft', productionStatus: 'published' })
      ).toThrow(EpaperConflictError);
    });

    it('rejects mutation when status or productionStatus is archived', () => {
      expect(() =>
        assertEpaperDraftEditable({ status: 'archived', productionStatus: 'archived' })
      ).toThrow(EpaperConflictError);
      expect(() =>
        assertEpaperDraftEditable({ status: 'draft', productionStatus: 'archived' })
      ).toThrow(EpaperConflictError);
    });

    it('fails closed when epaper argument is missing or invalid', () => {
      expect(() => assertEpaperDraftEditable(null as never)).toThrow(EpaperConflictError);
      expect(() => assertEpaperDraftEditable(undefined as never)).toThrow(EpaperConflictError);
    });
  });

  describe('epaperEditorialService.updateMetadata immutability', () => {
    let mockRepo: any;
    let service: EpaperEditorialService;

    beforeEach(() => {
      mockRepo = {
        connect: vi.fn().mockResolvedValue(undefined),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn(),
        updateEdition: vi.fn(),
      };
      service = new EpaperEditorialService(mockRepo);
    });

    it('permits metadata updates on draft editions', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Original Draft Title',
        publishDate: new Date('2026-09-25T00:00:00Z'),
        status: 'draft',
        productionStatus: 'hotspot_mapping',
      });
      mockRepo.updateEdition.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Updated Draft Title',
        publishDate: new Date('2026-09-25T00:00:00Z'),
        status: 'draft',
        productionStatus: 'hotspot_mapping',
      });

      const res = await service.updateMetadata(superAdminActor, '507f1f77bcf86cd799439011', {
        title: 'Updated Draft Title',
      });

      expect(res.data.title).toBe('Updated Draft Title');
      expect(mockRepo.updateEdition).toHaveBeenCalled();
    });

    it('blocks metadata updates on published editions with 409 conflict', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Live Published Edition',
        publishDate: new Date('2026-09-25T00:00:00Z'),
        status: 'published',
        productionStatus: 'published',
      });

      await expect(
        service.updateMetadata(superAdminActor, '507f1f77bcf86cd799439011', {
          title: 'Malicious Change To Live',
        })
      ).rejects.toThrow(EpaperConflictError);

      expect(mockRepo.updateEdition).not.toHaveBeenCalled();
    });

    it('blocks metadata updates on archived editions with 409 conflict', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Archived Edition',
        publishDate: new Date('2026-09-25T00:00:00Z'),
        status: 'draft',
        productionStatus: 'archived',
      });

      await expect(
        service.updateMetadata(superAdminActor, '507f1f77bcf86cd799439011', {
          title: 'Try Modifying Archive',
        })
      ).rejects.toThrow(EpaperConflictError);

      expect(mockRepo.updateEdition).not.toHaveBeenCalled();
    });
  });

  describe('epaperPageService.update immutability', () => {
    let mockRepo: any;
    let service: EpaperPageService;

    beforeEach(() => {
      mockRepo = {
        connect: vi.fn().mockResolvedValue(undefined),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn(),
        updateEdition: vi.fn(),
      };
      service = new EpaperPageService(mockRepo);
    });

    it('blocks page updates on published editions', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        status: 'published',
        productionStatus: 'published',
        pageCount: 2,
        pages: [],
      });

      await expect(
        service.update(
          superAdminActor,
          '507f1f77bcf86cd799439011',
          { pages: [{ pageNumber: 1, classificationNote: 'Modified' }] },
          'application/json'
        )
      ).rejects.toThrow(EpaperConflictError);

      expect(mockRepo.updateEdition).not.toHaveBeenCalled();
    });
  });

  describe('epaperArticleService.create hotspot immutability', () => {
    let mockRepo: any;
    let service: EpaperArticleService;

    beforeEach(() => {
      mockRepo = {
        connect: vi.fn().mockResolvedValue(undefined),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn(),
        createArticle: vi.fn(),
      };
      service = new EpaperArticleService(mockRepo);
    });

    it('blocks article and hotspot creation on published editions', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        status: 'published',
        productionStatus: 'published',
        pageCount: 4,
        pages: [],
      });

      await expect(
        service.create(superAdminActor, '507f1f77bcf86cd799439011', {
          pageNumber: 1,
          title: 'Direct Hotspot Mapping on Live',
          hotspot: { x: 10, y: 10, width: 20, height: 20 },
        })
      ).rejects.toThrow(EpaperConflictError);

      expect(mockRepo.createArticle).not.toHaveBeenCalled();
    });
  });

  describe('epaperUploadService.finalize draft upload immutability', () => {
    let mockRepo: any;
    let mockWorker: any;
    let service: EpaperUploadService;

    beforeEach(() => {
      mockRepo = {
        connect: vi.fn().mockResolvedValue(undefined),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn(),
        updateEdition: vi.fn(),
      };
      mockWorker = {
        isPageProcessingEnabled: vi.fn().mockReturnValue(true),
        queuePageProcessing: vi.fn(),
      };
      service = new EpaperUploadService(mockRepo, mockWorker);
    });

    it('rejects finalize against published editions with 409 conflict', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        status: 'published',
        productionStatus: 'published',
        publicationType: 'epaper',
      });

      await expect(
        service.finalize(superAdminActor, '507f1f77bcf86cd799439011', {
          mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test.pdf',
        })
      ).rejects.toThrow(EpaperConflictError);
    });

    it('rejects finalize against archived editions with 409 conflict', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        status: 'draft',
        productionStatus: 'archived',
        publicationType: 'epaper',
      });

      await expect(
        service.finalize(superAdminActor, '507f1f77bcf86cd799439011', {
          mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test.pdf',
        })
      ).rejects.toThrow(EpaperConflictError);
    });

    it('rejects finalize against draft editions not in draft_upload state', async () => {
      mockRepo.findEditionById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        status: 'draft',
        productionStatus: 'hotspot_mapping',
        publicationType: 'epaper',
      });

      await expect(
        service.finalize(superAdminActor, '507f1f77bcf86cd799439011', {
          mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test.pdf',
        })
      ).rejects.toThrow(EpaperConflictError);
    });
  });

  describe('Revision flow preserves published original unchanged', () => {
    let mockRepo: any;
    let service: EpaperRevisionService;

    beforeEach(() => {
      mockRepo = {
        connect: vi.fn().mockResolvedValue(undefined),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn(),
        findEdition: vi.fn(),
        findLatestRevision: vi.fn(),
        updateEditionWhere: vi.fn(),
        createEdition: vi.fn(),
        listArticles: vi.fn().mockResolvedValue([]),
        listReadyTtsAssets: vi.fn().mockResolvedValue([]),
      };
      service = new EpaperRevisionService(mockRepo);
    });

    it('creates new draft revision without mutating published original', async () => {
      const publishedOriginal = {
        _id: '507f1f77bcf86cd799439011',
        familyId: 'family-100',
        revisionNumber: 1,
        isCurrentRevision: true,
        status: 'published',
        productionStatus: 'published',
        publicationType: 'epaper',
        citySlug: 'indore',
        cityName: 'Indore',
        title: 'Original Published Edition',
        publishDate: new Date('2026-09-25T00:00:00Z'),
        pageCount: 8,
        pages: [],
      };
      mockRepo.findEditionById.mockResolvedValue(publishedOriginal);
      mockRepo.findEdition.mockResolvedValue(null);
      mockRepo.findLatestRevision.mockResolvedValue({ revisionNumber: 1 });
      mockRepo.createEdition.mockImplementation(async (doc: any) => ({
        ...doc,
        _id: '507f1f77bcf86cd799439022',
      }));

      const res = await service.create(superAdminActor, '507f1f77bcf86cd799439011');

      // Published original remains unchanged in DB
      expect(publishedOriginal.status).toBe('published');
      expect(publishedOriginal.isCurrentRevision).toBe(true);

      // New revision has correct revision properties
      expect(res.data.revisionId).toBe('507f1f77bcf86cd799439022');
      expect(res.data.revisionNumber).toBe(2);
      expect(res.data.familyId).toBe('family-100');

      // Check createEdition was called with draft status and isCurrentRevision: false
      expect(mockRepo.createEdition).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
          productionStatus: 'hotspot_mapping',
          isCurrentRevision: false,
          familyId: 'family-100',
          revisionNumber: 2,
        })
      );
    });
  });

  describe('RBAC enforcement for E-Paper operations', () => {
    it('denies non-super_admin roles across all operations', async () => {
      const mockRepo = {
        connect: vi.fn().mockResolvedValue(undefined),
        isValidId: vi.fn().mockReturnValue(true),
        findEditionById: vi.fn(),
      };
      const editorialService = new EpaperEditorialService(mockRepo as any);
      const uploadService = new EpaperUploadService(mockRepo as any, {} as any);
      const revisionService = new EpaperRevisionService(mockRepo as any);

      // regular admin denied
      await expect(editorialService.updateMetadata(adminActor, '507f1f77bcf86cd799439011', {})).rejects.toThrow();
      await expect(uploadService.initialize(adminActor, {})).rejects.toThrow();
      await expect(uploadService.finalize(adminActor, '507f1f77bcf86cd799439011', {})).rejects.toThrow();
      await expect(revisionService.create(adminActor, '507f1f77bcf86cd799439011')).rejects.toThrow();

      // copy_editor denied
      await expect(editorialService.updateMetadata(copyEditorActor, '507f1f77bcf86cd799439011', {})).rejects.toThrow();
      await expect(uploadService.initialize(copyEditorActor, {})).rejects.toThrow();

      // reporter denied
      await expect(editorialService.updateMetadata(reporterActor, '507f1f77bcf86cd799439011', {})).rejects.toThrow();
      await expect(uploadService.initialize(reporterActor, {})).rejects.toThrow();
    });
  });
});
