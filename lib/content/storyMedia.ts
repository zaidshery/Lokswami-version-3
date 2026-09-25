export const STORY_MIN_IMAGE_COUNT = 1;
export const STORY_MAX_IMAGE_COUNT = Number.POSITIVE_INFINITY;
export const STORY_MIN_VIDEO_COUNT = 1;
export const STORY_MAX_VIDEO_COUNT = Number.POSITIVE_INFINITY;
export const STORY_MAX_TOTAL_VIDEO_BYTES = Number.POSITIVE_INFINITY;

export type StoryMediaAssetKind = 'image' | 'video';

export type StoryMediaAsset = {
  id: string;
  assetId?: string;
  kind: StoryMediaAssetKind;
  url: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  originalFileName: string;
  order: number;
  createdAt: string;
};

function createAssetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeStoryMediaAssets(input: unknown): StoryMediaAsset[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item, index) => {
      const source = typeof item === 'object' && item ? (item as Record<string, unknown>) : null;
      if (!source) return null;

      const kind = source.kind === 'video' ? 'video' : source.kind === 'image' ? 'image' : null;
      const url = normalizeString(source.url);
      if (!kind || !url) return null;

      return {
        id: normalizeString(source.id) || createAssetId(),
        ...(normalizeString(source.assetId) ? { assetId: normalizeString(source.assetId) } : {}),
        kind,
        url,
        key: normalizeString(source.key),
        mimeType: normalizeString(source.mimeType).toLowerCase(),
        sizeBytes: Math.max(0, normalizeNumber(source.sizeBytes)),
        storageProvider: normalizeString(source.storageProvider),
        originalFileName: normalizeString(source.originalFileName),
        order: Math.max(0, Math.trunc(normalizeNumber(source.order, index))),
        createdAt: normalizeString(source.createdAt) || new Date().toISOString(),
      } satisfies StoryMediaAsset;
    })
    .filter((asset): asset is StoryMediaAsset => Boolean(asset))
    .sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt))
    .map((asset, index) => ({
      ...asset,
      order: index,
    }));
}

export function createStoryMediaAsset(
  input: Omit<StoryMediaAsset, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
) {
  return {
    ...input,
    id: input.id || createAssetId(),
    createdAt: input.createdAt || new Date().toISOString(),
  } satisfies StoryMediaAsset;
}

export function countStoryMediaAssets(assets: StoryMediaAsset[]) {
  return assets.reduce(
    (totals, asset) => {
      if (asset.kind === 'image') {
        totals.images += 1;
      } else if (asset.kind === 'video') {
        totals.videos += 1;
      }

      return totals;
    },
    { images: 0, videos: 0 }
  );
}

export function getTotalStoryVideoBytes(assets: StoryMediaAsset[]) {
  return assets.reduce((total, asset) => {
    if (asset.kind !== 'video') {
      return total;
    }

    return total + Math.max(0, Number(asset.sizeBytes) || 0);
  }, 0);
}

export function validateStoryMediaAssets(
  assets: StoryMediaAsset[],
  options: { requireCompletePackage?: boolean } = {}
) {
  const { images, videos } = countStoryMediaAssets(assets);
  const totalVideoBytes = getTotalStoryVideoBytes(assets);

  if (images > STORY_MAX_IMAGE_COUNT) {
    return `You can upload up to ${STORY_MAX_IMAGE_COUNT} images per story.`;
  }

  if (videos > STORY_MAX_VIDEO_COUNT) {
    return `You can upload up to ${STORY_MAX_VIDEO_COUNT} videos per story.`;
  }

  if (
    Number.isFinite(STORY_MAX_TOTAL_VIDEO_BYTES) &&
    totalVideoBytes > STORY_MAX_TOTAL_VIDEO_BYTES
  ) {
    return `Total video size must be ${Math.round(STORY_MAX_TOTAL_VIDEO_BYTES / (1024 * 1024))} MB or smaller per story.`;
  }

  if (options.requireCompletePackage) {
    if (images < STORY_MIN_IMAGE_COUNT) {
      return `At least ${STORY_MIN_IMAGE_COUNT} image is required for this story.`;
    }

    if (videos < STORY_MIN_VIDEO_COUNT) {
      return `At least ${STORY_MIN_VIDEO_COUNT} video is required for this story.`;
    }
  }

  return null;
}

export function derivePrimaryStoryMedia(
  assets: StoryMediaAsset[],
  fallbackThumbnail = ''
) {
  const firstImage = assets.find((asset) => asset.kind === 'image') || null;
  const firstVideo = assets.find((asset) => asset.kind === 'video') || null;

  return {
    thumbnail: firstImage?.url || fallbackThumbnail.trim() || firstVideo?.url || '',
    mediaType: firstVideo ? ('video' as const) : ('image' as const),
    mediaUrl: firstVideo?.url || firstImage?.url || '',
    mediaKey: firstVideo?.key || '',
    mediaSizeBytes: firstVideo?.sizeBytes || 0,
    mediaMimeType: firstVideo?.mimeType || '',
    storageProvider: firstVideo?.storageProvider || '',
  };
}
