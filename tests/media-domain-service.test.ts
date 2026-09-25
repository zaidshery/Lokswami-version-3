import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { MediaRepository } from '@/lib/server/media/mediaRepository';
import { MediaService, MediaValidationError } from '@/lib/server/media/mediaService';
import type { SpacesAdapter } from '@/lib/server/media/spacesAdapter';
import type { MediaRecord } from '@/lib/server/media/mediaTypes';

const admin: AdminSessionIdentity = {
  id: 'admin-1', name: 'Admin', username: 'admin', email: 'admin@example.com', role: 'admin',
};
const reporter: AdminSessionIdentity = {
  id: 'reporter-1', name: 'Reporter', username: 'reporter', email: 'reporter@example.com', role: 'reporter',
};

describe('MediaService canonical asset boundary', () => {
  let records: MediaRecord[];
  let repository: MediaRepository;
  let spaces: SpacesAdapter;
  let service: MediaService;

  beforeEach(() => {
    records = [{
      _id: 'media-1', filename: 'one.jpg', url: 'https://cdn/one.jpg', size: 3,
      type: 'image/jpeg', uploadedBy: reporter.email, createdById: reporter.id,
      provider: 'do-spaces', objectKey: 'lokswami/images/one.jpg', status: 'verified',
      mediaKind: 'image', ownerType: 'library', referenceTrackingComplete: true, references: [],
    }];
    repository = {
      listMedia: vi.fn(async () => records),
      getMediaById: vi.fn(async (id: string) => records.find((item) => item._id === id) || null),
      findMediaByUrl: vi.fn(async (url: string) => records.find((item) => item.url === url) || null),
      createMedia: vi.fn(async (data: MediaRecord) => {
        const record = { ...data, _id: `media-${records.length + 1}` };
        records.push(record); return record;
      }),
      updateMediaById: vi.fn(async (id: string, updates: Partial<MediaRecord>) => {
        const record = records.find((item) => item._id === id);
        if (!record) return null;
        Object.assign(record, updates); return record;
      }),
      listCleanupCandidates: vi.fn(async () => records.filter((item) => item.status === 'cleanup_pending')),
    } as unknown as MediaRepository;
    spaces = {
      uploadBuffer: vi.fn(async () => ({
        secureUrl: 'https://cdn/uploaded.jpg', url: 'https://cdn/uploaded.jpg',
        publicId: 'lokswami/images/uploaded.jpg', resourceType: 'image', bytes: 3,
      })),
      deleteAssetByPublicId: vi.fn(async () => undefined),
    } as unknown as SpacesAdapter;
    service = new MediaService(repository, spaces);
  });

  it('only registers an existing server-issued receipt', async () => {
    await expect(service.createMedia({ filename: 'x', url: 'https://evil/x' }, admin))
      .rejects.toThrow('Upload receipt not found');
    await expect(service.createMedia({ assetId: 'media-1', filename: '', url: '' }, reporter))
      .resolves.toMatchObject({ _id: 'media-1' });
  });

  it('rejects referenced deletes and deletes an unreferenced provider object idempotently', async () => {
    records[0].references = [{ ownerType: 'story', ownerId: 'story-1', attachedAt: new Date() }];
    await expect(service.deleteMedia('media-1', admin)).rejects.toThrow('still referenced');
    records[0].references = [];
    await service.deleteMedia('media-1', admin);
    expect(spaces.deleteAssetByPublicId).toHaveBeenCalledWith('lokswami/images/one.jpg');
    expect(records[0].status).toBe('deleted');
    await service.deleteMedia('media-1', admin);
    expect(spaces.deleteAssetByPublicId).toHaveBeenCalledTimes(1);
  });

  it('keeps cleanup pending when provider deletion fails', async () => {
    vi.mocked(spaces.deleteAssetByPublicId).mockRejectedValueOnce(new Error('offline'));
    await expect(service.deleteMedia('media-1', admin)).rejects.toMatchObject({ status: 503 });
    expect(records[0]).toMatchObject({ status: 'cleanup_pending', cleanupError: 'provider_cleanup_failed' });
  });

  it('enforces upload roles and detects spoofed content', async () => {
    const pdf = new File(['%PDF-demo'], 'paper.pdf', { type: 'application/pdf' });
    await expect(service.processUpload(pdf, 'epaper-paper', reporter)).rejects.toThrow('Reporters');
    const spoofed = new File(['<script>'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(service.processUpload(spoofed, 'image', admin)).rejects.toThrow('contents');
  });

  it('persists a canonical receipt for a signature-valid upload', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' });
    const result = await service.processUpload(file, 'image', admin, {
      ownerType: 'library', referenceTrackingComplete: true,
    });
    expect(result).toMatchObject({ assetId: 'media-2', publicId: 'lokswami/images/uploaded.jpg' });
    expect(repository.createMedia).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'do-spaces', objectKey: 'lokswami/images/uploaded.jpg', status: 'verified',
    }));
  });

  it('reconciles cleanup candidates using stored keys', async () => {
    records[0].status = 'cleanup_pending';
    const result = await service.reconcileCleanup(new Date());
    expect(result).toEqual({ deleted: 1, failed: 0 });
    expect(records[0].status).toBe('deleted');
  });

  it('blocks non-admin deletion', async () => {
    await expect(service.deleteMedia('media-1', reporter)).rejects.toThrow(MediaValidationError);
  });
});
