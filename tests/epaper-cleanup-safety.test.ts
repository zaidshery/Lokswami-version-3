// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { epaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { epaperRepository } from '@/lib/server/epaper/epaperRepository';
import {
  cleanupAbandonedEpaperUploads,
  isAbandonedDraftCandidate,
} from '@/lib/server/epaperProcessingJobs';
import * as epaperStorage from '@/lib/utils/epaperStorage';
import type { AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';

vi.mock('server-only', () => ({}));

const superAdminActor: AdminSessionIdentity = {
  id: 'super-admin-1',
  name: 'Super Admin',
  email: 'superadmin@example.com',
  username: 'superadmin',
  role: 'super_admin',
};

const deskAdminActor: AdminSessionIdentity = {
  id: 'admin-1',
  name: 'Desk Admin',
  email: 'admin@example.com',
  username: 'admin',
  role: 'admin',
};

describe('E-Paper Reference-Safe Deletion & Cleanup Safety (Phase 3.9D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('epaperEditorialService.delete - Reference Safety & Immutability', () => {
    it('blocks non-super_admin roles from deleting an edition', async () => {
      const nonSuperRoles: AdminSessionIdentity[] = [
        deskAdminActor,
        { id: 'copy-1', name: 'Copy', email: 'copy@example.com', username: 'copy', role: 'copy_editor' },
        { id: 'rep-1', name: 'Reporter', email: 'rep@example.com', username: 'reporter', role: 'reporter' },
      ];

      for (const actor of nonSuperRoles) {
        await expect(
          epaperEditorialService.delete(actor, '665000000000000000000001')
        ).rejects.toThrow(/Forbidden/i);
      }
    });

    it('rejects deletion of published editions to enforce draft immutability', async () => {
      const mockPublished = {
        _id: '665000000000000000000001',
        title: 'Indore Edition',
        status: 'published',
        productionStatus: 'published',
        isCurrentRevision: true,
        pages: [],
      };

      vi.spyOn(epaperRepository, 'connect').mockResolvedValue(undefined);
      vi.spyOn(epaperRepository, 'findEditionById').mockResolvedValue(mockPublished as never);

      await expect(
        epaperEditorialService.delete(superAdminActor, '665000000000000000000001')
      ).rejects.toThrow(/Published editions are immutable/i);
    });

    it('rejects deletion of current published revisions', async () => {
      const mockCurrent = {
        _id: '665000000000000000000001',
        title: 'Indore Edition',
        status: 'draft',
        productionStatus: 'ready_to_publish',
        isCurrentRevision: true,
        pages: [],
      };

      vi.spyOn(epaperRepository, 'connect').mockResolvedValue(undefined);
      vi.spyOn(epaperRepository, 'findEditionById').mockResolvedValue(mockCurrent as never);

      await expect(
        epaperEditorialService.delete(superAdminActor, '665000000000000000000001')
      ).rejects.toThrow(/Current published revision cannot be deleted/i);
    });

    it('rejects deletion of archived editions', async () => {
      const mockArchived = {
        _id: '665000000000000000000001',
        title: 'Archived Edition',
        status: 'draft',
        productionStatus: 'archived',
        isCurrentRevision: false,
        pages: [],
      };

      vi.spyOn(epaperRepository, 'connect').mockResolvedValue(undefined);
      vi.spyOn(epaperRepository, 'findEditionById').mockResolvedValue(mockArchived as never);

      await expect(
        epaperEditorialService.delete(superAdminActor, '665000000000000000000001')
      ).rejects.toThrow(/Archived editions are immutable/i);
    });

    it('retains storage assets referenced by published revision N when draft revision N+1 is deleted', async () => {
      const sharedPdf = 'https://lokswami.nyc3.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-25/shared.pdf';
      const sharedThumb = 'https://lokswami.nyc3.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-25/shared-thumb.jpg';
      const sharedPage1 = 'https://lokswami.nyc3.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-25/shared-p1.jpg';
      const uniquePage2 = 'https://lokswami.nyc3.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-25/unique-draft-p2.jpg';

      const draftRevision = {
        _id: '665000000000000000000002',
        title: 'Indore Edition Revision 2',
        status: 'draft',
        productionStatus: 'hotspot_mapping',
        familyId: 'family-indore-2026-09-25',
        revisionNumber: 2,
        isCurrentRevision: false,
        pdfPath: sharedPdf,
        thumbnailPath: sharedThumb,
        pages: [
          { pageNumber: 1, imagePath: sharedPage1 },
          { pageNumber: 2, imagePath: uniquePage2 },
        ],
      };

      vi.spyOn(epaperRepository, 'connect').mockResolvedValue(undefined);
      vi.spyOn(epaperRepository, 'findEditionById').mockResolvedValue(draftRevision as never);
      vi.spyOn(epaperRepository, 'deleteEditionCascade').mockResolvedValue(draftRevision as never);

      // isAssetReferencedElsewhere returns true for shared assets, false for unique asset
      vi.spyOn(epaperRepository, 'isAssetReferencedElsewhere').mockImplementation(
        async (assetPath: string, excludeId: string) => {
          expect(excludeId).toBe('665000000000000000000002');
          return assetPath === sharedPdf || assetPath === sharedThumb || assetPath === sharedPage1;
        }
      );

      const deleteAssetFileSpy = vi.spyOn(epaperStorage, 'deleteAssetFile').mockResolvedValue(undefined);

      const result = await epaperEditorialService.delete(superAdminActor, '665000000000000000000002');

      expect(result.message).toContain('deleted');
      expect(result.data.retainedAssets).toContain(sharedPdf);
      expect(result.data.retainedAssets).toContain(sharedThumb);
      expect(result.data.retainedAssets).toContain(sharedPage1);
      expect(result.data.deletedAssets).toContain(uniquePage2);

      // Verify that deleteAssetFile was ONLY called for unique asset, never for shared assets!
      expect(deleteAssetFileSpy).toHaveBeenCalledTimes(1);
      expect(deleteAssetFileSpy).toHaveBeenCalledWith(uniquePage2);
      expect(deleteAssetFileSpy).not.toHaveBeenCalledWith(sharedPdf);
      expect(deleteAssetFileSpy).not.toHaveBeenCalledWith(sharedThumb);
      expect(deleteAssetFileSpy).not.toHaveBeenCalledWith(sharedPage1);
    });

    it('recovers gracefully from partial storage deletion failure without unhandled error', async () => {
      const uniquePage1 = 'https://lokswami.nyc3.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-25/p1.jpg';
      const failingPage2 = 'https://lokswami.nyc3.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-25/p2.jpg';

      const draft = {
        _id: '665000000000000000000003',
        status: 'draft',
        productionStatus: 'draft_upload',
        isCurrentRevision: false,
        pages: [
          { pageNumber: 1, imagePath: uniquePage1 },
          { pageNumber: 2, imagePath: failingPage2 },
        ],
      };

      vi.spyOn(epaperRepository, 'connect').mockResolvedValue(undefined);
      vi.spyOn(epaperRepository, 'findEditionById').mockResolvedValue(draft as never);
      vi.spyOn(epaperRepository, 'deleteEditionCascade').mockResolvedValue(draft as never);
      vi.spyOn(epaperRepository, 'isAssetReferencedElsewhere').mockResolvedValue(false);

      vi.spyOn(epaperStorage, 'deleteAssetFile').mockImplementation(async (path: string) => {
        if (path === failingPage2) {
          throw new Error('Spaces network timeout');
        }
      });

      const result = await epaperEditorialService.delete(superAdminActor, '665000000000000000000003');

      expect(result.data.deletedAssets).toContain(uniquePage1);
      expect(result.data.failedAssets).toHaveLength(1);
      expect(result.data.failedAssets[0].asset).toBe(failingPage2);
      expect(result.data.failedAssets[0].error).toBe('Spaces network timeout');
    });
  });

  describe('isAbandonedDraftCandidate - Pure Decision Rules', () => {
    const fixedNow = new Date('2026-09-25T12:00:00.000Z');
    const twentyThreeHoursFiftyNineMinsOld = new Date(fixedNow.getTime() - (23 * 60 + 59) * 60 * 1000);
    const twentyFourHoursOneMinOld = new Date(fixedNow.getTime() - (24 * 60 + 1) * 60 * 1000);

    it('protects recent drafts that are less than 24h old', () => {
      const recentDraft = {
        status: 'draft',
        productionStatus: 'draft_upload',
        pdfPath: '',
        isCurrentRevision: false,
        createdAt: twentyThreeHoursFiftyNineMinsOld,
      };

      expect(
        isAbandonedDraftCandidate(recentDraft, { now: fixedNow })
      ).toBe(false);
    });

    it('marks drafts older than 24h without PDF upload as eligible', () => {
      const eligibleDraft = {
        status: 'draft',
        productionStatus: 'draft_upload',
        pdfPath: '',
        isCurrentRevision: false,
        createdAt: twentyFourHoursOneMinOld,
      };

      expect(
        isAbandonedDraftCandidate(eligibleDraft, { now: fixedNow })
      ).toBe(true);
    });

    it('protects drafts with finalized PDF attachments even if older than 24h', () => {
      const finalizedDraft = {
        status: 'draft',
        productionStatus: 'draft_upload',
        pdfPath: 'https://lokswami.nyc3.digitaloceanspaces.com/finalized.pdf',
        isCurrentRevision: false,
        createdAt: twentyFourHoursOneMinOld,
      };

      expect(
        isAbandonedDraftCandidate(finalizedDraft, { now: fixedNow })
      ).toBe(false);
    });

    it('protects published editions regardless of age', () => {
      const published = {
        status: 'published',
        productionStatus: 'published',
        pdfPath: '',
        isCurrentRevision: true,
        createdAt: twentyFourHoursOneMinOld,
      };

      expect(
        isAbandonedDraftCandidate(published, { now: fixedNow })
      ).toBe(false);
    });

    it('protects current revisions regardless of age', () => {
      const current = {
        status: 'draft',
        productionStatus: 'draft_upload',
        pdfPath: '',
        isCurrentRevision: true,
        createdAt: twentyFourHoursOneMinOld,
      };

      expect(
        isAbandonedDraftCandidate(current, { now: fixedNow })
      ).toBe(false);
    });

    it('protects drafts with active processing jobs', () => {
      const draftWithJobs = {
        status: 'draft',
        productionStatus: 'draft_upload',
        pdfPath: '',
        isCurrentRevision: false,
        createdAt: twentyFourHoursOneMinOld,
      };

      expect(
        isAbandonedDraftCandidate(draftWithJobs, { now: fixedNow, hasActiveJobs: true })
      ).toBe(false);
    });
  });

  describe('cleanupAbandonedEpaperUploads - Execution & Safety', () => {
    it('runs pure dry-run without deleting records or storage', async () => {
      const now = new Date('2026-09-25T12:00:00.000Z');
      const oldDate = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      const candidates = [
        {
          _id: '665000000000000000000010',
          status: 'draft',
          productionStatus: 'draft_upload',
          isCurrentRevision: false,
          pdfPath: null,
          createdAt: oldDate,
        },
      ];

      vi.spyOn(EPaper, 'find').mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(candidates),
        }),
      } as never);

      vi.spyOn(EPaperProcessingJob, 'countDocuments').mockResolvedValue(0);
      const deleteOneSpy = vi.spyOn(EPaper, 'deleteOne').mockResolvedValue({ deletedCount: 1, acknowledged: true } as never);

      const result = await cleanupAbandonedEpaperUploads({ now, dryRun: true });

      expect(result.checked).toBe(1);
      expect(result.eligible).toBe(1);
      expect(result.deleted).toBe(0);
      expect((result as { dryRun?: boolean }).dryRun).toBe(true);
      expect(deleteOneSpy).not.toHaveBeenCalled();
    });

    it('deletes abandoned drafts, jobs, and suggestions when executed', async () => {
      const now = new Date('2026-09-25T12:00:00.000Z');
      const oldDate = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      const candidates = [
        {
          _id: '665000000000000000000011',
          status: 'draft',
          productionStatus: 'draft_upload',
          isCurrentRevision: false,
          pdfPath: null,
          pdfPublicId: '',
          createdAt: oldDate,
        },
      ];

      vi.spyOn(EPaper, 'find').mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(candidates),
        }),
      } as never);

      vi.spyOn(EPaperProcessingJob, 'countDocuments').mockResolvedValue(0);
      const deleteJobsSpy = vi.spyOn(EPaperProcessingJob, 'deleteMany').mockResolvedValue({ deletedCount: 2 } as never);
      const deleteSuggestionsSpy = vi.spyOn(EPaperOcrSuggestion, 'deleteMany').mockResolvedValue({ deletedCount: 1 } as never);
      const deleteEditionSpy = vi.spyOn(EPaper, 'deleteOne').mockResolvedValue({ deletedCount: 1, acknowledged: true } as never);

      const result = await cleanupAbandonedEpaperUploads({ now, dryRun: false });

      expect(result.checked).toBe(1);
      expect(result.eligible).toBe(1);
      expect(result.deleted).toBe(1);
      expect(deleteJobsSpy).toHaveBeenCalledWith({ epaperId: '665000000000000000000011' });
      expect(deleteSuggestionsSpy).toHaveBeenCalledWith({ epaperId: '665000000000000000000011' });
      expect(deleteEditionSpy).toHaveBeenCalled();
    });
  });
});
