import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { MediaRepository } from '@/lib/server/media/mediaRepository';
import type { SpacesAdapter } from '@/lib/server/media/spacesAdapter';
import {
  VideoMasterVerificationService,
} from '@/lib/server/media/videoMasterVerificationService';

const admin: AdminSessionIdentity = {
  id: 'admin-1', email: 'admin@example.com', name: 'Admin', username: 'admin', role: 'admin',
};
const reporter: AdminSessionIdentity = {
  id: 'reporter-1', email: 'rep@example.com', name: 'Reporter', username: 'reporter', role: 'reporter',
};

describe('VideoMasterVerificationService', () => {
  let repository: MediaRepository;
  let spaces: SpacesAdapter;
  let fetchImpl: typeof fetch;
  let service: VideoMasterVerificationService;

  beforeEach(() => {
    repository = {
      getMediaById: vi.fn(async (id: string) => {
        if (id === 'valid-asset') {
          return {
            _id: 'valid-asset',
            createdById: 'admin-1',
            provider: 'do-spaces',
            objectKey: 'stories/videos/master.mp4',
            url: 'https://cdn/stories/videos/master.mp4',
            size: 5000,
            type: 'video/mp4',
            status: 'verified',
            mediaKind: 'video',
            ownerType: 'story',
            ownerId: 'story-1',
          };
        }
        return null;
      }),
    } as unknown as MediaRepository;

    spaces = {
      verifyUploadedObject: vi.fn(async () => ({
        key: 'stories/videos/master.mp4',
        bytes: 5000,
        etag: '"etag-123"',
        contentType: 'video/mp4',
      })),
    } as unknown as SpacesAdapter;

    fetchImpl = vi.fn(async () => new Response(new Uint8Array(100), { status: 206 })) as typeof fetch;

    service = new VideoMasterVerificationService(repository, spaces, fetchImpl);
  });

  it('verifies a valid video master export and returns technical metadata', async () => {
    const result = await service.verifyMasterExport({
      assetId: 'valid-asset',
      expectedStoryId: 'story-1',
      actor: admin,
    });

    expect(result).toMatchObject({
      assetId: 'valid-asset',
      mediaKey: 'stories/videos/master.mp4',
      mediaUrl: 'https://cdn/stories/videos/master.mp4',
      sizeBytes: 5000,
      etag: '"etag-123"',
      container: 'mp4',
    });
    expect(spaces.verifyUploadedObject).toHaveBeenCalledWith({ key: 'stories/videos/master.mp4' });
  });

  it('rejects master export belonging to a different story', async () => {
    await expect(service.verifyMasterExport({
      assetId: 'valid-asset',
      expectedStoryId: 'story-different',
      actor: admin,
    })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects master export if storage object is missing', async () => {
    vi.mocked(spaces.verifyUploadedObject).mockRejectedValueOnce(new Error('NoSuchKey'));
    await expect(service.verifyMasterExport({
      assetId: 'valid-asset',
      expectedStoryId: 'story-1',
      actor: admin,
    })).rejects.toMatchObject({ status: 404 });
  });

  it('rejects master export with invalid size', async () => {
    vi.mocked(spaces.verifyUploadedObject).mockResolvedValueOnce({
      publicId: 'stories/videos/master.mp4',
      secureUrl: 'https://spaces.lokswami.in/stories/videos/master.mp4',
      url: 'https://spaces.lokswami.in/stories/videos/master.mp4',
      bytes: 0,
      contentType: 'video/mp4',
    });
    await expect(service.verifyMasterExport({
      assetId: 'valid-asset',
      expectedStoryId: 'story-1',
      actor: admin,
    })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects if another user owns the receipt for a reporter actor', async () => {
    await expect(service.verifyMasterExport({
      assetId: 'valid-asset',
      expectedStoryId: 'story-1',
      actor: reporter,
    })).rejects.toMatchObject({ status: 403 });
  });
});
