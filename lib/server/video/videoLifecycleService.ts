import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { isSuperAdminRole } from '@/lib/auth/roles';
import type { VideoProcessingStatus } from '@/lib/content/videoPublication';
import { mediaRepository, type MediaRepository } from '@/lib/server/media/mediaRepository';
import { parseTrustedDigitalOceanSpacesAssetFromUrl } from '@/lib/utils/digitalOceanSpaces';
import { VideoForbiddenError, VideoValidationError } from './videoTypes';

export class VideoLifecycleService {
  constructor(private readonly repository: MediaRepository = mediaRepository) {}

  validateTransition(
    current: VideoProcessingStatus,
    target: VideoProcessingStatus,
    actor: AdminSessionIdentity
  ): void {
    if (current === target) return;

    if (current === 'uploaded') {
      if (target !== 'processing' && target !== 'ready' && target !== 'failed') {
        throw new VideoValidationError(
          `Cannot transition video from uploaded directly to ${target}. Process the asset first.`,
          400
        );
      }
      return;
    }

    if (current === 'processing') {
      if (target === 'ready' || target === 'failed') return;
      throw new VideoValidationError(
        `Invalid video lifecycle transition from processing to ${target}.`,
        400
      );
    }

    if (current === 'failed') {
      if (target !== 'processing' && target !== 'uploaded') {
        throw new VideoValidationError(
          `Cannot transition failed video to ${target}. Retry processing first.`,
          400
        );
      }
      return;
    }

    if (current === 'ready') {
      if (target === 'review' || target === 'published' || target === 'processing') return;
      throw new VideoValidationError(
        `Invalid video lifecycle transition from ready to ${target}.`,
        400
      );
    }

    if (current === 'review') {
      if (target === 'approved' || target === 'failed' || target === 'processing' || target === 'ready') return;
      throw new VideoValidationError(
        `Invalid video lifecycle transition from review to ${target}.`,
        400
      );
    }

    if (current === 'approved') {
      if (target === 'published' || target === 'review') return;
      throw new VideoValidationError(
        `Invalid video lifecycle transition from approved to ${target}.`,
        400
      );
    }

    if (current === 'published') {
      if (target === 'review') {
        if (actor.role !== 'admin' && !isSuperAdminRole(actor.role)) {
          throw new VideoForbiddenError('Only admins can return a published video to review.');
        }
        return;
      }
      throw new VideoValidationError(
        `Cannot transition published video to ${target}.`,
        400
      );
    }
  }

  validateAccessibility(input: {
    captionUrl?: string;
    transcript?: string;
  }): {
    hasCaptions: boolean;
    hasTranscript: boolean;
    controls: boolean;
  } {
    const caption = String(input.captionUrl || '').trim();
    if (caption) {
      const isHttpsVtt = /^https:\/\/[^\s]+(?:\.vtt)(?:[?#].*)?$/i.test(caption);
      if (!isHttpsVtt) {
        throw new VideoValidationError(
          'Video captions must be a valid HTTPS WebVTT (.vtt) file.',
          400
        );
      }
    }

    const transcript = String(input.transcript || '').trim();
    return {
      hasCaptions: Boolean(caption),
      hasTranscript: transcript.length > 0,
      controls: true,
    };
  }

  async resolveSourceAsset(input: {
    sourceAssetId?: string;
    videoUrl?: string;
    mediaProvider?: string;
    actor: AdminSessionIdentity;
  }): Promise<{
    sourceAssetId?: string;
    videoUrl: string;
    playbackUrl: string;
    duration?: number;
  }> {
    if (input.mediaProvider !== 'spaces-mp4') {
      return {
        videoUrl: input.videoUrl || '',
        playbackUrl: input.videoUrl || '',
      };
    }

    if (input.sourceAssetId) {
      const record = await this.repository.getMediaById(input.sourceAssetId);
      if (!record || record.status === 'deleted') {
        throw new VideoValidationError('Video source upload receipt not found.', 404);
      }
      if (record.provider !== 'do-spaces' || record.mediaKind !== 'video') {
        throw new VideoValidationError('Upload receipt is not a valid video asset.', 400);
      }
      if (
        record.createdById &&
        record.createdById !== input.actor.id &&
        input.actor.role === 'reporter'
      ) {
        throw new VideoForbiddenError('Upload receipt belongs to another user.');
      }

      return {
        sourceAssetId: String(record._id),
        videoUrl: record.url,
        playbackUrl: record.url,
        duration: undefined,
      };
    }

    // Direct URL check without asset ID (legacy or direct)
    if (input.videoUrl) {
      const parsed = parseTrustedDigitalOceanSpacesAssetFromUrl(input.videoUrl);
      const isDirectHttpsMp4 = /^https:\/\/[^\s]+(?:\.mp4)(?:[?#].*)?$/i.test(input.videoUrl);
      if (!parsed && !isDirectHttpsMp4) {
        throw new VideoValidationError(
          'Direct video uploads must use a verified server receipt or trusted storage origin.',
          400
        );
      }
      return {
        videoUrl: input.videoUrl,
        playbackUrl: input.videoUrl,
      };
    }

    throw new VideoValidationError('Video source is required.', 400);
  }
}

export const videoLifecycleService = new VideoLifecycleService();
