export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SnapshotContentType =
  | 'article'
  | 'breaking'
  | 'video'
  | 'short'
  | 'epaper'
  | 'emagazine';

export type SnapshotMediaKind = 'image' | 'pdf';

export type SnapshotMediaReference = {
  sourceUrl: string;
  kind: SnapshotMediaKind;
  status: 'pending' | 'downloaded' | 'unavailable';
  localPath?: string;
  contentType?: string;
  sizeBytes?: number;
  sha256?: string;
  error?: string;
};

export type SnapshotRecordBase = {
  type: SnapshotContentType;
  sourceId: string;
  sourceUrl: string;
  sourceCapturedAt: string;
  localId: string;
  title: string;
};

export type SnapshotArticle = SnapshotRecordBase & {
  type: 'article';
  slug: string;
  summary: string;
  content: string;
  category: string;
  author: string;
  tags: string[];
  publishedAt: string;
  updatedAt: string;
  image?: SnapshotMediaReference;
};

export type SnapshotBreakingItem = SnapshotRecordBase & {
  type: 'breaking';
  articleSourceId?: string;
  articleLocalId?: string;
  category: string;
  city: string;
  publishedAt: string;
  audioSourceUrl?: string;
};

export type SnapshotVideo = SnapshotRecordBase & {
  type: 'video';
  slug: string;
  description: string;
  category: string;
  provider: string;
  publicUrl: string;
  durationSeconds: number;
  publishedAt: string;
  thumbnail?: SnapshotMediaReference;
};

export type SnapshotShort = SnapshotRecordBase & {
  type: 'short';
  slug: string;
  description: string;
  category: string;
  provider: string;
  publicUrl: string;
  durationSeconds: number;
  publishedAt: string;
  thumbnail?: SnapshotMediaReference;
  articleSourceId?: string;
  articleLocalId?: string;
  supported: boolean;
  unsupportedReason?: string;
};

export type SnapshotPublication = SnapshotRecordBase & {
  type: 'epaper' | 'emagazine';
  city: string;
  citySlug: string;
  publishDate: string;
  pageCount: number;
  publicUrl: string;
  thumbnail?: SnapshotMediaReference;
  pdf?: SnapshotMediaReference;
  pages: SnapshotMediaReference[];
};

export type SnapshotLimits = {
  articles: number;
  breaking: number;
  videos: number;
  shorts: number;
  epapers: number;
  emagazines: number;
  concurrency: number;
};

export type SnapshotError = {
  scope: SnapshotContentType | 'asset' | 'snapshot';
  sourceUrl: string;
  message: string;
};

export type SnapshotManifest = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  sourceHost: 'lokswami.com';
  sourceOrigin: 'https://lokswami.com';
  pulledAt: string;
  readMethodsUsed: Array<'GET' | 'HEAD'>;
  writeMethodsUsed: [];
  endpoints: string[];
  limits: SnapshotLimits;
  articles: SnapshotArticle[];
  breaking: SnapshotBreakingItem[];
  videos: SnapshotVideo[];
  shorts: SnapshotShort[];
  epapers: SnapshotPublication[];
  emagazines: SnapshotPublication[];
  errors: SnapshotError[];
  assetSummary: {
    downloaded: number;
    unavailable: number;
  };
};
