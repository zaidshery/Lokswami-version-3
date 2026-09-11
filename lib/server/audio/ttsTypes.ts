import type {
  TtsAssetStatus,
  TtsSourceType,
  TtsVariant,
} from '@/lib/types/tts';

export interface TtsAssetFilter {
  status?: TtsAssetStatus | '';
  variant?: TtsVariant | '';
  sourceType?: TtsSourceType | '';
  sourceId?: string;
  sourceIds?: string[];
  sourceParentId?: string;
  limit?: number;
}

export interface TtsAssetSummary {
  totalAssets: number;
  byStatus: Record<TtsAssetStatus, number>;
  byVariant: Record<TtsVariant, number>;
  recentFailures: number;
}

export interface TtsCleanupInput {
  status?: TtsAssetStatus | 'all';
  variant?: TtsVariant;
  sourceType?: TtsSourceType;
  sourceId?: string;
  sourceParentId?: string;
  limit?: number;
  dryRun?: boolean;
}

export interface TtsCleanupResult {
  deletedAssets: number;
  deletedFiles: number;
  missingFiles: number;
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  filters: Record<string, unknown>;
}

export interface TtsRevalidateInput {
  assetIds?: string[];
  status?: 'ready' | 'stale' | 'failed' | 'pending' | 'all';
  limit?: number;
}

export interface TtsRevalidateResult {
  processed: number;
  ready: number;
  stale: number;
  unchanged: number;
}

export interface TtsSettingsResult {
  mode: 'manual-upload-only';
  message: string;
  storage: {
    mode: string;
    writable: boolean;
    digitalOceanSpacesConfigured: boolean;
  };
  assets: {
    ready: number;
    failed: number;
    stale: number;
  };
}
