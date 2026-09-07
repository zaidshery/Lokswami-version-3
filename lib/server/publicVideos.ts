import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import Video from '@/lib/models/Video';
import { listAllStoredVideos } from '@/lib/storage/videosFile';
import { cursorPage, type CursorPageResult } from '@/lib/utils/cursorPage';
import {
  PUBLIC_VIDEO_PROJECTION,
  isPubliclyPublishedVideo,
  normalizeVideoSlug,
  toPublicVideoItem,
  type PublicVideoItem,
  type PublicVideoSource,
} from '@/lib/content/videoPublication';
import { getPublicArticleBySlug } from '@/lib/server/publicArticles';

const MAX_SWIPE_RESOLUTION_CANDIDATES = 200;

export type SwipeArticlePreview = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  city?: string;
  publishedAt: string;
  href: string;
};

export type PublicSwipeStory = {
  video: PublicVideoItem;
  article: SwipeArticlePreview | null;
};

type MongoSwipeLookup = {
  authoritative: boolean;
  candidates: PublicVideoSource[];
};

async function getMongoSwipeCandidates(slug: string): Promise<MongoSwipeLookup> {
  if (!(await isMongoAvailable({ label: 'public swipe story lookup' }))) {
    return { authoritative: false, candidates: [] };
  }

  try {
    const exact = (await Video.findOne({ isPublished: true, isShort: true, slug })
      .select(PUBLIC_VIDEO_PROJECTION)
      .lean()) as PublicVideoSource | null;
    if (exact) return { authoritative: true, candidates: [exact] };

    const legacyCandidates = (await Video.find({
      isPublished: true,
      isShort: true,
      $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }],
    })
      .select(PUBLIC_VIDEO_PROJECTION)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(MAX_SWIPE_RESOLUTION_CANDIDATES)
      .lean()) as PublicVideoSource[];
    return { authoritative: true, candidates: legacyCandidates };
  } catch (error) {
    console.error('Failed to resolve public Swipe story from MongoDB.', error);
    return { authoritative: false, candidates: [] };
  }
}

async function getSwipeCandidates(slug: string) {
  const mongoLookup = await getMongoSwipeCandidates(slug);
  if (mongoLookup.authoritative) return mongoLookup.candidates;
  return (await listAllStoredVideos()) as unknown as PublicVideoSource[];
}

export async function getPublicSwipeVideoBySlug(slug: string) {
  const normalizedSlug = normalizeVideoSlug(slug);
  if (!normalizedSlug) return null;

  const candidates = await getSwipeCandidates(normalizedSlug);
  for (const candidate of candidates) {
    const item = toPublicVideoItem(candidate, { requireShort: true });
    if (item?.slug === normalizedSlug) return item;
  }

  return null;
}

async function getArticlePreview(articleId: string): Promise<SwipeArticlePreview | null> {
  if (!articleId) return null;
  try {
    const result = await getPublicArticleBySlug(articleId);
    if (!result) return null;
    const { article } = result;
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      category: article.category,
      author: article.author,
      city: article.city,
      publishedAt: article.publishedAt,
      href: article.href,
    };
  } catch (error) {
    console.error('Failed to resolve the published article for a Swipe story.', error);
    return null;
  }
}

export async function getPublicSwipeStory(slug: string): Promise<PublicSwipeStory | null> {
  const video = await getPublicSwipeVideoBySlug(slug);
  if (!video) return null;
  return {
    video,
    article: await getArticlePreview(video.articleId),
  };
}

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export type PublicVideoFeedPageOptions = {
  limit?: number | string | null;
  cursorPublishedAt?: string | null;
  cursorId?: string | null;
};

export async function getPublicVideoFeedPage(
  options: PublicVideoFeedPageOptions = {}
): Promise<CursorPageResult<PublicVideoItem>> {
  const limit = options.limit ?? 20;
  const cursorPublishedAt = options.cursorPublishedAt;
  const cursorId = options.cursorId;

  if (await isMongoAvailable({ label: 'public videos feed page' })) {
    try {
      return await cursorPage<PublicVideoItem>({
        model: Video,
        mongoFilter: { isPublished: true },
        mongoProjection: PUBLIC_VIDEO_PROJECTION,
        limit,
        dateField: 'publishedAt',
        cursorPublishedAt,
        cursorId,
        mapItem: (raw) => toPublicVideoItem(asObject(raw)),
      });
    } catch (error) {
      console.error(
        'Failed to fetch public videos feed page from MongoDB, falling back to file store.',
        error
      );
    }
  }

  const rows = await listAllStoredVideos();
  return cursorPage<PublicVideoItem>({
    arrayItems: rows.filter((item) => isPubliclyPublishedVideo(item)),
    limit,
    dateField: 'publishedAt',
    cursorPublishedAt,
    cursorId,
    mapItem: (raw) => toPublicVideoItem(asObject(raw)),
  });
}
