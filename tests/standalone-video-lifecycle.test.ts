import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { MediaRepository } from '@/lib/server/media/mediaRepository';
import { VideoLifecycleService } from '@/lib/server/video/videoLifecycleService';
import { VideoForbiddenError, VideoValidationError } from '@/lib/server/video/videoTypes';

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

describe('VideoLifecycleService', () => {
  let repository: MediaRepository;
  let lifecycleService: VideoLifecycleService;

  beforeEach(() => {
    repository = {
      getMediaById: vi.fn(async (id: string) => {
        if (id === 'valid-video-asset') {
          return {
            _id: 'valid-video-asset',
            createdById: 'reporter-1',
            provider: 'do-spaces',
            objectKey: 'videos/clip.mp4',
            url: 'https://spaces.lokswami.in/videos/clip.mp4',
            type: 'video/mp4',
            status: 'verified',
            mediaKind: 'video',
            ownerType: 'library',
          };
        }
        if (id === 'foreign-video-asset') {
          return {
            _id: 'foreign-video-asset',
            createdById: 'other-user',
            provider: 'do-spaces',
            objectKey: 'videos/other.mp4',
            url: 'https://spaces.lokswami.in/videos/other.mp4',
            type: 'video/mp4',
            status: 'verified',
            mediaKind: 'video',
            ownerType: 'library',
          };
        }
        return null;
      }),
    } as unknown as MediaRepository;

    lifecycleService = new VideoLifecycleService(repository);
  });

  describe('Lifecycle State Transitions', () => {
    it('allows valid progressive transitions', () => {
      expect(() =>
        lifecycleService.validateTransition('uploaded', 'processing', copyEditorActor)
      ).not.toThrow();

      expect(() =>
        lifecycleService.validateTransition('processing', 'ready', copyEditorActor)
      ).not.toThrow();

      expect(() =>
        lifecycleService.validateTransition('ready', 'review', copyEditorActor)
      ).not.toThrow();

      expect(() =>
        lifecycleService.validateTransition('review', 'approved', copyEditorActor)
      ).not.toThrow();

      expect(() =>
        lifecycleService.validateTransition('approved', 'published', copyEditorActor)
      ).not.toThrow();
    });

    it('rejects jumping from uploaded or processing directly to published', () => {
      expect(() =>
        lifecycleService.validateTransition('uploaded', 'published', copyEditorActor)
      ).toThrowError(/Cannot transition video from uploaded directly to published/i);

      expect(() =>
        lifecycleService.validateTransition('processing', 'published', copyEditorActor)
      ).toThrowError(/Invalid video lifecycle transition from processing to published/i);
    });

    it('allows failure transition and retry recovery', () => {
      expect(() =>
        lifecycleService.validateTransition('processing', 'failed', copyEditorActor)
      ).not.toThrow();

      expect(() =>
        lifecycleService.validateTransition('failed', 'processing', copyEditorActor)
      ).not.toThrow();

      expect(() =>
        lifecycleService.validateTransition('failed', 'uploaded', copyEditorActor)
      ).not.toThrow();

      expect(() =>
        lifecycleService.validateTransition('failed', 'published', copyEditorActor)
      ).toThrowError(/Cannot transition failed video to published/i);
    });

    it('governs reopening published video to review with role check', () => {
      expect(() =>
        lifecycleService.validateTransition('published', 'review', reporterActor)
      ).toThrow(VideoForbiddenError);

      expect(() =>
        lifecycleService.validateTransition('published', 'review', copyEditorActor)
      ).toThrow(VideoForbiddenError);

      expect(() =>
        lifecycleService.validateTransition('published', 'review', adminActor)
      ).not.toThrow();
    });
  });

  describe('Accessibility Metadata Validation', () => {
    it('accepts valid HTTPS WebVTT caption URLs and transcripts', () => {
      const result = lifecycleService.validateAccessibility({
        captionUrl: 'https://cdn.lokswami.in/captions/clip.vtt',
        transcript: 'This is a sample video transcript.',
      });

      expect(result).toEqual({
        hasCaptions: true,
        hasTranscript: true,
        controls: true,
      });
    });

    it('rejects invalid caption formats and non-HTTPS protocols', () => {
      expect(() =>
        lifecycleService.validateAccessibility({
          captionUrl: 'http://insecure.lokswami.in/captions/clip.vtt',
        })
      ).toThrow(VideoValidationError);

      expect(() =>
        lifecycleService.validateAccessibility({
          captionUrl: 'https://cdn.lokswami.in/captions/clip.srt',
        })
      ).toThrowError(/Video captions must be a valid HTTPS WebVTT \(\.vtt\) file/i);
    });
  });

  describe('Source Asset Resolution & RBAC', () => {
    it('passes through external/YouTube providers without requiring storage receipt', async () => {
      const result = await lifecycleService.resolveSourceAsset({
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        mediaProvider: 'youtube',
        actor: reporterActor,
      });

      expect(result.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.sourceAssetId).toBeUndefined();
    });

    it('resolves spaces-mp4 video from verified server upload receipt', async () => {
      const result = await lifecycleService.resolveSourceAsset({
        sourceAssetId: 'valid-video-asset',
        mediaProvider: 'spaces-mp4',
        actor: reporterActor,
      });

      expect(result.sourceAssetId).toBe('valid-video-asset');
      expect(result.videoUrl).toBe('https://spaces.lokswami.in/videos/clip.mp4');
    });

    it('rejects foreign upload receipts for reporter role', async () => {
      await expect(
        lifecycleService.resolveSourceAsset({
          sourceAssetId: 'foreign-video-asset',
          mediaProvider: 'spaces-mp4',
          actor: reporterActor,
        })
      ).rejects.toThrow(VideoForbiddenError);
    });

    it('allows foreign upload receipts for admin role', async () => {
      const result = await lifecycleService.resolveSourceAsset({
        sourceAssetId: 'foreign-video-asset',
        mediaProvider: 'spaces-mp4',
        actor: adminActor,
      });

      expect(result.sourceAssetId).toBe('foreign-video-asset');
      expect(result.videoUrl).toBe('https://spaces.lokswami.in/videos/other.mp4');
    });

    it('throws 404 if source asset receipt does not exist', async () => {
      await expect(
        lifecycleService.resolveSourceAsset({
          sourceAssetId: 'nonexistent-asset',
          mediaProvider: 'spaces-mp4',
          actor: reporterActor,
        })
      ).rejects.toThrow(VideoValidationError);
    });
  });
});
