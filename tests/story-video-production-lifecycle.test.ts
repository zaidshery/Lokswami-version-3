import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { MediaRepository } from '@/lib/server/media/mediaRepository';
import {
  StoryVideoProductionService,
} from '@/lib/server/media/storyVideoProductionService';
import type { VideoMasterVerificationService, VerifiedVideoMaster } from '@/lib/server/media/videoMasterVerificationService';
import { StoryVersionConflictError } from '@/lib/server/storyEditorialService';
import {
  createEmptyStoryVideoProduction,
  type StoryVideoProduction,
} from '@/lib/content/newsroomPublishing';

const adminActor: AdminSessionIdentity = {
  id: 'admin-1',
  email: 'admin@lokswami.com',
  name: 'Admin User',
  username: 'admin',
  role: 'admin',
};

const copyEditorActor: AdminSessionIdentity = {
  id: 'editor-1',
  email: 'editor@lokswami.com',
  name: 'Editor User',
  username: 'editor',
  role: 'copy_editor',
};

const reporterActor: AdminSessionIdentity = {
  id: 'reporter-1',
  email: 'reporter@lokswami.com',
  name: 'Reporter User',
  username: 'reporter',
  role: 'reporter',
};

describe('StoryVideoProductionService Lifecycle & Verification', () => {
  let repository: MediaRepository;
  let verificationService: VideoMasterVerificationService;
  let productionService: StoryVideoProductionService;

  beforeEach(() => {
    repository = {
      attachMediaToStory: vi.fn(async () => {}),
      addReference: vi.fn(async () => {}),
      removeReference: vi.fn(async () => {}),
    } as unknown as MediaRepository;

    verificationService = {
      verifyMasterExport: vi.fn(async (): Promise<VerifiedVideoMaster> => ({
        assetId: 'asset-123',
        mediaKey: 'stories/story-1/master.mp4',
        mediaUrl: 'https://cdn.lokswami.in/stories/story-1/master.mp4',
        sizeBytes: 1048576,
        durationSeconds: 90,
        aspectRatio: '16:9',
        container: 'mp4',
        codec: 'avc1',
        verifiedAt: new Date().toISOString(),
      })),
    } as unknown as VideoMasterVerificationService;

    productionService = new StoryVideoProductionService(repository, verificationService);
  });

  describe('Transition validation graph', () => {
    it('allows valid progressive transitions from not_started to published', () => {
      const prodWithoutMaster: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'not_started',
      };
      expect(() =>
        productionService.validateTransition('not_started', 'editing', copyEditorActor, prodWithoutMaster)
      ).not.toThrow();

      const prodWithMaster: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'editing',
        masterAssetId: 'asset-123',
        masterExportUrl: 'https://cdn.lokswami.in/stories/story-1/master.mp4',
      };

      expect(() =>
        productionService.validateTransition('editing', 'qa_review', copyEditorActor, prodWithMaster)
      ).not.toThrow();

      expect(() =>
        productionService.validateTransition('qa_review', 'ready_to_publish', copyEditorActor, prodWithMaster)
      ).not.toThrow();

      expect(() =>
        productionService.validateTransition('ready_to_publish', 'published', copyEditorActor, prodWithMaster)
      ).not.toThrow();
    });

    it('rejects ready_to_publish if master asset is missing', () => {
      const prodWithoutMaster: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'qa_review',
      };
      expect(() =>
        productionService.validateTransition('qa_review', 'ready_to_publish', copyEditorActor, prodWithoutMaster)
      ).toThrowError(/ready_to_publish without a verified master export/i);
    });

    it('allows failed transition and retry back to editing', () => {
      const editingProd: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'editing',
      };
      expect(() =>
        productionService.validateTransition('editing', 'failed', copyEditorActor, editingProd)
      ).not.toThrow();

      const failedProd: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'failed',
      };
      expect(() =>
        productionService.validateTransition('failed', 'editing', copyEditorActor, failedProd)
      ).not.toThrow();
    });

    it('rejects jumping directly from not_started to published or ready_to_publish', () => {
      const prod: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'not_started',
      };
      expect(() =>
        productionService.validateTransition('not_started', 'published', copyEditorActor, prod)
      ).toThrowError(/Cannot transition video production directly from not_started to published/i);

      expect(() =>
        productionService.validateTransition('not_started', 'ready_to_publish', copyEditorActor, prod)
      ).toThrowError(/Cannot transition video production directly from not_started to ready_to_publish/i);
    });

    it('enforces RBAC when reopening published video production', () => {
      const publishedProd: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'published',
        masterAssetId: 'asset-123',
      };
      expect(() =>
        productionService.validateTransition('published', 'editing', reporterActor, publishedProd)
      ).toThrowError(/Only admins can reopen a published video production package/i);

      expect(() =>
        productionService.validateTransition('published', 'editing', copyEditorActor, publishedProd)
      ).toThrowError(/Only admins can reopen a published video production package/i);

      expect(() =>
        productionService.validateTransition('published', 'editing', adminActor, publishedProd)
      ).not.toThrow();
    });
  });

  describe('Master export attachment', () => {
    it('verifies master export and attaches technical metadata', async () => {
      const currentProduction: StoryVideoProduction = {
        ...createEmptyStoryVideoProduction(),
        status: 'editing',
      };

      const result = await productionService.attachMaster(
        'story-1',
        'asset-123',
        copyEditorActor,
        currentProduction
      );

      expect(verificationService.verifyMasterExport).toHaveBeenCalledWith({
        assetId: 'asset-123',
        expectedStoryId: 'story-1',
        actor: copyEditorActor,
      });

      expect(repository.addReference).toHaveBeenCalledWith('asset-123', {
        ownerType: 'story',
        ownerId: 'story-1',
        field: 'videoProduction.master',
        attachedAt: expect.any(Date),
      });

      expect(result.masterAssetId).toBe('asset-123');
      expect(result.masterExportUrl).toBe('https://cdn.lokswami.in/stories/story-1/master.mp4');
      expect(result.status).toBe('editing');
      expect(result.technicalMetadata).toMatchObject({
        sizeBytes: 1048576,
        durationSeconds: 90,
        aspectRatio: '16:9',
        codec: 'avc1',
      });
      expect(result.lastError).toBeNull();
    });

    it('rejects unverified master export without throwing away valid production state', async () => {
      vi.mocked(verificationService.verifyMasterExport).mockRejectedValueOnce(
        new Error('Storage object not found')
      );

      await expect(
        productionService.attachMaster(
          'story-1',
          'nonexistent-asset',
          copyEditorActor,
          { ...createEmptyStoryVideoProduction(), status: 'editing' }
        )
      ).rejects.toThrow('Storage object not found');
    });
  });

  describe('Concurrency conflicts (CAS)', () => {
    it('StoryVersionConflictError encapsulates version conflicts', () => {
      const err = new StoryVersionConflictError(5);
      expect(err.currentVersion).toBe(5);
      expect(err.code).toBe('STORY_VERSION_CONFLICT');
      expect(err.name).toBe('StoryVersionConflictError');
    });
  });
});
