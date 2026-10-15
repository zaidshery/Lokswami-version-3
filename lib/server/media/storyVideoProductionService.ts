import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { isSuperAdminRole } from '@/lib/auth/roles';
import {
  type StoryVideoProduction,
  type StoryVideoProductionStatus,
} from '@/lib/content/newsroomPublishing';
import { mediaRepository, type MediaRepository } from './mediaRepository';
import { MediaValidationError } from './mediaService';
import {
  videoMasterVerificationService,
  type VideoMasterVerificationService,
} from './videoMasterVerificationService';

export class StoryVideoProductionService {
  constructor(
    private readonly repository: MediaRepository = mediaRepository,
    private readonly masterVerification: VideoMasterVerificationService = videoMasterVerificationService
  ) {}

  validateTransition(
    current: StoryVideoProductionStatus,
    target: StoryVideoProductionStatus,
    actor: AdminSessionIdentity,
    currentProduction: StoryVideoProduction
  ): void {
    if (current === target) return;

    if (current === 'not_started') {
      if (target !== 'editing') {
        throw new MediaValidationError(
          `Cannot transition video production directly from not_started to ${target}. Start editing first.`,
          400
        );
      }
      return;
    }

    if (current === 'editing') {
      if (target === 'qa_review' || target === 'ready_to_publish') {
        if (!currentProduction.masterAssetId && !currentProduction.masterExportUrl) {
          throw new MediaValidationError(
            `Cannot move video production to ${target} without an attached master export.`,
            400
          );
        }
        return;
      }
      if (target === 'failed') return;
      throw new MediaValidationError(
        `Invalid video production transition from editing to ${target}.`,
        400
      );
    }

    if (current === 'failed') {
      if (target !== 'editing') {
        throw new MediaValidationError(
          `Cannot transition failed video production to ${target}. Retry by moving to editing first.`,
          400
        );
      }
      return;
    }

    if (current === 'qa_review') {
      if (target === 'ready_to_publish') {
        if (!currentProduction.masterAssetId && !currentProduction.masterExportUrl) {
          throw new MediaValidationError(
            'Cannot mark video production ready_to_publish without a verified master export.',
            400
          );
        }
        return;
      }
      if (target === 'editing' || target === 'failed') return;
      throw new MediaValidationError(
        `Invalid video production transition from qa_review to ${target}.`,
        400
      );
    }

    if (current === 'ready_to_publish') {
      if (target === 'published' || target === 'editing') return;
      throw new MediaValidationError(
        `Invalid video production transition from ready_to_publish to ${target}.`,
        400
      );
    }

    if (current === 'published') {
      if (target === 'editing') {
        if (actor.role !== 'admin' && !isSuperAdminRole(actor.role)) {
          throw new MediaValidationError(
            'Only admins can reopen a published video production package.',
            403
          );
        }
        return;
      }
      throw new MediaValidationError(
        `Cannot transition published video production to ${target}.`,
        400
      );
    }
  }

  async attachMaster(
    storyId: string,
    assetId: string,
    actor: AdminSessionIdentity,
    currentProduction: StoryVideoProduction
  ): Promise<StoryVideoProduction> {
    const verified = await this.masterVerification.verifyMasterExport({
      assetId,
      expectedStoryId: storyId,
      actor,
    });

    await this.repository.addReference(verified.assetId, {
      ownerType: 'story',
      ownerId: storyId,
      field: 'videoProduction.master',
      attachedAt: new Date(),
    });

    if (currentProduction.masterAssetId && currentProduction.masterAssetId !== verified.assetId) {
      await this.repository.removeReference(currentProduction.masterAssetId, 'story', storyId);
    }

    return {
      ...currentProduction,
      masterAssetId: verified.assetId,
      masterExportUrl: verified.mediaUrl,
      verifiedAt: verified.verifiedAt,
      technicalMetadata: {
        sizeBytes: verified.sizeBytes,
        durationSeconds: verified.durationSeconds,
        width: verified.width,
        height: verified.height,
        aspectRatio: verified.aspectRatio,
        container: verified.container,
        codec: verified.codec,
        etag: verified.etag,
      },
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

export const storyVideoProductionService = new StoryVideoProductionService();
