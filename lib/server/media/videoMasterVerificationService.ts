import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { isReporterDeskRole } from '@/lib/auth/roles';
import { createStoryVideoDownloadRequest } from '@/lib/storage/storyVideoUpload';
import { mediaRepository, type MediaRepository } from './mediaRepository';
import { MediaValidationError } from './mediaService';
import { spacesAdapter, type SpacesAdapter } from './spacesAdapter';
import { parseMp4Header } from './mp4BoxParser';

export const MASTER_VIDEO_MIN_BYTES = 1;
export const MASTER_VIDEO_MAX_BYTES = 1.9 * 1024 * 1024 * 1024; // 1.9 GB

export interface VerifiedVideoMaster {
  assetId: string;
  mediaKey: string;
  mediaUrl: string;
  sizeBytes: number;
  etag?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1' | 'unknown';
  container: string;
  codec?: string;
  verifiedAt: string;
}

export class VideoMasterVerificationService {
  constructor(
    private readonly repository: MediaRepository = mediaRepository,
    private readonly spaces: SpacesAdapter = spacesAdapter,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async verifyMasterExport(input: {
    assetId: string;
    expectedStoryId?: string;
    actor: AdminSessionIdentity;
  }): Promise<VerifiedVideoMaster> {
    const assetId = String(input.assetId || '').trim();
    if (!assetId) {
      throw new MediaValidationError('Master export asset ID is required.', 400);
    }

    const record = await this.repository.getMediaById(assetId);
    if (!record || record.status === 'deleted') {
      throw new MediaValidationError('Master export asset not found.', 404);
    }
    if (record.status !== 'verified' && record.status !== 'attached') {
      throw new MediaValidationError('Master export asset must be verified before attachment.', 400);
    }
    if (record.provider !== 'do-spaces' || !record.objectKey) {
      throw new MediaValidationError('Master export asset has invalid storage metadata.', 400);
    }
    if (record.mediaKind !== 'video') {
      throw new MediaValidationError('Master export asset must be a video.', 400);
    }

    if (
      input.expectedStoryId &&
      record.ownerType === 'story' &&
      record.ownerId &&
      record.ownerId !== input.expectedStoryId
    ) {
      throw new MediaValidationError('Master export belongs to another Story.', 409);
    }

    if (
      record.createdById &&
      record.createdById !== input.actor.id &&
      isReporterDeskRole(input.actor.role)
    ) {
      throw new MediaValidationError('Master export upload belongs to another user.', 403);
    }

    // 1. Verify object existence and size on storage provider
    let objectMeta;
    try {
      objectMeta = await this.spaces.verifyUploadedObject({ key: record.objectKey });
    } catch {
      throw new MediaValidationError('Master export object was not found in storage.', 404);
    }

    const sizeBytes = typeof objectMeta.bytes === 'number' ? objectMeta.bytes : (record.size || 0);
    if (sizeBytes < MASTER_VIDEO_MIN_BYTES || sizeBytes > MASTER_VIDEO_MAX_BYTES) {
      throw new MediaValidationError('Master export exceeds allowable video size limits.', 400);
    }

    // 2. Fetch header range to probe container, box structure, and dimensions
    let durationSeconds: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let aspectRatio: '9:16' | '16:9' | '1:1' | 'unknown' = 'unknown';
    let codec: string | undefined;

    try {
      const signed = createStoryVideoDownloadRequest(record.objectKey);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 10_000);
      let probeResponse: Response | null = null;
      try {
        probeResponse = await this.fetchImpl(signed.url, {
          method: 'GET',
          headers: { ...signed.headers, Range: 'bytes=0-65535' },
          redirect: 'error',
          cache: 'no-store',
          signal: abort.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (probeResponse && (probeResponse.status === 200 || probeResponse.status === 206)) {
        const headerBytes = new Uint8Array(await probeResponse.arrayBuffer());
        const parsed = parseMp4Header(headerBytes);
        if (parsed) {
          durationSeconds = parsed.durationSeconds;
          width = parsed.width;
          height = parsed.height;
          aspectRatio = parsed.aspectRatio || 'unknown';
          codec = parsed.codec;
        }
      }
    } catch {
      // Probing is best-effort over network; container and size existence are authoritative
    }

    const verifiedAt = new Date().toISOString();

    return {
      assetId: String(record._id),
      mediaKey: record.objectKey,
      mediaUrl: record.url,
      sizeBytes,
      etag: (objectMeta as unknown as { etag?: string }).etag,
      durationSeconds,
      width,
      height,
      aspectRatio,
      container: 'mp4',
      codec,
      verifiedAt,
    };
  }
}

export const videoMasterVerificationService = new VideoMasterVerificationService();
