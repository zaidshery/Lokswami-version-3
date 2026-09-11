import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { TtsRepository } from '@/lib/server/audio/ttsRepository';
import {
  TtsService,
  TtsValidationError,
} from '@/lib/server/audio/ttsService';
import TtsAsset, { type ITtsAsset } from '@/lib/models/TtsAsset';

describe('TtsService domain boundaries', () => {
  let mockAssets: ITtsAsset[];
  let mockAudits: Record<string, unknown>[];
  let mockRepository: TtsRepository;
  let service: TtsService;

  const superAdminUser: AdminSessionIdentity = {
    id: 'super-1',
    name: 'Super Admin',
    username: 'superadmin',
    email: 'owner@lokswami.in',
    role: 'super_admin',
  };

  const adminUser: AdminSessionIdentity = {
    id: 'admin-1',
    name: 'Admin User',
    username: 'admin',
    email: 'admin@lokswami.in',
    role: 'admin',
  };

  const reporterUser: AdminSessionIdentity = {
    id: 'reporter-1',
    name: 'Reporter User',
    username: 'reporter',
    email: 'reporter@lokswami.in',
    role: 'reporter',
  };

  beforeEach(() => {
    mockAudits = [];
    mockAssets = [
      {
        sourceType: 'article',
        sourceId: 'art-1',
        variant: 'article_full',
        title: 'Headline One',
        textHash: 'hash1',
        contentVersionHash: 'version1',
        languageCode: 'hi',
        voice: 'manual-upload',
        provider: 'manual',
        model: 'manual-upload',
        mimeType: 'audio/mpeg',
        audioUrl: 'https://spaces.example/art-1.mp3',
        storageMode: 'spaces',
        status: 'ready',
        chunkCount: 1,
        charCount: 100,
        failureCount: 0,
        createdAt: new Date('2026-09-10T10:00:00Z'),
        updatedAt: new Date('2026-09-10T10:00:00Z'),
      } as ITtsAsset,
      {
        sourceType: 'article',
        sourceId: 'art-2',
        variant: 'breaking_headline',
        title: 'Headline Two',
        textHash: 'hash2',
        contentVersionHash: 'version2',
        languageCode: 'hi',
        voice: 'manual-upload',
        provider: 'manual',
        model: 'manual-upload',
        mimeType: 'audio/mpeg',
        audioUrl: 'https://spaces.example/art-2.mp3',
        storageMode: 'spaces',
        status: 'failed',
        chunkCount: 1,
        charCount: 50,
        failureCount: 1,
        lastError: 'File corrupted',
        createdAt: new Date('2026-06-01T10:00:00Z'),
        updatedAt: new Date('2026-06-01T10:00:00Z'),
      } as ITtsAsset,
    ];

    mockRepository = {
      queryAssets: vi.fn(async (filters: Record<string, unknown>, limit: number) => {
        let filtered = [...mockAssets];
        if (filters.status) filtered = filtered.filter((a) => a.status === filters.status);
        if (filters.variant) filtered = filtered.filter((a) => a.variant === filters.variant);

        return {
          assets: filtered.slice(0, limit),
          recentAudits: mockAudits.slice(0, 12),
          totalAssets: filtered.length,
          statusCounts: [
            { _id: 'ready', count: filtered.filter((a) => a.status === 'ready').length },
            { _id: 'failed', count: filtered.filter((a) => a.status === 'failed').length },
          ],
          variantCounts: [
            { _id: 'article_full', count: filtered.filter((a) => a.variant === 'article_full').length },
            { _id: 'breaking_headline', count: filtered.filter((a) => a.variant === 'breaking_headline').length },
          ],
          recentFailures: filtered.filter((a) => a.status === 'failed').slice(0, 5),
        };
      }),
      getRetentionDays: vi.fn(async () => 90),
      findAssetsForCleanup: vi.fn(async (filters: Record<string, unknown>) => {
        return mockAssets.filter((a) => {
          if (filters.updatedAt) {
            const cutoff = (filters.updatedAt as { $lte: Date }).$lte;
            return a.updatedAt <= cutoff && a.status === 'failed';
          }
          return false;
        }) as any;
      }),
      deleteAssetDocument: vi.fn(async (asset: any) => {
        const idx = mockAssets.indexOf(asset);
        if (idx !== -1) mockAssets.splice(idx, 1);
      }),
      findAssetsForRevalidation: vi.fn(async () => {
        return mockAssets.map((asset) => ({
          ...asset,
          save: vi.fn(async () => asset),
        })) as any;
      }),
      getSettingsCounts: vi.fn(async () => ({
        readyAssets: 1,
        failedAssets: 1,
        staleAssets: 0,
      })),
      recordAuditEvent: vi.fn(async (event: Record<string, unknown>) => {
        mockAudits.push(event);
      }),
    } as unknown as TtsRepository;

    service = new TtsService(mockRepository);
  });

  describe('listAssets', () => {
    it('allows admin access and returns filtered summary and assets', async () => {
      const result = await service.listAssets(
        {
          limit: 10,
          status: 'ready',
        },
        adminUser
      );

      expect(result.summary.totalAssets).toBe(1);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].sourceId).toBe('art-1');
      expect(result.filters.status).toBe('ready');
    });

    it('denies access to unauthorized roles', async () => {
      await expect(
        service.listAssets({}, reporterUser)
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('cleanupAssets', () => {
    it('executes cleanup of expired assets beyond retention period', async () => {
      const result = await service.cleanupAssets(
        {
          status: 'all',
          dryRun: false,
        },
        adminUser
      );

      expect(result.deletedAssets).toBe(1);
      expect(mockRepository.deleteAssetDocument).toHaveBeenCalled();
      expect(mockRepository.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'cleanup',
          result: 'success',
        })
      );
    });

    it('supports dry-run cleanup without deleting documents', async () => {
      const result = await service.cleanupAssets(
        {
          dryRun: true,
        },
        adminUser
      );

      expect(result.dryRun).toBe(true);
      expect(result.deletedAssets).toBe(1);
      expect(mockRepository.deleteAssetDocument).not.toHaveBeenCalled();
    });
  });

  describe('revalidateAssets', () => {
    it('revalidates remote and local storage presence', async () => {
      const result = await service.revalidateAssets(
        {
          status: 'all',
        },
        adminUser
      );

      expect(result.processed).toBe(2);
      expect(result.unchanged).toBe(2);
      expect(mockRepository.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'revalidate',
          result: 'success',
        })
      );
    });
  });

  describe('settings and audit', () => {
    it('returns manual-upload-only mode and counts', async () => {
      const settings = await service.getSettings(superAdminUser);
      expect(settings.mode).toBe('manual-upload-only');
      expect(settings.assets).toEqual({
        ready: 1,
        failed: 1,
        stale: 0,
      });
    });

    it('records config_update skipped event on attempt', async () => {
      await service.recordConfigAttempt(adminUser);
      expect(mockRepository.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'config_update',
          result: 'skipped',
        })
      );
    });
  });

  describe('TtsAsset schema validation', () => {
    it('validates required schema fields on TtsAsset Mongoose model', async () => {
      const validAsset = new TtsAsset({
        sourceType: 'article',
        sourceId: 'art-validation-test',
        variant: 'article_full',
        title: 'Validation Article',
        textHash: 'hash-abc',
        contentVersionHash: 'version-xyz',
        languageCode: 'hi',
        voice: 'manual-upload',
        provider: 'manual',
        model: 'manual-upload',
        mimeType: 'audio/mpeg',
        audioUrl: 'https://spaces.example/valid.mp3',
        storageMode: 'spaces',
        status: 'ready',
      });

      await expect(validAsset.validate()).resolves.toBeUndefined();

      // Test that missing required fields fails Mongoose validation
      const missingFieldsAsset = new TtsAsset({
        sourceType: 'article',
        // missing sourceId, variant, textHash, contentVersionHash, languageCode, etc.
      });

      await expect(missingFieldsAsset.validate()).rejects.toThrow();
    });
  });
});
