import { Types } from 'mongoose';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import {
  canEditEpaper,
  canManageSettings,
  canRunGlobalAiOps,
  canViewPage,
} from '@/lib/auth/permissions';
import type {
  TtsAssetStatus,
  TtsSourceType,
  TtsVariant,
} from '@/lib/types/tts';
import {
  deleteStoredTtsAsset,
  getTtsStorageConfig,
  hasStoredTtsAsset,
} from '@/lib/utils/ttsStorage';
import {
  ttsRepository,
  type TtsRepository,
} from './ttsRepository';
import type {
  TtsAssetFilter,
  TtsCleanupInput,
  TtsCleanupResult,
  TtsRevalidateInput,
  TtsRevalidateResult,
  TtsSettingsResult,
} from './ttsTypes';

export class TtsValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TtsValidationError';
    this.status = status;
  }
}

const ALLOWED_STATUSES = new Set<TtsAssetStatus>(['pending', 'ready', 'failed', 'stale']);
const CLEANABLE_STATUSES = new Set<TtsAssetStatus>(['pending', 'failed', 'stale']);
const ALLOWED_VARIANTS = new Set<TtsVariant>([
  'breaking_headline',
  'article_full',
  'epaper_story',
]);
const ALLOWED_SOURCE_TYPES = new Set<TtsSourceType>(['article', 'epaperArticle']);

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export class TtsService {
  constructor(private readonly repository: TtsRepository = ttsRepository) {}

  async listAssets(filter: TtsAssetFilter, user: AdminSessionIdentity) {
    const canReadTts =
      canRunGlobalAiOps(user.role) ||
      canViewPage(user.role, 'articles') ||
      canViewPage(user.role, 'epapers') ||
      canEditEpaper(user.role);

    if (!canReadTts) {
      throw new TtsValidationError('Forbidden', 403);
    }

    const limit = filter.limit ?? 24;
    const filters: Record<string, unknown> = {};

    if (filter.status && ALLOWED_STATUSES.has(filter.status)) {
      filters.status = filter.status;
    }
    if (filter.variant && ALLOWED_VARIANTS.has(filter.variant)) {
      filters.variant = filter.variant;
    }
    if (filter.sourceType && ALLOWED_SOURCE_TYPES.has(filter.sourceType)) {
      filters.sourceType = filter.sourceType;
    }
    if (filter.sourceParentId) {
      filters.sourceParentId = filter.sourceParentId;
    }
    if (filter.sourceIds && filter.sourceIds.length > 0) {
      filters.sourceId = { $in: filter.sourceIds };
    } else if (filter.sourceId) {
      filters.sourceId = filter.sourceId;
    }

    const queryResult = await this.repository.queryAssets(filters, limit);

    const summary = {
      totalAssets: queryResult.totalAssets,
      byStatus: {
        pending: 0,
        ready: 0,
        failed: 0,
        stale: 0,
      } as Record<TtsAssetStatus, number>,
      byVariant: {
        breaking_headline: 0,
        article_full: 0,
        epaper_story: 0,
      } as Record<TtsVariant, number>,
      recentFailures: queryResult.recentFailures.length,
    };

    for (const item of queryResult.statusCounts) {
      const key = String(item._id || '') as TtsAssetStatus;
      if (key in summary.byStatus) {
        summary.byStatus[key] = Number(item.count || 0);
      }
    }

    for (const item of queryResult.variantCounts) {
      const key = String(item._id || '') as TtsVariant;
      if (key in summary.byVariant) {
        summary.byVariant[key] = Number(item.count || 0);
      }
    }

    return {
      filters: {
        status: filter.status || null,
        variant: filter.variant || null,
        sourceType: filter.sourceType || null,
        sourceId: filter.sourceId || null,
        sourceParentId: filter.sourceParentId || null,
        sourceIds: filter.sourceIds || [],
        limit,
      },
      summary,
      assets: queryResult.assets,
      recentAudits: queryResult.recentAudits,
      recentFailures: queryResult.recentFailures,
    };
  }

  async cleanupAssets(
    input: TtsCleanupInput,
    user: AdminSessionIdentity
  ): Promise<TtsCleanupResult> {
    if (!canRunGlobalAiOps(user.role)) {
      throw new TtsValidationError('Forbidden', 403);
    }

    const retentionDays = await this.repository.getRetentionDays();
    const limit = input.limit ?? 100;
    const dryRun = Boolean(input.dryRun);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const filters: Record<string, unknown> = {
      updatedAt: { $lte: cutoff },
      status:
        input.status && input.status !== 'all' && CLEANABLE_STATUSES.has(input.status)
          ? input.status
          : {
              $in: Array.from(CLEANABLE_STATUSES),
            },
    };

    if (input.variant && ALLOWED_VARIANTS.has(input.variant)) {
      filters.variant = input.variant;
    }
    if (input.sourceType && ALLOWED_SOURCE_TYPES.has(input.sourceType)) {
      filters.sourceType = input.sourceType;
    }
    if (input.sourceId) {
      filters.sourceId = input.sourceId;
    }
    if (input.sourceParentId) {
      filters.sourceParentId = input.sourceParentId;
    }

    const assets = await this.repository.findAssetsForCleanup(filters, limit);

    let deletedAssets = 0;
    let deletedFiles = 0;
    let missingFiles = 0;

    for (const asset of assets) {
      const audioUrl = String(asset.audioUrl || '').trim();
      const usesLocalStorage = audioUrl && !isHttpUrl(audioUrl);

      if (usesLocalStorage) {
        if (hasStoredTtsAsset(audioUrl)) {
          deletedFiles += 1;
          if (!dryRun) {
            await deleteStoredTtsAsset(audioUrl).catch(() => undefined);
          }
        } else {
          missingFiles += 1;
        }
      }

      deletedAssets += 1;
      if (!dryRun) {
        await this.repository.deleteAssetDocument(asset);
      }
    }

    await this.repository.recordAuditEvent({
      action: 'cleanup',
      result: 'success',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      message: dryRun
        ? 'Ran dry-run cleanup for expired TTS assets.'
        : 'Cleaned up expired TTS assets.',
      metadata: {
        dryRun,
        retentionDays,
        cutoff: cutoff.toISOString(),
        filters: {
          status: input.status || 'all',
          variant: input.variant || null,
          sourceType: input.sourceType || null,
          sourceId: input.sourceId || null,
          sourceParentId: input.sourceParentId || null,
          limit,
        },
        deletedAssets,
        deletedFiles,
        missingFiles,
      },
    });

    return {
      dryRun,
      retentionDays,
      cutoff: cutoff.toISOString(),
      processed: assets.length,
      deletedAssets,
      deletedFiles,
      missingFiles,
    };
  }

  async revalidateAssets(
    input: TtsRevalidateInput,
    user: AdminSessionIdentity
  ): Promise<TtsRevalidateResult> {
    if (!canRunGlobalAiOps(user.role)) {
      throw new TtsValidationError('Forbidden', 403);
    }

    const limit = input.limit ?? 50;
    const validIds = Array.isArray(input.assetIds)
      ? input.assetIds.filter((item) => Types.ObjectId.isValid(String(item || '').trim()))
      : [];

    const query: Record<string, unknown> = {};
    if (validIds.length) {
      query._id = { $in: validIds };
    } else if (input.status && input.status !== 'all') {
      query.status = input.status;
    }

    const assets = await this.repository.findAssetsForRevalidation(
      query,
      validIds.length ? validIds.length : limit
    );

    const now = new Date();
    let ready = 0;
    let stale = 0;
    let unchanged = 0;

    for (const asset of assets) {
      const isRemote = isHttpUrl(asset.audioUrl || '');
      const exists = isRemote ? true : Boolean(asset.audioUrl && hasStoredTtsAsset(asset.audioUrl));

      asset.lastVerifiedAt = now;

      if (!asset.audioUrl || !exists) {
        asset.status = 'stale';
        asset.lastError = 'Stored TTS asset file is missing.';
        stale += 1;
      } else if (asset.status === 'stale') {
        asset.status = 'ready';
        asset.lastError = '';
        ready += 1;
      } else {
        unchanged += 1;
      }

      await asset.save();
    }

    await this.repository.recordAuditEvent({
      action: 'revalidate',
      result: 'success',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      message: 'Revalidated TTS asset storage presence.',
      metadata: {
        requestedIds: validIds.length,
        processed: assets.length,
        ready,
        stale,
        unchanged,
      },
    });

    return {
      processed: assets.length,
      ready,
      stale,
      unchanged,
    };
  }

  async getSettings(user: AdminSessionIdentity): Promise<TtsSettingsResult> {
    if (!canManageSettings(user.role)) {
      throw new TtsValidationError('Forbidden', 403);
    }

    const storage = await getTtsStorageConfig().catch(() => null);
    const counts = await this.repository.getSettingsCounts();

    return {
      mode: 'manual-upload-only',
      message:
        'Auto-TTS (Gemini) has been removed. Audio is uploaded manually via DigitalOcean Spaces.',
      storage: {
        mode: storage?.mode || 'unavailable',
        writable: Boolean(storage),
        digitalOceanSpacesConfigured: Boolean(
          process.env.DIGITALOCEAN_SPACES_ACCESS_KEY?.trim() &&
            process.env.DIGITALOCEAN_SPACES_SECRET_KEY?.trim() &&
            process.env.DIGITALOCEAN_SPACES_BUCKET?.trim() &&
            process.env.DIGITALOCEAN_SPACES_REGION?.trim()
        ),
      },
      assets: {
        ready: counts.readyAssets,
        failed: counts.failedAssets,
        stale: counts.staleAssets,
      },
    };
  }

  async recordConfigAttempt(user: AdminSessionIdentity): Promise<void> {
    await this.repository.recordAuditEvent({
      action: 'config_update',
      result: 'skipped',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      message: 'Admin attempted TTS settings update but auto-TTS has been removed.',
      metadata: {},
    });
  }
}

export const ttsService = new TtsService();
