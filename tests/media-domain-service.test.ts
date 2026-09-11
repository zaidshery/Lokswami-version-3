import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { MediaRepository } from '@/lib/server/media/mediaRepository';
import {
  MediaService,
  MediaValidationError,
} from '@/lib/server/media/mediaService';
import type { SpacesAdapter } from '@/lib/server/media/spacesAdapter';
import type { MediaRecord } from '@/lib/server/media/mediaTypes';

describe('MediaService domain boundaries', () => {
  let mockRecords: MediaRecord[];
  let mockRepository: MediaRepository;
  let mockSpaces: SpacesAdapter;
  let service: MediaService;

  const adminUser: AdminSessionIdentity = {
    id: 'user-admin',
    name: 'Admin User',
    username: 'admin',
    email: 'admin@lokswami.in',
    role: 'admin',
  };

  const reporterUser: AdminSessionIdentity = {
    id: 'user-reporter',
    name: 'Reporter User',
    username: 'reporter',
    email: 'reporter@lokswami.in',
    role: 'reporter',
  };

  beforeEach(() => {
    mockRecords = [
      {
        _id: 'media-1',
        filename: 'report.jpg',
        url: 'https://spaces.example/report.jpg',
        size: 1024,
        type: 'image/jpeg',
        uploadedBy: 'reporter@lokswami.in',
        createdAt: new Date('2026-09-10T10:00:00Z'),
      },
      {
        _id: 'media-2',
        filename: 'lead.jpg',
        url: 'https://spaces.example/lead.jpg',
        size: 2048,
        type: 'image/jpeg',
        uploadedBy: 'editor@lokswami.in',
        createdAt: new Date('2026-09-11T10:00:00Z'),
      },
    ];

    mockRepository = {
      listMedia: vi.fn(async (user: AdminSessionIdentity) => {
        if (user.role === 'reporter') {
          return mockRecords.filter((r) => r.uploadedBy === user.email);
        }
        return mockRecords;
      }),
      createMedia: vi.fn(async (data: { filename: string; url: string; size?: number; type?: string; uploadedBy?: string }) => {
        const item: MediaRecord = {
          _id: 'media-new',
          ...data,
          createdAt: new Date(),
        };
        mockRecords.push(item);
        return item;
      }),
      deleteMediaById: vi.fn(async (id: string) => {
        const idx = mockRecords.findIndex((r) => r._id === id);
        if (idx === -1) return false;
        mockRecords.splice(idx, 1);
        return true;
      }),
    } as unknown as MediaRepository;

    mockSpaces = {
      isConfigured: vi.fn(() => true),
      uploadBuffer: vi.fn(async () => ({
        secureUrl: 'https://spaces.example/uploaded.jpg',
        url: 'https://spaces.example/uploaded.jpg',
        publicId: 'lokswami/images/uploaded',
        resourceType: 'image',
        bytes: 1024,
      })),
      createBrowserUploadTarget: vi.fn(),
      verifyUploadedObject: vi.fn(),
      deleteAssetByPublicId: vi.fn(async () => true),
      deleteAssetByUrl: vi.fn(async () => true),
      buildPublicUrl: vi.fn((key: string) => `https://spaces.example/${key}`),
    } as unknown as SpacesAdapter;

    service = new MediaService(mockRepository, mockSpaces);
  });

  describe('listMedia', () => {
    it('returns all media for admin role', async () => {
      const result = await service.listMedia(adminUser);
      expect(result).toHaveLength(2);
    });

    it('scopes media to own uploads for reporter role', async () => {
      const result = await service.listMedia(reporterUser);
      expect(result).toHaveLength(1);
      expect(result[0].uploadedBy).toBe('reporter@lokswami.in');
    });
  });

  describe('createMedia', () => {
    it('validates required fields', async () => {
      await expect(
        service.createMedia({ filename: '', url: '' }, adminUser)
      ).rejects.toThrow(MediaValidationError);
    });

    it('creates media with user attribution', async () => {
      const created = await service.createMedia(
        { filename: 'photo.jpg', url: 'https://spaces.example/photo.jpg' },
        reporterUser
      );
      expect(created.filename).toBe('photo.jpg');
      expect(mockRepository.createMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'photo.jpg',
          uploadedBy: 'reporter@lokswami.in',
        })
      );
    });
  });

  describe('deleteMedia', () => {
    it('blocks non-admin deletion', async () => {
      await expect(service.deleteMedia('media-1', reporterUser)).rejects.toThrow(
        'Only admins can delete media assets.'
      );
    });

    it('allows admin deletion and throws 404 if not found', async () => {
      await service.deleteMedia('media-1', adminUser);
      expect(mockRepository.deleteMediaById).toHaveBeenCalledWith('media-1');

      await expect(service.deleteMedia('non-existent', adminUser)).rejects.toThrow(
        'Not found'
      );
    });
  });

  describe('processUpload', () => {
    it('enforces role restrictions (reporters cannot upload epaper papers)', async () => {
      const file = new File(['%PDF-demo'], 'paper.pdf', { type: 'application/pdf' });
      await expect(
        service.processUpload(file, 'epaper-paper', 'reporter')
      ).rejects.toThrow('Reporters can only upload image assets from this workspace.');
    });

    it('rejects disallowed file types for the given purpose', async () => {
      const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
      await expect(
        service.processUpload(file, 'image', 'admin')
      ).rejects.toThrow('Only JPG, JPEG, PNG, or WEBP image files are allowed');
    });

    it('uploads valid image to Spaces and returns normalized result', async () => {
      const file = new File(['image-bytes'], 'banner.jpg', { type: 'image/jpeg' });
      const result = await service.processUpload(file, 'image', 'admin');

      expect(result.url).toBe('https://spaces.example/uploaded.jpg');
      expect(result.storageProvider).toBe('do-spaces');
      expect(mockSpaces.uploadBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          folder: 'lokswami/images',
          resourceType: 'image',
          originalFilename: 'banner.jpg',
        })
      );
    });
  });
});
